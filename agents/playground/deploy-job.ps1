# Deploy the fivesosybot-sync Cloud Run Job — the long-running MOE textbook
# ingestion batch (hours, ~272 books). Sharing the same Docker image as the
# fivesosybot service via `--command python --args sync_job_main.py` override.
#
# Usage:
#   .\deploy-job.ps1                 # default: job fivesosybot-sync in us-east4
#   .\deploy-job.ps1 -Region us-central1

[CmdletBinding()]
param(
  [string]$Job     = "fivesosybot-sync",
  [string]$Region  = "us-east4",
  [string]$Project = "khsosy"
)

Set-Location -Path $PSScriptRoot

Write-Host "Enabling required APIs..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
  --project $Project | Out-Null

# Same build SA setup as the service deploy — Cloud Run --source uses the
# Compute default SA for Cloud Build.
$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$buildSa = "$projectNumber-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/cloudbuild.builds.builder" `
  --condition=None `
  --quiet | Out-Null

# The Job at runtime needs Firestore + Storage + Gemini. The default Compute SA
# already gets datastore.user / storage.objectAdmin in a fresh GCP project, but
# bind explicitly to be safe.
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/datastore.user" `
  --condition=None `
  --quiet | Out-Null
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/storage.objectAdmin" `
  --condition=None `
  --quiet | Out-Null

$repoExists = gcloud artifacts repositories describe cloud-run-source-deploy `
  --project $Project --location $Region --format "value(name)" 2>$null
if (-not $repoExists) {
  Write-Host "Creating Artifact Registry repo cloud-run-source-deploy in $Region..." -ForegroundColor Cyan
  gcloud artifacts repositories create cloud-run-source-deploy `
    --project $Project --location $Region `
    --repository-format docker `
    --description "Cloud Run source deploys" | Out-Null
}

# Same comma-escape trick as deploy.ps1.
$envVars = "^@^GEMINI_MODEL=gemini-3.1-flash-lite@GOOGLE_GENAI_USE_VERTEXAI=FALSE@FIRESTORE_PROJECT=$Project@FIRESTORE_DATABASE=(default)@GCS_BUCKET=khsosy.firebasestorage.app"

Write-Host "Deploying Cloud Run Job $Job to $Region in $Project (builds via Cloud Build)..." -ForegroundColor Cyan

# Job-specific knobs:
#   --task-timeout 86400 : 24 h per task — covers a full catalog sync.
#   --max-retries 0      : on failure, the user re-triggers from the UI; no
#                           automatic retry (we don't want duplicate writes).
#   --memory 2Gi         : OCR / embedding work batches many pages in parallel.
#   --command python --args sync_job_main.py
#                          override the service CMD to run the job entrypoint.
gcloud run jobs deploy $Job `
  --source . `
  --project $Project `
  --region $Region `
  --quiet `
  --memory 2Gi `
  --cpu 1 `
  --task-timeout 86400 `
  --max-retries 0 `
  --parallelism 1 `
  --tasks 1 `
  --command python `
  --args sync_job_main.py `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Job deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Job deployed. Launch a one-shot execution with:" -ForegroundColor Yellow
Write-Host "  gcloud run jobs execute $Job --region $Region --project $Project"
Write-Host ""
Write-Host "Or trigger from the web UI: Books page → Sync Console → Start Sync."
Write-Host "Watch from CLI:"
Write-Host "  gcloud logging tail `"resource.type=cloud_run_job AND resource.labels.job_name=$Job`""
