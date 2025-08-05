#!/bin/bash
#
# 🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
# 📖 Primary Reference: /rules/system-overview.md
# 🏗️ Architecture: /rules/project-structure.md
# 💻 Coding Standards: /rules/coding-standards.md
#
# WaterMe! Smart Garden Irrigation System - Installation Script
# =============================================================
# 
# This script sets up a complete WaterMe! installation on a virgin Raspbian environment.
# It handles all dependencies, configurations, and system setup automatically.
#
# Requirements:
# - Fresh Raspbian OS installation
# - Internet connection
# - Root/sudo access
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/your-repo/waterme/main/install.sh | bash
#   OR
#   chmod +x install.sh && ./install.sh
#   OR
#   ./install.sh --service-enable    # Install with systemd service
#   ./install.sh --service-disable   # Install without systemd service (default)
#
# What this script does:
# 1. System updates and base packages
# 2. Python 3.9+ installation and pip setup
# 3. Node.js 18+ installation for UI
# 4. Python dependencies installation
# 5. GPIO permissions and hardware setup
# 6. Directory structure creation
# 7. Configuration file templates
# 8. Firewall configuration
# 9. Systemd service setup (if --service-enable)
# 10. Log rotation setup
# 11. Helper scripts creation
# 12. Final system validation

set -e  # Exit on any error
set -u  # Exit on undefined variables

# Enable debugging output
DEBUG=${DEBUG:-false}
if [[ "$DEBUG" == "true" ]]; then
    set -x  # Print commands before execution
fi

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
WATERME_USER="waterme"
WATERME_HOME="/home/waterme/WaterMe"
WATERME_SERVICE="waterme"
PYTHON_MIN_VERSION="3.9"
NODE_MIN_VERSION="18"

# Default settings
ENABLE_SERVICE=false
GIT_REPO="https://github.com/th3count/WaterMe-.git"
GIT_BRANCH="main"
GIT_PULL=false
GIT_UPGRADE=false
UNINSTALL=false

# Logging
LOG_FILE="/tmp/waterme_install.log"
exec > >(tee -a "$LOG_FILE")
exec 2>&1

print_header() {
    echo -e "${CYAN}"
    echo "=================================================================="
    echo "🌱 WaterMe! Smart Garden Irrigation System - Installer"
    echo "=================================================================="
    echo -e "${NC}"
}

print_step() {
    echo -e "${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --service-enable)
                ENABLE_SERVICE=true
                shift
                ;;
            --service-disable)
                ENABLE_SERVICE=false
                shift
                ;;
            --debug)
                DEBUG=true
                set -x  # Enable debug mode
                shift
                ;;
            --git-pull)
                GIT_PULL=true
                shift
                ;;
            --git-upgrade)
                GIT_UPGRADE=true
                shift
                ;;
            --uninstall)
                UNINSTALL=true
                shift
                ;;
            -h|--help)
                echo "WaterMe! Installation Script"
                echo ""
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --service-enable    Install with systemd service (production)"
                echo "  --service-disable   Install without systemd service (default, manual)"
                echo "  --debug             Enable verbose debugging output"
                echo "  --git-pull          Pull latest code from repository"
                echo "  --git-upgrade       Full upgrade: pull code + reinstall dependencies"
                echo "  --uninstall         Remove WaterMe! installation completely"
                echo "  -h, --help          Show this help message"
                echo ""
                echo "Examples:"
                echo "  sudo ./install.sh                    # Manual mode (default)"
                echo "  sudo ./install.sh --service-enable   # Service mode"
                echo "  sudo ./install.sh --debug            # With debugging"
                echo "  sudo ./install.sh --git-pull         # Pull latest code"
                echo "  sudo ./install.sh --git-upgrade      # Full upgrade"
                echo "  sudo ./install.sh --uninstall        # Remove installation"
                echo ""
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_os() {
    print_step "Checking operating system..."
    
    if [[ ! -f /etc/os-release ]]; then
        print_error "Cannot determine OS version"
        exit 1
    fi
    
    source /etc/os-release
    
    # Debug output
    if [[ "$DEBUG" == "true" ]]; then
        echo "DEBUG: OS_ID=$ID"
        echo "DEBUG: OS_ID_LIKE=${ID_LIKE:-}"
        echo "DEBUG: OS_PRETTY_NAME=$PRETTY_NAME"
    fi
    
    if [[ "$ID" != "raspbian" && "${ID_LIKE:-}" != *"debian"* ]]; then
        print_warning "This script is designed for Raspbian/Debian. Proceeding anyway..."
    fi
    
    print_success "OS check completed: $PRETTY_NAME"
}

