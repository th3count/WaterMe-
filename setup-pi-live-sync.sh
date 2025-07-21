#!/bin/bash
# WaterMe! Pi Live Sync Setup Script
# Run this on your Raspberry Pi

echo "Setting up WaterMe! Live Sync on Raspberry Pi..."

# Navigate to WaterMe backend
cd /home/waterme/WaterMe/backend

# Switch to live-sync branch
echo "Switching to live-sync branch..."
git checkout live-sync
git pull origin live-sync

# Make auto-commit script executable
echo "Making auto-commit script executable..."
chmod +x pi-auto-commit.sh

# Test the script
echo "Testing auto-commit script..."
./pi-auto-commit.sh

# Set up cron jobs
echo "Setting up cron jobs for auto-commit..."
(crontab -l 2>/dev/null; echo "*/1 * * * * /home/waterme/WaterMe/backend/pi-auto-commit.sh") | crontab -
(crontab -l 2>/dev/null; echo "*/1 * * * * sleep 30; /home/waterme/WaterMe/backend/pi-auto-commit.sh") | crontab -

echo "Setup complete!"
echo "Cron jobs installed:"
crontab -l

echo ""
echo "Live sync is now active!"
echo "State files will be auto-committed every 30 seconds."
echo "You can monitor with: tail -f /var/log/syslog | grep pi-auto-commit" 