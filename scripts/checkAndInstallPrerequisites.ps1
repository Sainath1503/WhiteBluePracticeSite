param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Continue"

function Write-Section([string]$message) {
  Write-Host ""
  Write-Host "== $message =="
}

function Command-Exists([string]$command) {
  return $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
}

function Get-CommandVersion([string]$command, [string[]]$arguments) {
  if (!(Command-Exists $command)) {
    return ""
  }

  try {
    return (& $command @arguments 2>$null | Select-Object -First 1)
  } catch {
    return ""
  }
}

function Test-Admin {
  try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Test-Winget {
  return Command-Exists "winget"
}

function Install-WingetPackage([string]$name, [string]$id) {
  if ($CheckOnly) {
    Write-Host "CHECK ONLY: Would install $name using winget package $id."
    return
  }

  if (!(Test-Winget)) {
    Write-Host "winget is not available. Please install $name manually."
    return
  }

  Write-Host "Installing $name with winget package $id..."
  winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Host "winget could not install $name automatically. Please install it manually."
  }
}

function Test-Node20 {
  if (!(Command-Exists "node")) {
    return $false
  }

  $version = Get-CommandVersion "node" @("--version")
  if ($version -match "^v(\d+)\.") {
    return [int]$Matches[1] -ge 20
  }

  return $false
}

function Test-Java17 {
  if (!(Command-Exists "java")) {
    return $false
  }

  $versionText = (& java -version 2>&1 | Select-Object -First 1)
  if ($versionText -match '"(\d+)') {
    return [int]$Matches[1] -ge 17
  }

  return $false
}

function Test-Excel {
  $paths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\excel.exe",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\excel.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\excel.exe"
  )

  foreach ($path in $paths) {
    if (Test-Path $path) {
      return $true
    }
  }

  try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
    return $true
  } catch {
    return $false
  }
}

function Report-Tool([string]$name, [bool]$available, [string]$version = "") {
  $status = if ($available) { "OK" } else { "MISSING" }
  $detail = if ($version) { " - $version" } else { "" }
  Write-Host ("{0,-18} {1}{2}" -f $name, $status, $detail)
}

function Test-DockerEngine {
  if (!(Command-Exists "docker")) {
    return $false
  }

  docker info *> $null
  return $LASTEXITCODE -eq 0
}

function Test-DockerImage([string]$image) {
  docker image inspect $image *> $null
  return $LASTEXITCODE -eq 0
}

function Pull-DockerImage([string]$image) {
  if ($CheckOnly) {
    Write-Host "CHECK ONLY: Would pull Docker image $image."
    return
  }

  Write-Host "Pulling Docker image $image..."
  docker pull $image
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker could not pull $image. Check Docker Desktop, network access, or registry access."
  }
}

function Get-RunningContainerNames([string]$image) {
  $containers = docker ps --filter "ancestor=$image" --format "{{.Names}}" 2>$null
  if ($LASTEXITCODE -ne 0 -or !$containers) {
    return @()
  }

  return @($containers)
}

function Check-DockerTestImages {
  $requiredImages = @(
    "postgres:16-alpine",
    "grafana/k6:2.0.0",
    "testcontainers/ryuk"
  )

  Write-Section "Docker test images and containers"

  if (!(Command-Exists "docker")) {
    Write-Host "Docker command was not found. Install Docker Desktop before pulling test images."
    return
  }

  if (!(Test-DockerEngine)) {
    Write-Host "Docker is installed, but the Docker engine is not running. Start Docker Desktop, then rerun this check."
    return
  }

  foreach ($image in $requiredImages) {
    $imageAvailable = Test-DockerImage $image
    if ($imageAvailable) {
      Report-Tool $image $true "image available"
    } else {
      Report-Tool $image $false "image missing"
      Pull-DockerImage $image
      $imageAvailable = Test-DockerImage $image
      Report-Tool $image $imageAvailable ($(if ($imageAvailable) { "image available after pull" } else { "image still missing" }))
    }

    $containers = Get-RunningContainerNames $image
    if ($containers.Count -gt 0) {
      Write-Host ("{0,-18} RUNNING - {1}" -f "Container", ($containers -join ", "))
    } else {
      Write-Host ("{0,-18} NOT RUNNING - no active container for {1}" -f "Container", $image)
    }
  }
}

Write-Host "WhiteBlue prerequisite check"
Write-Host "Repository: $((Resolve-Path (Join-Path $PSScriptRoot '..')).Path)"
Write-Host "Mode: $(if ($CheckOnly) { 'check only' } else { 'check and install where feasible' })"

Write-Section "Checking tools"

$gitOk = Command-Exists "git"
Report-Tool "Git" $gitOk (Get-CommandVersion "git" @("--version"))

$nodeOk = Test-Node20
Report-Tool "Node.js 20+" $nodeOk (Get-CommandVersion "node" @("--version"))

$npmOk = Command-Exists "npm"
Report-Tool "npm" $npmOk (Get-CommandVersion "npm" @("--version"))

$javaOk = Test-Java17
$javaVersion = if (Command-Exists "java") { (& java -version 2>&1 | Select-Object -First 1) } else { "" }
Report-Tool "Java JDK 17+" $javaOk $javaVersion

$mavenOk = Command-Exists "mvn"
Report-Tool "Maven" $mavenOk (Get-CommandVersion "mvn" @("--version"))

$excelOk = Test-Excel
Report-Tool "Microsoft Excel" $excelOk

$dockerOk = Command-Exists "docker"
$dockerVersion = Get-CommandVersion "docker" @("--version")
Report-Tool "Docker" $dockerOk $dockerVersion

Write-Section "Install actions"

if ($gitOk -and $nodeOk -and $npmOk -and $javaOk -and $mavenOk -and $excelOk) {
  Write-Host "All required local prerequisites are available."
} else {
  if (!(Test-Winget)) {
    Write-Host "winget was not found. Automatic install cannot be performed on this machine."
    Write-Host "Install missing tools manually, then rerun this check."
  } else {
    if (!$gitOk) {
      Install-WingetPackage "Git" "Git.Git"
    }
    if (!$nodeOk) {
      Install-WingetPackage "Node.js 20 LTS" "OpenJS.NodeJS.LTS"
    }
    if (!$javaOk) {
      Install-WingetPackage "Temurin JDK 17" "EclipseAdoptium.Temurin.17.JDK"
    }
    if (!$mavenOk) {
      Install-WingetPackage "Apache Maven" "Apache.Maven"
    }
    if (!$excelOk) {
      Write-Host "Microsoft Excel was not detected. Please install Microsoft 365/Office manually if Excel dashboard enhancement is required."
    }
  }
}

Write-Section "Docker guidance"
if ($dockerOk) {
  try {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Docker is installed and the Docker engine is running."
    } else {
      Write-Host "Docker is installed, but the Docker engine is not running. Start Docker Desktop before Testcontainers or Docker k6 runs."
    }
  } catch {
    Write-Host "Docker is installed, but Docker engine status could not be verified. Start Docker Desktop and rerun if needed."
  }
} else {
  Write-Host "Docker is not installed."
  Write-Host "Manual action required: install Docker Desktop from https://www.docker.com/products/docker-desktop/"
  Write-Host "After installation, start Docker Desktop and complete WSL2/engine setup before running Testcontainers or Docker k6 tests."
}

Check-DockerTestImages

Write-Section "Next recommended commands"
Write-Host "npm install"
Write-Host "npx playwright install"
Write-Host "npm run build:ci"
Write-Host "npm run test:all"

Write-Host ""
Write-Host "Prerequisite check completed. Restart the terminal or Automation Console after any new installations so PATH changes are picked up."