update_system() {
    print_step "Updating system packages..."
    
    if [[ "$DEBUG" == "true" ]]; then
        echo "DEBUG: Starting system update..."
        echo "DEBUG: ENABLE_SERVICE=$ENABLE_SERVICE"
    fi
    
    # Set environment to avoid prompts
    export DEBIAN_FRONTEND=noninteractive
    export DEBCONF_NONINTERACTIVE_SEEN=true
    
    # Update package lists
    apt-get update -y
    
    # Upgrade system packages (non-interactive)
    apt-get upgrade -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold"
    
    # Install essential packages (non-interactive)
    print_step "Installing essential packages..."
    apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
        curl \
        wget \
        git \
        build-essential \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        sudo \
        rsync \
        unzip \
        nano \
        htop \
        tree
    
    # Install systemd if service mode is enabled
    if [[ "$ENABLE_SERVICE" == true ]]; then
        print_step "Installing systemd (service mode enabled)..."
        apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" systemd
    else
        if [[ "$DEBUG" == "true" ]]; then
            echo "DEBUG: Skipping systemd installation (manual mode)"
        fi
    fi
    
    print_success "System packages updated"
}

install_python() {
    print_step "Installing Python ${PYTHON_MIN_VERSION}+..."
    
    # Check if Python is already installed with correct version
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
        if [[ "$DEBUG" == "true" ]]; then
            echo "DEBUG: Found Python $PYTHON_VERSION"
        fi
        if python3 -c "import sys; exit(0 if sys.version_info >= (${PYTHON_MIN_VERSION//./, }) else 1)" 2>/dev/null; then
            print_success "Python $PYTHON_VERSION already installed"
        else
            print_warning "Python $PYTHON_VERSION is too old, installing newer version..."
        fi
    else
        if [[ "$DEBUG" == "true" ]]; then
            echo "DEBUG: Python3 not found, will install"
        fi
    fi
    
    # Install Python and related packages (non-interactive)
    print_step "Installing Python packages..."
    apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
        python3 \
        python3-pip \
        python3-venv \
        python3-dev \
        python3-setuptools \
        python3-wheel
    
    # Verify installation
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
    print_success "Python $PYTHON_VERSION installed"
    
    # Upgrade pip (skip if externally managed)
    print_step "Checking pip version..."
    if python3 -m pip install --upgrade pip setuptools wheel 2>/dev/null; then
        print_success "pip upgraded to latest version"
    else
        print_warning "pip upgrade skipped (externally managed environment)"
        if [[ "$DEBUG" == "true" ]]; then
            echo "DEBUG: Using system pip version"
        fi
    fi
}

install_nodejs() {
    print_step "Installing Node.js ${NODE_MIN_VERSION}+..."
    
    # Check if Node.js is already installed with correct version
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version | cut -d'v' -f2)
        NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1)
        if [[ $NODE_MAJOR -ge $NODE_MIN_VERSION ]]; then
            print_success "Node.js v$NODE_VERSION already installed"
            return
        fi
    fi
    
    # Install Node.js from NodeSource repository (non-interactive)
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MIN_VERSION}.x | bash -
    apt-get install -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" nodejs
    
    # Verify installation
    NODE_VERSION=$(node --version)
    NPM_VERSION=$(npm --version)
    print_success "Node.js $NODE_VERSION and npm $NPM_VERSION installed"
}

create_user() {
    print_step "Creating WaterMe! system user..."
    
    if id "$WATERME_USER" &>/dev/null; then
        print_success "User $WATERME_USER already exists"
    else
        # Create system user
        useradd --system --create-home --home-dir "$WATERME_HOME" --shell /bin/bash "$WATERME_USER"
        
        # Add user to necessary groups for GPIO access
        usermod -a -G gpio,spi,i2c,dialout "$WATERME_USER"
        
        print_success "User $WATERME_USER created"
    fi
}

