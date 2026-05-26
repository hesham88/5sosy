# Deploy the khsosybot-mindmap Cloud Run Job (Batch 2, Part 4).
#
# Clusters the EXISTING book_pages embeddings into concept_nodes +
# concept_occurrences and builds cross-grade concept_edges. Mongo-only — no GCS
# mount. Reads reconciled page metadata (run khsosybot-reconcile first).
#
# Shares the same Docker image as the service; `--command python --args
# mindmap_job_main.py` selects the entrypoint. Status/logs → Firestore
# ingestion/mindmap_status (live console); concept data → MongoDB.

[CmdletBinding()]
param(
  [string]$Job     = "khsosybot-mindmap",
  [string]$Region  = "us-east4",
  [string]$Project = "khsosy"
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

$envVars = "^@^GEMINI_MODEL=gemini-3.1-flash-lite@GOOGLE_GENAI_USE_VERTEXAI=FALSE@DATABASE_PROVIDER=mongodb@FIRESTORE_PROJECT=$Project@FIRESTORE_DATABASE=(default)"

Write-Host "Deploying Cloud Run Job $Job to $Region (builds via Cloud Build)..." -ForegroundColor Cyan

gcloud run jobs deploy $Job `
  --source . `
  --project $Project `
  --region $Region `
  --quiet `
  --memory 4Gi `
  --cpu 2 `
  --task-timeout 7200 `
  --max-retries 0 `
  --parallelism 1 `
  --tasks 1 `
  --command python `
  --args mindmap_job_main.py `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest,MONGODB_URI=mongodb-uri:latest"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Mind-map job deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Mind-map job deployed. Run with:" -ForegroundColor Yellow
Write-Host "  gcloud run jobs execute $Job --region $Region --project $Project --wait"
Write-Host "Or from the web UI: Books page -> Pipeline Console -> Mind-Map Builder -> Start."
