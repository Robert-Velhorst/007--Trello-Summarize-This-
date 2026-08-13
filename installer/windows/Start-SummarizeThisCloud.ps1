param(
  [switch]$Configure,
  [string]$ConfigureUrl = "",
  [switch]$PrintConfiguredUrl
)

$ErrorActionPreference = "Stop"

$InstallRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Launcher = Join-Path $InstallRoot "Start-SummarizeThis.ps1"
$CloudSettingsPath = Join-Path $InstallRoot "ngrok-settings.psd1"
$PowerShellPath = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

function Resolve-NgrokPublicUrl {
  param([string]$Value)

  $uri = $null
  if (-not [Uri]::TryCreate(([string]$Value).Trim(), [UriKind]::Absolute, [ref]$uri) -or
      $uri.Scheme -ne "https" -or
      [Uri]::CheckHostName($uri.DnsSafeHost) -ne [UriHostNameType]::Dns -or
      -not $uri.IsDefaultPort -or
      -not [string]::IsNullOrWhiteSpace($uri.UserInfo) -or
      $uri.AbsolutePath -ne "/" -or
      -not [string]::IsNullOrWhiteSpace($uri.Query) -or
      -not [string]::IsNullOrWhiteSpace($uri.Fragment)) {
    throw "Enter a dedicated HTTPS domain without a path, query, credentials, or custom port (for example, https://summarize-this.ngrok.app)."
  }
  return $uri.GetLeftPart([UriPartial]::Authority).TrimEnd("/")
}

function Save-NgrokPublicUrl {
  param([string]$Url)

  $safeUrl = $Url.Replace("'", "''")
  Set-Content -LiteralPath $CloudSettingsPath -Value @("@{", "  NGROK_URL = '$safeUrl'", "}") -Encoding UTF8
}

if ($Configure -and [string]::IsNullOrWhiteSpace($ConfigureUrl)) {
  $ConfigureUrl = Read-Host "Reserved ngrok HTTPS domain"
}
if (-not [string]::IsNullOrWhiteSpace($ConfigureUrl)) {
  $configuredUrl = Resolve-NgrokPublicUrl -Value $ConfigureUrl
  Save-NgrokPublicUrl -Url $configuredUrl
  Write-Host "Summarize This will use $configuredUrl for future ngrok tunnels."
  return
}

$ConfiguredPublicUrl = ""
if (Test-Path -LiteralPath $CloudSettingsPath -PathType Leaf) {
  $cloudSettings = Import-PowerShellDataFile -LiteralPath $CloudSettingsPath
  if (-not [string]::IsNullOrWhiteSpace([string]$cloudSettings.NGROK_URL)) {
    $ConfiguredPublicUrl = Resolve-NgrokPublicUrl -Value ([string]$cloudSettings.NGROK_URL)
  }
}
if ($PrintConfiguredUrl) {
  Write-Output $ConfiguredPublicUrl
  return
}

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

$ngrokArguments = @("http", "http://127.0.0.1:$BackendPort", "--inspect=true", "--name=summarize-this")
if (-not [string]::IsNullOrWhiteSpace($ConfiguredPublicUrl)) {
  $ngrokArguments += "--url=$ConfiguredPublicUrl"
  Write-Host "Opening $ConfiguredPublicUrl for the Summarize This backend."
} else {
  Write-Warning "No dedicated ngrok domain is configured. ngrok will select the account's default development domain."
  Write-Host "Use the 'Configure ngrok domain' Start Menu shortcut to save a reserved HTTPS domain."
}
Write-Host "Keep this window open while Trello or HAI uses the cloud URL."
& $Ngrok.Source @ngrokArguments