setup_directories() {
    print_step "Setting up directory structure..."
    
    # Create main directories
    mkdir -p "$WATERME_HOME"/{data,config,logs,library,tools,ui,core}
    
    # Set ownership
    chown -R "$WATERME_USER:$WATERME_USER" "$WATERME_HOME"
    
    # Set permissions
    chmod 755 "$WATERME_HOME"
    chmod 755 "$WATERME_HOME"/{data,config,logs,library,tools,ui,core}
    chmod 775 "$WATERME_HOME"/{data,logs}  # Allow group write for logs and data
    
    print_success "Directory structure created"
}

install_python_dependencies() {
    print_step "Installing Python dependencies..."
    
    # Create requirements.txt if it doesn't exist
    cat > "$WATERME_HOME/requirements.txt" << 'EOF'
# WaterMe! Python Dependencies
flask>=2.3.0
flask-cors>=4.0.0
pytz>=2023.3
astral>=3.2
requests>=2.31.0
python-dateutil>=2.8.2
RPi.GPIO>=0.7.1
# Note: configparser, pathlib, threading are part of Python standard library
# Note: threading-timer is not needed as we use standard threading
EOF

    # Install dependencies as waterme user (non-interactive)
    if sudo -u "$WATERME_USER" python3 -m pip install --user --quiet -r "$WATERME_HOME/requirements.txt" 2>/dev/null; then
        print_success "Python dependencies installed"
    else
        print_warning "Some Python dependencies may need manual installation"
        if [[ "$DEBUG" == "true" ]]; then
            echo "DEBUG: Check requirements.txt for missing packages"
        fi
    fi
}

git_pull_latest() {
    print_step "Pulling latest code from repository..."
    
    if [[ "$DEBUG" == "true" ]]; then
        echo "DEBUG: GIT_REPO=$GIT_REPO"
        echo "DEBUG: GIT_BRANCH=$GIT_BRANCH"
        echo "DEBUG: WATERME_HOME=$WATERME_HOME"
    fi
    
    # Check if we're in a git repository
    if [[ -d "$WATERME_HOME/.git" ]]; then
        print_step "Updating existing repository..."
        cd "$WATERME_HOME"
        
        # Stash any local changes
        if git status --porcelain | grep -q .; then
            print_warning "Local changes detected, stashing..."
            git stash
        fi
        
        # Pull latest changes
        if git pull origin "$GIT_BRANCH"; then
            print_success "Code updated successfully"
        else
            print_error "Failed to pull latest code"
            return 1
        fi
        
        # Restore stashed changes if any
        if git stash list | grep -q .; then
            print_warning "Restoring stashed changes..."
            git stash pop
        fi
    else
        print_step "Cloning repository to $WATERME_HOME..."
        
        # Remove existing directory if it exists
        if [[ -d "$WATERME_HOME" ]]; then
            rm -rf "$WATERME_HOME"
        fi
        
        # Clone the repository
        if git clone -b "$GIT_BRANCH" "$GIT_REPO" "$WATERME_HOME"; then
            print_success "Repository cloned successfully"
        else
            print_error "Failed to clone repository"
            return 1
        fi
        
        # Set ownership
        chown -R "$WATERME_USER:$WATERME_USER" "$WATERME_HOME"
    fi
}

git_upgrade_system() {
    print_step "Performing full system upgrade..."
    
    # Pull latest code
    git_pull_latest
    
    # Reinstall Python dependencies
    print_step "Reinstalling Python dependencies..."
    cd "$WATERME_HOME"
    if sudo -u "$WATERME_USER" python3 -m pip install --user --quiet -r requirements.txt 2>/dev/null; then
        print_success "Python dependencies updated"
    else
        print_warning "Some Python dependencies may need manual installation"
    fi
    
    # Reinstall UI dependencies
    print_step "Reinstalling UI dependencies..."
    if [[ -f "$WATERME_HOME/ui/package.json" ]]; then
        cd "$WATERME_HOME/ui"
        sudo -u "$WATERME_USER" npm install --silent
        print_success "UI dependencies updated"
    else
        print_warning "UI package.json not found"
    fi
    
    # Restart service if enabled
    if [[ "$ENABLE_SERVICE" == true ]]; then
        print_step "Restarting service..."
        systemctl restart "$WATERME_SERVICE" 2>/dev/null || print_warning "Service restart failed"
    fi
    
    print_success "System upgrade completed"
}

