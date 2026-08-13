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
$LauncherProcess = $null
$CollisionListener = $null
$BackendPort = 0

function Assert-CurrentUserOnlyAcl {
  param(
    [System.Security.AccessControl.FileSystemSecurity]$Acl,
    [string]$Label
  )
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  if (-not $Acl.AreAccessRulesProtected) {
    throw "$Label still inherits access rules."
  }
  $rules = @($Acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  if ($rules.Count -ne 1 -or $rules[0].IdentityReference -ne $currentSid -or $rules[0].AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or -not $rules[0].FileSystemRights.HasFlag([System.Security.AccessControl.FileSystemRights]::FullControl)) {
    throw "$Label is not restricted to one current-user full-control rule."
  }
}

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
  Assert-CurrentUserOnlyAcl -Acl $settingsAcl -Label "The installed private backend settings file"
  $dataAcl = Get-Acl -LiteralPath (Join-Path $InstallRoot "data")
  Assert-CurrentUserOnlyAcl -Acl $dataAcl -Label "The installed private data directory"

  $testNgrokUrl = "https://summarize-this-test.ngrok.app"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "Start-SummarizeThisCloud.ps1") -ConfigureUrl $testNgrokUrl
  if ($LASTEXITCODE -ne 0) { throw "The ngrok domain configuration helper returned exit code $LASTEXITCODE." }
  $configuredNgrokUrl = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "Start-SummarizeThisCloud.ps1") -PrintConfiguredUrl
  if (([string]$configuredNgrokUrl).Trim() -ne $testNgrokUrl) { throw "The ngrok domain configuration was not resolved exactly." }
  $ngrokSettingsBeforeUpgrade = Get-Content -LiteralPath (Join-Path $InstallRoot "ngrok-settings.psd1") -Raw
  $cloudShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Summarize This\Configure ngrok domain.lnk"
  if (-not (Test-Path -LiteralPath $cloudShortcut -PathType Leaf)) { throw "The ngrok domain configuration shortcut is missing." }

  try {
    $CollisionListener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 18787)
    $CollisionListener.Start()
  } catch {
    $CollisionListener = $null
  }

  $backendPortOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "Start-SummarizeThis.ps1") -BackendOnly -NoLaunch -PrintBackendPort
  if ($LASTEXITCODE -ne 0) { throw "Installed backend launcher returned exit code $LASTEXITCODE." }
  if (-not [int]::TryParse(([string]($backendPortOutput | Select-Object -Last 1)).Trim(), [ref]$BackendPort)) {
    throw "Installed backend launcher did not report its port."
  }
  if ($CollisionListener -and $BackendPort -eq 18787) {
    throw "Installed backend did not avoid the occupied default port."
  }
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/api/health" -TimeoutSec 3
  if ($health.status -ne "ok" -or $health.storage.kind -ne "local") {
    throw "Installed backend health or storage status is invalid."
  }

  $testEmail = "upgrade-test@example.invalid"
  $testPassword = "upgrade-test-password"
  $registration = Invoke-RestMethod -Method Post -ContentType "application/json" -Uri "http://127.0.0.1:$BackendPort/api/auth/register" -Body (@{
    email = $testEmail
    password = $testPassword
    name = "Upgrade Test"
  } | ConvertTo-Json) -TimeoutSec 5
  if (-not $registration.token) { throw "Installed backend did not create the upgrade persistence account." }
  try {
    $unexpectedRegistration = Invoke-RestMethod -Method Post -ContentType "application/json" -Uri "http://127.0.0.1:$BackendPort/api/auth/register" -Body (@{
      email = "second-owner@example.invalid"
      password = "second-owner-password"
      name = "Second Owner"
    } | ConvertTo-Json) -TimeoutSec 5
    throw "Single-user Windows backend accepted a second registration."
  } catch {
    $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($statusCode -ne 403) { throw }
  }

  $backendSettingsPath = Join-Path $InstallRoot "backend-settings.psd1"
  $settingsBeforeUpgrade = Import-PowerShellDataFile -LiteralPath $backendSettingsPath
  [void]$settingsBeforeUpgrade.Remove("REGISTRATION_MODE")
  $legacyLines = @("@{")
  foreach ($entry in $settingsBeforeUpgrade.GetEnumerator()) {
    $safeValue = ([string]$entry.Value).Replace("'", "''")
    $legacyLines += "  $($entry.Key) = '$safeValue'"
  }
  $legacyLines += "}"
  Set-Content -LiteralPath $backendSettingsPath -Value $legacyLines -Encoding UTF8
  $oldBackendPid = [int](Get-Content -LiteralPath (Join-Path $InstallRoot "backend.pid") -Raw)
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Payload "install.ps1") -NoLaunch
  if ($LASTEXITCODE -ne 0) { throw "Upgrade installer payload returned exit code $LASTEXITCODE." }
  if (Get-Process -Id $oldBackendPid -ErrorAction SilentlyContinue) {
    throw "Upgrade installer did not stop the exact installed backend process."
  }
  $settingsAfterUpgrade = Import-PowerShellDataFile -LiteralPath $backendSettingsPath
  if ($settingsAfterUpgrade.REGISTRATION_MODE -ne "single-user") {
    throw "Upgrade installer did not migrate the Windows registration policy."
  }
  foreach ($entry in $settingsBeforeUpgrade.GetEnumerator()) {
    if ([string]$settingsAfterUpgrade[$entry.Key] -ne [string]$entry.Value) {
      throw "Upgrade installer changed the existing backend setting $($entry.Key)."
    }
  }
  $ngrokSettingsAfterUpgrade = Get-Content -LiteralPath (Join-Path $InstallRoot "ngrok-settings.psd1") -Raw
  if ($ngrokSettingsAfterUpgrade -ne $ngrokSettingsBeforeUpgrade) {
    throw "Upgrade installer replaced the configured ngrok domain."
  }

  $backendPortOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "Start-SummarizeThis.ps1") -BackendOnly -NoLaunch -PrintBackendPort
  if ($LASTEXITCODE -ne 0) { throw "Upgraded backend launcher returned exit code $LASTEXITCODE." }
  if (-not [int]::TryParse(([string]($backendPortOutput | Select-Object -Last 1)).Trim(), [ref]$BackendPort)) {
    throw "Upgraded backend launcher did not report its port."
  }
  $signIn = Invoke-RestMethod -Method Post -ContentType "application/json" -Uri "http://127.0.0.1:$BackendPort/api/auth/login" -Body (@{
    email = $testEmail
    password = $testPassword
  } | ConvertTo-Json) -TimeoutSec 5
  if (-not $signIn.token) { throw "Upgrade did not preserve local backend data." }

  $staticPort = 18137
  if (Get-NetTCPConnection -State Listen -LocalPort $staticPort -ErrorAction SilentlyContinue) {
    throw "Static acceptance port $staticPort is already in use."
  }
  $LauncherProcess = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $InstallRoot "Start-SummarizeThis.ps1"),
    "-NoLaunch", "-Port", [string]$staticPort
  ) -WorkingDirectory $InstallRoot -WindowStyle Hidden -PassThru
  $staticHealthy = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    try {
      $staticHealth = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$staticPort/__summarize_this_health" -TimeoutSec 1
      if ($staticHealth.StatusCode -eq 200 -and $staticHealth.Content -eq "ok") {
        $staticHealthy = $true
        break
      }
    } catch {
    }
  }
  if (-not $staticHealthy) { throw "Installed static launcher did not become healthy." }
  $popupResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$staticPort/popup.html?installed=1&backendPort=$BackendPort" -TimeoutSec 3
  if ($popupResponse.StatusCode -ne 200) { throw "Installed popup was not served." }
  foreach ($privatePath in @("backend-settings.psd1", "ngrok-settings.psd1", "SummarizeThisBackend.exe", "backend.pid", "data/local-backend-store.json", "Start-SummarizeThis.ps1")) {
    try {
      $unexpected = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$staticPort/$privatePath" -TimeoutSec 3
      throw "Private installer file $privatePath was served with HTTP $($unexpected.StatusCode)."
    } catch {
      $statusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
      if ($statusCode -ne 404) { throw "Private installer file $privatePath did not fail with HTTP 404." }
    }
  }
  Stop-Process -Id $LauncherProcess.Id -Force
  $LauncherProcess.WaitForExit()
  $LauncherProcess = $null

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "uninstall.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Uninstaller returned exit code $LASTEXITCODE." }
  for ($attempt = 0; $attempt -lt 40 -and (Test-Path -LiteralPath $InstallRoot); $attempt++) {
    Start-Sleep -Milliseconds 250
  }
  if (Test-Path -LiteralPath $InstallRoot) { throw "Uninstaller did not remove the test installation." }
  if (Test-Path $UninstallKey) { throw "Uninstaller did not remove the registration entry." }

  [pscustomobject]@{
    InstalledBackend = $health.status
    SelectedBackendPort = $BackendPort
    DefaultPortCollisionHandled = ($BackendPort -ne 18787)
    CloudDomainPreserved = ($ngrokSettingsAfterUpgrade -eq $ngrokSettingsBeforeUpgrade)
    Storage = $health.storage.kind
    PrivateSettingsAcl = $settingsAcl.AreAccessRulesProtected
    PrivateDataAcl = $dataAcl.AreAccessRulesProtected
    UpgradePreservedData = $true
    PrivateFilesBlocked = $true
    Uninstalled = $true
  }
} finally {
  if ($CollisionListener) { $CollisionListener.Stop() }
  if ($LauncherProcess -and -not $LauncherProcess.HasExited) {
    Stop-Process -Id $LauncherProcess.Id -Force
  }
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
