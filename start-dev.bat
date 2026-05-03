@echo off
setlocal enabledelayedexpansion
title WebAnim Dev Launcher
cd /d "%~dp0"

set "LOG=%~dp0dev-server.log"
set "PORT=5173"
set "URL=http://localhost:%PORT%/webanim/"

echo [%date% %time%] === WebAnim Dev Server Log === > "%LOG%"
echo [%date% %time%] Dir: %~dp0 >> "%LOG%"
echo. >> "%LOG%"

cls
echo.
echo   =========================================
echo    WebAnim - Dev Server Launcher
echo   =========================================
echo.

:: ─────────────────────────────────────────────
:: Step 1: Node.js
:: ─────────────────────────────────────────────
call :progress 1 "Checking Node.js"
node --version > nul 2>&1
if !errorlevel! neq 0 (
    call :abort "Node.js not found. Install v18+ from https://nodejs.org"
)
for /f "tokens=*" %%v in ('node --version') do (
    echo [OK] Node.js %%v >> "%LOG%"
    call :ok "Node.js %%v"
)

:: ─────────────────────────────────────────────
:: Step 2: npm
:: ─────────────────────────────────────────────
call :progress 2 "Checking npm"
npm --version > nul 2>&1
if !errorlevel! neq 0 (
    call :abort "npm not found. Reinstall Node.js"
)
for /f "tokens=*" %%v in ('npm --version') do (
    echo [OK] npm %%v >> "%LOG%"
    call :ok "npm %%v"
)

:: ─────────────────────────────────────────────
:: Step 3: node_modules
:: ─────────────────────────────────────────────
call :progress 3 "Checking node_modules"
if not exist "node_modules\" (
    echo   ^> First run - installing packages, please wait...
    echo [INFO] Running npm install >> "%LOG%"
    npm install >> "%LOG%" 2>&1
    if !errorlevel! neq 0 (
        call :abort "npm install failed. See log below."
    )
    echo [OK] npm install done >> "%LOG%"
)
call :ok "node_modules ready"

:: ─────────────────────────────────────────────
:: Step 4: Start Vite
:: ─────────────────────────────────────────────
call :progress 4 "Starting Vite Dev Server"
echo [INFO] Starting vite dev >> "%LOG%"
start "WebAnim Dev Server" /min cmd /c "npm run dev 1>>dev-server.log 2>&1"
echo [OK] Vite process launched >> "%LOG%"
call :ok "Vite launched (minimized in taskbar)"

:: ─────────────────────────────────────────────
:: Step 5: Wait for port
:: ─────────────────────────────────────────────
call :progress 5 "Waiting for server on port %PORT%"
set /a WAITED=0
:wait_loop
    powershell -NoProfile -Command "try{(New-Object Net.Sockets.TcpClient).Connect('localhost',%PORT%);exit 0}catch{exit 1}" > nul 2>&1
    if !errorlevel! equ 0 goto :server_ready
    set /a WAITED+=1
    if !WAITED! geq 45 (
        call :abort "Server timed out after 45s. Port may be in use or Vite crashed."
    )
    set /p "= > Waiting [!WAITED!/45s]...   " < nul
    timeout /t 1 /nobreak > nul
    echo !ESC![1A > nul 2>&1
goto :wait_loop

:server_ready
echo.
echo [OK] Server ready after %WAITED%s >> "%LOG%"
call :ok "Server is ready!"

echo.
echo   =========================================
echo    OK  Server running at:
echo        %URL%
echo   =========================================
echo.
echo   To stop: close the "WebAnim Dev Server" window in taskbar
echo   Log    : %LOG%
echo.
start "" "%URL%"
echo [INFO] Browser opened >> "%LOG%"

echo   ----------- Live Log (Ctrl+C to exit) -----------
echo.
powershell -NoProfile -Command "Get-Content '%LOG%' -Wait -Tail 30"
pause
goto :eof


:: =================================================
:progress
set "_s=%~1"
if "!_s!"=="1" set "_bar=[====                ] 20%%"
if "!_s!"=="2" set "_bar=[========            ] 40%%"
if "!_s!"=="3" set "_bar=[============        ] 60%%"
if "!_s!"=="4" set "_bar=[================    ] 80%%"
if "!_s!"=="5" set "_bar=[====================] 100%%"
echo   !_bar!  Step %~1/5  %~2
echo [STEP %~1/5] %~2 >> "%LOG%"
goto :eof

:ok
echo     ^> OK: %~1
echo.
echo [OK] %~1 >> "%LOG%"
goto :eof

:abort
echo.
echo   !! ERROR: %~1
echo.
echo [ERROR] %~1 >> "%LOG%"
echo [%date% %time%] Launch failed >> "%LOG%"
echo.
echo   --- Full Log ---
echo.
type "%LOG%"
echo.
echo   Log saved at: %LOG%
echo   (Copy the log above and send to AI for help)
echo.
echo Press any key to close...
pause > nul
exit /b 1
