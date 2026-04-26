param(
  [switch]$NoBrowser
)

$backendDir = "C:\Users\deiby\Downloads\agro-pipes-suite\backend"
$runFile = Join-Path $backendDir "run.py"
$pidFile = Join-Path $backendDir "instance\agro_pipes.pid"
$stdoutLog = Join-Path $backendDir "instance\agro_pipes_stdout.log"
$stderrLog = Join-Path $backendDir "instance\agro_pipes_stderr.log"
$healthUrl = "http://127.0.0.1:5000/api/health"
$appUrl = "http://127.0.0.1:5000/"

function Test-AppHealth {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-AppHealth) {
  if (-not $NoBrowser) {
    Start-Process $appUrl
  }
  exit 0
}

$pythonCandidates = @(
  "C:\Users\deiby\Downloads\enturnamiento-vehiculos\portable-python\python.exe",
  "C:\Users\deiby\Downloads\enturnamiento-vehiculos\portable-python-lite\python.exe"
)

$python = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $python) {
  throw "No se encontro un interprete de Python compatible para iniciar AGRO PIPES."
}

$env:APP_DEBUG = "0"
$process = Start-Process -FilePath $python -ArgumentList @($runFile) -WorkingDirectory $backendDir -WindowStyle Hidden -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
Set-Content -Path $pidFile -Value $process.Id -Encoding ascii

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-AppHealth) {
    if (-not $NoBrowser) {
      Start-Process $appUrl
    }
    exit 0
  }
}

throw "La aplicacion no respondio a tiempo en $appUrl."
