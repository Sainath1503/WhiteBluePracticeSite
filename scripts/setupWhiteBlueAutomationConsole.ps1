$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$setupToolsRoot = Join-Path $repoRoot ".setup-tools"
$mavenVersionToInstall = "3.9.9"
$localMavenRoot = Join-Path $setupToolsRoot "apache-maven-$mavenVersionToInstall"

function Write-SetupLog([string]$phase, [string]$tool, [string]$status, [string]$detail = "") {
  $timestamp = Get-Date -Format "HH:mm:ss"
  $message = "[{0}] [{1}] {2,-18} {3}" -f $timestamp, $phase, $tool, $status
  if ($detail) {
    $message = "$message - $detail"
  }
  Write-Host $message
}

function Test-Command([string]$command) {
  return $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
}

function Resolve-Executable([string[]]$commands) {
  foreach ($command in $commands) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved) {
      return $resolved.Source
    }
  }

  return ""
}

function Add-PathEntry([string]$path) {
  if ((Test-Path -LiteralPath $path) -and (($env:Path -split ";") -notcontains $path)) {
    $env:Path = "$path;$env:Path"
  }
}

function Add-LocalToolPaths {
  Add-PathEntry (Join-Path $localMavenRoot "bin")
}

function Get-CommandOutput([string]$command, [string[]]$arguments) {
  if (!(Test-Command $command)) {
    return ""
  }

  try {
    return (& $command @arguments 2>$null | Select-Object -First 1)
  } catch {
    return ""
  }
}

function Get-NodeMajorVersion {
  $version = Get-CommandOutput "node" @("--version")
  if ($version -match "^v(\d+)\.") {
    return [int]$Matches[1]
  }

  return 0
}

function Test-JdkPackagingTools {
  return !!(Resolve-Executable @("java.exe", "java")) -and !!(Resolve-Executable @("jpackage.exe", "jpackage"))
}

function Update-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = @($machinePath, $userPath) -join ";"
}

function Install-WingetPackage([string]$name, [string]$id) {
  if (!(Test-Command "winget")) {
    throw "$name is missing and winget is not available. Install $name manually, then run this setup again."
  }

  Write-SetupLog "Install" $name "START" "Installing $id with winget"
  winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget could not install $name. Install it manually, then run this setup again."
  }

  Update-ProcessPath
}

function Try-InstallWingetPackage([string]$name, [string]$id) {
  if (!(Test-Command "winget")) {
    Write-SetupLog "Install" $name "SKIPPED" "winget is not available"
    return $false
  }

  Write-SetupLog "Install" $name "START" "Installing $id with winget"
  winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -eq 0) {
    Update-ProcessPath
    Add-LocalToolPaths
    return $true
  }

  Write-SetupLog "Install" $name "WARN" "winget could not install $id; using portable fallback"
  return $false
}

function Install-Node20 {
  Install-WingetPackage "Node.js 20+" "OpenJS.NodeJS.LTS"
}

function Install-PortableMaven {
  $mavenBin = Join-Path $localMavenRoot "bin"
  if (Test-Path -LiteralPath (Join-Path $mavenBin "mvn.cmd")) {
    Add-PathEntry $mavenBin
    return
  }

  New-Item -ItemType Directory -Force -Path $setupToolsRoot | Out-Null

  $zipPath = Join-Path $setupToolsRoot "apache-maven-$mavenVersionToInstall-bin.zip"
  $downloadUrls = @(
    "https://archive.apache.org/dist/maven/maven-3/$mavenVersionToInstall/binaries/apache-maven-$mavenVersionToInstall-bin.zip",
    "https://dlcdn.apache.org/maven/maven-3/$mavenVersionToInstall/binaries/apache-maven-$mavenVersionToInstall-bin.zip"
  )

  foreach ($url in $downloadUrls) {
    try {
      Write-SetupLog "Install" "Apache Maven" "START" "Downloading portable Maven $mavenVersionToInstall"
      Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $zipPath
      break
    } catch {
      Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
      if ($url -eq $downloadUrls[-1]) {
        throw "Could not download Apache Maven $mavenVersionToInstall. Check internet access or install Maven manually."
      }
    }
  }

  Remove-Item -LiteralPath $localMavenRoot -Recurse -Force -ErrorAction SilentlyContinue
  Expand-Archive -LiteralPath $zipPath -DestinationPath $setupToolsRoot -Force
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  Add-PathEntry $mavenBin
}

