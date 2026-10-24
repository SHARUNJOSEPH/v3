@echo off
cd /d "%~dp0"

:: Check if local server is already running on port 3000
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    start "PixelMap Server" /min cmd /c "npx serve -l 3000 ."
    :: Small wait for server initialization
    timeout /t 2 /nobreak >nul
)

:: Open in standalone desktop app window using Edge or Chrome (bypassing stale cache)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3000/?t=%random%"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000/?t=%random%"
) else (
    start "" "http://localhost:3000/?t=%random%"
)
exit
