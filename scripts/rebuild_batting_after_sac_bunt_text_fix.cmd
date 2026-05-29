@echo off
setlocal
REM 実況「送りバント」補完・canonical 更新後に実行する。
REM エクスプローラーからダブルクリックするか、リポジトリルートで scripts\rebuild_batting_after_sac_bunt_text_fix.cmd
cd /d "%~dp0\.."
echo [1/5] Backfill plateAppearances from textPlayByPlay...
call npm run backfill:canonical:plate-appearances-from-text
if errorlevel 1 exit /b 1
echo [2/5] Phase11 + Phase15 + Phase12 rankings...
call npm run rebuild:batting-profile-and-rankings-2026
if errorlevel 1 exit /b 1
echo [3/5] Phase13 context splits...
call npm run phase13:build:context
if errorlevel 1 exit /b 1
echo [4/5] Phase14 pitch + Phase16 count + Phase17 period...
call npm run phase14:build:pitch
if errorlevel 1 exit /b 1
call npm run phase16:build:batting-count
if errorlevel 1 exit /b 1
call npm run phase17:build:period
if errorlevel 1 exit /b 1
echo [5/5] Done.
endlocal
