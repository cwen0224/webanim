@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title WebAnim 啟動器

:: ── ANSI 顏色 ────────────────────────────────────────────────────────
for /f %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "GRN=!ESC![92m" & set "YLW=!ESC![93m" & set "RED=!ESC![91m"
set "CYN=!ESC![96m" & set "WHT=!ESC![97m" & set "GRY=!ESC![90m"
set "RST=!ESC![0m"  & set "BLD=!ESC![1m"

:: ── 設定 ─────────────────────────────────────────────────────────────
set "LOG=dev-server.log"
set "PORT=5173"
set "URL=http://localhost:!PORT!/webanim/"
set "SCRIPT_DIR=%~dp0"
cd /d "!SCRIPT_DIR!"

:: ── 標題畫面 ─────────────────────────────────────────────────────────
cls
echo.
echo !CYN!!BLD!   ██╗    ██╗███████╗██████╗  █████╗ ███╗   ██╗██╗███╗   ███╗!RST!
echo !CYN!!BLD!   ██║    ██║██╔════╝██╔══██╗██╔══██╗████╗  ██║██║████╗ ████║!RST!
echo !CYN!!BLD!   ██║ █╗ ██║█████╗  ██████╔╝███████║██╔██╗ ██║██║██╔████╔██║!RST!
echo !CYN!!BLD!   ██║███╗██║██╔══╝  ██╔══██╗██╔══██║██║╚██╗██║██║██║╚██╔╝██║!RST!
echo !CYN!!BLD!   ╚███╔███╔╝███████╗██████╔╝██║  ██║██║ ╚████║██║██║ ╚═╝ ██║!RST!
echo !CYN!!BLD!    ╚══╝╚══╝ ╚══════╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝!RST!
echo !GRY!   2D 剪紙動畫工具  ·  開發伺服器啟動器!RST!
echo !GRY!   ─────────────────────────────────────────────────────────!RST!
echo.

:: ── 初始化 LOG ───────────────────────────────────────────────────────
echo [%date% %time%] ════ WebAnim Dev Server 啟動記錄 ════ > "!LOG!"
echo [%date% %time%] 工作目錄: !SCRIPT_DIR! >> "!LOG!"
echo. >> "!LOG!"

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 1：檢查 Node.js
:: ══════════════════════════════════════════════════════════════════════
call :progress 1 "檢查 Node.js"
node --version > nul 2>> "!LOG!"
if !errorlevel! neq 0 (
    call :fail "找不到 Node.js！請至 https://nodejs.org 安裝 v18+"
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do (
    echo [OK] Node.js %%v >> "!LOG!"
    call :ok "Node.js %%v"
)

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 2：檢查 npm
:: ══════════════════════════════════════════════════════════════════════
call :progress 2 "檢查 npm"
npm --version > nul 2>> "!LOG!"
if !errorlevel! neq 0 (
    call :fail "找不到 npm！請重新安裝 Node.js"
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('npm --version 2^>nul') do (
    echo [OK] npm %%v >> "!LOG!"
    call :ok "npm %%v"
)

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 3：確認 node_modules
:: ══════════════════════════════════════════════════════════════════════
call :progress 3 "確認相依套件"
if not exist "node_modules\" (
    echo   !YLW!→ 首次執行，安裝套件中，請稍候...!RST!
    echo [INFO] 執行 npm install >> "!LOG!"
    npm install >> "!LOG!" 2>&1
    if !errorlevel! neq 0 (
        call :fail "npm install 失敗！詳見 !LOG!"
        pause & exit /b 1
    )
    echo [OK] npm install 完成 >> "!LOG!"
)
call :ok "node_modules 就緒"

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 4：啟動 Vite dev server（最小化視窗）
:: ══════════════════════════════════════════════════════════════════════
call :progress 4 "啟動 Vite Dev Server"
echo [INFO] 啟動 npm run dev >> "!LOG!"
start "WebAnim Dev Server" /min cmd /c "npm run dev >> "!LOG!" 2>&1"
echo [OK] Vite 程序已啟動 >> "!LOG!"
call :ok "Vite 已啟動（最小化於工作列）"

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 5：等待 port 就緒
:: ══════════════════════════════════════════════════════════════════════
call :progress 5 "等待伺服器就緒"
set /a WAITED=0
:wait_loop
  powershell -NoProfile -Command ^
    "try{(New-Object Net.Sockets.TcpClient).Connect('localhost',!PORT!);exit 0}catch{exit 1}" > nul 2>&1
  if !errorlevel! equ 0 goto :server_ready
  set /a WAITED+=1
  if !WAITED! geq 45 (
    call :fail "伺服器啟動逾時（45s）— 請查看 !LOG!"
    pause & exit /b 1
  )
  <nul set /p "=  !GRY!等待中 [!WAITED!/45s]...!RST!   !ESC![1A"
  timeout /t 1 /nobreak > nul
goto :wait_loop

:server_ready
echo.
echo [OK] 伺服器就緒（等待 !WAITED! 秒）>> "!LOG!"
call :ok "伺服器已就緒！"

:: ══════════════════════════════════════════════════════════════════════
:: 完成 — 開啟瀏覽器
:: ══════════════════════════════════════════════════════════════════════
echo.
echo   !GRY!─────────────────────────────────────────────────────────!RST!
echo   !GRN!!BLD!  ✓ 啟動完成！!RST!
echo   !WHT!    !CYN!!URL!!RST!
echo   !GRY!─────────────────────────────────────────────────────────!RST!
echo.
echo   !GRY!LOG 位置 → !SCRIPT_DIR!!LOG!!RST!
echo   !GRY!停止方式 → 關閉工作列的「WebAnim Dev Server」視窗!RST!
echo.

start "" "!URL!"
echo [INFO] 已開啟瀏覽器 !URL! >> "!LOG!"

:: ══════════════════════════════════════════════════════════════════════
:: 即時 LOG 顯示
:: ══════════════════════════════════════════════════════════════════════
echo   !GRY!──────────── 即時 LOG（Ctrl+C 可關閉此視窗）────────────!RST!
echo.
powershell -NoProfile -Command "Get-Content '!LOG!' -Wait -Tail 20"
goto :eof


:: ════════════════════════════════════════════════════════════════════
:: 子程序
:: ════════════════════════════════════════════════════════════════════

:progress
:: %1 = 步驟(1-5)  %2 = 說明
set "_step=%~1"
if "!_step!"=="1" set "_bar=████░░░░░░░░░░░░░░░░  20%%"
if "!_step!"=="2" set "_bar=████████░░░░░░░░░░░░  40%%"
if "!_step!"=="3" set "_bar=████████████░░░░░░░░  60%%"
if "!_step!"=="4" set "_bar=████████████████░░░░  80%%"
if "!_step!"=="5" set "_bar=████████████████████ 100%%"
echo   !CYN![!_bar!]!RST!  !WHT!步驟 %~1/5!RST!  %~2
echo [STEP %~1] %~2 >> "!LOG!"
goto :eof

:ok
echo   !GRN!  ✓  %~1!RST!
echo.
goto :eof

:fail
echo.
echo   !RED!  ✗  錯誤：%~1!RST!
echo.
echo [ERROR] %~1 >> "!LOG!"
echo [%date% %time%] 啟動失敗 >> "!LOG!"
goto :eof
