# Deploy + run the khsosybot-translate-metadata Cloud Run Job — a one-off batch
# that pre-translates book title/subtitle into all 7 UI locales (titleI18n /
# subI18n on each book doc). Shares the service image; the entrypoint is
# `python -m scripts.translate_book_metadata`. Runs on Cloud Run because MongoDB
# Atlas only whitelists the cloud egress IP (not local machines).
#
# Usage:
#   .\deploy-translate-metadata.ps1                 # deploy + run full catalog (batch 50)
#   .\deploy-translate-metadata.ps1 -BatchSize 50
#   .\deploy-translate-metadata.ps1 -ExtraArgs "--limit|5|--dry-run"
#   .\deploy-translate-metadata.ps1 -DeployOnly     # deploy, don't execute

[CmdletBinding()]
param(
  [string]$Job        = "khsosybot-translate-metadata",
  [string]$Region     = "us-east4",
  [string]$Project    = "khsosy",
  [int]   $BatchSize  = 50,
  [string]$ExtraArgs  = "",          # pipe-delimited extra args, e.g. "--limit|5|--dry-run"
  [switch]$DeployOnly
)

Set-Location -Path $PSScriptRoot

Write-Host "Enabling required APIs..." -ForegroundColor Cyan
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com `
  --project $Project | Out-Null

$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$buildSa = "$projectNumber-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $Project `
  --member "serviceAccount:$buildSa" `
  --role "roles/cloudbuild.builds.builder" `
  --condition=None --quiet | Out-Null

$repoExists = gcloud artifacts repositories describe cloud-run-source-deploy `
  --project $Project --location $Region --format "value(name)" 2>$null
if (-not $repoExists) {
  gcloud artifacts repositories create cloud-run-source-deploy `
    --project $Project --location $Region `
    --repository-format docker `
    --description "Cloud Run source deploys" | Out-Null
}

$envVars = "^@^GEMINI_MODEL=gemini-3.1-flash-lite@GOOGLE_GENAI_USE_VERTEXAI=FALSE@DATABASE_PROVIDER=mongodb@FIRESTORE_PROJECT=$Project@FIRESTORE_DATABASE=(default)"

# Pipe-delimited args (^|^) so values starting with "-" aren't parsed as gcloud flags.
$argList = "-m|scripts.translate_book_metadata|--batch-size|$BatchSize"
if ($ExtraArgs) { $argList = "$argList|$ExtraArgs" }
$jobArgs = "^|^$argList"

Write-Host "Deploying Cloud Run Job $Job to $Region (builds via Cloud Build)..." -ForegroundColor Cyan
gcloud run jobs deploy $Job `
  --source . `
  --project $Project `
  --region $Region `
  --quiet `
  --memory 2Gi `
  --cpu 1 `
  --task-timeout 3600 `
  --max-retries 1 `
  --parallelism 1 `
  --tasks 1 `
  --command python `
  --args $jobArgs `
  --set-env-vars $envVars `
  --set-secrets "GOOGLE_API_KEY=gemini-api-key:latest,MONGODB_URI=mongodb-uri:latest"

if ($LASTEXITCODE -ne 0) {
  Write-Host "Job deploy failed." -ForegroundColor Red
  exit $LASTEXITCODE
}

if ($DeployOnly) {
  Write-Host "Deployed (not executed). Run with: gcloud run jobs execute $Job --region $Region --project $Project" -ForegroundColor Green
  exit 0
}

Write-Host "Executing $Job (waits for completion)..." -ForegroundColor Cyan
gcloud run jobs execute $Job --region $Region --project $Project --wait
exit $LASTEXITCODE
