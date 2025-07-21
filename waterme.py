#!/usr/bin/env python3
"""
WaterMe! - Smart Garden Irrigation System
Main Entry Point

This is the primary entry point for the WaterMe! system.
It handles system initialization, health checks, and launches all components.

Usage:
    python waterme.py                    # Start the system
    python waterme.py --status          # Check system status
    python waterme.py --stop            # Stop the system
    python waterme.py --restart         # Restart the system
    python waterme.py --logs            # View recent logs
    python waterme.py --config          # Show configuration
    python waterme.py --help            # Show this help
"""

import os
import sys
import time
import json
import signal
import argparse
import subprocess
import threading
from datetime import datetime
from pathlib import Path

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(__file__))

# Dependency check and auto-install
REQUIRED_PACKAGES = [
    'flask', 'flask_cors', 'pytz', 'astral', 'configparser', 'RPi.GPIO',
    'fastapi', 'uvicorn', 'sqlalchemy', 'pydantic'
]

def check_and_install_dependencies():
    import importlib
    missing = []
    for pkg in REQUIRED_PACKAGES:
        try:
            importlib.import_module(pkg.replace('-', '_'))
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"\n🔧 Installing missing dependencies: {', '.join(missing)}\n")
        try:
            subprocess.check_call([sys.executable, '-m', 'pip', 'install', *missing])
        except Exception as e:
            print(f"❌ Failed to install dependencies: {e}")
            print("Please install the missing packages manually and restart.")
            sys.exit(1)

check_and_install_dependencies()

