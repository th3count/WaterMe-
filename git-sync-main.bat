@echo off
echo WaterMe! Git Sync to Raspberry Pi (Main Branch)
echo.

REM Switch to main branch
git checkout main

REM Commit and push changes
echo Committing changes to main branch...
git add .
git commit -m "Dev update: %date% %time%"
git push origin main

echo.
echo Changes pushed to main branch.
echo Pi will auto-pull from live-sync branch for state files.
echo.
pause 