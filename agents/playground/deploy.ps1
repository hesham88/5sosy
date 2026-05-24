# Deploy the 5sosybot agents service to Cloud Run.
#
# Prereqs (one-time):
#   1. Install gcloud:          winget install Google.CloudSDK
#   2. Open a new shell, then:  gcloud auth login
#   3. Set project:             gcloud config set project khsosy
#   4. Create secrets:          .\setup-secrets.ps1
#
# Usage:
#   .\deploy.ps1                 # default: service fivesosybot in us-east4
#   .\deploy.ps1 -Region us-central1

[CmdletBinding()]
param(
  [string]$Service = "khsosybot",
  [string]$Region  = "us-east4",
  [string]$Project = "khsosy"
)

Set-Location -Path $PSScriptRoot

Write-Host "Enabling required APIs..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com `
  --project $Project | Out-Null

# Grant the Compute default SA (which Cloud Run --source uses for builds) the
# composite builder role: covers storage.objects.get, artifactregistry.writer,
# and logging.logWriter.
$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$buildSa = "$projectNumber-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/cloudbuild.builds.builder" `
  --condition=None `
  --quiet | Out-Null

# Service needs to launch + cancel Cloud Run Job executions for the sync console.
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/run.developer" `
  --condition=None `
  --quiet | Out-Null

# Pre-create the Artifact Registry repo so the deploy doesn't prompt interactively.
$repoExists = gcloud artifacts repositories describe cloud-run-source-deploy `
  --project $Project --location $Region --format "value(name)" 2>$null
if (-not $repoExists) {
  Write-Host "Creating Artifact Registry repo cloud-run-source-deploy in $Region..." -ForegroundColor Cyan
  gcloud artifacts repositories create cloud-run-source-deploy `
    --project $Project --location $Region `
    --repository-format docker `
    --description "Cloud Run source deploys" | Out-Null
}

$webOrigins = "http://localhost:3000,https://khsosyapphosting--khsosy.us-east4.hosted.app"
# `^@^` overrides gcloud's default `,` delimiter so commas inside ALLOWED_ORIGINS don't break parsing.
$envVars = "^@^GEMINI_MODEL=gemini-3.1-flash-lite@GOOGLE_GENAI_USE_VERTEXAI=FALSE@DATABASE_PROVIDER=mongodb@ALLOWED_ORIGINS=$webOrigins@SYNC_JOB_NAME=khsosybot-sync@SYNC_JOB_REGION=$Region@SYNC_JOB_PROJECT=$Project@GCS_BUCKET=khsosy.firebasestorage.app"

Write-Host "Deploying $Service to $Region in $Project (this builds the container in Cloud Build)..." -ForegroundColor Cyan

# --no-cpu-throttling: keeps CPU always allocated so BackgroundTasks (custom PDF
# parse) survive past the HTTP response. --timeout 3600 is the Cloud Run max for
# request-driven services; combined with always-allocated CPU it covers single
# large PDFs. The batch MOE sync is no longer here — see deploy-job.ps1.
gcloud run deploy $Service `
  --source . `
  --project $Project `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --quiet `
  --port 8080 `
  --memory 1Gi `
  --cpu 1 `
  --no-cpu-throttling `
  --max-instances 3 `
  --concurrency 10 `
  --timeout 3600 `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest,AGENTS_API_KEY=khsosybot-api-key:latest,MONGODB_URI=mongodb-uri:latest"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

$url = gcloud run services describe $Service --region $Region --project $Project --format "value(status.url)"
Write-Host "`nService URL: $url" -ForegroundColor Green
Write-Host "Smoke test:" -ForegroundColor Yellow
Write-Host "  curl `"$url/health`""
Write-Host ""
Write-Host "Add to web/.env.local:" -ForegroundColor Yellow
Write-Host "  AGENTS_BASE_URL=$url"
Write-Host "  AGENTS_API_KEY=<value printed by setup-secrets.ps1>"
