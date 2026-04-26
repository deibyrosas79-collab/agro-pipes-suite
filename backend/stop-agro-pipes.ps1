$backendDir = "C:\Users\deiby\Downloads\agro-pipes-suite\backend"
$pidFile = Join-Path $backendDir "instance\agro_pipes.pid"

if (Test-Path $pidFile) {
  $serverPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($serverPid) {
    Get-Process -Id $serverPid -ErrorAction SilentlyContinue | Stop-Process -Force
  }
  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
}
