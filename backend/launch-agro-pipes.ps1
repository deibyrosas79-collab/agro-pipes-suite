param(
  [switch]$NoBrowser
)

$rootDir     = "C:\Users\deiby\Downloads\agro-pipes-suite"
$backendDir  = Join-Path $rootDir "backend"
$webDir      = Join-Path $rootDir "web"
$runFile     = Join-Path $backendDir "run.py"
$pidFile     = Join-Path $backendDir "instance\agro_pipes.pid"
$stdoutLog   = Join-Path $backendDir "instance\agro_pipes_stdout.log"
$stderrLog   = Join-Path $backendDir "instance\agro_pipes_stderr.log"
$webPidFile  = Join-Path $backendDir "instance\web_preview.pid"
$apiHealthUrl = "http://127.0.0.1:5000/api/health"
$webUrl       = "http://127.0.0.1:4173"

function Test-PortOpen($port) {
  try {
    $tcp = [System.Net.Sockets.TcpClient]::new("127.0.0.1", $port)
    $tcp.Close()
    return $true
  } catch { return $false }
}

function Test-ApiHealth {
  try {
    $r = Invoke-WebRequest -Uri $apiHealthUrl -UseBasicParsing -TimeoutSec 2
    return $r.StatusCode -eq 200
  } catch { return $false }
}

# ── Find Python ─────────────────────────────────────────────────────────────
$pythonCandidates = @(
  (Get-Command python3 -ErrorAction SilentlyContinue)?.Source,
  (Get-Command python -ErrorAction SilentlyContinue)?.Source,
  "C:\Users\deiby\Downloads\enturnamiento-vehiculos\portable-python\python.exe",
  "C:\Users\deiby\Downloads\enturnamiento-vehiculos\portable-python-lite\python.exe"
) | Where-Object { $_ -and (Test-Path $_) }

$python = $pythonCandidates | Select-Object -First 1
if (-not $python) {
  [System.Windows.MessageBox]::Show("No se encontro Python. Instala Python 3 e intentalo de nuevo.","AGRO PIPES","OK","Error")
  exit 1
}

# ── Find Node / npm ──────────────────────────────────────────────────────────
$npmPath = (Get-Command npm -ErrorAction SilentlyContinue)?.Source
if (-not $npmPath) {
  [System.Windows.MessageBox]::Show("No se encontro npm/Node.js.","AGRO PIPES","OK","Error")
  exit 1
}

# ── Start Backend (if not running) ──────────────────────────────────────────
if (-not (Test-ApiHealth)) {
  $env:APP_DEBUG = "0"
  $bp = Start-Process -FilePath $python `
    -ArgumentList @($runFile) `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError  $stderrLog `
    -PassThru
  Set-Content -Path $pidFile -Value $bp.Id -Encoding ascii

  # Wait up to 15 s for backend to respond
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ApiHealth) { break }
  }
  if (-not (Test-ApiHealth)) {
    [System.Windows.MessageBox]::Show("El backend no respondio. Revisa los logs en backend\instance\","AGRO PIPES","OK","Warning")
  }
}

# ── Start Web Preview (if not running) ──────────────────────────────────────
if (-not (Test-PortOpen 4173)) {
  $nodeExe  = Split-Path $npmPath -Parent | Join-Path -ChildPath "node.exe"
  $vitePath = Join-Path $webDir "node_modules\.bin\vite.cmd"

  if (Test-Path $vitePath) {
    $wp = Start-Process -FilePath "cmd.exe" `
      -ArgumentList "/c `"$vitePath`" preview --host 0.0.0.0 --port 4173" `
      -WorkingDirectory $webDir `
      -WindowStyle Hidden `
      -PassThru
    Set-Content -Path $webPidFile -Value $wp.Id -Encoding ascii

    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 500
      if (Test-PortOpen 4173) { break }
    }
  }
}

# ── Open Browser ─────────────────────────────────────────────────────────────
if (-not $NoBrowser) {
  Start-Process $webUrl
}

Write-Host "AGRO PIPES iniciado:"
Write-Host "  Web:  $webUrl"
Write-Host "  API:  http://127.0.0.1:5000/api"
