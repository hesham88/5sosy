# Deploy the khsosybot-analyze-books Cloud Run Job — picks up downloaded books
# from Firestore, parses each PDF page-by-page from a GCS volume mount, writes
# per-page docs + content/full, marks books `status='indexed'`.
#
# CRITICAL: mounts the GCS bucket at /mnt/khsosy_files via gcsfuse so
# pypdf can stream pages on-demand without loading the whole PDF into RAM.
# That eliminates the OOM that killed the old single-job design at ~book 37.
#
# Shares the same Docker image as the service and harvester jobs;
# `--command python --args analyzer_job_main.py` selects the entrypoint.

[CmdletBinding()]
param(
  [string]$Job     = "khsosybot-analyze-books",
  [string]$Region  = "us-east4",
  [string]$Project = "khsosy",
  [string]$Bucket  = "khsosy.firebasestorage.app",
  [string]$MountPath = "/mnt/khsosy_files"
)

Set-Location -Path $PSScriptRoot

Write-Host "Enabling required APIs..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
  --project $Project | Out-Null

$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$buildSa = "$projectNumber-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/cloudbuild.builds.builder" `
  --condition=None --quiet | Out-Null
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/datastore.user" `
  --condition=None --quiet | Out-Null
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/storage.objectAdmin" `
  --condition=None --quiet | Out-Null
# gcsfuse needs storage.objectViewer at minimum — objectAdmin above covers it.

$repoExists = gcloud artifacts repositories describe cloud-run-source-deploy `
  --project $Project --location $Region --format "value(name)" 2>$null
if (-not $repoExists) {
  Write-Host "Creating Artifact Registry repo cloud-run-source-deploy in $Region..." -ForegroundColor Cyan
  gcloud artifacts repositories create cloud-run-source-deploy `
    --project $Project --location $Region `
    --repository-format docker `
    --description "Cloud Run source deploys" | Out-Null
}

# MALLOC_TRIM_THRESHOLD_=131072 still helps small per-page allocations return
# to the OS quickly even though the volume mount removes the big offenders.
$envVars = "^@^GEMINI_MODEL=gemini-3.1-flash-lite@GOOGLE_GENAI_USE_VERTEXAI=FALSE@FIRESTORE_PROJECT=$Project@FIRESTORE_DATABASE=(default)@GCS_BUCKET=$Bucket@GCS_MOUNT_PATH=$MountPath@MALLOC_TRIM_THRESHOLD_=131072@SYNC_WORKER_COUNT=3@PAGE_OCR_CONCURRENCY=15"

Write-Host "Deploying Cloud Run Job $Job to $Region in $Project (builds via Cloud Build)..." -ForegroundColor Cyan
Write-Host "  GCS bucket  : $Bucket" -ForegroundColor DarkGray
Write-Host "  Mount path  : $MountPath" -ForegroundColor DarkGray

# Volume mount via `--add-volume` + `--add-volume-mount` (Cloud Run gen2).
# With path-based PdfReader, the PDFs never fully land in RAM; pypdf reads
# the trailer + per-page bytes lazily over gcsfuse.
gcloud run jobs deploy $Job `
  --source . `
  --project $Project `
  --region $Region `
  --quiet `
  --memory 4Gi `
  --cpu 2 `
  --task-timeout 86400 `
  --max-retries 0 `
  --parallelism 1 `
  --tasks 1 `
  --command python `
  --args analyzer_job_main.py `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest" `
  --add-volume "name=books-fs,type=cloud-storage,bucket=$Bucket" `
  --add-volume-mount "volume=books-fs,mount-path=$MountPath"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Analyzer job deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Analyzer job deployed. Launch with:" -ForegroundColor Yellow
Write-Host "  gcloud run jobs execute $Job --region $Region --project $Project"
Write-Host ""
Write-Host "Or from the web UI: Books page -> Sync Console -> Analyzer card -> Start."
Write-Host "Tail logs:"
Write-Host "  gcloud logging tail `"resource.type=cloud_run_job AND resource.labels.job_name=$Job`""
