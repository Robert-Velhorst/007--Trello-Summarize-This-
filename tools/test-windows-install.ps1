param([string]$PayloadPath = ".tmp/installer-payload")

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$Payload = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $PayloadPath))
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SummarizeThis"
if (Test-Path $UninstallKey) {
  throw "A real Summarize This installation is already registered; refusing to overwrite it during acceptance testing."
}

$TestRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("SummarizeThisInstallTest-" + [guid]::NewGuid().ToString("N"))
$OldLocalAppData = $env:LOCALAPPDATA
$OldAppData = $env:APPDATA
$InstallRoot = Join-Path $TestRoot "Local\SummarizeThis"

try {
  $env:LOCALAPPDATA = Join-Path $TestRoot "Local"
  $env:APPDATA = Join-Path $TestRoot "Roaming"
  New-Item -ItemType Directory -Force -Path $env:LOCALAPPDATA, $env:APPDATA | Out-Null

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Payload "install.ps1") -NoLaunch
  if ($LASTEXITCODE -ne 0) { throw "Installer payload returned exit code $LASTEXITCODE." }

  foreach ($required in @(
    "SummarizeThisBackend.exe",
    "backend-settings.psd1",
    "popup.html",
    "settings-powerup.html",
    "trello-config.js",
    "authorize.html",
    "Start-SummarizeThis.ps1",
    "Start-SummarizeThisCloud.ps1"
  )) {
    if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot $required) -PathType Leaf)) {
      throw "Installed application is missing $required."
    }
  }

  $settingsAcl = Get-Acl -LiteralPath (Join-Path $InstallRoot "backend-settings.psd1")
  if (-not $settingsAcl.AreAccessRulesProtected) {
    throw "The installed private backend settings file still inherits access rules."
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "Start-SummarizeThis.ps1") -BackendOnly -NoLaunch
  if ($LASTEXITCODE -ne 0) { throw "Installed backend launcher returned exit code $LASTEXITCODE." }
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:18787/api/health" -TimeoutSec 3
  if ($health.status -ne "ok" -or $health.storage.kind -ne "local") {
    throw "Installed backend health or storage status is invalid."
  }

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "uninstall.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Uninstaller returned exit code $LASTEXITCODE." }
  for ($attempt = 0; $attempt -lt 40 -and (Test-Path -LiteralPath $InstallRoot); $attempt++) {
    Start-Sleep -Milliseconds 250
  }
  if (Test-Path -LiteralPath $InstallRoot) { throw "Uninstaller did not remove the test installation." }
  if (Test-Path $UninstallKey) { throw "Uninstaller did not remove the registration entry." }

  [pscustomobject]@{
    InstalledBackend = $health.status
    Storage = $health.storage.kind
    PrivateSettingsAcl = $settingsAcl.AreAccessRulesProtected
    Uninstalled = $true
  }
} finally {
  $pidPath = Join-Path $InstallRoot "backend.pid"
  if (Test-Path -LiteralPath $pidPath -PathType Leaf) {
    $backendPid = 0
    if ([int]::TryParse((Get-Content -LiteralPath $pidPath -Raw).Trim(), [ref]$backendPid)) {
      $process = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
      if ($process) {
        try {
          if ([System.IO.Path]::GetFullPath($process.Path) -eq [System.IO.Path]::GetFullPath((Join-Path $InstallRoot "SummarizeThisBackend.exe"))) {
            Stop-Process -Id $backendPid -Force
          }
        } catch {
        }
      }
    }
  }
  if (Test-Path $UninstallKey) { Remove-Item -Path $UninstallKey -Recurse -Force }
  if (Test-Path -LiteralPath $TestRoot) { Remove-Item -LiteralPath $TestRoot -Recurse -Force }
  $env:LOCALAPPDATA = $OldLocalAppData
  $env:APPDATA = $OldAppData
}
