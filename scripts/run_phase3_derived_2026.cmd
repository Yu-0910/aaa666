@echo off
REM Phase3（計画書）: canonical -> 個人ページ用派生JSON（2026・一括）
cd /d "%~dp0\.."
call npm run phase3:derived:2026
exit /b %ERRORLEVEL%
