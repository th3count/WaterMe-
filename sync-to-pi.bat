@echo off
echo Syncing WaterMe! to Raspberry Pi...
echo.

REM Replace with your Pi's IP address and username
set PI_IP=192.168.1.100
set PI_USER=waterme
set PI_PATH=/home/waterme/WaterMe/backend

REM Sync the backend directory
echo Syncing backend files...
rsync -avz --exclude='.git' --exclude='__pycache__' --exclude='node_modules' --exclude='*.pyc' ^
  ./ %PI_USER%@%PI_IP%:%PI_PATH%/

REM Sync the UI directory
echo Syncing UI files...
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='build' ^
  ../ui/ %PI_USER%@%PI_IP%:/home/waterme/WaterMe/ui/

echo.
echo Sync complete! Files updated on Raspberry Pi.
echo.
pause 