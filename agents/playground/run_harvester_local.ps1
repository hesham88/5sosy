# Run the harvester locally to download textbooks and upload them to Firebase Storage.
# This bypasses the Cloud Run IP block from the Ministry of Education (MOE) website.

$env:FIRESTORE_PROJECT = "khsosy"
$env:FIRESTORE_DATABASE = "(default)"
$env:GCS_BUCKET = "khsosy.firebasestorage.app"
$env:SYNC_WORKER_COUNT = "2" # Keep it safe to prevent local IP bans

Write-Host "Running harvester job locally..." -ForegroundColor Cyan
& ".\.venv\Scripts\python.exe" harvester_job_main.py
