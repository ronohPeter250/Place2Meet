param(
  [string]$ProjectRoot = "."
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$venvPython = Join-Path $scriptDir ".graphify-venv\Scripts\python.exe"
$builder = Join-Path $scriptDir "tools\build_graphify_memory.py"

if (-not (Test-Path $venvPython)) {
  throw "graphify venv was not found at $venvPython"
}

& $venvPython $builder $ProjectRoot
