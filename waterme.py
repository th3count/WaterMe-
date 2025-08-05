#!/usr/bin/env python3
"""
🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
📖 Primary Reference: /rules/system-overview.md
🏗️ Architecture: /rules/project-structure.md
🌐 API Patterns: /rules/api-patterns.md
💻 Coding Standards: /rules/coding-standards.md

WaterMe! - Smart Garden Irrigation System
==========================================
Main System Entry Point & Process Manager

This is the primary entry point for the WaterMe! system. It handles:
- System initialization and health checks
- Process lifecycle management (API server, UI, scheduler)
- GPIO cleanup and hardware safety
- Network configuration and monitoring
- Unified logging integration

The system follows the startup process:
1. waterme.py (System Entry Point)
   ↓ configuration loading
2. Flask API Server Launch (api.py)
   ↓ scheduler initialization  
3. WateringScheduler Start (scheduler.py)
   ↓ GPIO setup
4. Hardware Initialization (gpio.py)
   ↓ UI serving
5. React UI Available (ui/src/App.tsx)

Usage:
    python waterme.py                    # Start the system
    python waterme.py --status          # Check system status
    python waterme.py --stop            # Stop the system
    python waterme.py --restart         # Restart the system
    python waterme.py --logs            # View recent logs
    python waterme.py --config          # Show configuration
    python waterme.py --network         # Show network information
    python waterme.py --help            # Show this help
"""

# Standard library imports
import os
import sys
import time
import json
import signal
import argparse
import subprocess
import threading
import configparser
import socket
from datetime import datetime
from pathlib import Path

# External library imports
import pytz

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(__file__))

# Internal imports (after path setup)
from core.logging import setup_logger, log_event

# Note: All dependencies are handled by install.sh script
# No automatic dependency installation in waterme.py

