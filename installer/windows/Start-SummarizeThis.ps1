param(
  [switch]$NoLaunch,
  [switch]$Setup,
  [switch]$BackendOnly,
  [switch]$PrintBackendPort,
  [int]$Port = 17117
)

$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRootCandidate = [System.IO.Path]::GetFullPath((Join-Path $ScriptRoot "..\.."))

if (Test-Path -LiteralPath (Join-Path $ScriptRoot "popup.html") -PathType Leaf) {
  $AppRoot = $ScriptRoot
} elseif (Test-Path -LiteralPath (Join-Path $RepoRootCandidate "popup.html") -PathType Leaf) {
  $AppRoot = $RepoRootCandidate
} else {
  $AppRoot = $ScriptRoot
}
$DefaultPort = $Port
$HostAddress = [System.Net.IPAddress]::Parse("127.0.0.1")
$BackendPort = 18787
$BackendExecutable = Join-Path $AppRoot "SummarizeThisBackend.exe"
$BackendConfigPath = Join-Path $AppRoot "backend-settings.psd1"
$BackendPidPath = Join-Path $AppRoot "backend.pid"
$RuntimeManifestPath = Join-Path $AppRoot "runtime-files.json"

if (-not (Test-Path -LiteralPath $RuntimeManifestPath -PathType Leaf)) {
  throw "The runtime file allowlist is missing. Reinstall Summarize This."
}
$AppRootPrefix = [System.IO.Path]::GetFullPath($AppRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$AllowedRuntimeFiles = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$RuntimeFiles = Get-Content -LiteralPath $RuntimeManifestPath -Raw | ConvertFrom-Json
foreach ($entry in $RuntimeFiles) {
  $requestName = ([string]$entry).Replace("\", "/").TrimStart("/")
  $candidate = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($AppRoot, $requestName.Replace("/", [System.IO.Path]::DirectorySeparatorChar)))
  if ([string]::IsNullOrWhiteSpace($requestName) -or -not $candidate.StartsWith($AppRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "runtime-files.json contains an unsafe path. Reinstall Summarize This."
  }
  [void]$AllowedRuntimeFiles.Add($requestName)
}

function Test-SummarizeThisBackend {
  param([int]$Port = $BackendPort)

  try {
    $health = Invoke-RestMethod -TimeoutSec 1 "http://127.0.0.1:$Port/api/health"
    return $health.status -eq "ok" -and $health.service -eq "summarize-this-backend"
  } catch {
    return $false
  }
}

function Start-SummarizeThisBackend {
  if (Test-SummarizeThisBackend) { return }
  if (-not (Test-Path -LiteralPath $BackendExecutable -PathType Leaf) -or -not (Test-Path -LiteralPath $BackendConfigPath -PathType Leaf)) {
    if ($BackendOnly) { throw "The installed backend runtime or private settings file is missing." }
    Write-Warning "The standalone backend is unavailable; the local summarizer can still run without persistence."
    return
  }

  $settings = Import-PowerShellDataFile -LiteralPath $BackendConfigPath
  $previous = @{}
  try {
    foreach ($entry in $settings.GetEnumerator()) {
      $previous[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, "Process")
      [Environment]::SetEnvironmentVariable($entry.Key, [string]$entry.Value, "Process")
    }
    [Environment]::SetEnvironmentVariable("API_PORT", [string]$BackendPort, "Process")
    $backendProcess = Start-Process -FilePath $BackendExecutable -WorkingDirectory $AppRoot -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath $BackendPidPath -Value ([string]$backendProcess.Id) -Encoding ASCII
  } finally {
    foreach ($entry in $settings.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $previous[$entry.Key], "Process")
    }
  }

  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-SummarizeThisBackend) { return }
    if ($backendProcess.HasExited) { break }
  }
  throw "The standalone backend did not become healthy."
}

function Test-SummarizeThisServer {
  param([int]$Port)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 "http://127.0.0.1:$Port/__summarize_this_health"
    return $response.StatusCode -eq 200 -and $response.Content -eq "ok"
  } catch {
    return $false
  }
}

function Test-PortAvailable {
  param([int]$Port)

  $probe = $null
  try {
    $probe = [System.Net.Sockets.TcpListener]::new($HostAddress, $Port)
    $probe.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($probe) {
      $probe.Stop()
    }
  }
}

function Get-AvailablePort {
  for ($port = $DefaultPort; $port -lt ($DefaultPort + 20); $port++) {
    if (Test-SummarizeThisServer -Port $port) {
      return @{ Port = $port; AlreadyRunning = $true }
    }
    if (Test-PortAvailable -Port $port) {
      return @{ Port = $port; AlreadyRunning = $false }
    }
  }

  throw "No local port was available for Summarize This."
}

