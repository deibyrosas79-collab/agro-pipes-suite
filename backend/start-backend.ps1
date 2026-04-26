$pythonCandidates = @(
  "C:\Users\deiby\Downloads\enturnamiento-vehiculos\portable-python\python.exe",
  "C:\Users\deiby\Downloads\enturnamiento-vehiculos\portable-python-lite\python.exe",
  "python",
  "py"
)

$python = $null
foreach ($candidate in $pythonCandidates) {
  try {
    if ($candidate -eq "py") {
      & $candidate --version *> $null
    } else {
      & $candidate --version *> $null
    }
    $python = $candidate
    break
  } catch {
  }
}

if (-not $python) {
  Write-Error "No se encontro un interprete de Python utilizable."
  exit 1
}

Write-Host "Usando Python:" $python
& $python "C:\Users\deiby\Downloads\agro-pipes-suite\backend\run.py"
