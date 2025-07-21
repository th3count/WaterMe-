@echo off
echo WaterMe! PC Auto-Pull from Live Sync Branch
echo.

REM Switch to live-sync branch and pull
git checkout live-sync
git pull origin live-sync

echo.
echo Live sync data pulled from Raspberry Pi.
echo State files updated: active_zones.json, logs, etc.
echo.
pause 