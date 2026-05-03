$Host.UI.RawUI.WindowTitle = "WebAnim Dev Launcher"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$LOG  = Join-Path $ScriptDir "dev-server.log"
$PORT = 5173
$URL  = "http://localhost:$PORT/webanim/"

"[$(Get-Date)] === WebAnim Dev Server Log ===" | Set-Content $LOG -Encoding UTF8
"[$(Get-Date)] Dir: $ScriptDir"               | Add-Content $LOG

function Write-Log($msg) { "[$(Get-Date -f 'HH:mm:ss')] $msg" | Add-Content $LOG }

function Show-Progress($step, $label) {
    $filled = $step * 4
    $empty  = 20 - $filled
    $bar    = ("=" * $filled) + ("-" * $empty)
    $pct    = $step * 20
    Write-Host ""
    Write-Host "  [$bar] $pct%  Step $step/5  " -NoNewline -ForegroundColor Cyan
    Write-Host $label -ForegroundColor White
    Write-Log "STEP $step/5 $label"
}

function Show-OK($msg) {
    Write-Host "    > OK: $msg" -ForegroundColor Green
    Write-Log "OK: $msg"
}

function Show-Abort($msg) {
    Write-Host ""
    Write-Host "  !! ERROR: $msg" -ForegroundColor Red
    Write-Host ""
    Write-Log "ERROR: $msg"
    Write-Log "Launch failed"
    Write-Host "  --- Full Log ---" -ForegroundColor Yellow
    Get-Content $LOG | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "  Log saved at: $LOG" -ForegroundColor Yellow
    Write-Host "  (Copy the log above and send to AI for debugging)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Press any key to close..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

Clear-Host
Write-Host ""
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host "   WebAnim  -  Dev Server Launcher" -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Node.js ─────────────────────────────────────────────────
Show-Progress 1 "Checking Node.js"
try {
    $nv = & node --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Log "Node.js $nv"
    Show-OK "Node.js $nv"
} catch {
    Show-Abort "Node.js not found. Install v18+ from https://nodejs.org"
}

# ── Step 2: npm ──────────────────────────────────────────────────────
Show-Progress 2 "Checking npm"
try {
    $npmv = & npm --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Log "npm $npmv"
    Show-OK "npm $npmv"
} catch {
    Show-Abort "npm not found. Reinstall Node.js"
}

# ── Step 3: node_modules ─────────────────────────────────────────────
Show-Progress 3 "Checking node_modules"
if (-not (Test-Path "node_modules")) {
    Write-Host "  > First run - installing packages, please wait..." -ForegroundColor Yellow
    Write-Log "Running npm install"
    $result = & npm install 2>&1
    $result | Add-Content $LOG
    if ($LASTEXITCODE -ne 0) { Show-Abort "npm install failed. See log above." }
    Write-Log "npm install done"
}
Show-OK "node_modules ready"

# ── Step 4: Start Vite ───────────────────────────────────────────────
Show-Progress 4 "Starting Vite Dev Server"
Write-Log "Launching: npm run dev"
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName  = "cmd.exe"
$psi.Arguments = "/c npm run dev >> `"$LOG`" 2>&1"
$psi.WorkingDirectory      = $ScriptDir
$psi.CreateNoWindow        = $false
$psi.WindowStyle           = [System.Diagnostics.ProcessWindowStyle]::Minimized
$null = [System.Diagnostics.Process]::Start($psi)
Write-Log "Vite process launched"
Show-OK "Vite launched (minimized in taskbar)"

# ── Step 5: Wait for port ────────────────────────────────────────────
Show-Progress 5 "Waiting for server on port $PORT"
$waited = 0
$ready  = $false
while ($waited -lt 45) {
    try {
        $tcp = New-Object Net.Sockets.TcpClient
        $tcp.Connect("localhost", $PORT)
        $tcp.Close()
        $ready = $true
        break
    } catch {}
    $waited++
    Write-Host "  > Waiting [$waited/45s]...   " -NoNewline -ForegroundColor Gray
    Start-Sleep 1
    Write-Host "`r" -NoNewline
}

if (-not $ready) {
    Show-Abort "Server timed out after 45s. Port may be in use or Vite crashed."
}

Write-Log "Server ready after ${waited}s"
Show-OK "Server ready!"

# ── Done ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  =========================================" -ForegroundColor Green
Write-Host "   OK  Server running!" -ForegroundColor Green
Write-Host "       $URL" -ForegroundColor Cyan
Write-Host "  =========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Stop : close 'WebAnim Dev Server' in taskbar" -ForegroundColor Gray
Write-Host "  Log  : $LOG" -ForegroundColor Gray
Write-Host ""

Start-Process "cmd.exe" -ArgumentList "/c", "start", "", $URL
Write-Log "Browser opened: $URL"

Write-Host "  ----------- Live Log (Ctrl+C to exit) -----------" -ForegroundColor Gray
Write-Host ""
Get-Content $LOG -Wait -Tail 30
