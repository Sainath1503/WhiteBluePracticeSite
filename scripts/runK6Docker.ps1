param(
  [switch]$Smoke
)

$ErrorActionPreference = "Stop"

$baseUrl = if ($env:BASE_URL) { $env:BASE_URL } else { "http://host.docker.internal:4173" }
$vus = if ($env:VUS) { $env:VUS } else { "5" }
$image = if ($env:K6_DOCKER_IMAGE) { $env:K6_DOCKER_IMAGE } else { "grafana/k6:2.0.0" }
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

$ErrorActionPreference = "Continue"
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker engine is not available. Start Docker Desktop and try again."
}
$ErrorActionPreference = "Stop"

$arguments = @(
  "run",
  "--rm",
  "-e", "BASE_URL=$baseUrl",
  "-e", "VUS=$vus",
  "-v", "${repoRoot}:/work",
  "-w", "/work",
  $image,
  "run"
)

if ($Smoke) {
  $arguments += @("--vus", "1", "--duration", "10s")
}

$arguments += "tests/load/whiteblue-api.k6.js"

$ErrorActionPreference = "Continue"
docker @arguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
