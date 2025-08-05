# WaterMe! Installation Guide

## 🚀 Quick Installation (Recommended)

For a fresh Raspbian installation, use the automated installer:

```bash
# Download and run the installer
curl -sSL https://raw.githubusercontent.com/your-repo/waterme/main/install.sh | sudo bash

# OR download first, then run
wget https://raw.githubusercontent.com/your-repo/waterme/main/install.sh
chmod +x install.sh
sudo ./install.sh
```

The installer will:
- ✅ Update system packages
- ✅ Install Python 3.9+ and Node.js 18+
- ✅ Create system user and directories
- ✅ Install all dependencies
- ✅ Configure GPIO permissions
- ✅ Set up systemd service
- ✅ Configure firewall
- ✅ Create configuration templates

## 📋 Manual Installation

If you prefer manual installation or need to customize the setup:

### 1. System Requirements

- **OS**: Raspbian OS (Debian-based)
- **Python**: 3.9 or higher
- **Node.js**: 18 or higher
- **Memory**: 1GB RAM minimum
- **Storage**: 8GB minimum
- **Network**: Internet connection for installation

### 2. Install System Dependencies

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3 python3-pip python3-venv nodejs npm git
```

### 3. Create System User

```bash
sudo useradd --system --create-home --home-dir /opt/waterme --shell /bin/bash waterme
sudo usermod -a -G gpio,spi,i2c,dialout waterme
```

### 4. Set Up Directories

```bash
sudo mkdir -p /opt/waterme/{data,config,logs,library,tools,ui,core}
sudo chown -R waterme:waterme /opt/waterme
```

### 5. Install Python Dependencies

```bash
sudo -u waterme pip3 install --user flask flask-cors pytz astral RPi.GPIO requests python-dateutil
```

### 6. Configure GPIO Permissions

```bash
sudo cat > /etc/udev/rules.d/99-gpio.rules << 'EOF'
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", ACTION=="add", RUN+="/bin/chgrp gpio /sys/class/gpio/export /sys/class/gpio/unexport", RUN+="/bin/chmod 220 /sys/class/gpio/export /sys/class/gpio/unexport"
SUBSYSTEM=="gpio", KERNEL=="gpio*", ACTION=="add", RUN+="/bin/chgrp gpio %S%p/active_low %S%p/direction %S%p/edge %S%p/value", RUN+="/bin/chmod 660 %S%p/active_low %S%p/direction %S%p/edge %S%p/value"
EOF

sudo udevadm control --reload-rules
sudo udevadm trigger
```

## 🔧 Post-Installation Setup

### 1. Copy Application Code

```bash
# Copy your WaterMe! source code to /opt/waterme/
sudo cp -r /path/to/waterme/* /opt/waterme/
sudo chown -R waterme:waterme /opt/waterme/
```

### 2. Install UI Dependencies

```bash
cd /opt/waterme/ui
sudo -u waterme npm install
```

### 3. Configure Your System

Edit the configuration files:

```bash
# Garden settings (GPS coordinates, timezone, etc.)
sudo nano /opt/waterme/config/settings.cfg

# GPIO pin assignments
sudo nano /opt/waterme/config/gpio.cfg
```

### 4. Start the Service

```bash
# Enable auto-start
sudo systemctl enable waterme

# Start the service
sudo systemctl start waterme

# Check status
sudo systemctl status waterme
```

## 🌐 Access Your System

Once running, access WaterMe! at:

- **Backend API**: `http://your-pi-ip:5000`
- **Frontend UI**: `http://your-pi-ip:3000`

Find your Pi's IP address:
```bash
hostname -I
```

## 🛠️ Management Commands

The installer creates a convenient `waterme` command:

```bash
waterme start      # Start the service
waterme stop       # Stop the service
waterme restart    # Restart the service
waterme status     # Show service status
waterme logs       # View live logs
waterme config     # Edit garden settings
waterme gpio       # Edit GPIO configuration
waterme update     # Update from git (if using git)
```

## 📝 Configuration Files

### GPIO Configuration (`/opt/waterme/config/gpio.cfg`)

```ini
[GPIO]
zoneCount = 8
pins = 5, 6, 13, 16, 19, 20, 21, 26
pumpIndex = 8
activeLow = True
mode = BCM
```

### Garden Settings (`/opt/waterme/config/settings.cfg`)

```ini
[Garden]
name = My Smart Garden
city = Your City, Country
gps_lat = 50.4452
gps_lon = -104.6189
mode = smart
timezone = UTC
timer_multiplier = 1.0
simulate = False
```

## 🔍 Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status waterme

# View detailed logs
sudo journalctl -u waterme -f

# Check application logs
tail -f /opt/waterme/logs/*.log
```

### GPIO Permission Issues

```bash
# Check user groups
groups waterme

# Reload GPIO rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### Network Access Issues

```bash
# Check if ports are open
sudo netstat -tulpn | grep -E ':3000|:5000'

# Check firewall
sudo ufw status
```

### Python Import Errors

```bash
# Check Python path
sudo -u waterme python3 -c "import sys; print(sys.path)"

# Reinstall dependencies
sudo -u waterme pip3 install --user --force-reinstall -r /opt/waterme/requirements.txt
```

## 🔄 Updates

To update WaterMe!:

1. **Backup your configuration**:
   ```bash
   sudo cp -r /opt/waterme/config /opt/waterme/config.backup
   ```

2. **Update the code**:
   ```bash
   # If using git
   waterme update
   
   # Or manually copy new files
   sudo cp -r /path/to/new/waterme/* /opt/waterme/
   sudo chown -R waterme:waterme /opt/waterme/
   ```

3. **Restart the service**:
   ```bash
   waterme restart
   ```

## 🔒 Security Notes

- The installer configures a restrictive firewall
- The service runs as a non-privileged user
- GPIO access is granted through group membership
- Only necessary ports are opened (3000, 5000)
- Local network access is allowed by default

## 📞 Support

If you encounter issues:

1. Check the logs: `waterme logs`
2. Verify configuration files
3. Check system resources: `htop`
4. Review installation log: `/tmp/waterme_install.log`

For hardware-specific issues, ensure:
- GPIO pins are not in use by other services
- Relay modules are properly connected
- Power supply is adequate for your setup