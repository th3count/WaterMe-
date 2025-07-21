# WaterMe! Sync to Raspberry Pi
# Replace these variables with your Pi's details
$PI_IP = "192.168.1.100"
$PI_USER = "waterme"
$PI_PATH = "/home/waterme/WaterMe/backend"

Write-Host "Syncing WaterMe! to Raspberry Pi..." -ForegroundColor Green
Write-Host ""

# Sync backend directory
Write-Host "Syncing backend files..." -ForegroundColor Yellow
rsync -avz --exclude='.git' --exclude='__pycache__' --exclude='node_modules' --exclude='*.pyc' `
  ./ ${PI_USER}@${PI_IP}:${PI_PATH}/

# Sync UI directory
Write-Host "Syncing UI files..." -ForegroundColor Yellow
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='build' `
  ../ui/ ${PI_USER}@${PI_IP}:/home/waterme/WaterMe/ui/

Write-Host ""
Write-Host "Sync complete! Files updated on Raspberry Pi." -ForegroundColor Green
Write-Host ""
Read-Host "Press Enter to continue" 