class WaterMeSystem:
    def __init__(self):
        self.project_root = os.path.dirname(__file__)
        self.backend_dir = self.project_root  # Now points to project root
        self.ui_dir = os.path.join(self.project_root, 'ui')
        self.data_dir = os.path.join(self.project_root, 'data')
        self.config_dir = os.path.join(self.project_root, 'config')
        self.logs_dir = os.path.join(self.project_root, 'logs')
        
        # Process management
        self.backend_process = None
        self.ui_process = None
        self.scheduler = None
        
        # System status
        self.is_running = False
        self.start_time = None
        
        # Configuration
        self.config = self.load_config()
    
    def load_config(self):
        """Load system configuration"""
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
                    config.update(json.load(f))
            except Exception as e:
                print(f"Warning: Could not load config file: {e}")
        
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
        """Check if a port is in use"""
        import socket
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            return s.connect_ex(('localhost', port)) == 0
    
    def get_network_urls(self):
        """Get network URLs for the system"""
        import socket
        
        urls = {
            'backend': [],
            'frontend': []
        }
        
        try:
            # Get localhost URLs
            urls['backend'].append(f"http://localhost:{self.config['backend_port']}")
            urls['frontend'].append(f"http://localhost:{self.config['ui_port']}")
            
            # Get network IP addresses
            hostname = socket.gethostname()
            local_ip = socket.gethostbyname(hostname)
            
            # Add network URLs
            urls['backend'].append(f"http://{local_ip}:{self.config['backend_port']}")
            urls['frontend'].append(f"http://{local_ip}:{self.config['ui_port']}")
            
            # Try to get additional network interfaces
            try:
                # Get all network interfaces
                for interface_name, interface_addresses in socket.getaddrinfo(hostname, None):
                    if interface_name[0] == socket.AF_INET:  # IPv4 only
                        ip = interface_addresses[4][0]
                        if ip != '127.0.0.1' and ip != local_ip:
                            urls['backend'].append(f"http://{ip}:{self.config['ui_port']}")
                            urls['frontend'].append(f"http://{ip}:{self.config['ui_port']}")
            except:
                pass  # Ignore errors getting additional interfaces
                
        except Exception as e:
            print(f"Warning: Could not get network URLs: {e}")
            # Fallback to localhost only
            urls['backend'] = [f"http://localhost:{self.config['backend_port']}"]
            urls['frontend'] = [f"http://localhost:{self.config['ui_port']}"]
        
        return urls
    
    def get_network_info(self):
        """Get detailed network information"""
        import socket
        
        info = {
            'hostname': 'Unknown',
            'local_ip': 'Unknown',
            'network_interfaces': []
        }
        
        try:
            hostname = socket.gethostname()
            info['hostname'] = hostname
            
            local_ip = socket.gethostbyname(hostname)
            info['local_ip'] = local_ip
            
            # Get additional network interfaces
            try:
                for interface_name, interface_addresses in socket.getaddrinfo(hostname, None):
                    if interface_name[0] == socket.AF_INET:  # IPv4 only
                        ip = interface_addresses[4][0]
                        if ip != '127.0.0.1' and ip != local_ip:
                            info['network_interfaces'].append(ip)
            except:
                pass
                
        except Exception as e:
            print(f"Warning: Could not get network info: {e}")
        
        return info
    
    def start_backend(self):
        """Start the backend API server"""
        print("🚀 Starting backend server...")
        
        try:
            # Change to backend directory
            os.chdir(self.backend_dir)
            
            # Set environment variables for network access
            env = os.environ.copy()
            env['FLASK_HOST'] = '0.0.0.0'  # Ensure network access
            
            # Start the backend process
            self.backend_process = subprocess.Popen([
                sys.executable, 'api.py'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            
            # Wait a moment for startup
            time.sleep(3)
            
            # Check if process is still running
            if self.backend_process.poll() is None:
                print(f"✅ Backend server started on port {self.config['backend_port']}")
                return True
            else:
                stdout, stderr = self.backend_process.communicate()
                print(f"❌ Backend server failed to start:")
                print(f"   STDOUT: {stdout.decode()}")
                print(f"   STDERR: {stderr.decode()}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to start backend: {e}")
            return False
    
    def start_ui(self):
        """Start the frontend UI"""
        if not self.config['auto_start_ui']:
            print("ℹ️  UI auto-start disabled")
            return True
        
        print("🎨 Starting frontend UI...")
        
        try:
            # Change to UI directory
            os.chdir(self.ui_dir)
            
            # Check if node_modules exists
            if not os.path.exists('node_modules'):
                print("📦 Installing UI dependencies...")
                subprocess.run(['npm', 'install'], check=True)
            
            # Start the UI development server with network access
            env = os.environ.copy()
            env['VITE_HOST'] = '0.0.0.0'  # Ensure network access
            
            self.ui_process = subprocess.Popen([
                'npm', 'run', 'dev'
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            
            # Wait a moment for startup
            time.sleep(5)
            
            # Check if process is still running
            if self.ui_process.poll() is None:
                print(f"✅ Frontend UI started on port {self.config['ui_port']}")
                return True
            else:
                stdout, stderr = self.ui_process.communicate()
                print(f"❌ Frontend UI failed to start:")
                print(f"   STDOUT: {stdout.decode()}")
                print(f"   STDERR: {stderr.decode()}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to start UI: {e}")
            return False
    
    def stop_backend(self):
        """Stop the backend server"""
        if self.backend_process:
            print("🛑 Stopping backend server...")
            self.backend_process.terminate()
            try:
                self.backend_process.wait(timeout=10)
                print("✅ Backend server stopped")
            except subprocess.TimeoutExpired:
                self.backend_process.kill()
                print("⚠️  Backend server force killed")
    
    def stop_ui(self):
        """Stop the frontend UI"""
        if self.ui_process:
            print("🛑 Stopping frontend UI...")
            self.ui_process.terminate()
            try:
                self.ui_process.wait(timeout=10)
                print("✅ Frontend UI stopped")
            except subprocess.TimeoutExpired:
                self.ui_process.kill()
                print("⚠️  Frontend UI force killed")
    
    def start(self):
        """Start the complete WaterMe! system"""
        if self.is_running:
            print("⚠️  System is already running")
            return False
        
        print("🌱 Starting WaterMe! Smart Garden System...")
        print("=" * 50)
        
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
        self.start_time = datetime.now()
        
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
        """Turn off all relays and clean up GPIO through scheduler"""
        try:
            print("🔌 Turning off all relays through scheduler...")
            print("DEBUG: cleanup_gpio called - about to call scheduler.shutdown()")
            # Use scheduler for proper GPIO control
            from core.scheduler import scheduler
            
            # Use the new shutdown method that preserves active zones
            scheduler.shutdown()
            print("✅ Scheduler shutdown complete - active zones saved for restoration")
            
        except ImportError:
            print("   Scheduler module not available (development mode)")
            # Fallback to direct GPIO control if scheduler unavailable
            try:
                from core.gpio import deactivate_zone, cleanup_gpio, ZONE_PINS
                for zone_id in ZONE_PINS.keys():
                    try:
                        deactivate_zone(zone_id)
                    except Exception as e:
                        print(f"   Warning: Could not deactivate zone {zone_id}: {e}")
                cleanup_gpio()
                print("✅ Fallback GPIO cleanup completed")
            except Exception as e:
                print(f"⚠️  Error during fallback GPIO cleanup: {e}")
        except Exception as e:
            print(f"⚠️  Error during scheduler cleanup: {e}")
            import traceback
            traceback.print_exc()
    
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
            print(f"Started: {self.start_time.strftime('%Y-%m-%d %H:%M:%S')}")
            uptime = datetime.now() - self.start_time
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
        """Handle shutdown signals"""
        print(f"\n🛑 Received signal {signum}, shutting down...")
        print(f"DEBUG: signal_handler called - about to call cleanup_gpio()")
        # Ensure GPIO cleanup happens on Ctrl-C
        self.cleanup_gpio()
        print(f"DEBUG: cleanup_gpio() completed - about to call self.stop()")
        self.stop()
        print(f"DEBUG: self.stop() completed - about to exit")
        sys.exit(0)

def main():
    """Main entry point"""
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
    
    args = parser.parse_args()
    
    # Create system instance
    system = WaterMeSystem()
    
    # Set up signal handlers
    signal.signal(signal.SIGINT, system.signal_handler)
    signal.signal(signal.SIGTERM, system.signal_handler)
    
    # Handle commands
    if args.stop:
        system.stop()
    elif args.restart:
        system.restart()
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
                while system.is_running:
                    time.sleep(1)
            except KeyboardInterrupt:
                print("\n🛑 Keyboard interrupt received")
                system.stop()

if __name__ == '__main__':
    main() 