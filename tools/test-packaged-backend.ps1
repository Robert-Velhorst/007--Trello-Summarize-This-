param(
  [string]$ExecutablePath = "dist/windows-backend/SummarizeThisBackend.exe",
  [int]$Port = 18787
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Executable = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $ExecutablePath))
if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) {
  throw "Packaged backend was not found at $Executable"
}

$DataDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("SummarizeThisExeTest-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $DataDirectory | Out-Null
$StorePath = Join-Path $DataDirectory "store.json"
$Process = $null

try {
  $env:JWT_SECRET = "standalone-test-session-secret-32-characters"
  $env:ADMIN_PASSWORD = "standalone-test-admin-password"
  $env:ADMIN_EMAIL = "standalone-admin@example.test"
  $env:TRELLO_APP_KEY = "710f51778ec3e0eff7be947779695aed"
  $env:BACKEND_STORE = "local"
  $env:BACKEND_STORE_PATH = $StorePath
  $env:BACKEND_ALLOWED_ORIGINS = "http://127.0.0.1:17117"
  $env:HAI_CONNECTOR_ENABLED = "true"
  $env:API_HOST = "127.0.0.1"
  $env:API_PORT = [string]$Port

  $Process = Start-Process -FilePath $Executable -PassThru -WindowStyle Hidden
  $Health = $null
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
      if ($Health.status -eq "ok") { break }
    } catch {
      $Health = $null
    }
  }

  if ($null -eq $Health -or $Health.status -ne "ok") {
    throw "Packaged backend did not become healthy on port $Port."
  }
  if (-not (Test-Path -LiteralPath $StorePath -PathType Leaf)) {
    throw "Packaged backend did not create its private local store."
  }

  [pscustomobject]@{
    Status = $Health.status
    Version = $Health.version
    Storage = $Health.storage.kind
    StoreBytes = (Get-Item -LiteralPath $StorePath).Length
    ExecutableBytes = (Get-Item -LiteralPath $Executable).Length
  }
} finally {
  if ($Process -and -not $Process.HasExited) {
    Stop-Process -Id $Process.Id -Force
    $Process.WaitForExit()
  }
  if (Test-Path -LiteralPath $DataDirectory) {
    Remove-Item -LiteralPath $DataDirectory -Recurse -Force
  }
}
