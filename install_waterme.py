#!/usr/bin/env python3
"""
WaterMe! Installer Script
Sets up the complete WaterMe! system with proper permissions and configuration

Usage:
    sudo python3 install_waterme.py                    # Interactive installation
    sudo python3 install_waterme.py --auto            # Automated installation
    sudo python3 install_waterme.py --firmware        # Firmware setup mode
"""

import os
import sys
import subprocess
import configparser
import json
import shutil
from pathlib import Path

class WaterMeInstaller:
    def __init__(self):
        self.project_root = os.path.dirname(os.path.abspath(__file__))
        self.is_root = os.geteuid() == 0
        self.auto_mode = '--auto' in sys.argv
        self.firmware_mode = '--firmware' in sys.argv
        
        if not self.is_root:
            print("❌ This installer must be run as root (use sudo)")
            sys.exit(1)
    
    def run(self):
        """Main installation process"""
        print("🌱 WaterMe! System Installer")
        print("=" * 40)
        
        if self.firmware_mode:
            print("🔧 Firmware Setup Mode")
        elif self.auto_mode:
            print("🤖 Automated Installation Mode")
        else:
            print("👤 Interactive Installation Mode")
        
        print()
        
        # System checks
        self.check_system_requirements()
        
        # Install dependencies
        self.install_dependencies()
        
        # Configure system
        self.configure_system()
        
        # Set up permissions
        self.setup_permissions()
        
        # Configure services
        self.configure_services()
        
        # Final setup
        self.final_setup()
        
        print("\n🎉 WaterMe! installation completed successfully!")
        print("\nNext steps:")
        print("1. Configure your garden settings in the web interface")
        print("2. Set up your GPIO configuration")
        print("3. Start the system: python3 waterme.py")
    
    def check_system_requirements(self):
        """Check if system meets requirements"""
        print("🔍 Checking system requirements...")
        
        # Check Python version
        if sys.version_info < (3, 7):
            print("❌ Python 3.7+ required")
            sys.exit(1)
        print("   ✅ Python version: " + sys.version.split()[0])
        
        # Check if we're on a Raspberry Pi
        try:
            with open('/proc/cpuinfo', 'r') as f:
                if 'Raspberry Pi' in f.read():
                    print("   ✅ Raspberry Pi detected")
                else:
                    print("   ⚠️  Not running on Raspberry Pi (GPIO features may not work)")
        except:
            print("   ⚠️  Could not detect hardware platform")
        
        # Check available disk space
        statvfs = os.statvfs(self.project_root)
        free_space_gb = (statvfs.f_frsize * statvfs.f_bavail) / (1024**3)
        if free_space_gb < 1:
            print("❌ Less than 1GB free space available")
            sys.exit(1)
        print(f"   ✅ Free space: {free_space_gb:.1f}GB")
        
        print("   ✅ System requirements met")
    
    def install_dependencies(self):
        """Install required system packages"""
        print("\n📦 Installing system dependencies...")
        
        packages = [
            'python3-pip',
            'python3-venv',
            'git',
            'curl',
            'wget'
        ]
        
        for package in packages:
            print(f"   Installing {package}...")
            try:
                subprocess.run(['apt-get', 'update'], check=True)
                subprocess.run(['apt-get', 'install', '-y', package], check=True)
                print(f"   ✅ {package} installed")
            except subprocess.CalledProcessError as e:
                print(f"   ❌ Failed to install {package}: {e}")
                if not self.auto_mode:
                    if input("Continue anyway? (y/N): ").lower() != 'y':
                        sys.exit(1)
    
    def configure_system(self):
        """Configure system settings"""
        print("\n⚙️  Configuring system settings...")
        
        # Enable SPI and I2C for GPIO
        print("   Configuring GPIO interfaces...")
        try:
            # Enable SPI
            subprocess.run(['raspi-config', 'nonint', 'do_spi', '0'], check=True)
            # Enable I2C
            subprocess.run(['raspi-config', 'nonint', 'do_i2c', '0'], check=True)
            print("   ✅ GPIO interfaces enabled")
        except subprocess.CalledProcessError:
            print("   ⚠️  Could not configure GPIO interfaces (raspi-config not available)")
        
        # Set up timezone and NTP
        print("   Configuring time settings...")
        try:
            # Enable NTP
            subprocess.run(['timedatectl', 'set-ntp', 'true'], check=True)
            print("   ✅ NTP enabled")
        except subprocess.CalledProcessError:
            print("   ⚠️  Could not enable NTP")
    
    def setup_permissions(self):
        """Set up proper file permissions"""
        print("\n🔐 Setting up permissions...")
        
        # Create waterme user if it doesn't exist
        try:
            subprocess.run(['useradd', '-r', '-s', '/bin/false', 'waterme'], check=False)
            print("   ✅ WaterMe user created")
        except:
            print("   ℹ️  WaterMe user already exists")
        
        # Set ownership of project files
        try:
            subprocess.run(['chown', '-R', 'waterme:waterme', self.project_root], check=True)
            print("   ✅ File ownership set")
        except subprocess.CalledProcessError:
            print("   ⚠️  Could not set file ownership")
        
        # Set up sudo permissions for timedatectl
        sudoers_entry = "waterme ALL=(ALL) NOPASSWD: /usr/bin/timedatectl\n"
        try:
            with open('/etc/sudoers.d/waterme', 'w') as f:
                f.write(sudoers_entry)
            subprocess.run(['chmod', '440', '/etc/sudoers.d/waterme'], check=True)
            print("   ✅ Sudo permissions configured")
        except Exception as e:
            print(f"   ⚠️  Could not set up sudo permissions: {e}")
    
    def configure_services(self):
        """Configure system services"""
        print("\n🔧 Configuring services...")
        
        # Create systemd service file
        service_content = f"""[Unit]
Description=WaterMe! Smart Garden System
After=network.target

[Service]
Type=simple
User=waterme
WorkingDirectory={self.project_root}
ExecStart=/usr/bin/python3 {self.project_root}/waterme.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
"""
        
        try:
            with open('/etc/systemd/system/waterme.service', 'w') as f:
                f.write(service_content)
            
            subprocess.run(['systemctl', 'daemon-reload'], check=True)
            subprocess.run(['systemctl', 'enable', 'waterme.service'], check=True)
            print("   ✅ Systemd service configured")
        except Exception as e:
            print(f"   ⚠️  Could not configure systemd service: {e}")
    
    def final_setup(self):
        """Final setup steps"""
        print("\n🎯 Final setup...")
        
        # Create virtual environment
        venv_path = os.path.join(self.project_root, 'venv')
        if not os.path.exists(venv_path):
            print("   Creating Python virtual environment...")
            try:
                subprocess.run([sys.executable, '-m', 'venv', venv_path], check=True)
                print("   ✅ Virtual environment created")
            except subprocess.CalledProcessError:
                print("   ❌ Failed to create virtual environment")
        
        # Install Python dependencies
        print("   Installing Python dependencies...")
        try:
            pip_path = os.path.join(venv_path, 'bin', 'pip')
            requirements_path = os.path.join(self.project_root, 'requirements.txt')
            subprocess.run([pip_path, 'install', '-r', requirements_path], check=True)
            print("   ✅ Python dependencies installed")
        except subprocess.CalledProcessError:
            print("   ❌ Failed to install Python dependencies")
        
        # Create default configuration if it doesn't exist
        self.create_default_config()
        
        print("   ✅ Final setup completed")
    
    def create_default_config(self):
        """Create default configuration files"""
        config_dir = os.path.join(self.project_root, 'config')
        os.makedirs(config_dir, exist_ok=True)
        
        # Default settings.cfg
        settings_file = os.path.join(config_dir, 'settings.cfg')
        if not os.path.exists(settings_file):
            config = configparser.ConfigParser()
            config['Garden'] = {
                'garden_name': 'My Garden',
                'gps_lat': '0.0',
                'gps_lon': '0.0',
                'city': '',
                'timezone': 'UTC',
                'timer_multiplier': '1.0',
                'mode': 'manual'
            }
            
            with open(settings_file, 'w') as f:
                config.write(f)
            print("   ✅ Default settings created")
        
        # Default gpio.cfg
        gpio_file = os.path.join(config_dir, 'gpio.cfg')
        if not os.path.exists(gpio_file):
            config = configparser.ConfigParser()
            config['GPIO'] = {
                'mode': 'BCM',
                'zoneCount': '8',
                'pins': '5,6,13,16,19,20,21,26',
                'pumpIndex': '0',
                'activeLow': 'True'
            }
            
            with open(gpio_file, 'w') as f:
                config.write(f)
            print("   ✅ Default GPIO config created")

def main():
    """Main entry point"""
    if len(sys.argv) > 1 and sys.argv[1] in ['--help', '-h']:
        print(__doc__)
        sys.exit(0)
    
    installer = WaterMeInstaller()
    installer.run()

if __name__ == '__main__':
    main() 