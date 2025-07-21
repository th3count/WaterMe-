@echo off
echo WaterMe! Git Sync to Raspberry Pi
echo.

REM Commit and push changes
echo Committing changes...
git add .
git commit -m "Auto-sync: %date% %time%"
git push

echo.
echo Changes pushed to git repository.
echo Raspberry Pi should auto-pull or you can run: git pull
echo.
pause 