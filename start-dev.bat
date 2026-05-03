@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul
title WebAnim 啟動器
cd /d "%~dp0"

:: ── LOG 最優先初始化，確保任何錯誤都能記錄 ─────────────────────────
set "LOG=%~dp0dev-server.log"
echo [%date% %time%] ====== WebAnim 啟動記錄 ====== > "!LOG!"
echo [%date% %time%] 工作目錄: %~dp0 >> "!LOG!"
echo. >> "!LOG!"

:: ── ANSI 顏色 ────────────────────────────────────────────────────────
for /f %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "GRN=!ESC![92m" & set "YLW=!ESC![93m" & set "RED=!ESC![91m"
set "CYN=!ESC![96m" & set "WHT=!ESC![97m" & set "GRY=!ESC![90m"
set "RST=!ESC![0m"  & set "BLD=!ESC![1m"

:: ── 標題 ─────────────────────────────────────────────────────────────
cls
echo.
echo !CYN!!BLD!   WebAnim  —  開發伺服器啟動器!RST!
echo !GRY!   ─────────────────────────────────────────────────────────!RST!
echo.

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 1：Node.js
:: ══════════════════════════════════════════════════════════════════════
call :progress 1 "檢查 Node.js"
node --version > nul 2>&1
if !errorlevel! neq 0 (
    call :abort "找不到 Node.js！請至 https://nodejs.org 安裝 v18+"
)
for /f "tokens=*" %%v in ('node --version') do (
    echo [OK] Node.js %%v >> "!LOG!"
    call :ok "Node.js %%v"
)

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 2：npm
:: ══════════════════════════════════════════════════════════════════════
call :progress 2 "檢查 npm"
npm --version > nul 2>&1
if !errorlevel! neq 0 (
    call :abort "找不到 npm！"
)
for /f "tokens=*" %%v in ('npm --version') do (
    echo [OK] npm %%v >> "!LOG!"
    call :ok "npm %%v"
)

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 3：node_modules
:: ══════════════════════════════════════════════════════════════════════
call :progress 3 "確認相依套件"
if not exist "node_modules\" (
    echo   !YLW!→ 首次執行，安裝套件中（約 30 秒）...!RST!
    echo [INFO] 執行 npm install >> "!LOG!"
    npm install >> "!LOG!" 2>&1
    if !errorlevel! neq 0 (
        call :abort "npm install 失敗！"
    )
    echo [OK] npm install 完成 >> "!LOG!"
)
call :ok "套件就緒"

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 4：啟動 Vite（注意：不用巢狀引號，LOG 路徑不含空白）
:: ══════════════════════════════════════════════════════════════════════
call :progress 4 "啟動 Vite Dev Server"
echo [INFO] 啟動 vite dev >> "!LOG!"
start "WebAnim Dev Server" /min cmd /c "npm run dev 1>>dev-server.log 2>&1"
echo [OK] Vite 程序已啟動 >> "!LOG!"
call :ok "Vite 已啟動（最小化於工作列）"

:: ══════════════════════════════════════════════════════════════════════
:: 步驟 5：等待 port 5173
:: ══════════════════════════════════════════════════════════════════════
call :progress 5 "等待伺服器就緒"
set /a WAITED=0
:wait_loop
  powershell -NoProfile -Command ^
    "try{(New-Object Net.Sockets.TcpClient).Connect('localhost',5173);exit 0}catch{exit 1}" > nul 2>&1
  if !errorlevel! equ 0 goto :server_ready
  set /a WAITED+=1
  if !WAITED! geq 45 (
    call :abort "伺服器啟動逾時（45秒），可能是 port 被佔用或 vite 出錯"
  )
  <nul set /p "=  !GRY!等待中 [!WAITED!/45s]...!RST!   !ESC![1A"
  timeout /t 1 /nobreak > nul
goto :wait_loop

:server_ready
echo.
echo [OK] 伺服器就緒（等了 !WAITED! 秒）>> "!LOG!"
call :ok "伺服器已就緒！"

:: ══════════════════════════════════════════════════════════════════════
:: 完成：開啟瀏覽器
:: ══════════════════════════════════════════════════════════════════════
echo.
echo   !GRY!─────────────────────────────────────────────────────────!RST!
echo   !GRN!!BLD!  ✓  啟動完成！!RST!
echo   !WHT!      !CYN!http://localhost:5173/webanim/!RST!
echo   !GRY!─────────────────────────────────────────────────────────!RST!
echo.
echo   !GRY!停止方式   → 關閉工作列的「WebAnim Dev Server」視窗!RST!
echo   !GRY!LOG 位置   → !LOG!!RST!
echo.
start "" "http://localhost:5173/webanim/"
echo [INFO] 已開啟瀏覽器 >> "!LOG!"

echo   !GRY!────────────── 即時 LOG（Ctrl+C 離開）──────────────!RST!
echo.
powershell -NoProfile -Command "Get-Content '!LOG!' -Wait -Tail 30"
pause
goto :eof


:: ════════════════════════════════════════════════════════════════════
:progress
set "_s=%~1"
if "!_s!"=="1" set "_bar=████░░░░░░░░░░░░░░░░  20%%"
if "!_s!"=="2" set "_bar=████████░░░░░░░░░░░░  40%%"
if "!_s!"=="3" set "_bar=████████████░░░░░░░░  60%%"
if "!_s!"=="4" set "_bar=████████████████░░░░  80%%"
if "!_s!"=="5" set "_bar=████████████████████ 100%%"
echo   !CYN![!_bar!]!RST!  步驟 %~1/5  %~2
echo [STEP %~1/5] %~2 >> "!LOG!"
goto :eof

:ok
echo   !GRN!  ✓  %~1!RST!
echo.
echo [OK] %~1 >> "!LOG!"
goto :eof

:: ════════════════════════════════════════════════════════════════════
:: :abort — 顯示錯誤、印出完整 LOG、等待按鍵後才關閉
:: ════════════════════════════════════════════════════════════════════
:abort
echo.
echo   !RED!!BLD!  ✗  錯誤：%~1!RST!
echo.
echo [ERROR] %~1 >> "!LOG!"
echo [%date% %time%] 啟動失敗 >> "!LOG!"
echo.
echo   !YLW!────────────── 完整 LOG 內容 ──────────────!RST!
echo.
type "!LOG!"
echo.
echo   !YLW!LOG 已存於：!LOG!!RST!
echo   !GRY!（可直接複製以上內容回報給 AI）!RST!
echo.
echo   按任意鍵關閉...
pause > nul
exit /b 1
