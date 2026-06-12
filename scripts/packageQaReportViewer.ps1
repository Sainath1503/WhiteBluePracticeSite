param(
  [switch]$SkipMavenPackage
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$viewerRoot = Join-Path $repoRoot "qa-report-viewer"
$targetRoot = Join-Path $viewerRoot "target"
$packageInput = Join-Path $targetRoot "package-input"
$packageOutput = Join-Path $targetRoot "package"
$appImage = Join-Path $packageOutput "WhiteBlueAutomationConsole"
$rootExe = Join-Path $repoRoot "WhiteBlueAutomationConsole.exe"
$rootIcon = Join-Path $repoRoot "WhiteBlueAutomationConsole.ico"
$legacyRootExe = Join-Path $repoRoot "WhiteBlueQAReportViewer.exe"
$legacyRootIcon = Join-Path $repoRoot "WhiteBlueQAReportViewer.ico"
$rootApp = Join-Path $repoRoot "app"
$rootRuntime = Join-Path $repoRoot "runtime"
$viewerIcon = Join-Path $viewerRoot "src\main\resources\com\whiteblue\tools\qareportviewer\whiteblue-report-viewer.ico"

function Resolve-Executable([string[]]$commands) {
  foreach ($command in $commands) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) {
      return $resolved.Source
    }
  }

  return ""
}

function Resolve-RequiredExecutable([string]$name, [string[]]$commands) {
  $resolved = Resolve-Executable $commands
  if (!$resolved) {
    throw "$name was not found on PATH. Run SetupWhiteBlueAutomationConsole.cmd to install prerequisites."
  }

  return $resolved
}

function Clear-GeneratedPath([string]$path) {
  if (!(Test-Path -LiteralPath $path)) {
    return
  }

  Get-ChildItem -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
    $_.Attributes = $_.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
  }
  $item = Get-Item -LiteralPath $path -Force
  $item.Attributes = $item.Attributes -band (-bnot [System.IO.FileAttributes]::ReadOnly)
}

if (!(Test-Path $viewerRoot)) {
  throw "QA report viewer project was not found at $viewerRoot"
}

Push-Location $viewerRoot
try {
  if (!$SkipMavenPackage) {
    $mavenCommand = Resolve-RequiredExecutable "Maven" @("mvn.cmd", "mvn")
    & $mavenCommand clean package
  }

  Remove-Item -LiteralPath $packageInput -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $packageOutput -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $packageInput | Out-Null

  Copy-Item -LiteralPath (Join-Path $targetRoot "qa-report-viewer-1.0.0.jar") -Destination $packageInput
  Copy-Item -Path (Join-Path $targetRoot "dependency\*.jar") -Destination $packageInput

  $jpackageCommand = Resolve-RequiredExecutable "jpackage" @("jpackage.exe", "jpackage")
  & $jpackageCommand `
    --type app-image `
    --name WhiteBlueAutomationConsole `
    --input $packageInput `
    --main-jar qa-report-viewer-1.0.0.jar `
    --main-class com.whiteblue.tools.qareportviewer.MainLauncher `
    --icon $viewerIcon `
    --dest $packageOutput
}
finally {
  Pop-Location
}

if (!(Test-Path $appImage)) {
  throw "jpackage did not create the expected app image at $appImage"
}

foreach ($path in @($rootExe, $rootIcon, $legacyRootExe, $legacyRootIcon, $rootApp, $rootRuntime)) {
  $resolvedRoot = [System.IO.Path]::GetFullPath($repoRoot)
  $resolvedPath = [System.IO.Path]::GetFullPath($path)
  if (!$resolvedPath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to clean path outside repository root: $resolvedPath"
  }
  Clear-GeneratedPath $path
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction SilentlyContinue
}

Copy-Item -LiteralPath (Join-Path $appImage "WhiteBlueAutomationConsole.exe") -Destination $repoRoot
Copy-Item -LiteralPath (Join-Path $appImage "WhiteBlueAutomationConsole.ico") -Destination $repoRoot
Copy-Item -LiteralPath (Join-Path $appImage "app") -Destination $repoRoot -Recurse
Copy-Item -LiteralPath (Join-Path $appImage "runtime") -Destination $repoRoot -Recurse

Remove-Item -LiteralPath $packageOutput -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "WhiteBlueAutomationConsole.exe published to $rootExe"