function Run-NpmCommand([string]$command, [string[]]$commandArguments = @()) {
  $npmCommand = Resolve-Executable @("npm.cmd", "npm.exe", "npm")
  if (!$npmCommand) {
    throw "npm executable was not found on PATH."
  }

  $allArguments = @($command) + $commandArguments
  $display = "npm $($allArguments -join ' ')"
  Write-SetupLog "Command" $display "START"
  & $npmCommand @allArguments
  if ($LASTEXITCODE -ne 0) {
    throw "$display failed with exit code $LASTEXITCODE."
  }
  Write-SetupLog "Command" $display "OK"
}

function Stop-AutomationConsole {
  $processes = Get-Process -Name "WhiteBlueAutomationConsole" -ErrorAction SilentlyContinue
  if (!$processes) {
    return
  }

  Write-SetupLog "Setup" "Automation Console" "STOP" "Closing running instance before rebuild"
  $processes | Stop-Process -Force
}

Write-Host "WhiteBlue Automation Console setup"
Write-Host "Repository: $repoRoot"
Write-Host ""

Add-LocalToolPaths

$nodeMajor = Get-NodeMajorVersion
$nodeVersion = Get-CommandOutput "node" @("--version")
if ($nodeMajor -ge 20) {
  Write-SetupLog "Prerequisite check" "Node.js 20+" "OK" $nodeVersion
} else {
  $detail = if ($nodeVersion) { "Found $nodeVersion; Node.js 20+ is required" } else { "Not installed" }
  Write-SetupLog "Prerequisite check" "Node.js 20+" "MISSING" $detail
  Install-Node20

  $nodeMajor = Get-NodeMajorVersion
  $nodeVersion = Get-CommandOutput "node" @("--version")
  if ($nodeMajor -lt 20) {
    throw "Node.js 20+ is still not available after installation. Restart this terminal or machine, then run setup again."
  }
  Write-SetupLog "Prerequisite check" "Node.js 20+" "OK" $nodeVersion
}

$npmCommand = Resolve-Executable @("npm.cmd", "npm.exe", "npm")
$npmVersion = if ($npmCommand) { (& $npmCommand "--version" 2>$null | Select-Object -First 1) } else { "" }
if ($npmVersion) {
  Write-SetupLog "Prerequisite check" "npm" "OK" $npmVersion
} else {
  throw "npm is missing after Node.js setup. Reinstall Node.js 20 LTS, then run this setup again."
}

$javaVersion = Get-CommandOutput "java" @("--version")
if (Test-JdkPackagingTools) {
  Write-SetupLog "Prerequisite check" "JDK jpackage" "OK" ($javaVersion -replace "`r|`n", " ")
} else {
  Write-SetupLog "Prerequisite check" "JDK jpackage" "MISSING" "Java JDK with jpackage is required"
  Install-WingetPackage "Temurin JDK 17" "EclipseAdoptium.Temurin.17.JDK"
  if (!(Test-JdkPackagingTools)) {
    throw "JDK jpackage is still not available after installation. Restart this terminal or machine, then run setup again."
  }
  $javaVersion = Get-CommandOutput "java" @("--version")
  Write-SetupLog "Prerequisite check" "JDK jpackage" "OK" ($javaVersion -replace "`r|`n", " ")
}

$mavenCommand = Resolve-Executable @("mvn.cmd", "mvn")
$mavenVersion = if ($mavenCommand) { (& $mavenCommand "--version" 2>$null | Select-Object -First 1) } else { "" }
if ($mavenVersion) {
  Write-SetupLog "Prerequisite check" "Maven" "OK" $mavenVersion
} else {
  Write-SetupLog "Prerequisite check" "Maven" "MISSING" "Apache Maven is required"
  if (!(Try-InstallWingetPackage "Apache Maven" "Apache.Maven")) {
    Install-PortableMaven
  }
  $mavenCommand = Resolve-Executable @("mvn.cmd", "mvn")
  $mavenVersion = if ($mavenCommand) { (& $mavenCommand "--version" 2>$null | Select-Object -First 1) } else { "" }
  if (!$mavenVersion) {
    throw "Maven is still not available after installation. Restart this terminal or machine, then run setup again."
  }
  Write-SetupLog "Prerequisite check" "Maven" "OK" $mavenVersion
}

Push-Location $repoRoot
try {
  Run-NpmCommand "install"
  Stop-AutomationConsole
  Run-NpmCommand "run" @("build:qa-report-viewer")
} finally {
  Pop-Location
}
