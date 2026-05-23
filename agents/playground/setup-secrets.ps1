# Create Secret Manager secrets used by the Cloud Run deploy.
# Run once per project. Re-running with -Force replaces existing values.
#
# Creates:
#   gemini-api-key        -> value of GOOGLE_API_KEY from .env (or -GeminiKey param)
#   fivesosybot-api-key   -> a freshly generated 32-byte hex string (or -AgentsKey param)
#
# Prints both names + the AGENTS_API_KEY value at the end so you can paste it
# into the web app's environment.

[CmdletBinding()]
param(
  [string]$Project = "khsosy",
  [string]$GeminiKey,
  [string]$AgentsKey,
  [string]$MongoUri,
  [switch]$Force
)

Set-Location -Path $PSScriptRoot

# Resolve Gemini key: param -> .env GOOGLE_API_KEY -> prompt
if (-not $GeminiKey) {
  if (Test-Path ".env") {
    $line = Select-String -Path .env -Pattern '^GOOGLE_API_KEY=' | Select-Object -First 1
    if ($line) {
      $GeminiKey = ($line.Line -replace '^GOOGLE_API_KEY=', '').Trim('"').Trim("'")
    }
  }
}
if (-not $GeminiKey) {
  Write-Host "GOOGLE_API_KEY not found. Provide -GeminiKey or set it in .env first." -ForegroundColor Red
  exit 1
}

# Resolve MongoDB URI: param -> .env MONGODB_URI
if (-not $MongoUri) {
  if (Test-Path ".env") {
    $line = Select-String -Path .env -Pattern '^MONGODB_URI=' | Select-Object -First 1
    if ($line) {
      $val = ($line.Line -replace '^MONGODB_URI=', '').Trim('"').Trim("'")
      if ($val -and $val -ne "fetch_from_secret_manager") {
        $MongoUri = $val
      }
    }
  }
}

# Resolve shared-secret API key: param -> random 32-byte hex
if (-not $AgentsKey) {
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $AgentsKey = -join ($bytes | ForEach-Object { $_.ToString('x2') })
}

# Make sure Secret Manager API is on
gcloud services enable secretmanager.googleapis.com --project $Project | Out-Null

function Ensure-Secret($name, $value) {
  $exists = gcloud secrets describe $name --project $Project 2>$null
  if ($LASTEXITCODE -eq 0) {
    if (-not $Force) {
      Write-Host "Secret '$name' already exists. Use -Force to add a new version." -ForegroundColor Yellow
      return
    }
    Write-Host "Adding new version to existing secret '$name'..." -ForegroundColor Cyan
  } else {
    Write-Host "Creating secret '$name'..." -ForegroundColor Cyan
    gcloud secrets create $name --project $Project --replication-policy=automatic | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create secret $name" }
  }
  # Add value as a new version. echo -n equivalent via [Console]::Write.
  $tmp = [System.IO.Path]::GetTempFileName()
  try {
    [System.IO.File]::WriteAllText($tmp, $value, [System.Text.UTF8Encoding]::new($false))
    gcloud secrets versions add $name --project $Project --data-file=$tmp | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to add version to $name" }
  } finally {
    Remove-Item $tmp -ErrorAction SilentlyContinue
  }
}

Ensure-Secret "gemini-api-key" $GeminiKey
Ensure-Secret "khsosybot-api-key" $AgentsKey
if ($MongoUri) {
  Ensure-Secret "mongodb-uri" $MongoUri
}

# Grant the Cloud Run runtime SA access to read the secrets.
$projectNumber = gcloud projects describe $Project --format="value(projectNumber)"
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
$secretsToGrant = @("gemini-api-key", "khsosybot-api-key")
if ($MongoUri -or (gcloud secrets describe mongodb-uri --project $Project 2>$null)) {
  $secretsToGrant += "mongodb-uri"
}
foreach ($secret in $secretsToGrant) {
  gcloud secrets add-iam-policy-binding $secret `
    --project $Project `
    --member "serviceAccount:$runtimeSa" `
    --role "roles/secretmanager.secretAccessor" | Out-Null
}

Write-Host "`nSecrets ready in project $Project." -ForegroundColor Green
Write-Host "gemini-api-key        -> existing version added or kept"
Write-Host "khsosybot-api-key   -> value below (also accessible via gcloud secrets versions access latest --secret khsosybot-api-key)"
Write-Host ""
Write-Host "AGENTS_API_KEY = $AgentsKey" -ForegroundColor Magenta
Write-Host ""
Write-Host "Save this value: it goes into web/.env.local as AGENTS_API_KEY and into App Hosting env config." -ForegroundColor Yellow