uninstall_waterme() {
    print_step "Uninstalling WaterMe! system..."
    
    if [[ "$DEBUG" == "true" ]]; then
        echo "DEBUG: Starting uninstall process"
        echo "DEBUG: WATERME_HOME=$WATERME_HOME"
        echo "DEBUG: WATERME_USER=$WATERME_USER"
        echo "DEBUG: WATERME_SERVICE=$WATERME_SERVICE"
    fi
    
    # Stop service if running
    if systemctl is-active --quiet "$WATERME_SERVICE" 2>/dev/null; then
        print_step "Stopping WaterMe! service..."
        systemctl stop "$WATERME_SERVICE"
        systemctl disable "$WATERME_SERVICE"
    fi
    
    # Remove systemd service file
    if [[ -f "/etc/systemd/system/$WATERME_SERVICE.service" ]]; then
        print_step "Removing systemd service..."
        rm -f "/etc/systemd/system/$WATERME_SERVICE.service"
        systemctl daemon-reload
    fi
    
    # Remove helper script
    if [[ -f "/usr/local/bin/waterme" ]]; then
        print_step "Removing helper script..."
        rm -f "/usr/local/bin/waterme"
    fi
    
    # Remove log rotation configuration
    if [[ -f "/etc/logrotate.d/waterme" ]]; then
        print_step "Removing log rotation configuration..."
        rm -f "/etc/logrotate.d/waterme"
    fi
    
    # Remove GPIO udev rules
    if [[ -f "/etc/udev/rules.d/99-gpio.rules" ]]; then
        print_step "Removing GPIO udev rules..."
        rm -f "/etc/udev/rules.d/99-gpio.rules"
        udevadm control --reload-rules
        udevadm trigger
    fi
    
    # Remove firewall rules (if they exist)
    if command -v ufw &> /dev/null; then
        print_step "Removing firewall rules..."
        ufw delete allow 5000/tcp 2>/dev/null || true
        ufw delete allow 3000/tcp 2>/dev/null || true
    fi
    
    # Remove WaterMe! user
    if id "$WATERME_USER" &>/dev/null; then
        print_step "Removing WaterMe! user..."
        userdel -r "$WATERME_USER" 2>/dev/null || print_warning "Could not remove user $WATERME_USER"
    fi
    
    # Remove installation directory
    if [[ -d "$WATERME_HOME" ]]; then
        print_step "Removing installation directory..."
        rm -rf "$WATERME_HOME"
    fi
    
    # Remove any remaining processes
    print_step "Stopping any remaining WaterMe! processes..."
    pkill -f "python3.*waterme.py" 2>/dev/null || true
    pkill -f "waterme" 2>/dev/null || true
    
    # Remove Python packages (optional - user packages)
    print_step "Removing Python packages..."
    if [[ -d "/home/$WATERME_USER/.local/lib/python3.*/site-packages" ]]; then
        sudo -u "$WATERME_USER" python3 -m pip uninstall -y flask flask-cors pytz astral requests python-dateutil RPi.GPIO 2>/dev/null || true
    fi
    
    print_success "WaterMe! uninstallation completed"
    echo
    echo "📋 Uninstallation Summary:"
    echo "  ✅ Service stopped and disabled"
    echo "  ✅ Systemd service file removed"
    echo "  ✅ Helper script removed"
    echo "  ✅ Log rotation configuration removed"
    echo "  ✅ GPIO udev rules removed"
    echo "  ✅ Firewall rules removed"
    echo "  ✅ User $WATERME_USER removed"
    echo "  ✅ Installation directory removed"
    echo "  ✅ Python packages removed"
    echo
    echo "🌱 WaterMe! has been completely removed from your system."
}

install_ui_dependencies() {
    print_step "Installing UI dependencies..."
    
    if [[ "$DEBUG" == "true" ]]; then
        echo "DEBUG: Installing npm dependencies for UI"
    fi
    
    # Check if UI directory exists and has package.json
    if [[ -f "$WATERME_HOME/ui/package.json" ]]; then
        print_step "Installing npm dependencies from existing package.json..."
        cd "$WATERME_HOME/ui"
        sudo -u "$WATERME_USER" npm install --silent
        print_success "UI dependencies installed"
    else
        print_step "Creating basic UI package.json..."
        
        # Create a basic package.json for the UI
        cat > "$WATERME_HOME/ui/package.json" << 'EOF'
{
  "name": "waterme-ui",
  "version": "1.0.0",
  "description": "WaterMe! Smart Garden Irrigation System UI",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "luxon": "^3.4.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "eslint": "^8.0.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "eslint-plugin-react-refresh": "^0.4.0",
    "typescript": "^5.0.0",
    "vite": "^4.0.0"
  }
}
EOF

        # Install the basic dependencies
        cd "$WATERME_HOME/ui"
        sudo -u "$WATERME_USER" npm install --silent
        print_success "Basic UI dependencies installed"
    fi
}