function Get-BackendPortCandidates {
  $settingsPort = 18787
  if (Test-Path -LiteralPath $BackendConfigPath -PathType Leaf) {
    try {
      $settings = Import-PowerShellDataFile -LiteralPath $BackendConfigPath
      $parsedPort = 0
      if ([int]::TryParse([string]$settings.API_PORT, [ref]$parsedPort) -and $parsedPort -ge 1024 -and $parsedPort -le 65535) {
        $settingsPort = $parsedPort
      }
    } catch {
    }
  }

  return @($settingsPort) + @(18787..18806) | Select-Object -Unique
}

function Resolve-BackendPort {
  $candidates = @(Get-BackendPortCandidates)
  foreach ($candidate in $candidates) {
    if (Test-SummarizeThisBackend -Port $candidate) {
      return [int]$candidate
    }
  }
  foreach ($candidate in $candidates) {
    if (Test-PortAvailable -Port $candidate) {
      return [int]$candidate
    }
  }
  throw "No loopback port was available for the Summarize This backend."
}

function Get-MimeType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".js" { "text/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".svg" { "image/svg+xml" }
    ".css" { "text/css; charset=utf-8" }
    ".png" { "image/png" }
    default { "application/octet-stream" }
  }
}

function Write-HttpResponse {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$Reason,
    [byte[]]$Body,
    [string]$ContentType
  )

  $headers = @(
    "HTTP/1.1 $StatusCode $Reason",
    "Content-Type: $ContentType",
    "Content-Length: $($Body.Length)",
    "Cache-Control: no-store",
    "X-Content-Type-Options: nosniff",
    "Connection: close",
    "",
    ""
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

function Resolve-RequestPath {
  param([string]$RequestPath)

  $pathOnly = ($RequestPath -split "\?")[0]
  if ([string]::IsNullOrWhiteSpace($pathOnly) -or $pathOnly -eq "/") {
    $pathOnly = "/popup.html"
  }

  try {
    $requestName = [Uri]::UnescapeDataString($pathOnly.TrimStart("/")).Replace("\", "/")
  } catch {
    return $null
  }
  if (-not $AllowedRuntimeFiles.Contains($requestName)) {
    return $null
  }
  $relative = $requestName.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
  $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($AppRootPrefix, $relative))

  if (-not $fullPath.StartsWith($AppRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  return $fullPath
}

$BackendPort = Resolve-BackendPort
Start-SummarizeThisBackend
if ($BackendOnly) {
  if ($PrintBackendPort) { Write-Output $BackendPort }
  return
}

$portInfo = Get-AvailablePort
$port = [int]$portInfo.Port
$targetPage = if ($Setup) { "trello-setup.html" } else { "popup.html" }
$url = "http://127.0.0.1:$port/$($targetPage)?installed=1&backendPort=$BackendPort"

if ($portInfo.AlreadyRunning) {
  if (-not $NoLaunch) {
    Start-Process $url
  }
  return
}

$listener = [System.Net.Sockets.TcpListener]::new($HostAddress, $port)
$listener.Start()

if (-not $NoLaunch) {
  Start-Process $url
}
Write-Host "Summarize This is running at $url"
Write-Host "Close this window to stop the local launcher."

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()

      while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line.Length -eq 0) {
          break
        }
      }

      if ([string]::IsNullOrWhiteSpace($requestLine)) {
        continue
      }

      $parts = $requestLine -split " "
      $method = $parts[0]
      $requestPath = if ($parts.Length -gt 1) { $parts[1] } else { "/" }

      if ($method -ne "GET" -and $method -ne "HEAD") {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Method not allowed")
        Write-HttpResponse -Stream $stream -StatusCode 405 -Reason "Method Not Allowed" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      if (($requestPath -split "\?")[0] -eq "/__summarize_this_health") {
        $body = [System.Text.Encoding]::UTF8.GetBytes("ok")
        Write-HttpResponse -Stream $stream -StatusCode 200 -Reason "OK" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      $filePath = Resolve-RequestPath -RequestPath $requestPath
      if ($null -eq $filePath -or -not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Not found")
        Write-HttpResponse -Stream $stream -StatusCode 404 -Reason "Not Found" -Body $body -ContentType "text/plain; charset=utf-8"
        continue
      }

      $bytes = if ($method -eq "HEAD") { [byte[]]::new(0) } else { [System.IO.File]::ReadAllBytes($filePath) }
      Write-HttpResponse -Stream $stream -StatusCode 200 -Reason "OK" -Body $bytes -ContentType (Get-MimeType -Path $filePath)
    } catch {
      try {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Server error")
        Write-HttpResponse -Stream $stream -StatusCode 500 -Reason "Server Error" -Body $body -ContentType "text/plain; charset=utf-8"
      } catch {
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