class WaterMeSystem:
    """
    Main WaterMe! system controller and process manager.
    
    Handles system initialization, process lifecycle management,
    GPIO cleanup, and unified logging integration.
    """
    
    def __init__(self):
        """Initialize the WaterMe! system with proper error handling and logging."""
        # Directory structure
        self.project_root = os.path.dirname(__file__)
        self.backend_dir = self.project_root
        self.ui_dir = os.path.join(self.project_root, 'ui')
        self.data_dir = os.path.join(self.project_root, 'data')
        self.config_dir = os.path.join(self.project_root, 'config')
        self.logs_dir = os.path.join(self.project_root, 'logs')
        
        # Ensure critical directories exist
        self._ensure_directories()
        
        # Setup logging first for error tracking
        self._setup_logging()
        
        # Process management
        self.backend_process = None
        self.ui_process = None
        self.scheduler = None
        
        # System status
        self.is_running = False
        self.start_time = None
        
        # Load configuration with error handling
        try:
            self.config = self.load_config()
            self._load_timezone_and_set_start_time()
            log_event(self.system_logger, 'INFO', 'WaterMeSystem initialized successfully')
        except Exception as e:
            print(f"❌ Failed to initialize WaterMeSystem: {e}")
            if hasattr(self, 'system_logger'):
                log_event(self.system_logger, 'ERROR', 'WaterMeSystem initialization failed', error=str(e))
            raise
    
    def _ensure_directories(self):
        """Ensure all required directories exist."""
        required_dirs = [self.data_dir, self.config_dir, self.logs_dir]
        for dir_path in required_dirs:
            try:
                os.makedirs(dir_path, exist_ok=True)
            except Exception as e:
                print(f"❌ Failed to create directory {dir_path}: {e}")
                raise
    
    def _setup_logging(self):
        """Initialize unified logging system."""
        try:
            self.system_logger = setup_logger('waterme_system', 'system.log')
            self.error_logger = setup_logger('waterme_error', 'error.log')
        except Exception as e:
            print(f"Warning: Could not setup logging: {e}")
            # Create minimal fallback loggers
            self.system_logger = None
            self.error_logger = None
    
    def _load_timezone_and_set_start_time(self):
        """Load timezone from settings and set initial start time."""
        try:
            settings_file = os.path.join(self.config_dir, 'settings.cfg')
            config_parser = configparser.ConfigParser()
            config_parser.read(settings_file)
            
            tz_name = 'UTC'  # Default fallback
            if 'Garden' in config_parser:
                tz_name = config_parser['Garden'].get('timezone', 'UTC')
            
            tz = pytz.timezone(tz_name)
            self.start_time = datetime.now(tz)
            
            if self.system_logger:
                log_event(self.system_logger, 'INFO', f'Timezone set to {tz_name}')
                
        except Exception as e:
            # Fallback to UTC if timezone loading fails
            self.start_time = datetime.now(pytz.UTC)
            if self.error_logger:
                log_event(self.error_logger, 'WARN', 'Failed to load timezone, using UTC', error=str(e))
    
    def load_config(self):
        """Load system configuration with proper error handling."""
        # Default configuration
        config = {
            'backend_port': 5000,
            'ui_port': 3000,
            'host': '0.0.0.0',
            'debug': False,
            'auto_start_ui': True,
            'log_level': 'INFO',
            'network_access': True,
            'allow_external_connections': True
        }
        
        # Load from config file if it exists
        config_file = os.path.join(self.config_dir, 'waterme.json')
        if os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    loaded_config = json.load(f)
                    config.update(loaded_config)
                    if self.system_logger:
                        log_event(self.system_logger, 'INFO', f'Configuration loaded from {config_file}')
            except Exception as e:
                error_msg = f"Could not load config file {config_file}: {e}"
                print(f"Warning: {error_msg}")
                if self.error_logger:
                    log_event(self.error_logger, 'WARN', error_msg)
        else:
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Using default configuration (no config file found)')
        
        return config
    
    def save_config(self):
        """Save system configuration"""
        config_file = os.path.join(self.config_dir, 'waterme.json')
        try:
            os.makedirs(self.config_dir, exist_ok=True)
            with open(config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            print(f"Warning: Could not save config file: {e}")
    
    def sync_system_time(self):
        """Check system time and provide helpful information"""
        try:
            settings_file = os.path.join(self.config_dir, 'settings.cfg')
            if not os.path.exists(settings_file):
                return True  # Silent skip if no config
            
            # Read timezone from settings
            config = configparser.ConfigParser()
            config.read(settings_file)
            
            if 'Garden' not in config:
                return True  # Silent skip if no garden section
            
            timezone = config['Garden'].get('timezone', 'UTC')
            
            # Check current system timezone (silent check)
            try:
                current_tz = subprocess.check_output(['timedatectl', 'show', '--property=Timezone', '--value'], 
                                                   text=True, stderr=subprocess.DEVNULL).strip()
                
                if current_tz != timezone:
                    print(f"🕐 Timezone mismatch: Settings={timezone}, System={current_tz}")
                    print(f"   Run: sudo timedatectl set-timezone {timezone}")
                # No else - silent success
                    
            except subprocess.CalledProcessError:
                pass  # Silent skip if timedatectl not available
            
            # Check NTP status (silent check)
            try:
                ntp_status = subprocess.check_output(['timedatectl', 'status'], text=True)
                if 'System clock synchronized: no' in ntp_status:
                    print("🕐 NTP sync not active - run: sudo timedatectl set-ntp true")
                # No else - silent success
                    
            except subprocess.CalledProcessError:
                pass  # Silent skip if timedatectl not available
            
            return True
            
        except Exception as e:
            # Silent fail - don't interrupt startup
            return True
    
    def check_system_health(self):
        """Check system health and dependencies"""
        print("🔍 Checking system health...")
        
        issues = []
        
        # Check Python version
        if sys.version_info < (3, 7):
            issues.append("Python 3.7+ required")
        
        # Check required directories
        required_dirs = [self.backend_dir, self.data_dir, self.config_dir, self.logs_dir]
        for dir_path in required_dirs:
            if not os.path.exists(dir_path):
                issues.append(f"Missing directory: {dir_path}")
        
        # Check required files
        required_files = [
            os.path.join(self.backend_dir, 'api.py'),
            os.path.join(self.backend_dir, 'core', 'scheduler.py')
        ]
        for file_path in required_files:
            if not os.path.exists(file_path):
                issues.append(f"Missing file: {file_path}")
        
        # Check ports
        if self.is_port_in_use(self.config['backend_port']):
            issues.append(f"Backend port {self.config['backend_port']} is already in use")
        
        if self.config['auto_start_ui'] and self.is_port_in_use(self.config['ui_port']):
            issues.append(f"UI port {self.config['ui_port']} is already in use")
        
        if issues:
            print("❌ System health check failed:")
            for issue in issues:
                print(f"   - {issue}")
            return False
        else:
            print("✅ System health check passed")
            return True
    
    def is_port_in_use(self, port):
        """Check if a port is in use with proper error handling."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                result = s.connect_ex(('localhost', port)) == 0
                return result
        except Exception as e:
            if self.error_logger:
                log_event(self.error_logger, 'WARN', f'Could not check port {port}', error=str(e))
            return False  # Assume port is available if we can't check
    
    def get_network_urls(self):
        """Get network URLs for the system with proper error handling."""
        urls = {
            'backend': [],
            'frontend': []
        }
        
        try:
            # Get localhost URLs
            urls['backend'].append(f"http://localhost:{self.config['backend_port']}")
            urls['frontend'].append(f"http://localhost:{self.config['ui_port']}")
            
            # Get actual LAN IP addresses
            lan_ips = self._get_lan_ips()
            
            # Add LAN URLs
            for ip in lan_ips:
                urls['backend'].append(f"http://{ip}:{self.config['backend_port']}")
                urls['frontend'].append(f"http://{ip}:{self.config['ui_port']}")
                
        except Exception as e:
            warning_msg = f"Could not get network URLs: {e}"
            print(f"Warning: {warning_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'WARN', warning_msg)
            
            # Fallback to localhost only
            urls['backend'] = [f"http://localhost:{self.config['backend_port']}"]
            urls['frontend'] = [f"http://localhost:{self.config['ui_port']}"]
        
        return urls
    
    def _get_lan_ips(self):
        """Get actual LAN IP addresses with improved error handling."""
        lan_ips = []
        
        try:
            # Method 1: Get all network interfaces
            for interface_name, interface_addresses in socket.getaddrinfo(socket.gethostname(), None):
                if interface_name[0] == socket.AF_INET:  # IPv4 only
                    ip = interface_addresses[4][0]
                    # Filter out loopback and link-local addresses
                    if (ip != '127.0.0.1' and 
                        ip != '127.0.1.1' and 
                        not ip.startswith('169.254.') and
                        not ip.startswith('::')):
                        lan_ips.append(ip)
        except Exception as e:
            if self.error_logger:
                log_event(self.error_logger, 'WARN', 'Could not get network interfaces', error=str(e))
        
        # Method 2: If no LAN IPs found, try alternative method
        if not lan_ips:
            try:
                # Try to connect to a remote address to determine our IP
                with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                    s.connect(("8.8.8.8", 80))
                    local_ip = s.getsockname()[0]
                    if local_ip not in ['127.0.0.1', '127.0.1.1']:
                        lan_ips.append(local_ip)
            except Exception as e:
                if self.error_logger:
                    log_event(self.error_logger, 'WARN', 'Could not determine local IP', error=str(e))
        
        return lan_ips
    
    def get_network_info(self):
        """Get detailed network information with proper error handling."""
        info = {
            'hostname': 'Unknown',
            'local_ip': 'Unknown',
            'network_interfaces': []
        }
        
        try:
            hostname = socket.gethostname()
            info['hostname'] = hostname
            
            # Get actual LAN IPs
            lan_ips = self._get_lan_ips()
            if lan_ips:
                info['local_ip'] = lan_ips[0]  # Use first LAN IP
                info['network_interfaces'] = lan_ips
            else:
                # Fallback to hostname resolution
                try:
                    local_ip = socket.gethostbyname(hostname)
                    info['local_ip'] = local_ip
                except Exception as e:
                    if self.error_logger:
                        log_event(self.error_logger, 'WARN', 'Could not resolve hostname to IP', error=str(e))
                
        except Exception as e:
            warning_msg = f"Could not get network info: {e}"
            print(f"Warning: {warning_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'WARN', warning_msg)
        
        return info
    
    def start_backend(self):
        """Start the backend API server with proper error handling and logging."""
        print("🚀 Starting backend server...")
        if self.system_logger:
            log_event(self.system_logger, 'INFO', 'Starting backend API server')
        
        try:
            # Verify api.py exists
            api_file = os.path.join(self.backend_dir, 'api.py')
            if not os.path.exists(api_file):
                raise FileNotFoundError(f"API file not found: {api_file}")
            
            # Change to backend directory
            original_cwd = os.getcwd()
            os.chdir(self.backend_dir)
            
            # Set environment variables for network access
            env = os.environ.copy()
            env['FLASK_HOST'] = '0.0.0.0'  # Ensure network access
            env['FLASK_PORT'] = str(self.config['backend_port'])
            
            # Start the backend process
            self.backend_process = subprocess.Popen([
                sys.executable, 'api.py'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            
            # Wait for startup with timeout
            startup_timeout = 10  # seconds
            for i in range(startup_timeout):
                if self.backend_process.poll() is not None:
                    # Process terminated early
                    break
                if self.is_port_in_use(self.config['backend_port']):
                    # Port is active, backend likely started
                    break
                time.sleep(1)
            
            # Restore original working directory
            os.chdir(original_cwd)
            
            # Check if process is still running and port is active
            if self.backend_process.poll() is None and self.is_port_in_use(self.config['backend_port']):
                success_msg = f"Backend server started on port {self.config['backend_port']}"
                print(f"✅ {success_msg}")
                if self.system_logger:
                    log_event(self.system_logger, 'INFO', success_msg)
                return True
            else:
                # Process failed or port not active
                stdout, stderr = "", ""
                if self.backend_process.poll() is not None:
                    try:
                        stdout, stderr = self.backend_process.communicate(timeout=5)
                        stdout = stdout.decode()
                        stderr = stderr.decode()
                    except subprocess.TimeoutExpired:
                        stdout, stderr = "<timeout>", "<timeout>"
                
                error_msg = "Backend server failed to start"
                print(f"❌ {error_msg}:")
                if stdout:
                    print(f"   STDOUT: {stdout}")
                if stderr:
                    print(f"   STDERR: {stderr}")
                
                if self.error_logger:
                    log_event(self.error_logger, 'ERROR', error_msg, stdout=stdout, stderr=stderr)
                
                return False
                
        except Exception as e:
            error_msg = f"Failed to start backend: {e}"
            print(f"❌ {error_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'ERROR', error_msg)
            return False
    
    def start_ui(self):
        """Start the frontend UI with proper error handling and logging."""
        if not self.config['auto_start_ui']:
            print("ℹ️  UI auto-start disabled")
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'UI auto-start disabled')
            return True
        
        print("🎨 Starting frontend UI...")
        if self.system_logger:
            log_event(self.system_logger, 'INFO', 'Starting frontend UI')
        
        try:
            # Verify UI directory exists
            if not os.path.exists(self.ui_dir):
                raise FileNotFoundError(f"UI directory not found: {self.ui_dir}")
            
            # Change to UI directory
            original_cwd = os.getcwd()
            os.chdir(self.ui_dir)
            
            # Check if package.json exists
            if not os.path.exists('package.json'):
                raise FileNotFoundError("package.json not found in UI directory")
            
            # Check if node_modules exists and install if needed
            if not os.path.exists('node_modules'):
                print("📦 Installing UI dependencies...")
                if self.system_logger:
                    log_event(self.system_logger, 'INFO', 'Installing UI dependencies')
                
                result = subprocess.run(['npm', 'install'], 
                                      capture_output=True, text=True, timeout=300)
                if result.returncode != 0:
                    raise subprocess.CalledProcessError(result.returncode, 'npm install', 
                                                      result.stdout, result.stderr)
                print("✅ UI dependencies installed")
            
            # Start the UI development server with network access
            env = os.environ.copy()
            env['VITE_HOST'] = '0.0.0.0'  # Ensure network access
            env['VITE_PORT'] = str(self.config['ui_port'])
            
            self.ui_process = subprocess.Popen([
                'npm', 'run', 'dev'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            
            # Wait for startup with timeout
            startup_timeout = 15  # seconds (UI takes longer to start)
            for i in range(startup_timeout):
                if self.ui_process.poll() is not None:
                    # Process terminated early
                    break
                if self.is_port_in_use(self.config['ui_port']):
                    # Port is active, UI likely started
                    break
                time.sleep(1)
            
            # Restore original working directory
            os.chdir(original_cwd)
            
            # Check if process is still running
            if self.ui_process.poll() is None:
                success_msg = f"Frontend UI started on port {self.config['ui_port']}"
                print(f"✅ {success_msg}")
                if self.system_logger:
                    log_event(self.system_logger, 'INFO', success_msg)
                return True
            else:
                # Process failed
                stdout, stderr = "", ""
                try:
                    stdout, stderr = self.ui_process.communicate(timeout=5)
                    stdout = stdout.decode()
                    stderr = stderr.decode()
                except subprocess.TimeoutExpired:
                    stdout, stderr = "<timeout>", "<timeout>"
                
                error_msg = "Frontend UI failed to start"
                print(f"❌ {error_msg}:")
                if stdout:
                    print(f"   STDOUT: {stdout}")
                if stderr:
                    print(f"   STDERR: {stderr}")
                
                if self.error_logger:
                    log_event(self.error_logger, 'ERROR', error_msg, stdout=stdout, stderr=stderr)
                
                return False
                
        except Exception as e:
            error_msg = f"Failed to start UI: {e}"
            print(f"❌ {error_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'ERROR', error_msg)
            return False
    
    def stop_backend(self):
        """Stop the backend server with proper cleanup and logging."""
        if self.backend_process:
            print("🛑 Stopping backend server...")
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Stopping backend server')
            
            try:
                # Graceful termination first
                self.backend_process.terminate()
                self.backend_process.wait(timeout=10)
                print("✅ Backend server stopped gracefully")
                if self.system_logger:
                    log_event(self.system_logger, 'INFO', 'Backend server stopped gracefully')
            except subprocess.TimeoutExpired:
                # Force kill if graceful termination fails
                self.backend_process.kill()
                print("⚠️  Backend server force killed")
                if self.system_logger:
                    log_event(self.system_logger, 'WARN', 'Backend server force killed after timeout')
            except Exception as e:
                error_msg = f"Error stopping backend server: {e}"
                print(f"❌ {error_msg}")
                if self.error_logger:
                    log_event(self.error_logger, 'ERROR', error_msg)
            finally:
                self.backend_process = None
    
    def stop_ui(self):
        """Stop the frontend UI with proper cleanup and logging."""
        if self.ui_process:
            print("🛑 Stopping frontend UI...")
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Stopping frontend UI')
            
            try:
                # Graceful termination first
                self.ui_process.terminate()
                self.ui_process.wait(timeout=10)
                print("✅ Frontend UI stopped gracefully")
                if self.system_logger:
                    log_event(self.system_logger, 'INFO', 'Frontend UI stopped gracefully')
            except subprocess.TimeoutExpired:
                # Force kill if graceful termination fails
                self.ui_process.kill()
                print("⚠️  Frontend UI force killed")
                if self.system_logger:
                    log_event(self.system_logger, 'WARN', 'Frontend UI force killed after timeout')
            except Exception as e:
                error_msg = f"Error stopping frontend UI: {e}"
                print(f"❌ {error_msg}")
                if self.error_logger:
                    log_event(self.error_logger, 'ERROR', error_msg)
            finally:
                self.ui_process = None
    
    def start(self):
        """Start the complete WaterMe! system"""
        if self.is_running:
            print("⚠️  System is already running")
            return False
        
        print("🌱 Starting WaterMe! Smart Garden System...")
        print("=" * 50)
        
        # Time sync handled by future installer
        
        # Health check
        if not self.check_system_health():
            return False
        
        # Start backend
        if not self.start_backend():
            return False
        
        # Start UI
        if not self.start_ui():
            print("⚠️  UI failed to start, but backend is running")
        
        self.is_running = True
        # tz_name = self.config.get('timezone', 'UTC')  # Assuming config has timezone, or load from settings.cfg
        # tz = pytz.timezone(tz_name)
        # self.start_time = datetime.now(tz)
        
        print("=" * 50)
        print("🎉 WaterMe! system started successfully!")
        
        # Get network information
        network_info = self.get_network_info()
        network_urls = self.get_network_urls()
        
        print(f"🖥️  System: {network_info['hostname']} ({network_info['local_ip']})")
        
        print(f"📊 Backend API:")
        for url in network_urls['backend']:
            print(f"   {url}")
            
        if self.config['auto_start_ui']:
            print(f"🌐 Frontend UI:")
            for url in network_urls['frontend']:
                print(f"   {url}")
        
        print(f"⏰ Started at: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 50)
        
        return True
    
    def stop(self):
        """Stop the complete WaterMe! system"""
        if not self.is_running:
            print("⚠️  System is not running")
            return False
        
        print("🛑 Stopping WaterMe! system...")
        
        # Clean up GPIO and turn off all relays
        self.cleanup_gpio()
        
        self.stop_ui()
        self.stop_backend()
        
        self.is_running = False
        print("✅ WaterMe! system stopped")
        
        return True
    
    def cleanup_gpio(self):
        """Turn off all relays and clean up GPIO through scheduler with proper error handling."""
        try:
            print("🔌 Turning off all relays through scheduler...")
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Starting GPIO cleanup through scheduler')
            
            # Primary method: Use scheduler for proper GPIO control
            from core.scheduler import scheduler
            scheduler.shutdown()
            
            print("✅ Scheduler shutdown complete - active zones saved for restoration")
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Scheduler shutdown completed successfully')
            
        except ImportError as e:
            # Scheduler not available - use fallback GPIO control
            warning_msg = "Scheduler module not available, using fallback GPIO control"
            print(f"   {warning_msg}")
            if self.system_logger:
                log_event(self.system_logger, 'WARN', warning_msg, error=str(e))
            
            self._fallback_gpio_cleanup()
            
        except Exception as e:
            error_msg = f"Error during scheduler cleanup: {e}"
            print(f"⚠️  {error_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'ERROR', error_msg)
            
            # Attempt fallback cleanup
            self._fallback_gpio_cleanup()
    
    def _fallback_gpio_cleanup(self):
        """Fallback GPIO cleanup when scheduler is unavailable."""
        try:
            from core.gpio import deactivate_zone, cleanup_gpio, ZONE_PINS
            
            # Deactivate all zones
            for zone_id in ZONE_PINS.keys():
                try:
                    deactivate_zone(zone_id)
                except Exception as e:
                    warning_msg = f"Could not deactivate zone {zone_id}: {e}"
                    print(f"   Warning: {warning_msg}")
                    if self.error_logger:
                        log_event(self.error_logger, 'WARN', warning_msg)
            
            # Final GPIO cleanup
            cleanup_gpio()
            print("✅ Fallback GPIO cleanup completed")
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Fallback GPIO cleanup completed')
                
        except Exception as e:
            error_msg = f"Error during fallback GPIO cleanup: {e}"
            print(f"⚠️  {error_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'ERROR', error_msg)
    
    def restart(self):
        """Restart the complete system"""
        print("🔄 Restarting WaterMe! system...")
        self.stop()
        time.sleep(2)
        return self.start()
    
    def status(self):
        """Show system status"""
        print("📊 WaterMe! System Status")
        print("=" * 30)
        
        # System status
        print(f"Status: {'🟢 Running' if self.is_running else '🔴 Stopped'}")
        if self.start_time:
            current_time = datetime.now(self.start_time.tzinfo)
            uptime = current_time - self.start_time
            print(f"Started: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"Uptime: {str(uptime).split('.')[0]}")
        
        # Process status
        if self.backend_process:
            backend_status = "🟢 Running" if self.backend_process.poll() is None else "🔴 Stopped"
            print(f"Backend: {backend_status}")
        
        if self.ui_process:
            ui_status = "🟢 Running" if self.ui_process.poll() is None else "🔴 Stopped"
            print(f"Frontend: {ui_status}")
        
        # Port status
        print(f"Backend Port: {'🟢 Open' if self.is_port_in_use(self.config['backend_port']) else '🔴 Closed'}")
        if self.config['auto_start_ui']:
            print(f"UI Port: {'🟢 Open' if self.is_port_in_use(self.config['ui_port']) else '🔴 Closed'}")
        
        # Network URLs
        if self.is_running:
            network_urls = self.get_network_urls()
            print(f"\n🌐 Network Access:")
            print(f"   Backend: {network_urls['backend'][1] if len(network_urls['backend']) > 1 else network_urls['backend'][0]}")
            if self.config['auto_start_ui']:
                print(f"   Frontend: {network_urls['frontend'][1] if len(network_urls['frontend']) > 1 else network_urls['frontend'][0]}")
        
        # Configuration
        print(f"\n⚙️  Configuration:")
        print(f"Debug Mode: {'🟢 On' if self.config['debug'] else '🔴 Off'}")
        print(f"Auto Start UI: {'🟢 On' if self.config['auto_start_ui'] else '🔴 Off'}")
    
    def logs(self, lines=20):
        """Show recent logs"""
        print(f"📋 Recent System Logs (last {lines} lines)")
        print("=" * 40)
        
        log_files = [
            os.path.join(self.logs_dir, 'system.log'),
            os.path.join(self.logs_dir, 'watering.log'),
            os.path.join(self.logs_dir, 'user.log'),
            os.path.join(self.logs_dir, 'error.log')
        ]
        
        for log_file in log_files:
            if os.path.exists(log_file):
                print(f"\n📄 {os.path.basename(log_file)}:")
                try:
                    with open(log_file, 'r') as f:
                        lines_content = f.readlines()
                        for line in lines_content[-lines:]:
                            print(line.rstrip())
                except Exception as e:
                    print(f"Error reading {log_file}: {e}")
    
    def config_show(self):
        """Show current configuration"""
        print("⚙️  WaterMe! Configuration")
        print("=" * 30)
        
        for key, value in self.config.items():
            print(f"{key}: {value}")
    
    def network_info(self):
        """Show network information"""
        print("🌐 WaterMe! Network Information")
        print("=" * 35)
        
        network_info = self.get_network_info()
        network_urls = self.get_network_urls()
        
        print(f"🖥️  Hostname: {network_info['hostname']}")
        print(f"📍 Local IP: {network_info['local_ip']}")
        
        if network_info['network_interfaces']:
            print(f"🌍 Additional IPs: {', '.join(network_info['network_interfaces'])}")
        
        print(f"\n📊 Backend API URLs:")
        for url in network_urls['backend']:
            print(f"   {url}")
        
        print(f"\n🌐 Frontend UI URLs:")
        for url in network_urls['frontend']:
            print(f"   {url}")
        
        print(f"\n💡 Access from other devices on your network using the IP addresses above!")
    
    def signal_handler(self, signum, frame):
        """Handle shutdown signals with proper cleanup and logging."""
        signal_name = 'SIGTERM' if signum == signal.SIGTERM else 'SIGINT' if signum == signal.SIGINT else f'Signal {signum}'
        print(f"\n🛑 Received {signal_name}, shutting down gracefully...")
        
        if self.system_logger:
            log_event(self.system_logger, 'INFO', f'Received {signal_name}, initiating graceful shutdown')
        
        try:
            # Ensure GPIO cleanup happens first for hardware safety
            self.cleanup_gpio()
            
            # Stop all processes
            self.stop()
            
            if self.system_logger:
                log_event(self.system_logger, 'INFO', 'Graceful shutdown completed')
            
            print("✅ Graceful shutdown completed")
            
        except Exception as e:
            error_msg = f"Error during graceful shutdown: {e}"
            print(f"❌ {error_msg}")
            if self.error_logger:
                log_event(self.error_logger, 'ERROR', error_msg)
        finally:
            sys.exit(0)

def main():
    """
    Main entry point for WaterMe! system with proper error handling.
    
    Handles command-line arguments, system initialization, and graceful shutdown.
    """
    parser = argparse.ArgumentParser(
        description="WaterMe! Smart Garden Irrigation System",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python waterme.py              # Start the system
  python waterme.py --status     # Check system status
  python waterme.py --stop       # Stop the system
  python waterme.py --restart    # Restart the system
  python waterme.py --logs       # View recent logs
  python waterme.py --config     # Show configuration
  python waterme.py --network    # Show network information
        """
    )
    
    parser.add_argument('--start', action='store_true', help='Start the system')
    parser.add_argument('--stop', action='store_true', help='Stop the system')
    parser.add_argument('--restart', action='store_true', help='Restart the system')
    parser.add_argument('--status', action='store_true', help='Show system status')
    parser.add_argument('--logs', action='store_true', help='Show recent logs')
    parser.add_argument('--config', action='store_true', help='Show configuration')
    parser.add_argument('--network', action='store_true', help='Show network information')
    parser.add_argument('--lines', type=int, default=20, help='Number of log lines to show')
    
    try:
        args = parser.parse_args()
        
        # Create system instance with error handling
        try:
            system = WaterMeSystem()
        except ImportError as e:
            print(f"❌ Missing dependencies. Please run install.sh first: {e}")
            print("Run: sudo ./install.sh")
            sys.exit(1)
        except Exception as e:
            print(f"❌ Failed to initialize WaterMe! system: {e}")
            sys.exit(1)
        
        # Set up signal handlers
        signal.signal(signal.SIGINT, system.signal_handler)
        signal.signal(signal.SIGTERM, system.signal_handler)
        
        # Handle commands with proper error handling
        try:
            if args.stop:
                success = system.stop()
                sys.exit(0 if success else 1)
            elif args.restart:
                success = system.restart()
                sys.exit(0 if success else 1)
            elif args.status:
                system.status()
            elif args.logs:
                system.logs(args.lines)
            elif args.config:
                system.config_show()
            elif args.network:
                system.network_info()
            elif args.start or not any([args.stop, args.restart, args.status, args.logs, args.config, args.network]):
                # Default action is to start
                if system.start():
                    try:
                        # Keep the main process alive
                        print("\n🌱 WaterMe! is running. Press Ctrl+C to stop.")
                        while system.is_running:
                            time.sleep(1)
                    except KeyboardInterrupt:
                        print("\n🛑 Keyboard interrupt received")
                        system.stop()
                else:
                    print("❌ Failed to start WaterMe! system")
                    sys.exit(1)
        except Exception as e:
            print(f"❌ Command execution failed: {e}")
            if hasattr(system, 'error_logger') and system.error_logger:
                log_event(system.error_logger, 'ERROR', f'Command execution failed: {e}')
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n🛑 Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main() 