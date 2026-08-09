$ErrorActionPreference = "Stop"

$InstallRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Summarize This"
$UninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SummarizeThis"
$BackendPidPath = Join-Path $InstallRoot "backend.pid"
$BackendExecutable = [System.IO.Path]::GetFullPath((Join-Path $InstallRoot "SummarizeThisBackend.exe"))

if (Test-Path -LiteralPath $BackendPidPath -PathType Leaf) {
  $backendPid = 0
  if ([int]::TryParse((Get-Content -LiteralPath $BackendPidPath -Raw).Trim(), [ref]$backendPid)) {
    $backendProcess = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
    if ($backendProcess) {
      try {
        if ([System.IO.Path]::GetFullPath($backendProcess.Path) -eq $BackendExecutable) {
          Stop-Process -Id $backendPid -Force
          $backendProcess.WaitForExit()
        }
      } catch {
      }
    }
  }
}

if (Test-Path -LiteralPath $StartMenuDir) {
  Remove-Item -LiteralPath $StartMenuDir -Recurse -Force
}

if (Test-Path $UninstallKey) {
  Remove-Item -Path $UninstallKey -Recurse -Force
}

$escapedInstallRoot = $InstallRoot.Replace("'", "''")
$cleanupScript = Join-Path $env:TEMP "SummarizeThis-UninstallCleanup.ps1"
@"
Start-Sleep -Seconds 1
if (Test-Path -LiteralPath '$escapedInstallRoot') {
  Remove-Item -LiteralPath '$escapedInstallRoot' -Recurse -Force
}
Remove-Item -LiteralPath `$MyInvocation.MyCommand.Path -Force
"@ | Set-Content -LiteralPath $cleanupScript -Encoding UTF8

Start-Process -FilePath (Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe") -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $cleanupScript) -WindowStyle Hidden
Write-Host "Summarize This has been removed."
