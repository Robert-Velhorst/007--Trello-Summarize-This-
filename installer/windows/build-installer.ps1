param(
  [string]$PayloadInspectionPath = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$DistDir = Join-Path $RepoRoot "dist\windows-installer"
$BuildRoot = Join-Path ([System.IO.Path]::GetTempPath()) "SummarizeThisInstallerBuild"
$StagingDir = Join-Path $BuildRoot "staging"
$PayloadZip = Join-Path $BuildRoot "payload.zip"
$SourcePath = Join-Path $BuildRoot "SummarizeThisSetup.cs"
$OutputExe = Join-Path $DistDir "SummarizeThisSetup.exe"

$RuntimeManifestPath = Join-Path $RepoRoot "runtime-files.json"
$RuntimeFiles = Get-Content -LiteralPath $RuntimeManifestPath -Raw | ConvertFrom-Json

if ($RuntimeFiles.Count -eq 0 -or $RuntimeFiles.Count -ne (@($RuntimeFiles | Select-Object -Unique)).Count) {
  throw "runtime-files.json must contain a non-empty unique file list."
}

$InstallerFiles = @(
  "install.ps1",
  "Start-SummarizeThis.ps1",
  "Start-SummarizeThisCloud.ps1",
  "uninstall.ps1"
)
$BackendExecutable = Join-Path $RepoRoot "dist\windows-backend\SummarizeThisBackend.exe"

$CompilerCandidates = @(
  (Join-Path $env:SystemRoot "Microsoft.NET\Framework64\v4.0.30319\csc.exe"),
  (Join-Path $env:SystemRoot "Microsoft.NET\Framework\v4.0.30319\csc.exe")
)
$Compiler = $CompilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1

if (-not $Compiler) {
  throw "The .NET Framework C# compiler was not found. Install .NET Framework 4.x developer tools or build on Windows 11 with the framework compiler available."
}

foreach ($legacyPath in @(
  (Join-Path $DistDir "build"),
  (Join-Path $DistDir "staging"),
  (Join-Path $DistDir "SummarizeThisSetup.sed"),
  (Join-Path $DistDir "~SummarizeThisSetup.DDF")
)) {
  if (Test-Path -LiteralPath $legacyPath) {
    Remove-Item -LiteralPath $legacyPath -Recurse -Force
  }
}

if (Test-Path -LiteralPath $BuildRoot) {
  Remove-Item -LiteralPath $BuildRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
New-Item -ItemType Directory -Force -Path $StagingDir | Out-Null

try {
  foreach ($file in $RuntimeFiles) {
    $source = Join-Path $RepoRoot $file
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Missing runtime file: $file"
    }

    Copy-Item -LiteralPath $source -Destination (Join-Path $StagingDir $file) -Force
  }

  foreach ($file in $InstallerFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination (Join-Path $StagingDir $file) -Force
  }
  if (-not (Test-Path -LiteralPath $BackendExecutable -PathType Leaf)) {
    throw "Missing packaged backend. Run npm run build:windows-backend first."
  }
  Copy-Item -LiteralPath $BackendExecutable -Destination (Join-Path $StagingDir "SummarizeThisBackend.exe") -Force

  if (-not [string]::IsNullOrWhiteSpace($PayloadInspectionPath)) {
    $inspectionPath = if ([System.IO.Path]::IsPathRooted($PayloadInspectionPath)) {
      [System.IO.Path]::GetFullPath($PayloadInspectionPath)
    } else {
      [System.IO.Path]::GetFullPath((Join-Path $RepoRoot $PayloadInspectionPath))
    }
    $repoPrefix = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $inspectionPath.StartsWith($repoPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Payload inspection output must stay inside the repository."
    }
    if (Test-Path -LiteralPath $inspectionPath) {
      Remove-Item -LiteralPath $inspectionPath -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $inspectionPath | Out-Null
    Copy-Item -Path (Join-Path $StagingDir "*") -Destination $inspectionPath -Recurse -Force
  }

  Compress-Archive -Path (Join-Path $StagingDir "*") -DestinationPath $PayloadZip -Force

  $payloadHash = (Get-FileHash -LiteralPath $PayloadZip -Algorithm SHA256).Hash
  $source = @"
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;

namespace SummarizeThisInstaller
{
  internal static class Program
  {
    private const string PayloadSha256 = "$payloadHash";

    [STAThread]
    private static int Main()
    {
      string installRoot = Path.Combine(Path.GetTempPath(), "SummarizeThisInstall-" + Guid.NewGuid().ToString("N"));
      Directory.CreateDirectory(installRoot);

      try
      {
        string payloadPath = Path.Combine(installRoot, "payload.zip");
        using (Stream embeddedPayload = Assembly.GetExecutingAssembly().GetManifestResourceStream("SummarizeThisPayload"))
        {
          if (embeddedPayload == null)
          {
            throw new InvalidDataException("Installer payload resource is missing.");
          }
          using (FileStream payloadOutput = File.Create(payloadPath))
          {
            embeddedPayload.CopyTo(payloadOutput);
          }
        }
        using (SHA256 sha256 = SHA256.Create())
        using (FileStream payloadStream = File.OpenRead(payloadPath))
        {
          string actualHash = BitConverter.ToString(sha256.ComputeHash(payloadStream)).Replace("-", "");
          if (!string.Equals(actualHash, PayloadSha256, StringComparison.OrdinalIgnoreCase))
          {
            throw new InvalidDataException("Installer payload integrity check failed.");
          }
        }
        ZipFile.ExtractToDirectory(payloadPath, installRoot);

        string powershell = Path.Combine(
          Environment.GetFolderPath(Environment.SpecialFolder.System),
          "WindowsPowerShell",
          "v1.0",
          "powershell.exe"
        );
        string installerScript = Path.Combine(installRoot, "install.ps1");

        ProcessStartInfo startInfo = new ProcessStartInfo
        {
          FileName = powershell,
          Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + installerScript + "\"",
          WorkingDirectory = installRoot,
          UseShellExecute = false,
          CreateNoWindow = true
        };

        using (Process process = Process.Start(startInfo))
        {
          process.WaitForExit();
          return process.ExitCode;
        }
      }
      catch (Exception error)
      {
        try
        {
          File.WriteAllText(Path.Combine(Path.GetTempPath(), "SummarizeThisInstaller-error.txt"), error.ToString());
        }
        catch
        {
        }

        return 1;
      }
      finally
      {
        try
        {
          Directory.Delete(installRoot, true);
        }
        catch
        {
        }
      }
    }
  }
}
"@

  Set-Content -LiteralPath $SourcePath -Value $source -Encoding UTF8

  if (Test-Path -LiteralPath $OutputExe) {
    Remove-Item -LiteralPath $OutputExe -Force
  }

  & $Compiler `
    /nologo `
    /optimize+ `
    /target:winexe `
    /platform:anycpu `
    "/out:$OutputExe" `
    "/resource:$PayloadZip,SummarizeThisPayload,private" `
    /reference:System.IO.Compression.dll `
    /reference:System.IO.Compression.FileSystem.dll `
    $SourcePath

  if ($LASTEXITCODE -ne 0) {
    throw "Installer compiler failed with exit code $LASTEXITCODE."
  }

  if (-not (Test-Path -LiteralPath $OutputExe -PathType Leaf)) {
    throw "Installer build did not produce $OutputExe"
  }

  Get-Item -LiteralPath $OutputExe | Select-Object FullName, Length
} finally {
  if (Test-Path -LiteralPath $BuildRoot) {
    Remove-Item -LiteralPath $BuildRoot -Recurse -Force
  }
}
