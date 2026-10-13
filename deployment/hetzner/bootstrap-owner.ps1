param(
  [string]$ApiUrl = "http://127.0.0.1:8787"
)

$ErrorActionPreference = "Stop"
$uri = [Uri]::new($ApiUrl.TrimEnd('/') + "/api/auth/register")
if ($uri.Scheme -ne "http" -or $uri.Host -notin @("127.0.0.1", "localhost", "[::1]", "::1") -or
    $uri.UserInfo -or $uri.Query -or $uri.Fragment -or $uri.AbsolutePath -ne "/api/auth/register") {
  throw "Owner registration must use the local end of the SSH tunnel (http://127.0.0.1:8787)."
}

$email = (Read-Host "Owner email address").Trim()
$name = (Read-Host "Owner display name").Trim()
$securePassword = Read-Host "New owner password (at least 12 characters)" -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new("", $securePassword).Password
$body = $null
$response = $null

try {
  $body = @{
    email = $email
    name = $name
    password = $plainPassword
  } | ConvertTo-Json -Compress

  $response = Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30 -MaximumRedirection 0
  if (-not $response.success) {
    throw "The backend did not confirm owner registration."
  }

  Write-Host "Owner account created for $($response.user.email). The session token was not displayed."
}
catch {
  $statusCode = 0
  if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
    $statusCode = [int]$_.Exception.Response.StatusCode
  }
  if ($statusCode -eq 403) {
    throw "Registration was refused. Confirm REGISTRATION_MODE=single-user, that no account already exists, and that the SSH tunnel is open."
  }
  throw "Owner registration failed. Confirm the SSH tunnel and backend are reachable, then try again. Details: $($_.Exception.Message)"
}
finally {
  $plainPassword = $null
  $body = $null
  $response = $null
  $securePassword.Dispose()
}
