# Deploy the khsosybot-migration Cloud Run Job — the Firestore-to-MongoDB migration job.
# Shares the same Docker image as the main service;
# `--command python --args migration_job_main.py` selects the entrypoint.
#
# Usage:
#   .\deploy-migration.ps1                    # default: us-east4, project khsosy
#   .\deploy-migration.ps1 -Region us-central1

[CmdletBinding()]
param(
  [string]$Job     = "khsosybot-migration",
  [string]$Region  = "us-east4",
  [string]$Project = "khsosy"
)

Set-Location -Path $PSScriptRoot

Write-Host "Enabling required APIs..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com `
  --project $Project | Out-Null

$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$buildSa = "$projectNumber-compute@developer.gserviceaccount.com"

# Bind necessary SA roles for building and executing datastore/storage operations.
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/cloudbuild.builds.builder" `
  --condition=None --quiet | Out-Null
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/datastore.user" `
  --condition=None --quiet | Out-Null

# Verify the secret exists
$secretExists = gcloud secrets describe mongodb-uri --project $Project 2>$null
if (-not $secretExists) {
  Write-Host "WARNING: Secret 'mongodb-uri' does not exist in project $Project! Please run setup-secrets or create it first." -ForegroundColor Yellow
}

$repoExists = gcloud artifacts repositories describe cloud-run-source-deploy `
  --project $Project --location $Region --format "value(name)" 2>$null
if (-not $repoExists) {
  Write-Host "Creating Artifact Registry repo cloud-run-source-deploy in $Region..." -ForegroundColor Cyan
  gcloud artifacts repositories create cloud-run-source-deploy `
    --project $Project --location $Region `
    --repository-format docker `
    --description "Cloud Run source deploys" | Out-Null
}

$envVars = "^@^GEMINI_MODEL=gemini-3.1-flash-lite@GOOGLE_GENAI_USE_VERTEXAI=FALSE@FIRESTORE_PROJECT=$Project@FIRESTORE_DATABASE=(default)"

Write-Host "Deploying Cloud Run Job $Job to $Region in $Project (builds via Cloud Build)..." -ForegroundColor Cyan

# Resource parameters for migration job (4 GiB memory, 2 CPUs)
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
  --args migration_job_main.py `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest,MONGODB_URI=mongodb-uri:latest"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Migration job deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Migration job deployed successfully." -ForegroundColor Green
Write-Host "Launch with:" -ForegroundColor Yellow
Write-Host "  gcloud run jobs execute $Job --region $Region --project $Project"
Write-Host "Tail logs:"
Write-Host "  gcloud logging tail `"resource.type=cloud_run_job AND resource.labels.job_name=$Job`""
