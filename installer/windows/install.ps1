param([switch]$NoLaunch)

$ErrorActionPreference = "Stop"

$InstallRoot = Join-Path $env:LOCALAPPDATA "SummarizeThis"
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Summarize This"
$PowerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$InstalledBackendPidPath = Join-Path $InstallRoot "backend.pid"
$InstalledBackendExecutable = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot "SummarizeThisBackend.exe"))

function Stop-InstalledBackend {
  if (-not (Test-Path -LiteralPath $InstalledBackendPidPath -PathType Leaf)) { return }

  $backendPid = 0
  if (-not [int]::TryParse((Get-Content -LiteralPath $InstalledBackendPidPath -Raw).Trim(), [ref]$backendPid)) {
    Remove-Item -LiteralPath $InstalledBackendPidPath -Force
    return
  }

  $backendProcess = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
  if (-not $backendProcess) {
    Remove-Item -LiteralPath $InstalledBackendPidPath -Force
    return
  }

  try {
    $actualExecutable = [System.IO.Path]::GetFullPath($backendProcess.Path)
  } catch {
    throw "The running backend process could not be verified safely. Close Summarize This and run the installer again."
  }
  if (-not $actualExecutable.Equals($InstalledBackendExecutable, [System.StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $InstalledBackendPidPath -Force
    return
  }

  Stop-Process -Id $backendPid -Force
  $backendProcess.WaitForExit()
  Remove-Item -LiteralPath $InstalledBackendPidPath -Force -ErrorAction SilentlyContinue
}

$RuntimeManifestPath = Join-Path $PSScriptRoot "runtime-files.json"
if (-not (Test-Path -LiteralPath $RuntimeManifestPath -PathType Leaf)) {
  throw "Installer package is missing runtime-files.json"
}
$RuntimeFiles = Get-Content -LiteralPath $RuntimeManifestPath -Raw | ConvertFrom-Json
$HelperFiles = @("Start-SummarizeThis.ps1", "Start-SummarizeThisCloud.ps1", "uninstall.ps1", "SummarizeThisBackend.exe")

if ($RuntimeFiles.Count -eq 0 -or $RuntimeFiles.Count -ne (@($RuntimeFiles | Select-Object -Unique)).Count) {
  throw "runtime-files.json must contain a non-empty unique file list."
}

Stop-InstalledBackend
New-Item -ItemType Directory -Force -Path $InstallRoot | Out-Null
New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null

foreach ($file in @($RuntimeFiles) + $HelperFiles) {
  $source = Join-Path $PSScriptRoot $file
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Installer package is missing $file"
  }

  Copy-Item -LiteralPath $source -Destination (Join-Path $InstallRoot $file) -Force
}

function New-PrivateRandomText {
  param([int]$Bytes = 32)
  $buffer = New-Object byte[] $Bytes
  $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $random.GetBytes($buffer) } finally { $random.Dispose() }
  return [Convert]::ToBase64String($buffer).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Test-CurrentUserOnlyAcl {
  param(
    [System.Security.AccessControl.FileSystemSecurity]$Security,
    [System.Security.Principal.SecurityIdentifier]$CurrentUser,
    [System.Security.AccessControl.InheritanceFlags]$InheritanceFlags
  )
  if (-not $Security.AreAccessRulesProtected -or $Security.GetOwner([System.Security.Principal.SecurityIdentifier]) -ne $CurrentUser) {
    return $false
  }
  $rules = @($Security.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
  return $rules.Count -eq 1 -and
    $rules[0].IdentityReference -eq $CurrentUser -and
    $rules[0].AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
    $rules[0].FileSystemRights.HasFlag([System.Security.AccessControl.FileSystemRights]::FullControl) -and
    $rules[0].InheritanceFlags -eq $InheritanceFlags
}

function Protect-CurrentUserFile {
  param([string]$Path)
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $security = Get-Acl -LiteralPath $Path
  if ($security.GetOwner([System.Security.Principal.SecurityIdentifier]) -ne $identity.User) {
    throw "The private settings file is not owned by the current Windows user."
  }
  if (Test-CurrentUserOnlyAcl -Security $security -CurrentUser $identity.User -InheritanceFlags ([System.Security.AccessControl.InheritanceFlags]::None)) {
    return
  }
  $security.SetAccessRuleProtection($true, $false)
  foreach ($existingRule in $security.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    [void]$security.RemoveAccessRuleSpecific($existingRule)
  }
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $identity.User,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $security.AddAccessRule($rule)
  Set-Acl -LiteralPath $Path -AclObject $security
}

function Protect-CurrentUserDirectory {
  param([string]$Path)
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $security = Get-Acl -LiteralPath $Path
  if ($security.GetOwner([System.Security.Principal.SecurityIdentifier]) -ne $identity.User) {
    throw "The private data directory is not owned by the current Windows user."
  }
  $directoryInheritance = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
  if (Test-CurrentUserOnlyAcl -Security $security -CurrentUser $identity.User -InheritanceFlags $directoryInheritance) {
    return
  }
  $security.SetAccessRuleProtection($true, $false)
  foreach ($existingRule in $security.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier])) {
    [void]$security.RemoveAccessRuleSpecific($existingRule)
  }
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $identity.User,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $directoryInheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $security.AddAccessRule($rule)
  Set-Acl -LiteralPath $Path -AclObject $security
}

