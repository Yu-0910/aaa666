@echo off
REM Phase2: raw_sportsnavi + stats + text -> canonical（全件・上書き）
cd /d "%~dp0\.."
node "scripts\phase2_build_canonical_from_raw_sportsnavi.mjs" --year 2026 --force
exit /b %ERRORLEVEL%