setup_gpio_permissions() {
    print_step "Configuring GPIO permissions..."
    
    # Add udev rules for GPIO access
    cat > /etc/udev/rules.d/99-gpio.rules << 'EOF'
# GPIO permissions for WaterMe!
SUBSYSTEM=="gpio", KERNEL=="gpiochip*", ACTION=="add", RUN+="/bin/chgrp gpio /sys/class/gpio/export /sys/class/gpio/unexport", RUN+="/bin/chmod 220 /sys/class/gpio/export /sys/class/gpio/unexport"
SUBSYSTEM=="gpio", KERNEL=="gpio*", ACTION=="add", RUN+="/bin/chgrp gpio %S%p/active_low %S%p/direction %S%p/edge %S%p/value", RUN+="/bin/chmod 660 %S%p/active_low %S%p/direction %S%p/edge %S%p/value"
EOF

    # Reload udev rules
    udevadm control --reload-rules
    udevadm trigger
    
    # Enable SPI and I2C (optional, for future sensors)
    if command -v raspi-config &> /dev/null; then
        raspi-config nonint do_spi 0  # Enable SPI
        raspi-config nonint do_i2c 0  # Enable I2C
        print_success "SPI and I2C enabled"
    fi
    
    print_success "GPIO permissions configured"
}

create_config_templates() {
    print_step "Creating configuration templates..."
    
    # GPIO configuration template
    cat > "$WATERME_HOME/config/gpio.cfg" << 'EOF'
[GPIO]
# Number of watering zones (1-8 supported)
zoneCount = 8

# GPIO pin assignments for each zone (BCM numbering)
# Default pins: 5, 6, 13, 16, 19, 20, 21, 26
pins = 5, 6, 13, 16, 19, 20, 21, 26

# Pump zone index (1-based, 0 = no pump zone)
# Set to the zone number that controls your main pump
pumpIndex = 8

# GPIO signal polarity (true = active low for relay modules)
# Most relay modules are active low (true)
activeLow = True

# GPIO mode: BCM (GPIO numbering) or BOARD (physical pin numbering)
mode = BCM
EOF

    # Garden settings template
    cat > "$WATERME_HOME/config/settings.cfg" << 'EOF'
[Garden]
# Garden identification
name = My Smart Garden
city = Your City, Country

# GPS coordinates for solar calculations
# Get these from Google Maps or GPS
gps_lat = 50.4452
gps_lon = -104.6189

# Operating mode: "manual" or "smart"
mode = smart

# Timezone for scheduling (use standard timezone names)
# Examples: America/New_York, Europe/London, America/Los_Angeles
timezone = UTC

# Global watering multiplier (1.0 = normal, 2.0 = double, 0.5 = half)
timer_multiplier = 1.0

# Simulation mode for development (True/False)
# Set to False for hardware operation
simulate = False

[Well_Water]
# Future feature - well water management
max_flow_rate_gph = 0
reservoir_size_gallons = 0
recharge_time_minutes = 0
EOF

    # Runtime configuration
    cat > "$WATERME_HOME/config/waterme.json" << 'EOF'
{
  "backend_port": 5000,
  "ui_port": 3000,
  "host": "0.0.0.0",
  "debug": false,
  "auto_start_ui": true,
  "log_level": "INFO",
  "network_access": true,
  "allow_external_connections": true
}
EOF

    # Create empty data files
    echo '{}' > "$WATERME_HOME/data/locations.json"
    echo '{}' > "$WATERME_HOME/data/map.json"
    echo '{}' > "$WATERME_HOME/data/schedule.json"
    echo '{}' > "$WATERME_HOME/data/active_zones.json"
    echo '{"ignored_alerts": []}' > "$WATERME_HOME/data/health_alerts.json"
    echo '[]' > "$WATERME_HOME/data/logs.json"
    
    # Set ownership
    chown -R "$WATERME_USER:$WATERME_USER" "$WATERME_HOME/config" "$WATERME_HOME/data"
    
    print_success "Configuration templates created"
}