$BackendSettingsPath = Join-Path $InstallRoot "backend-settings.psd1"
$dataDirectory = Join-Path $InstallRoot "data"
New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
Protect-CurrentUserDirectory -Path $dataDirectory
if (-not (Test-Path -LiteralPath $BackendSettingsPath -PathType Leaf)) {
  $localOrigins = 17117..17136 | ForEach-Object { "http://127.0.0.1:$_" }
  $settings = [ordered]@{
    API_HOST = "127.0.0.1"
    API_PORT = "18787"
    BACKEND_STORE = "local"
    BACKEND_STORE_PATH = (Join-Path $dataDirectory "local-backend-store.json")
    JWT_SECRET = (New-PrivateRandomText -Bytes 48)
    ADMIN_EMAIL = "local-admin@summarize-this.invalid"
    ADMIN_PASSWORD = (New-PrivateRandomText -Bytes 32)
    TRELLO_APP_KEY = "710f51778ec3e0eff7be947779695aed"
    TRELLO_APP_NAME = "Summarize This"
    BACKEND_ALLOWED_ORIGINS = ((@($localOrigins) + "https://robert-velhorst.github.io") -join ",")
    HAI_CONNECTOR_ENABLED = "true"
  }
  $lines = @("@{")
  foreach ($entry in $settings.GetEnumerator()) {
    $safeValue = ([string]$entry.Value).Replace("'", "''")
    $lines += "  $($entry.Key) = '$safeValue'"
  }
  $lines += "}"
  Set-Content -LiteralPath $BackendSettingsPath -Value $lines -Encoding UTF8
}
Protect-CurrentUserFile -Path $BackendSettingsPath

function New-AppShortcut {
  param(
    [string]$ShortcutPath,
    [string]$Target,
    [string]$Arguments,
    [string]$WorkingDirectory
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = $Target
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Description = "Start Summarize This"
  $shortcut.Save()
}

$launchScript = Join-Path $InstallRoot "Start-SummarizeThis.ps1"
$launchArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$launchScript`""
$setupArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$launchScript`" -Setup"
$cloudScript = Join-Path $InstallRoot "Start-SummarizeThisCloud.ps1"
$cloudArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$cloudScript`""
$uninstallScript = Join-Path $InstallRoot "uninstall.ps1"
$uninstallArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$uninstallScript`""

New-AppShortcut -ShortcutPath (Join-Path $StartMenuDir "Summarize This.lnk") -Target $PowerShellPath -Arguments $launchArgs -WorkingDirectory $InstallRoot
New-AppShortcut -ShortcutPath (Join-Path $StartMenuDir "Configure Trello Power-Up.lnk") -Target $PowerShellPath -Arguments $setupArgs -WorkingDirectory $InstallRoot
New-AppShortcut -ShortcutPath (Join-Path $StartMenuDir "Share Backend with ngrok.lnk") -Target $PowerShellPath -Arguments $cloudArgs -WorkingDirectory $InstallRoot
New-AppShortcut -ShortcutPath (Join-Path $StartMenuDir "Uninstall Summarize This.lnk") -Target $PowerShellPath -Arguments $uninstallArgs -WorkingDirectory $InstallRoot

$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SummarizeThis"
$updateManifest = Get-Content -LiteralPath (Join-Path $InstallRoot "update.json") -Raw | ConvertFrom-Json
$displayVersion = [string]$updateManifest.version
if ($displayVersion -notmatch '^\d+\.\d+\.\d+$') {
  throw "The installed update manifest has an invalid semantic version."
}
New-Item -Path $uninstallKey -Force | Out-Null
Set-ItemProperty -Path $uninstallKey -Name DisplayName -Value "Summarize This"
Set-ItemProperty -Path $uninstallKey -Name DisplayVersion -Value $displayVersion
Set-ItemProperty -Path $uninstallKey -Name Publisher -Value "Summarize This Team"
Set-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $InstallRoot
Set-ItemProperty -Path $uninstallKey -Name UninstallString -Value "`"$PowerShellPath`" $uninstallArgs"
Set-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -Type DWord
Set-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -Type DWord

if (-not $NoLaunch) {
  Start-Process -FilePath $PowerShellPath -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $launchScript) -WorkingDirectory $InstallRoot
}
Write-Host "Summarize This installed to $InstallRoot"
