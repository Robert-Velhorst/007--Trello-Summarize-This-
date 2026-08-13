$ErrorActionPreference = "Stop"

$InstallRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $InstallRoot "Start-SummarizeThis.ps1"
$PowerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

$backendPortOutput = & $PowerShellPath -NoProfile -ExecutionPolicy Bypass -File $Launcher -BackendOnly -NoLaunch -PrintBackendPort
if ($LASTEXITCODE -ne 0) {
  throw "The local backend could not be started."
}
$BackendPort = 0
if (-not [int]::TryParse(([string]($backendPortOutput | Select-Object -Last 1)).Trim(), [ref]$BackendPort) -or $BackendPort -lt 1024 -or $BackendPort -gt 65535) {
  throw "The local backend did not report a valid loopback port."
}

$Ngrok = Get-Command ngrok.exe -ErrorAction SilentlyContinue
if (-not $Ngrok) {
  throw "ngrok is not installed or is not available on PATH. Install ngrok and run 'ngrok config add-authtoken ...' once, then try again."
}

Write-Host "Opening a secure ngrok tunnel to the Summarize This backend."
Write-Host "Keep this window open while Trello or HAI uses the cloud URL."
& $Ngrok.Source http "http://127.0.0.1:$BackendPort"
