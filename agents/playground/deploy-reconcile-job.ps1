# Deploy the khsosybot-reconcile Cloud Run Job (Batch 2).
#
# Backfills book_pages with subject/grade/type/language/bookType + statistical
# keywords denormalized from the books collection, so subject search can group
# correctly and pre-filter in-index. Mongo-only — no GCS volume mount needed.
#
# Shares the same Docker image as the service; `--command python --args
# reconcile_pages_job_main.py` selects the entrypoint.
#
# First run safely with a subset:  .\deploy-reconcile-job.ps1 -Limit 10
# Then full:                       .\deploy-reconcile-job.ps1 -Limit 0

[CmdletBinding()]
param(
  [string]$Job     = "khsosybot-reconcile",
  [string]$Region  = "us-east4",
  [string]$Project = "khsosy",
  [int]$Limit      = 0
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

$envVars = "^@^DATABASE_PROVIDER=mongodb@FIRESTORE_PROJECT=$Project@FIRESTORE_DATABASE=(default)@RECONCILE_LIMIT=$Limit"

Write-Host "Deploying Cloud Run Job $Job to $Region (builds via Cloud Build). RECONCILE_LIMIT=$Limit" -ForegroundColor Cyan

gcloud run jobs deploy $Job `
  --source . `
  --project $Project `
  --region $Region `
  --quiet `
  --memory 2Gi `
  --cpu 1 `
  --task-timeout 3600 `
  --max-retries 0 `
  --parallelism 1 `
  --tasks 1 `
  --command python `
  --args reconcile_pages_job_main.py `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest,MONGODB_URI=mongodb-uri:latest"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Reconcile job deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Reconcile job deployed. Run with:" -ForegroundColor Yellow
Write-Host "  gcloud run jobs execute $Job --region $Region --project $Project --wait"
Write-Host "Tail logs:"
Write-Host "  gcloud logging read `"resource.type=cloud_run_job AND resource.labels.job_name=$Job`" --project $Project --limit 50"