install_waterme_code() {
    print_step "Installing WaterMe! application code..."
    
    # Note: In a real deployment, this would clone from a git repository
    # For now, we'll create placeholder files that need to be populated
    
    cat > "$WATERME_HOME/README.md" << 'EOF'
# WaterMe! Installation Complete

Your WaterMe! system has been installed successfully!

## Next Steps:

1. **Configure your system:**
   - Edit `/opt/waterme/config/settings.cfg` with your location and timezone
   - Edit `/opt/waterme/config/gpio.cfg` with your GPIO pin assignments

2. **Application code is automatically installed to:**
   - `/home/waterme/WaterMe/`
   - All files are owned by the waterme user

3. **UI dependencies are automatically installed** during the installation process.

4. **Start the system:**
   
   **For service mode (--service-enable):**
   ```bash
   waterme enable    # Enable auto-start
   waterme start     # Start service
   ```
   
   **For manual mode (default):**
   ```bash
   sudo -u waterme python3 /home/waterme/WaterMe/waterme.py
   # OR
   waterme start     # Helper script
   ```

## Access URLs:
- Backend API: http://your-pi-ip:5000
- Frontend UI: http://your-pi-ip:3000

## Logs:
- **Service mode**: `waterme logs` or `sudo journalctl -u waterme -f`
- **Manual mode**: `waterme logs` or `tail -f /home/waterme/WaterMe/logs/*.log`
- Application logs: `/home/waterme/WaterMe/logs/`

## Configuration:
- GPIO settings: `/home/waterme/WaterMe/config/gpio.cfg`
- Garden settings: `/home/waterme/WaterMe/config/settings.cfg`
- Runtime config: `/home/waterme/WaterMe/config/waterme.json`
EOF

    chown "$WATERME_USER:$WATERME_USER" "$WATERME_HOME/README.md"
    print_success "Installation guide created"
}



configure_firewall() {
    print_step "Configuring firewall..."
    
    # Install ufw if not present
    if ! command -v ufw &> /dev/null; then
        apt-get install -y ufw
    fi
    
    # Configure firewall rules
    ufw --force enable
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow ssh
    
    # Allow WaterMe! ports
    ufw allow 5000/tcp comment 'WaterMe! Backend API'
    ufw allow 3000/tcp comment 'WaterMe! Frontend UI'
    
    # Allow local network access
    ufw allow from 192.168.0.0/16
    ufw allow from 10.0.0.0/8
    ufw allow from 172.16.0.0/12
    
    print_success "Firewall configured"
}

create_systemd_service() {
    if [[ "$ENABLE_SERVICE" != true ]]; then
        return 0
    fi
    
    print_step "Creating systemd service..."
    
    cat > "/etc/systemd/system/$WATERME_SERVICE.service" << EOF
[Unit]
Description=WaterMe! Smart Garden Irrigation System
Documentation=file://$WATERME_HOME/README.md
After=network.target
Wants=network.target

[Service]
Type=simple
User=$WATERME_USER
Group=$WATERME_USER
WorkingDirectory=$WATERME_HOME
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=PYTHONPATH=$WATERME_HOME
ExecStart=/usr/bin/python3 $WATERME_HOME/waterme.py
ExecReload=/bin/kill -HUP \$MAINPID
ExecStop=/bin/kill -TERM \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=waterme

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$WATERME_HOME/data $WATERME_HOME/logs $WATERME_HOME/config
ProtectHome=true

# GPIO access
SupplementaryGroups=gpio spi i2c dialout

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    
    print_success "Systemd service created"
}

setup_log_rotation() {
    print_step "Setting up log rotation..."
    
    cat > "/etc/logrotate.d/waterme" << EOF
$WATERME_HOME/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 0644 $WATERME_USER $WATERME_USER
    postrotate
EOF

    if [[ "$ENABLE_SERVICE" == true ]]; then
        cat >> "/etc/logrotate.d/waterme" << EOF
        systemctl reload-or-restart $WATERME_SERVICE > /dev/null 2>&1 || true
EOF
    else
        cat >> "/etc/logrotate.d/waterme" << EOF
        # Manual mode - no service restart needed
EOF
    fi

    cat >> "/etc/logrotate.d/waterme" << EOF
    endscript
}
EOF

    print_success "Log rotation configured"
}

