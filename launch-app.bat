@echo off
cd /d "%~dp0"

:: Kill any stale server on port 3000 to ensure fresh code is loaded
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /f /pid %%a >nul 2>&1

:: Start fresh local server
start "PixelMap Server" /min cmd /c "npx serve -l 3000 ."
timeout /t 1 /nobreak >nul

:: Open in standalone desktop app window using Edge or Chrome (bypassing stale cache)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3000/?t=%random%"
) else if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://localhost:3000/?t=%random%"
) else (
    start "" "http://localhost:3000/?t=%random%"
)
exit
