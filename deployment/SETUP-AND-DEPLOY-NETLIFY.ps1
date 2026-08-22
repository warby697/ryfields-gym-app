$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$netlify = Join-Path $project 'node_modules\.bin\netlify.cmd'
Set-Location -LiteralPath $project

if (-not (Test-Path -LiteralPath $netlify)) {
  throw 'Netlify tools are not installed. Run pnpm install first.'
}

Write-Host 'Ryfields Gym - Netlify setup' -ForegroundColor Green
Write-Host 'A browser will open if Netlify needs you to sign in.'
$ErrorActionPreference = 'Continue'
& $netlify status 2>$null
$statusExitCode = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($statusExitCode -ne 0) { & $netlify login }

if (-not (Test-Path -LiteralPath '.netlify\state.json')) {
  Write-Host 'Choose your existing Netlify team, then create or select the Ryfields Gym site.'
  & $netlify init
}

$adminEmail = Read-Host 'Email address for the first Ryfields administrator'
$serviceAccountPath = Read-Host 'Full path to the Firebase service-account JSON file'
if (-not (Test-Path -LiteralPath $serviceAccountPath)) { throw 'The service-account JSON file was not found.' }
$service = Get-Content -LiteralPath $serviceAccountPath -Raw | ConvertFrom-Json
if (-not $service.client_email -or -not $service.private_key -or -not $service.project_id) { throw 'That file is not a valid Firebase service account.' }
if ($service.project_id -ne 'ryfields-gym') { throw 'The service account belongs to a different Firebase project.' }

$variables = [ordered]@{
  VITE_FIREBASE_API_KEY = 'AIzaSyAhYngdwQ0cn4t0xKoiLs_Wi9uhDzJGoNs'
  VITE_FIREBASE_AUTH_DOMAIN = 'ryfields-gym.firebaseapp.com'
  VITE_FIREBASE_PROJECT_ID = 'ryfields-gym'
  VITE_FIREBASE_STORAGE_BUCKET = 'ryfields-gym.firebasestorage.app'
  VITE_FIREBASE_MESSAGING_SENDER_ID = '7925237933'
  VITE_FIREBASE_APP_ID = '1:7925237933:web:d320e3186f18d755419e24'
  VITE_GOCARDLESS_ENABLED = 'false'
  FIREBASE_ADMIN_PROJECT_ID = $service.project_id
  FIREBASE_ADMIN_CLIENT_EMAIL = $service.client_email
  FIREBASE_ADMIN_PRIVATE_KEY = $service.private_key
  ADMIN_EMAIL = $adminEmail.Trim().ToLowerInvariant()
}

foreach ($entry in $variables.GetEnumerator()) {
  $arguments = @('env:set', $entry.Key, [string]$entry.Value, '--scope', 'builds', 'functions', '--context', 'production', '--force')
  if ($entry.Key -like 'FIREBASE_ADMIN_*') { $arguments += '--secret' }
  & $netlify @arguments
  if ($LASTEXITCODE -ne 0) { throw "Could not set $($entry.Key) in Netlify." }
}

& node functions\node_modules\typescript\bin\tsc -p functions\tsconfig.json
if ($LASTEXITCODE -ne 0) { throw 'Backend compilation failed.' }
& $netlify deploy --build --prod
if ($LASTEXITCODE -ne 0) { throw 'Netlify deployment failed.' }

Write-Host ''
Write-Host 'SUCCESS - Ryfields Gym is deployed to Netlify.' -ForegroundColor Green
Write-Host 'Keep the service-account JSON secure; never upload or email it.'