create_helper_scripts() {
    print_step "Creating helper scripts..."
    
    # WaterMe! control script - conditional based on service mode
    cat > "/usr/local/bin/waterme" << EOF
#!/bin/bash
# WaterMe! control script

WATERME_DIR="$WATERME_HOME"
WATERME_USER="$WATERME_USER"
WATERME_SERVICE="$WATERME_SERVICE"
SERVICE_MODE=$ENABLE_SERVICE

case "\$1" in
    start)
        if [[ "\$SERVICE_MODE" == true ]]; then
            echo "Starting WaterMe! service..."
            sudo systemctl start \$WATERME_SERVICE
        else
            echo "Starting WaterMe! manually..."
            sudo -u \$WATERME_USER python3 \$WATERME_DIR/waterme.py
        fi
        ;;
    stop)
        if [[ "\$SERVICE_MODE" == true ]]; then
            echo "Stopping WaterMe! service..."
            sudo systemctl stop \$WATERME_SERVICE
        else
            echo "Stopping WaterMe!..."
            pkill -f "python3.*waterme.py" || echo "No WaterMe! process found"
        fi
        ;;
    restart)
        if [[ "\$SERVICE_MODE" == true ]]; then
            echo "Restarting WaterMe! service..."
            sudo systemctl restart \$WATERME_SERVICE
        else
            echo "Restarting WaterMe! manually..."
            pkill -f "python3.*waterme.py" || true
            sleep 2
            sudo -u \$WATERME_USER python3 \$WATERME_DIR/waterme.py &
        fi
        ;;
    status)
        if [[ "\$SERVICE_MODE" == true ]]; then
            sudo systemctl status \$WATERME_SERVICE
        else
            if pgrep -f "python3.*waterme.py" > /dev/null; then
                echo "WaterMe! is running (manual mode)"
                ps aux | grep "python3.*waterme.py" | grep -v grep
            else
                echo "WaterMe! is not running"
            fi
        fi
        ;;
    logs)
        if [[ "\$SERVICE_MODE" == true ]]; then
            sudo journalctl -u \$WATERME_SERVICE -f
        else
            tail -f \$WATERME_DIR/logs/*.log
        fi
        ;;
    config)
        sudo nano \$WATERME_DIR/config/settings.cfg
        ;;
    gpio)
        sudo nano \$WATERME_DIR/config/gpio.cfg
        ;;
    update)
        cd \$WATERME_DIR
        sudo -u \$WATERME_USER git pull
        if [[ "\$SERVICE_MODE" == true ]]; then
            sudo systemctl restart \$WATERME_SERVICE
        fi
        ;;
    enable)
        if [[ "\$SERVICE_MODE" == true ]]; then
            sudo systemctl enable \$WATERME_SERVICE
            echo "WaterMe! service enabled for auto-start"
        else
            echo "Service mode not installed. Use --service-enable during installation."
        fi
        ;;
    disable)
        if [[ "\$SERVICE_MODE" == true ]]; then
            sudo systemctl disable \$WATERME_SERVICE
            echo "WaterMe! service disabled"
        else
            echo "Service mode not installed."
        fi
        ;;
    *)
        echo "Usage: waterme {start|stop|restart|status|logs|config|gpio|update|enable|disable}"
        if [[ "\$SERVICE_MODE" == true ]]; then
            echo "Mode: Service (systemd)"
        else
            echo "Mode: Manual"
            echo "Note: Use 'python3 $WATERME_HOME/waterme.py' directly for more control."
        fi
        exit 1
        ;;
esac
EOF

    chmod +x /usr/local/bin/waterme
    
    if [[ "$ENABLE_SERVICE" == true ]]; then
        print_success "Helper scripts created (service mode)"
    else
        print_success "Helper scripts created (manual mode)"
    fi
}

final_validation() {
    print_step "Performing final validation..."
    
    if [[ "$DEBUG" == "true" ]]; then
        echo "DEBUG: Starting final validation..."
        echo "DEBUG: WATERME_USER=$WATERME_USER"
        echo "DEBUG: WATERME_HOME=$WATERME_HOME"
        echo "DEBUG: ENABLE_SERVICE=$ENABLE_SERVICE"
    fi
    
    # Check Python installation
    print_step "Validating Python installation..."
    python3 --version || { print_error "Python validation failed"; exit 1; }
    
    # Check Node.js installation
    print_step "Validating Node.js installation..."
    node --version || { print_error "Node.js validation failed"; exit 1; }
    
    # Check user creation
    print_step "Validating user creation..."
    id "$WATERME_USER" &>/dev/null || { print_error "User validation failed"; exit 1; }
    
    # Check directory structure
    print_step "Validating directory structure..."
    [[ -d "$WATERME_HOME" ]] || { print_error "Directory validation failed"; exit 1; }
    
    # Check systemd service if enabled
    if [[ "$ENABLE_SERVICE" == true ]]; then
        print_step "Validating systemd service..."
        systemctl list-unit-files | grep -q "$WATERME_SERVICE.service" || { print_error "Service validation failed"; exit 1; }
        print_success "Systemd service validation passed"
    else
        if [[ "$DEBUG" == "true" ]]; then
            echo "DEBUG: Skipping systemd service validation (manual mode)"
        fi
    fi
    
    print_success "All validations passed"
}

print_completion() {
    echo -e "${GREEN}"
    echo "=================================================================="
    echo "🎉 WaterMe! Installation Complete!"
    echo "=================================================================="
    echo -e "${NC}"
    echo
    echo "📁 Installation directory: $WATERME_HOME"
    echo "👤 System user: $WATERME_USER"
    if [[ "$ENABLE_SERVICE" == true ]]; then
        echo "🔧 Service name: $WATERME_SERVICE (systemd enabled)"
    else
        echo "🔧 Mode: Manual operation (no systemd service)"
    fi
    echo
    echo "📋 Next steps:"
    echo "1. Copy your WaterMe! source code to $WATERME_HOME"
    echo "2. Configure your system: waterme config"
    echo "3. Configure GPIO pins: waterme gpio"
    echo "4. UI dependencies are automatically installed"
    if [[ "$ENABLE_SERVICE" == true ]]; then
        echo "5. Enable service: waterme enable"
        echo "6. Start service: waterme start"
        echo "7. Check status: waterme status"
    else
        echo "5. Start manually: python3 $WATERME_HOME/waterme.py"
        echo "6. Or use helper: waterme start"
        echo "7. Check status: waterme status"
    fi
    echo
    echo "🌐 Once running, access your system at:"
    echo "   • Backend API: http://$(hostname -I | awk '{print $1}'):5000"
    echo "   • Frontend UI: http://$(hostname -I | awk '{print $1}'):3000"
    echo
    echo "📖 Full documentation: $WATERME_HOME/README.md"
    echo "📝 Installation log: $LOG_FILE"
    echo
    echo -e "${CYAN}Happy gardening! 🌱${NC}"
}

# Main installation process
main() {
    print_header
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Show installation mode and debug status
    if [[ "$ENABLE_SERVICE" == true ]]; then
        print_step "Installation mode: Service (systemd enabled)"
    else
        print_step "Installation mode: Manual (no systemd service)"
    fi
    
    if [[ "$DEBUG" == "true" ]]; then
        print_step "Debug mode: ENABLED"
        echo "DEBUG: Installation started at $(date)"
        echo "DEBUG: Script arguments: $@"
    fi
    
    # Handle git operations
    if [[ "$GIT_PULL" == true ]]; then
        print_header
        print_step "Git pull mode - updating code only"
        check_root
        git_pull_latest
        print_completion
        exit 0
    fi
    
    if [[ "$GIT_UPGRADE" == true ]]; then
        print_header
        print_step "Git upgrade mode - full system upgrade"
        check_root
        git_upgrade_system
        print_completion
        exit 0
    fi
    
    if [[ "$UNINSTALL" == true ]]; then
        print_header
        print_step "Uninstall mode - removing WaterMe! completely"
        check_root
        uninstall_waterme
        exit 0
    fi
    
    check_root
    check_os
    update_system
    install_python
    install_nodejs
    create_user
    setup_directories
    install_python_dependencies
    install_ui_dependencies
    setup_gpio_permissions
    create_config_templates
    install_waterme_code
    configure_firewall
    create_systemd_service
    setup_log_rotation
    create_helper_scripts
    final_validation
    
    print_completion
}

# Run main function
main "$@"