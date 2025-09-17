# api.py
# Flask REST API server with 80+ endpoints for WaterMe! irrigation system
#
# 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
# 📖 System Overview: ~/rules/system-overview.md
# 🏗️ Project Structure: ~/rules/project-structure.md  
# 🌐 API Patterns: ~/rules/api-patterns.md
# 💻 Coding Standards: ~/rules/coding-standards.md

from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import json
import os
import sqlite3
import configparser
from astral.sun import sun
from astral import LocationInfo
from datetime import datetime, timedelta
import re
import pytz
import logging
from logging.handlers import RotatingFileHandler
import glob
import zipfile
import tempfile
import shutil
import io
import time
# GPIO imports removed - scheduler is now primary controller

# Create a mock GPIO module for simulation
class MockGPIO:
    BCM = "BCM"
    OUT = "OUT"
    LOW = False
    HIGH = True
    
    def __init__(self):
        self.pin_states = {}  # Track pin states for simulation
        
    def setmode(self, mode):
        print(f"Mock GPIO: Set mode to {mode}")
        
    def setwarnings(self, warnings):
        print(f"Mock GPIO: Set warnings to {warnings}")
        
    def setup(self, pin, mode):
        print(f"Mock GPIO: Setup pin {pin} as {mode}")
        self.pin_states[pin] = False  # Initialize as OFF
        
    def output(self, pin, state):
        self.pin_states[pin] = state
        print(f"Mock GPIO: Pin {pin} set to {state}")
        
    def input(self, pin):
        return self.pin_states.get(pin, False)

# Function to determine if we should use simulation mode
def should_simulate():
    """Check if simulation mode is enabled in settings"""
    try:
        settings = load_ini_settings()
        return settings.get('simulate', False)
    except:
        return False

# Conditional GPIO import based on simulation setting
SIMULATION_MODE = should_simulate()

if SIMULATION_MODE:
    print("Simulation mode enabled - using mock GPIO")
    GPIO = MockGPIO()
    GPIO_AVAILABLE = False
else:
    try:
        import RPi.GPIO as GPIO
        GPIO_AVAILABLE = True
        print("Using real GPIO hardware")
    except ImportError:
        print("RPi.GPIO not available - falling back to mock GPIO")
        GPIO_AVAILABLE = False
        GPIO = MockGPIO()

app = Flask(__name__)
# CORS configuration for LAN access - allows all local network traffic
CORS(app, 
     origins=["*"],  # Allow all origins for local development
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Connection", "Authorization", "X-Requested-With"],
     supports_credentials=False)

@app.after_request
def after_request(response):
    """Add CORS headers to all responses"""
    # Flask-CORS is already handling CORS headers, so we don't need to add them manually
    # This prevents duplicate headers that cause CORS errors
    return response

# Register Plant Manager Blueprint (import here to avoid circular imports)
from core.plant_manager import plant_bp
app.register_blueprint(plant_bp)

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "config", "settings.cfg")
GPIO_PATH = os.path.join(os.path.dirname(__file__), "config", "gpio.cfg")
SCHEDULE_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "schedule.json")
LOCATIONS_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "locations.json")
MAP_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "map.json")
HEALTH_ALERTS_PATH = os.path.join(os.path.dirname(__file__), "data", "health_alerts.json")
LOGS_JSON_PATH = os.path.join(os.path.dirname(__file__), "data", "logs.json")
LOGS_DIR = os.path.join(os.path.dirname(__file__), "logs")

# JSON File Management Functions
def load_json_file(file_path, default_value=None):
    """Load JSON file with error handling and default value"""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Error loading {file_path}: {e}")
    return default_value if default_value is not None else {}

def save_json_file(file_path, data, indent=2):
    """Save JSON file with error handling"""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=indent, ensure_ascii=False)
        return True
    except IOError as e:
        print(f"Error saving {file_path}: {e}")
        return False

def append_to_json_array(file_path, new_item, key_field=None):
    """Append a new item to a JSON array file"""
    try:
        # Load existing data
        existing_data = load_json_file(file_path, [])
        
        # If key_field is provided, check for duplicates
        if key_field and new_item.get(key_field):
            # Remove existing item with same key if it exists
            existing_data = [item for item in existing_data 
                           if item.get(key_field) != new_item[key_field]]
        
        # Append new item
        existing_data.append(new_item)
        
        # Save updated data
        return save_json_file(file_path, existing_data)
    except Exception as e:
        print(f"Error appending to {file_path}: {e}")
        return False

def update_json_array_item(file_path, item_id, updates, id_field='id'):
    """Update a specific item in a JSON array file"""
    try:
        # Load existing data
        existing_data = load_json_file(file_path, [])
        
        # Find and update the item
        for i, item in enumerate(existing_data):
            if item.get(id_field) == item_id:
                existing_data[i].update(updates)
                return save_json_file(file_path, existing_data)
        
        return False  # Item not found
    except Exception as e:
        print(f"Error updating item in {file_path}: {e}")
        return False

def remove_from_json_array(file_path, item_id, id_field='id'):
    """Remove a specific item from a JSON array file"""
    try:
        # Load existing data
        existing_data = load_json_file(file_path, [])
        
        # Remove the item
        original_length = len(existing_data)
        existing_data = [item for item in existing_data 
                        if item.get(id_field) != item_id]
        
        if len(existing_data) == original_length:
            return False  # Item not found
        
        # Save updated data
        return save_json_file(file_path, existing_data)
    except Exception as e:
        print(f"Error removing item from {file_path}: {e}")
        return False

def append_to_json_object(file_path, key, value):
    """Append a new key-value pair to a JSON object file"""
    try:
        # Load existing data
        existing_data = load_json_file(file_path, {})
        
        # Add or update the key-value pair
        existing_data[key] = value
        
        # Save updated data
        return save_json_file(file_path, existing_data)
    except Exception as e:
        print(f"Error appending to object {file_path}: {e}")
        return False

def remove_from_json_object(file_path, key):
    """Remove a specific key from a JSON object file"""
    try:
        # Load existing data
        existing_data = load_json_file(file_path, {})
        
        if key not in existing_data:
            return False  # Key not found
        
        # Remove the key
        del existing_data[key]
        
        # Save updated data
        return save_json_file(file_path, existing_data)
    except Exception as e:
        print(f"Error removing key from {file_path}: {e}")
        return False

# Validation Functions
def validate_garden_settings(settings):
    """Validate garden settings data"""
    errors = []
    
    # Required fields
    if not settings.get('name', '').strip():
        errors.append('Garden name is required')
    
    # Timer multiplier validation
    timer_mult = settings.get('timer_multiplier', 1.0)
    if not isinstance(timer_mult, (int, float)) or timer_mult < 0.1 or timer_mult > 10.0:
        errors.append('Timer multiplier must be between 0.1 and 10.0')
    
    # Location validation
    lat = settings.get('gps_lat')
    lon = settings.get('gps_lon')
    if lat is None or lon is None:
        errors.append('Valid location coordinates are required')
    elif not (-90 <= lat <= 90) or not (-180 <= lon <= 180):
        errors.append('Invalid location coordinates')
    
    # Timezone validation
    timezone = settings.get('timezone', '')
    if not timezone or timezone not in pytz.all_timezones:
        errors.append('Valid timezone is required')
    
    # Max duration threshold validation
    max_duration = settings.get('max_duration_threshold', '02:00')
    if max_duration:
        # Validate HH:MM format
        import re
        if not re.match(r'^\d{1,2}:\d{2}$', max_duration):
            errors.append('Max duration threshold must be in HH:MM format (e.g., 02:00)')
        else:
            try:
                hours, minutes = max_duration.split(':')
                hours_int = int(hours)
                minutes_int = int(minutes)
                if hours_int < 0 or hours_int > 23 or minutes_int < 0 or minutes_int > 59:
                    errors.append('Max duration threshold must have valid hours (0-23) and minutes (0-59)')
            except ValueError:
                errors.append('Max duration threshold must be in HH:MM format (e.g., 02:00)')
    
    return errors

def validate_gpio_config(config):
    """Validate GPIO configuration data"""
    errors = []
    
    # Zone count validation
    zone_count = config.get('zoneCount', 0)
    if not isinstance(zone_count, int) or zone_count < 1 or zone_count > 8:
        errors.append('Zone count must be between 1 and 8')
    
    # Pins validation
    pins = config.get('pins', [])
    if not isinstance(pins, list) or len(pins) != zone_count:
        errors.append('Pin count must match zone count')
    
    # Check for unique pins (excluding 0 for unconfigured zones)
    configured_pins = [pin for pin in pins if pin != 0]
    if len(set(configured_pins)) != len(configured_pins):
        errors.append('Each configured zone must use a unique GPIO pin')
    
    # Validate pin numbers
    valid_pins = list(range(2, 28))  # GPIO 2-27
    for i, pin in enumerate(pins):
        if not isinstance(pin, int):
            errors.append(f'Zone {i+1}: Pin must be a number')
        elif pin != 0 and pin not in valid_pins:
            errors.append(f'Zone {i+1}: Invalid GPIO pin {pin} (must be 2-27 or 0 for unconfigured)')
    
    # Pump index validation
    pump_index = config.get('pumpIndex', 0)
    if pump_index != 0 and (not isinstance(pump_index, int) or pump_index < 1 or pump_index > zone_count):
        errors.append('Pump index must be 0 or a valid zone number')
    
    return errors

def validate_schedule_data(schedule):
    """Validate schedule data"""
    errors = []
    
    if not isinstance(schedule, list):
        errors.append('Schedule must be a list of zones')
        return errors
    
    for i, zone in enumerate(schedule):
        if not isinstance(zone, dict):
            errors.append(f'Zone {i+1}: Invalid zone data')
            continue
        
        # Zone ID validation - zone_id is now stored as the key, not in the data
        # This validation is handled by the API endpoints that manage the keys
        
        # Mode validation
        mode = zone.get('mode', '')
        if mode not in ['manual', 'smart', 'disabled']:
            errors.append(f'Zone {i+1}: Invalid mode (must be manual, smart, or disabled)')
        
        # Skip other validations for disabled zones
        if mode == 'disabled':
            continue
        
        # Period validation (only for active zones)
        period = zone.get('period', '')
        if period not in ['D', 'W', 'M']:
            errors.append(f'Zone {i+1}: Invalid period (must be D, W, or M)')
        
        # Time validation - only times array is used (only for active zones)
        times = zone.get('times', [])
        if not times or len(times) == 0:
            errors.append(f'Zone {i+1}: Must have at least one time in times array')
        
        # Validate time codes (only for active zones)
        time_codes = []
        for t in times:
            if t.get('value'):
                time_codes.append(t['value'])
        
        print(f"DEBUG: Zone {i+1} time codes: {time_codes}")
        for code in time_codes:
            if not validate_time_code(code):
                errors.append(f'Zone {i+1}: Invalid time code "{code}"')
    
    return errors

def validate_time_code(code):
    """Validate a time code (HH:MM, HHMM, SUNRISE, SUNSET, etc.)"""
    print(f"DEBUG: Validating time code: '{code}' (type: {type(code)})")
    if not isinstance(code, str):
        print(f"DEBUG: Not a string, returning False")
        return False
    
    # Check for HH:MM format (new standard)
    if ':' in code and len(code) == 5:
        try:
            hour, minute = map(int, code.split(':'))
            result = 0 <= hour <= 23 and 0 <= minute <= 59
            print(f"DEBUG: HH:MM format - hour={hour}, minute={minute}, result={result}")
            return result
        except ValueError as e:
            print(f"DEBUG: HH:MM ValueError: {e}")
            return False
    
    # Check for legacy HHMM format
    if code.isdigit() and len(code) == 4:
        hour = int(code[:2])
        minute = int(code[2:])
        return 0 <= hour <= 23 and 0 <= minute <= 59
    
    # Check for solar codes
    solar_codes = ['SUNRISE', 'SUNSET', 'ZENITH']
    if code in solar_codes:
        return True
    
    # Check for solar codes with offsets
    for solar in solar_codes:
        if code.startswith(solar):
            offset = code[len(solar):]
            if offset.startswith('+') or offset.startswith('-'):
                try:
                    int(offset[1:])
                    return True
                except ValueError:
                    pass
    
    return False

# GPIO Control Functions - Now interfaces with scheduler
def get_pin_for_channel(channel):
    """Get GPIO pin number for a given channel (1-indexed)"""
    try:
        from core.gpio import ZONE_PINS
        return ZONE_PINS.get(channel)
    except Exception as e:
        print(f"Error getting pin for channel {channel}: {e}")
    return None

def get_channel_status(channel):
    """Get current status of a channel from scheduler"""
    try:
        from core.scheduler import scheduler
        state = scheduler.get_zone_status(channel)
        return "HIGH" if state.get('active', False) else "LOW"
    except Exception as e:
        print(f"Error getting status for channel {channel}: {e}")
        return "UNKNOWN"

# GPIO initialization is now handled by the scheduler
# No need for global GPIO setup in the API

# Import unified logging system
from core.logging import setup_logger, log_event
from core.plant_manager import plant_manager

# Initialize loggers
system_logger = setup_logger('SYSTEM', 'system.log')
watering_logger = setup_logger('WATERING', 'watering.log')
plants_logger = setup_logger('PLANTS', 'plants.log')
locations_logger = setup_logger('LOCATIONS', 'locations.log')
health_logger = setup_logger('HEALTH', 'health.log')
user_logger = setup_logger('USER', 'user.log')
error_logger = setup_logger('ERROR', 'error.log')


def cleanup_old_logs(days_to_keep=30):
    """Clean up log files older than specified days"""
    try:
        tz = pytz.timezone(scheduler.settings.get('timezone', 'UTC'))
        cutoff_date = datetime.now(tz) - timedelta(days=days_to_keep)
        log_files = glob.glob(os.path.join(LOGS_DIR, "*.log*"))
        
        for log_file in log_files:
            file_time = datetime.fromtimestamp(os.path.getmtime(log_file))
            if file_time < cutoff_date:
                os.remove(log_file)
                system_logger.info(f"Cleaned up old log file: {os.path.basename(log_file)}")
    except Exception as e:
        error_logger.error(f"Error cleaning up old logs: {e}")

def get_log_entries(log_file, level=None, category=None, limit=100, search=None):
    """Get log entries with optional filtering"""
    try:
        log_path = os.path.join(LOGS_DIR, log_file)
        if not os.path.exists(log_path):
            print(f"Log file not found: {log_path}")
            return []
        
        print(f"Reading log file: {log_path}")
        print(f"File exists: {os.path.exists(log_path)}")
        entries = []
        line_count = 0
        with open(log_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                line_count += 1
                if not line:
                    continue
                
                # Parse log entry
                try:
                    # Simple regex-like parsing for [timestamp] [level] [category] message
                    if line.startswith('[') and line.count('[') >= 3:
                        # Find all bracket positions
                        brackets = []
                        for i, char in enumerate(line):
                            if char == '[' or char == ']':
                                brackets.append((char, i))
                        
                        if len(brackets) >= 6:  # At least 3 pairs of brackets
                            # Extract timestamp: [timestamp]
                            timestamp_start = brackets[0][1] + 1
                            timestamp_end = brackets[1][1]
                            timestamp = line[timestamp_start:timestamp_end]
                            
                            # Extract level: [level]
                            level_start = brackets[2][1] + 1
                            level_end = brackets[3][1]
                            log_level = line[level_start:level_end]
                            
                            # Extract category: [category]
                            category_start = brackets[4][1] + 1
                            category_end = brackets[5][1]
                            log_category = line[category_start:category_end]
                            
                            # Extract message: everything after the last ]
                            message = line[category_end + 2:].strip()
                            
                            # Apply filters
                            if level and log_level != level:
                                continue
                            if category and log_category != category:
                                continue
                            if search and search.lower() not in message.lower():
                                continue
                            
                            entries.append({
                                'timestamp': timestamp,
                                'level': log_level,
                                'category': log_category,
                                'message': message,
                                'raw': line,
                                'file': log_file
                            })
                        else:
                            # Fallback: include as raw entry
                            entries.append({
                                'timestamp': '',
                                'level': 'UNKNOWN',
                                'category': 'UNKNOWN',
                                'message': line,
                                'raw': line,
                                'file': log_file
                            })
                    else:
                        # If parsing fails, include as raw entry
                        entries.append({
                            'timestamp': '',
                            'level': 'UNKNOWN',
                            'category': 'UNKNOWN',
                            'message': line,
                            'raw': line,
                            'file': log_file
                        })
                except:
                    # If parsing fails, include as raw entry
                    entries.append({
                        'timestamp': '',
                        'level': 'UNKNOWN',
                        'category': 'UNKNOWN',
                        'message': line,
                        'raw': line,
                        'file': log_file
                    })
        
        print(f"Found {len(entries)} entries in {log_file} from {line_count} total lines")
        # Return limited results, newest first
        return entries[-limit:][::-1]
    except Exception as e:
        error_logger.error(f"Error reading log file {log_file}: {e}")
        print(f"Error reading log file {log_file}: {e}")
        return []

def get_all_log_entries(level=None, category=None, limit=100, search=None):
    """Get log entries from all log files combined"""
    try:
        all_entries = []
        log_files = glob.glob(os.path.join(LOGS_DIR, "*.log"))
        
        print(f"Combining logs from {len(log_files)} files: {[os.path.basename(f) for f in log_files]}")
        
        for log_file in log_files:
            filename = os.path.basename(log_file)
            print(f"Processing file: {filename}")
            entries = get_log_entries(filename, level, category, limit * 2, search)  # Get more entries per file
            print(f"Got {len(entries)} entries from {filename}")
            all_entries.extend(entries)
        
        print(f"Total entries before sorting: {len(all_entries)}")
        
        # Sort by timestamp (newest first)
        all_entries.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        
        # Return limited results
        result = all_entries[:limit]
        print(f"Returning {len(result)} entries from combined logs")
        return result
    except Exception as e:
        error_logger.error(f"Error reading all log files: {e}")
        print(f"Error reading all log files: {e}")
        return []

# Log system startup
system_logger.info("WaterMe! system started")

# INI Configuration Functions
def load_ini_settings():
    """Load settings from INI format settings.cfg file"""
    config = configparser.ConfigParser()
    settings = {}
    
    if os.path.exists(SETTINGS_PATH):
        try:
            config.read(SETTINGS_PATH)
            
            # Load Garden section
            if 'Garden' in config:
                garden = config['Garden']
                settings.update({
                    'name': garden.get('name', ''),
                    'garden_name': garden.get('name', ''),  # Backward compatibility
                    'city': garden.get('city', ''),
                    'location': garden.get('city', ''),  # Backward compatibility
                    'gps_lat': garden.getfloat('gps_lat', 0.0),
                    'gps_lon': garden.getfloat('gps_lon', 0.0),
                    'mode': garden.get('mode', 'manual'),
                    'timezone': garden.get('timezone', 'UTC'),
                    'timer_multiplier': garden.getfloat('timer_multiplier', 1.0),
                    'simulate': garden.getboolean('simulate', False),
                    'max_duration_threshold': garden.get('max_duration_threshold', '02:00')
                })
            

                
        except Exception as e:
            print(f"Error loading INI settings: {e}")
            # Return default settings if parsing fails
            settings = {
                'name': 'T3',
                'garden_name': 'T3',
                'city': 'Yorkton,SK',
                'location': 'Yorkton,SK',
                'gps_lat': 51.212045,
                'gps_lon': -102.461243,
                'mode': 'manual',
                'timezone': 'America/Regina',
                'timer_multiplier': 1.0,
                'simulate': False
            }
    
    return settings

def save_ini_settings(settings_data):
    """Save settings to INI format settings.cfg file, preserving all comments"""
    print(f"Saving settings data: {settings_data}")
    
    try:
        # Ensure the config directory exists
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        print(f"Saving to: {SETTINGS_PATH}")
        
        # Prepare new values
        new_values = {
            'Garden': {
                'name': str(settings_data.get('garden_name', settings_data.get('name', ''))),
                'city': str(settings_data.get('city', '')),
                'gps_lat': str(settings_data.get('gps_lat', 0.0)),
                'gps_lon': str(settings_data.get('gps_lon', 0.0)),
                'mode': str(settings_data.get('mode', 'manual')),
                'timezone': str(settings_data.get('timezone', 'UTC')),
                'timer_multiplier': str(settings_data.get('timer_multiplier', 1.0)),
                'simulate': str(settings_data.get('simulate', False)),
                'max_duration_threshold': str(settings_data.get('max_duration_threshold', '02:00'))
            }
        }
        
        print(f"New values: {new_values}")
        
        # Read existing file and update values while preserving comments
        new_lines = []
        current_section = None
        
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, 'r') as f:
                lines = f.readlines()
        else:
            # Create new file with default structure
            lines = [
                "# WaterMe! Garden Configuration\n",
                "# This file contains the main garden settings and configuration\n",
                "\n",
                "[Garden]\n",
                "# Name of your garden\n",
                "name = \n",
                "\n",
                "# City and location for weather/solar calculations\n",
                "city = \n",
                "\n",
                "# GPS coordinates (latitude, longitude)\n",
                "# Used for solar time calculations and weather data\n",
                "gps_lat = 0.0\n",
                "gps_lon = 0.0\n",
                "\n",
                "# Operating mode\n",
                "# manual = user controlled scheduling\n",
                "# smart = automated scheduling (coming soon)\n",
                "mode = manual\n",
                "\n",
                "# Timezone for scheduling and time calculations\n",
                "timezone = UTC\n",
                "\n",
                "# Timer multiplier for global watering adjustments\n",
                "# 1.0 = normal watering, 2.0 = double water, 0.5 = half water\n",
                "timer_multiplier = 1.0\n",
                "\n",

                "# Simulation Mode\n",
                "# Enable mock GPIO for development/testing (no real relays)\n",
                "simulate = false\n"
            ]
        
        for line in lines:
            stripped = line.strip()
            
            # Check if this is a section header
            if stripped.startswith('[') and stripped.endswith(']'):
                current_section = stripped[1:-1]  # Remove brackets
                new_lines.append(line)
                continue
            
            # Check if this is a key-value line
            if '=' in line and not stripped.startswith('#'):
                key_value = line.split('=', 1)
                if len(key_value) == 2:
                    key = key_value[0].strip()
                    value_part = key_value[1]  # Keep the rest of the line (value + comment)
                    
                    # Update value if we have a new one for this section and key
                    if current_section in new_values and key in new_values[current_section]:
                        new_value = new_values[current_section][key]
                        # Preserve any inline comment
                        if '#' in value_part:
                            comment_part = value_part[value_part.find('#'):]
                            new_lines.append(f"{key} = {new_value}{comment_part}")
                        else:
                            new_lines.append(f"{key} = {new_value}\n")
                    else:
                        new_lines.append(line)
                else:
                    new_lines.append(line)
            else:
                # Keep comments and other lines as-is
                new_lines.append(line)
        
        # Add any missing keys that weren't in the original file
        for section, keys in new_values.items():
            if section not in [line.strip()[1:-1] for line in new_lines if line.strip().startswith('[') and line.strip().endswith(']')]:
                # Add missing section
                new_lines.append(f"\n[{section}]\n")
            
            # Find the section in the new lines
            section_start = -1
            for i, line in enumerate(new_lines):
                if line.strip() == f'[{section}]':
                    section_start = i
                    break
            
            if section_start != -1:
                # Check for missing keys in this section
                existing_keys = set()
                i = section_start + 1
                while i < len(new_lines) and not new_lines[i].strip().startswith('['):
                    if '=' in new_lines[i] and not new_lines[i].strip().startswith('#'):
                        key = new_lines[i].split('=')[0].strip()
                        existing_keys.add(key)
                    i += 1
                
                # Add missing keys
                for key, value in keys.items():
                    if key not in existing_keys:
                        # Insert after the section header
                        insert_pos = section_start + 1
                        while insert_pos < len(new_lines) and not new_lines[insert_pos].strip().startswith('[') and new_lines[insert_pos].strip():
                            insert_pos += 1
                        new_lines.insert(insert_pos, f"{key} = {value}\n")
        
        # Write the updated file
        with open(SETTINGS_PATH, 'w') as f:
            f.writelines(new_lines)
        
        print("Settings saved successfully with all comments preserved")
        return True
    except Exception as e:
        print(f"Error saving INI settings: {e}")
        return False

def load_ini_gpio():
    """Load GPIO configuration from INI format gpio.cfg file"""
    print(f"Loading GPIO config from: {GPIO_PATH}")
    config = configparser.ConfigParser()
    gpio_config = {}
    
    if os.path.exists(GPIO_PATH):
        print("GPIO config file exists")
        try:
            print(f"Reading config file: {GPIO_PATH}")
            config.read(GPIO_PATH)
            print(f"Config sections: {config.sections()}")
            
            if 'GPIO' in config:
                print("GPIO section found in config")
                gpio = config['GPIO']
                # Parse pins string into list
                pins_str = gpio.get('pins', '2')
                print(f"Pins string: {pins_str}")
                pins = [int(p.strip()) for p in pins_str.split(',') if p.strip()]
                print(f"Parsed pins: {pins}")
                
                # Parse activeLow with fallback
                try:
                    active_low = gpio.getboolean('activeLow', True)
                except:
                    active_low = True
                
                zone_count = gpio.getint('zoneCount', 1)
                pump_index = gpio.getint('pumpIndex', 0)
                gpio_mode = gpio.get('mode', 'BCM')  # Default to BCM mode
                print(f"Zone count: {zone_count}, Pump index: {pump_index}, Active low: {active_low}, Mode: {gpio_mode}")
                
                gpio_config.update({
                    'zoneCount': zone_count,
                    'pins': pins,
                    'pumpIndex': pump_index,
                    'activeLow': active_low,
                    'mode': gpio_mode
                })
                print(f"Final GPIO config: {gpio_config}")
            else:
                print("GPIO section not found in config file")
                print(f"Available sections: {config.sections()}")
                
        except Exception as e:
            print(f"Error loading INI GPIO config: {e}")
            # Return default GPIO config if parsing fails
            gpio_config = {
                'zoneCount': 1,
                'pins': [2],
                'pumpIndex': 0,
                'activeLow': True,
                'mode': 'BCM'
            }
    
    return gpio_config

def save_ini_gpio(gpio_data):
    """Save GPIO configuration to INI format gpio.cfg file, preserving all comments"""
    print(f"Saving GPIO data: {gpio_data}")
    
    try:
        # Ensure the config directory exists
        os.makedirs(os.path.dirname(GPIO_PATH), exist_ok=True)
        print(f"Saving to: {GPIO_PATH}")
        
        # Prepare new values
        pins_str = ', '.join(map(str, gpio_data.get('pins', [2])))
        new_values = {
            'GPIO': {
                'zoneCount': str(gpio_data.get('zoneCount', 1)),
                'pins': pins_str,
                'pumpIndex': str(gpio_data.get('pumpIndex', 0)),
                'activeLow': str(gpio_data.get('activeLow', True)),
                'mode': str(gpio_data.get('mode', 'BCM'))
            }
        }
        
        print(f"New GPIO values: {new_values}")
        
        # Read existing file and update values while preserving comments
        new_lines = []
        current_section = None
        
        if os.path.exists(GPIO_PATH):
            with open(GPIO_PATH, 'r') as f:
                lines = f.readlines()
        else:
            # Create new file with default structure
            lines = [
                "# WaterMe! GPIO Configuration\n",
                "# This file contains the GPIO pin assignments and hardware settings\n",
                "\n",
                "[GPIO]\n",
                "# Number of watering zones (1-8 supported)\n",
                "zoneCount = 1\n",
                "\n",
                "# GPIO pin assignments for each zone (BCM numbering)\n",
                "# Zone 1 = pins[0], Zone 2 = pins[1], etc.\n",
                "# Valid pins: 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26\n",
                "pins = 2\n",
                "\n",
                "# Pump zone index (1-based, 0 = no pump zone)\n",
                "# Set to 0 if no dedicated pump zone is needed\n",
                "# If set, this zone will control the main pump/valve\n",
                "pumpIndex = 0\n",
                "\n",
                "# GPIO signal polarity\n",
                "# true = active low (common for relay modules)\n",
                "# false = active high\n",
                "activeLow = true\n",
                "mode = BCM\n"
            ]
        
        for line in lines:
            stripped = line.strip()
            
            # Check if this is a section header
            if stripped.startswith('[') and stripped.endswith(']'):
                current_section = stripped[1:-1]  # Remove brackets
                new_lines.append(line)
                continue
            
            # Check if this is a key-value line
            if '=' in line and not stripped.startswith('#'):
                key_value = line.split('=', 1)
                if len(key_value) == 2:
                    key = key_value[0].strip()
                    value_part = key_value[1]  # Keep the rest of the line (value + comment)
                    
                    # Update value if we have a new one for this section and key
                    if current_section in new_values and key in new_values[current_section]:
                        new_value = new_values[current_section][key]
                        # Preserve any inline comment
                        if '#' in value_part:
                            comment_part = value_part[value_part.find('#'):]
                            new_lines.append(f"{key} = {new_value}{comment_part}")
                        else:
                            new_lines.append(f"{key} = {new_value}\n")
                    else:
                        new_lines.append(line)
                else:
                    new_lines.append(line)
            else:
                # Keep comments and other lines as-is
                new_lines.append(line)
        
        # Write the updated file
        with open(GPIO_PATH, 'w') as f:
            f.writelines(new_lines)
        
        print("GPIO config saved successfully with all comments preserved")
        return True
    except Exception as e:
        print(f"Error saving INI GPIO config: {e}")
        return False

def parse_offset(code, base):
    m = re.search(r'([+-])(\d+)$', code)
    if m:
        sign = 1 if m.group(1) == '+' else -1
        minutes = int(m.group(2))
        return timedelta(minutes=sign * minutes)
    return timedelta()

@app.route('/api/garden', methods=['POST'])
def save_garden():
    data = request.json
    print(f"Received garden data: {data}")
    
    if not data:
        log_event(system_logger, 'WARN', f'Garden settings save failed - invalid data')
        return jsonify({'status': 'error', 'message': 'Invalid garden data'}), 400
    
    # Validate the data
    errors = validate_garden_settings(data)
    if errors:
        log_event(system_logger, 'WARN', f'Garden settings save failed - validation errors', errors=errors)
        return jsonify({'status': 'error', 'message': 'Validation failed', 'details': errors}), 400
    
    success = save_ini_settings(data)
    if success:
        # Reload the scheduler's cached settings data
        from core.scheduler import scheduler
        scheduler.reload_settings()
        log_event(system_logger, 'INFO', f'Garden settings saved and reloaded', 
                 name=data.get('name', ''),
                 location=data.get('city', ''),
                 timezone=data.get('timezone', ''),
                 mode=data.get('mode', ''),
                 timer_multiplier=data.get('timer_multiplier', 1.0))
        return jsonify({'status': 'success'})
    else:
        log_event(error_logger, 'ERROR', f'Garden settings save failed - save error', 
                 name=data.get('name', ''))
        return jsonify({'status': 'error', 'message': 'Failed to save settings'}), 500

@app.route('/api/gpio', methods=['GET'])
def get_gpio():
    """Return GPIO config as JSON for frontend compatibility"""
    gpio_config = load_ini_gpio()
    return jsonify(gpio_config)

@app.route('/api/gpio', methods=['POST'])
def save_gpio():
    data = request.json
    print(f"Received GPIO data: {data}")
    
    if not data:
        log_event(system_logger, 'WARN', f'GPIO config save failed - invalid data')
        return jsonify({'status': 'error', 'message': 'Invalid GPIO data'}), 400
    
    # Validate the data
    errors = validate_gpio_config(data)
    if errors:
        print(f"GPIO validation errors: {errors}")
        log_event(system_logger, 'WARN', f'GPIO config save failed - validation errors', errors=errors)
        return jsonify({'status': 'error', 'message': 'Validation failed', 'details': errors}), 400
    
    success = save_ini_gpio(data)
    if success:
        log_event(system_logger, 'INFO', f'GPIO config saved', 
                 zone_count=data.get('zoneCount', 0),
                 pins=data.get('pins', []),
                 pump_index=data.get('pumpIndex', 0))
        return jsonify({'status': 'success'})
    else:
        log_event(error_logger, 'ERROR', f'GPIO config save failed - save error', 
                 zone_count=data.get('zoneCount', 0))
        return jsonify({'status': 'error', 'message': 'Failed to save GPIO config'}), 500

@app.route('/config/gpio.cfg', methods=['GET'])
def get_gpio_cfg():
    """Return GPIO config as JSON for frontend compatibility"""
    print("Loading GPIO config for frontend...")
    gpio_config = load_ini_gpio()
    print(f"GPIO config loaded: {gpio_config}")
    
    # Convert pins array to channels format for frontend
    channels = {}
    pins = gpio_config.get('pins', [])
    for i, pin in enumerate(pins):
        if i < 8:  # Limit to 8 zones
            channels[str(i + 1)] = pin
    
    frontend_config = {
        'channels': channels,
        'mode': gpio_config.get('mode', 'BCM'),  # Use mode from config
        'pumpIndex': gpio_config.get('pumpIndex', 0),
        'zoneCount': gpio_config.get('zoneCount', 8),
        'activeLow': gpio_config.get('activeLow', True),
        'pins': pins
    }
    
    print(f"Frontend GPIO config: {frontend_config}")
    return jsonify(frontend_config)

@app.route('/config/settings.cfg', methods=['GET'])
def get_settings_cfg():
    """Return settings as JSON for frontend compatibility"""
    settings = load_ini_settings()
    return jsonify(settings)

@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    from core.scheduler import scheduler
    zones = scheduler.get_schedule_data()
    
    # 🔍 CRITICAL DEBUG: Check what duration data we're sending to frontend
    print(f"🌐 API DEBUG - Sending schedule data to frontend:")
    for zone in zones:
        if zone.get('zone_id') == 1:
            print(f"  🎯 Zone {zone.get('zone_id')}:", {
                'mode': zone.get('mode'),
                'duration': zone.get('times', [{}])[0].get('duration') if zone.get('times') else None,
                'period': zone.get('period'),
                'cycles': zone.get('cycles'),
                'times_array': zone.get('times')
            })
    
    return jsonify(zones)

@app.route('/api/schedule', methods=['POST'])
def save_schedule():
    data = request.json
    
    from core.scheduler import scheduler
    result = scheduler.save_schedule_data(data)
    
    if result['status'] == 'success':
        return jsonify(result)
    else:
        status_code = 400 if 'validation' in result.get('message', '').lower() else 500
        return jsonify(result), status_code

@app.route('/api/resolve_times', methods=['POST'])
def resolve_times():
    data = request.json
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid data'}), 400
    codes = data.get('codes', [])
    date = data.get('date')
    lat = data.get('lat')
    lon = data.get('lon')
    tz = data.get('timezone')  # Optionally allow override from frontend

    # If lat/lon or timezone not provided, try to load from settings.cfg
    if (lat is None or lon is None or not tz) and os.path.exists(SETTINGS_PATH):
        settings = load_ini_settings()
        # Check for new format first (gps_lat, gps_lon)
        if settings.get('gps_lat') is not None and settings.get('gps_lon') is not None:
            lat = settings.get('gps_lat')
            lon = settings.get('gps_lon')
        # Fallback to old format (coords array)
        else:
            coords = settings.get('coords')
            if coords and len(coords) == 2:
                lon, lat = coords[0], coords[1]
        if not tz:
            tz = settings.get('timezone', 'UTC')

    if not (codes and date and lat is not None and lon is not None and tz):
        return jsonify({'error': 'Missing data'}), 400

    city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
    dt = datetime.fromisoformat(date)
    s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)

    resolved = []
    for code in codes:
        base = None
        offset = timedelta()
        if code.startswith('SUNRISE'):
            base = s['sunrise']
            offset = parse_offset(code, 'SUNRISE')
        elif code.startswith('SUNSET'):
            base = s['sunset']
            offset = parse_offset(code, 'SUNSET')
        elif code.startswith('ZENITH'):
            base = s['noon']
            offset = parse_offset(code, 'ZENITH')
        elif code.isdigit() and len(code) == 4:
            # Legacy HHMM format
            h, m = int(code[:2]), int(code[2:])
            base = dt.replace(hour=h, minute=m, second=0, tzinfo=pytz.timezone(tz))
        elif ':' in code and len(code) == 5:
            # New HH:MM format
            try:
                h, m = map(int, code.split(':'))
                base = dt.replace(hour=h, minute=m, second=0, tzinfo=pytz.timezone(tz))
            except ValueError:
                pass
        if base:
            resolved_time = (base + offset).strftime('%H:%M')
            resolved.append(resolved_time)
        else:
            resolved.append('N/A')
    return jsonify(resolved)

@app.route('/api/locations', methods=['POST'])
def save_locations():
    data = request.json
    
    if not data:
        log_event(locations_logger, 'WARN', f'Locations save failed - invalid data')
        return jsonify({'error': 'Invalid locations data'}), 400
    
    # Convert array format from frontend to object format for storage
    locations_object = {}
    for location in data:
        location_id = location.get('location_id')
        if location_id:
            # Remove location_id from the data since it's now the key
            location_copy = location.copy()
            del location_copy['location_id']
            locations_object[str(location_id)] = location_copy
    
    if save_json_file(LOCATIONS_JSON_PATH, locations_object):
        log_event(locations_logger, 'INFO', f'Locations saved', location_count=len(locations_object))
        return jsonify({'status': 'success'})
    else:
        log_event(error_logger, 'ERROR', f'Locations save failed - save error', location_count=len(locations_object))
        return jsonify({'error': 'Failed to save locations'}), 500

@app.route('/api/locations', methods=['GET'])
def get_locations():
    data = load_json_file(LOCATIONS_JSON_PATH, {})
    # Convert object format to array format for frontend compatibility
    locations_array = []
    for location_id, location_data in data.items():
        location_data['location_id'] = int(location_id)
        locations_array.append(location_data)
    return jsonify(locations_array)

@app.route('/api/locations/<int:location_id>', methods=['DELETE'])
def delete_location(location_id):
    try:
        # Get location info before deletion for logging
        locations_data = load_json_file(LOCATIONS_JSON_PATH, {})
        location_info = locations_data.get(str(location_id), {})
        
        if remove_from_json_object(LOCATIONS_JSON_PATH, str(location_id)):
            log_event(locations_logger, 'INFO', f'Location deleted', 
                     location_id=location_id, 
                     name=location_info.get('name', ''),
                     zones=location_info.get('zones', []))
            return jsonify({'status': 'success', 'message': f'Location {location_id} deleted'})
        else:
            log_event(locations_logger, 'WARN', f'Location deletion failed - not found', location_id=location_id)
            return jsonify({'error': 'Location not found'}), 404
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Location deletion exception', location_id=location_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/library-files', methods=['GET'])
def list_library_files():
    from core.library import get_library_files
    files = get_library_files()
    return jsonify(files)

@app.route('/library/<path:filename>')
def get_library_file(filename):
    return send_from_directory('library', filename)

@app.route('/api/library/<path:filename>/<int:plant_id>', methods=['GET'])
def get_library_plant(filename, plant_id):
    from core.library import get_plant_from_library
    plant = get_plant_from_library(filename, plant_id)
    
    if not plant:
        return jsonify({'error': 'Plant not found'}), 404
    
    return jsonify(plant)

@app.route('/api/library/custom/add', methods=['POST'])
def add_to_custom_library():
    from core.library import add_plant_to_custom_library
    
    try:
        plant_data = request.json
        
        if not plant_data:
            log_event(user_logger, 'WARN', f'Custom plant addition failed - invalid data')
            return jsonify({'error': 'Invalid plant data'}), 400
        
        result = add_plant_to_custom_library(plant_data)
        
        if 'error' in result:
            return jsonify(result), 500
        else:
            return jsonify(result)
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant addition exception', error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/library/custom/update/<int:plant_id>', methods=['PUT'])
def update_custom_plant(plant_id):
    from core.library import update_plant_in_custom_library
    
    try:
        plant_data = request.json
        
        if not plant_data:
            log_event(user_logger, 'WARN', f'Custom plant update failed - invalid data', plant_id=plant_id)
            return jsonify({'error': 'Invalid plant data'}), 400
        
        result = update_plant_in_custom_library(plant_id, plant_data)
        
        if 'error' in result:
            return jsonify(result), 500
        else:
            return jsonify(result)
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant update exception', plant_id=plant_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/library/custom/delete/<int:plant_id>', methods=['DELETE'])
def delete_custom_plant(plant_id):
    from core.library import delete_plant_from_custom_library
    
    try:
        result = delete_plant_from_custom_library(plant_id)
        
        if 'error' in result:
            log_event(user_logger, 'WARN', f'Custom plant deletion failed', plant_id=plant_id, error=result['error'])
            return jsonify(result), 500
        else:
            log_event(user_logger, 'INFO', f'Custom plant deleted', plant_id=plant_id)
            return jsonify(result)
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant deletion exception', plant_id=plant_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/library/custom.json', methods=['POST'])
def save_custom_library():
    from core.library import save_custom_library
    
    try:
        library_data = request.json
        
        if not library_data:
            return jsonify({'error': 'Invalid library data'}), 400
        
        result = save_custom_library(library_data)
        
        if 'error' in result:
            return jsonify(result), 500
        else:
            return jsonify(result)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/map/save', methods=['POST'])
def save_map():
    data = request.json  # Single plant assignment
    
    if not data:
        log_event(plants_logger, 'WARN', f'Plant assignment failed - invalid data')
        return jsonify({"error": "Invalid plant data"}), 400
    
    # Use PlantManager to add plant instance
    success, message, instance_id = plant_manager.add_plant_instance(data)
    
    if success:
        # Trigger smart duration refresh for the zone if it's in smart mode
        zone_id = data.get('zone_id')
        # Smart duration refresh is now handled by PlantManager._trigger_zone_smart_refresh()
        # No need for duplicate API-level refresh
        
        return jsonify({"status": "success", "instance_id": instance_id})
    else:
        log_event(error_logger, 'ERROR', f'Plant assignment failed', 
                 plant_id=data.get('plant_id'), error=message)
        return jsonify({"error": message}), 500

@app.route('/api/map', methods=['GET'])
def get_map():
    # Reload data from file to ensure fresh data
    plant_manager.reload_data()
    data = plant_manager.get_plant_instances()
    return jsonify(data)

@app.route('/api/map/<instance_id>/reassign', methods=['POST'])
def reassign_plant(instance_id):
    """Reassign a plant instance to a new location and optionally a new zone"""
    try:
        data = request.json
        location_id = data.get('location_id')
        zone_id = data.get('zone_id')  # Optional zone_id parameter
        
        if location_id is None:
            log_event(plants_logger, 'WARN', f'Plant reassignment failed - missing location_id', instance_id=instance_id)
            return jsonify({'error': 'location_id is required'}), 400
        
        # Use PlantManager to reassign plant (now supports zone_id too)
        success, message = plant_manager.reassign_plant(instance_id, location_id, zone_id)
        
        if success:
            # Smart duration refresh is now handled by PlantManager.reassign_plant()
            # No need for duplicate API-level refresh
            
            return jsonify({'status': 'success', 'message': message})
        else:
            log_event(error_logger, 'ERROR', f'Plant reassignment failed', 
                     instance_id=instance_id, error=message)
            return jsonify({'error': message}), 404 if 'not found' in message.lower() else 500
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Plant reassignment exception', 
                 instance_id=instance_id, 
                 error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/map/<instance_id>', methods=['PUT'])
def update_plant_instance(instance_id):
    """Update a plant instance with new data"""
    try:
        data = request.json
        
        if not data:
            log_event(plants_logger, 'WARN', f'Plant instance update failed - invalid data', instance_id=instance_id)
            return jsonify({'error': 'Invalid update data'}), 400
        
        # Use PlantManager to update plant instance
        success, message = plant_manager.update_plant_instance(instance_id, data)
        
        if success:
            return jsonify({'status': 'success', 'message': message})
        else:
            log_event(error_logger, 'ERROR', f'Plant instance update failed', 
                     instance_id=instance_id, error=message)
            return jsonify({'error': message}), 404 if 'not found' in message.lower() else 500
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Plant instance update exception', 
                 instance_id=instance_id, 
                 error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/map/<instance_id>', methods=['DELETE'])
def delete_plant_instance(instance_id):
    try:
        # Reload data to ensure fresh plant data
        plant_manager.reload_data()
        # Get the zone from the plant data BEFORE deletion
        plant_data = plant_manager.get_plant_instances().get(instance_id, {})
        zone_id = plant_data.get('zone_id')
        
        print(f"API: Plant {instance_id} is in zone {zone_id}, proceeding with deletion")
        
        # Use PlantManager to delete plant instance
        success, message = plant_manager.delete_plant_instance(instance_id)
        
        if success:
            print(f"API: Plant {instance_id} deleted successfully")
            # Smart duration refresh is now handled by PlantManager.delete_plant_instance()
            # No need for duplicate API-level refresh
            
            return jsonify({'status': 'success', 'message': message})
        else:
            print(f"API: Plant deletion failed: {message}")
            log_event(plants_logger, 'WARN', f'Plant deletion failed', instance_id=instance_id, error=message)
            return jsonify({'error': message}), 404 if 'not found' in message.lower() else 500
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Plant deletion exception', instance_id=instance_id, error=str(e))
        return jsonify({'error': str(e)}), 500

# Smart Placement API Endpoints

@app.route('/api/smart/analyze-placement', methods=['POST'])
def analyze_plant_placement():
    """Analyze plant placement and provide smart recommendations"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Plant data required"}), 400
        
        # Debug logging
        log_event(plants_logger, 'INFO', 'Plant placement analysis requested', 
                 plant_id=data.get('plant_id'), 
                 library_book=data.get('library_book'),
                 common_name=data.get('common_name'))
        
        # CRITICAL: Reload PlantManager data to ensure we have the latest zone information
        # This is essential after zone creation/modification
        plant_manager.reload_data()
        log_event(plants_logger, 'DEBUG', 'PlantManager data reloaded before analysis')
        
        # Use PlantManager to analyze placement
        analysis = plant_manager.analyze_plant_placement(data)
        
        # Debug logging for the result
        if analysis.get('plant_data'):
            log_event(plants_logger, 'INFO', 'Plant placement analysis completed', 
                     plant_name=analysis.get('plant_data', {}).get('common_name'),
                     has_compatible_zones=analysis.get('has_compatible_zones'),
                     optimal_zone=analysis.get('optimal_zone'))
        else:
            log_event(plants_logger, 'WARN', 'Plant placement analysis failed - no plant data found', 
                     plant_id=data.get('plant_id'), 
                     library_book=data.get('library_book'))
        
        if analysis.get('success'):
            return jsonify(analysis)
        else:
            return jsonify(analysis), 400
            
    except Exception as e:
        log_event(error_logger, 'ERROR', 'Plant placement analysis failed', error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/smart/zone-recommendations', methods=['POST'])
def get_zone_recommendations():
    """Get zone recommendations for a plant"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Plant data required"}), 400
        
        # CRITICAL: Reload PlantManager data to ensure we have the latest zone information
        plant_manager.reload_data()
        
        # Use PlantManager to get recommendations
        recommendations = plant_manager.get_zone_recommendations(data)
        
        return jsonify({
            'success': True,
            'recommendations': recommendations,
            'count': len(recommendations)
        })
        
    except Exception as e:
        log_event(error_logger, 'ERROR', 'Zone recommendations failed', error=str(e))
        return jsonify({'error': str(e)}), 500

# Moved to plant_manager.py - /api/smart/validate-compatibility endpoint

@app.route('/api/smart/no-compatible-zone', methods=['POST'])
def handle_no_compatible_zone():
    """Handle the case where no compatible zone is found"""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Plant data required"}), 400
        
        # CRITICAL: Reload PlantManager data to ensure we have the latest zone information
        plant_manager.reload_data()
        
        # Use PlantManager to handle no compatible zone
        result = plant_manager.handle_no_compatible_zone(data)
        
        return jsonify(result)
        
    except Exception as e:
        log_event(error_logger, 'ERROR', 'No compatible zone handling failed', error=str(e))
        return jsonify({'error': str(e)}), 500

# GPIO Control Endpoints
@app.route('/api/gpio/activate/<int:channel>', methods=['POST'])
def activate_gpio_channel(channel):
    """Activate a specific GPIO channel"""
    try:
        # Import GPIO functions for testing
        from core.gpio import activate_zone, cleanup_gpio
        
        # Activate the zone
        activate_zone(channel)
        
        # Brief delay to allow hardware to respond
        time.sleep(0.1)
        
        # Clean up GPIO state to allow repeated tests
        cleanup_gpio()
        
        log_event(watering_logger, 'INFO', f'Zone activated', zone_id=channel)
        return jsonify({'status': 'success', 'message': f'Channel {channel} activated and cleaned up'})
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Zone activation failed', zone_id=channel, error=str(e))
        return jsonify({'status': 'error', 'message': f'Failed to activate channel {channel}: {str(e)}'}), 400

@app.route('/api/gpio/deactivate/<int:channel>', methods=['POST'])
def deactivate_gpio_channel(channel):
    """Deactivate a specific GPIO channel"""
    try:
        # Import GPIO functions for testing
        from core.gpio import deactivate_zone, cleanup_gpio
        
        # Deactivate the zone
        deactivate_zone(channel)
        
        # Brief delay to allow hardware to respond
        time.sleep(0.1)
        
        # Clean up GPIO state to allow repeated tests
        cleanup_gpio()
        
        log_event(watering_logger, 'INFO', f'Zone deactivated', zone_id=channel)
        return jsonify({'status': 'success', 'message': f'Channel {channel} deactivated and cleaned up'})
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Zone deactivation failed', zone_id=channel, error=str(e))
        return jsonify({'status': 'error', 'message': f'Failed to deactivate channel {channel}: {str(e)}'}), 400

@app.route('/api/gpio/status/<int:channel>', methods=['GET'])
def get_gpio_channel_status(channel):
    """Get status of a specific GPIO channel"""
    try:
        from core.scheduler import scheduler
        from core.gpio import get_zone_state
        
        print(f"DEBUG: Getting status for channel {channel}")
        
        # Get the actual hardware state from GPIO
        hardware_active = get_zone_state(channel)
        print(f"DEBUG: Hardware active for channel {channel}: {hardware_active}")
        
        # Get scheduler state for additional info
        scheduler_state = scheduler.get_zone_status(channel)
        print(f"DEBUG: Scheduler state for channel {channel}: {scheduler_state}")
        
        response = {
            'active': hardware_active,  # Frontend expects 'active' field
            'remaining': scheduler_state.get('remaining', 0),
            'type': scheduler_state.get('type'),
            'channel': channel,
            'status': "HIGH" if hardware_active else "LOW"  # Keep for compatibility
        }
        
        print(f"DEBUG: Returning response for channel {channel}: {response}")
        return jsonify(response)
    except Exception as e:
        print(f"Error getting status for channel {channel}: {e}")
        return jsonify({
            'active': False,
            'remaining': 0,
            'type': None,
            'channel': channel,
            'status': "UNKNOWN"
        })

@app.route('/api/gpio/status', methods=['GET'])
def get_all_gpio_status():
    """Get status of all GPIO channels from actual hardware state"""
    try:
        from core.scheduler import scheduler
        from core.gpio import ZONE_PINS, get_zone_state
        
        status = {}
        all_zone_status = scheduler.get_all_zone_status()
        
        for zone_id, pin in ZONE_PINS.items():
            zone_state = all_zone_status.get(zone_id, {})
            # Read actual hardware state for indicator lights
            hardware_active = get_zone_state(zone_id)
            
            status[f'channel_{zone_id}'] = {
                'pin': pin,
                'status': "HIGH" if hardware_active else "LOW",
                'active': hardware_active,  # Use actual hardware state for indicator lights
                'scheduler_active': zone_state.get('active', False),  # Keep scheduler state for reference
                'type': zone_state.get('type'),
                'remaining': zone_state.get('remaining', 0),
                'end_time': zone_state.get('end_time').isoformat() if zone_state.get('end_time') else None
            }
        
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Manual Timer Endpoints
@app.route('/api/manual-timer/<int:zone_id>', methods=['POST', 'OPTIONS'])
def start_manual_timer(zone_id):
    """Start a manual timer for a specific zone through scheduler"""
    # Handle OPTIONS preflight request
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    print(f"DEBUG: Manual timer POST request received for zone {zone_id}")
    print(f"DEBUG: Request data: {request.get_json()}")
    
    try:
        data = request.get_json()
        if not data or 'duration' not in data:
            log_event(user_logger, 'WARN', f'Manual timer failed - missing duration', zone_id=zone_id)
            return jsonify({'error': 'Duration is required'}), 400
        
        duration = data['duration']
        if not isinstance(duration, int) or duration <= 0:
            log_event(user_logger, 'WARN', f'Manual timer failed - invalid duration', zone_id=zone_id, duration=duration)
            return jsonify({'error': 'Duration must be a positive integer'}), 400
        
        # Use scheduler to activate zone with timer - scheduler is primary controller
        try:
            from core.scheduler import scheduler
            success = scheduler.add_manual_timer(zone_id, duration)
            if not success:
                log_event(error_logger, 'ERROR', f'Manual timer failed - scheduler activation failed', zone_id=zone_id, duration=duration)
                return jsonify({'error': f'Failed to activate zone {zone_id}'}), 400
        except ImportError as e:
            print(f"API: Failed to import scheduler for manual timer: {e}")
            return jsonify({'error': 'Scheduler not available'}), 503
        except Exception as e:
            print(f"API: Scheduler error in manual timer: {e}")
            log_event(error_logger, 'ERROR', f'Manual timer failed - scheduler error', zone_id=zone_id, duration=duration, error=str(e))
            return jsonify({'error': f'Scheduler error: {str(e)}'}), 500
        
        log_event(user_logger, 'INFO', f'Manual timer started', zone_id=zone_id, duration=duration)
        return jsonify({
            'status': 'success', 
            'message': f'Manual timer started for zone {zone_id} for {duration} seconds'
        })
        
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Manual timer exception', zone_id=zone_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/manual-timer/<int:zone_id>', methods=['DELETE', 'OPTIONS'])
def stop_manual_timer(zone_id):
    """Stop a manual timer for a specific zone through scheduler"""
    # Handle OPTIONS preflight request
    if request.method == 'OPTIONS':
        return jsonify({'status': 'ok'}), 200
    
    print(f"DEBUG: Manual timer DELETE request received for zone {zone_id}")
    
    try:
        from core.scheduler import scheduler
        success = scheduler.remove_manual_timer(zone_id)
        if not success:
            log_event(error_logger, 'ERROR', f'Manual timer stop failed', zone_id=zone_id)
            return jsonify({'error': f'Failed to stop zone {zone_id}'}), 400
        
        log_event(user_logger, 'INFO', f'Manual timer stopped', zone_id=zone_id)
        return jsonify({
            'status': 'success', 
            'message': f'Manual timer stopped for zone {zone_id}'
        })
        
    except ImportError as e:
        print(f"API: Failed to import scheduler for manual timer stop: {e}")
        return jsonify({'error': 'Scheduler not available'}), 503
    except Exception as e:
        print(f"API: Scheduler error in manual timer stop: {e}")
        log_event(error_logger, 'ERROR', f'Manual timer stop exception', zone_id=zone_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/zones/status', methods=['GET'])
def get_zone_status():
    """Get hardware status of all zones directly from GPIO (lock-free)"""
    try:
        print("API: Starting zone status request")
        
        # Try to import scheduler with better error handling
        try:
            from core.scheduler import scheduler
            print("API: Scheduler imported successfully")
        except ImportError as e:
            print(f"API: Failed to import scheduler: {e}")
            # Return empty status instead of error
            return jsonify({})
        except Exception as e:
            print(f"API: Unexpected error importing scheduler: {e}")
            # Return empty status instead of error
            return jsonify({})
        
        # Check if scheduler is properly initialized
        if not hasattr(scheduler, 'get_all_zone_status'):
            print("API: Scheduler not properly initialized - missing get_all_zone_status method")
            return jsonify({})
        
        # Get comprehensive status from scheduler (includes hardware state and remaining time)
        try:
            scheduler_status = scheduler.get_all_zone_status()
            print(f"API: Got scheduler status: {scheduler_status}")
        except Exception as e:
            print(f"API: Error getting scheduler status: {e}")
            # Return empty status instead of error
            return jsonify({})
        
        # Convert to the expected format
        status = {}
        for zone_id, zone_data in scheduler_status.items():
            status[str(zone_id)] = {
                'active': zone_data.get('active', False),
                'remaining': zone_data.get('remaining', 0),
                'type': zone_data.get('type', None)
            }
        
        print(f"API: Returning zone status: {status}")
        return jsonify(status)
    except Exception as e:
        import traceback
        print(f"API: Unexpected error in get_zone_status: {e}")
        print(f"API: Traceback: {traceback.format_exc()}")
        # Return empty status instead of error to prevent frontend crashes
        return jsonify({})

@app.route('/api/zones/<int:zone_id>/status', methods=['GET'])
def get_single_zone_status(zone_id):
    """Get detailed status of a single zone from scheduler"""
    try:
        from core.scheduler import scheduler
        status = scheduler.get_zone_status(zone_id)
        return jsonify(status)
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Zone status query failed', zone_id=zone_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/emergency-stop', methods=['POST'])
def emergency_stop():
    """Emergency stop all zones through scheduler"""
    try:
        from core.scheduler import scheduler
        success = scheduler.emergency_stop_all_zones()
        if not success:
            log_event(error_logger, 'ERROR', 'Emergency stop failed')
            return jsonify({'error': 'Emergency stop failed'}), 500
        
        log_event(user_logger, 'WARN', 'Emergency stop executed')
        return jsonify({
            'status': 'success', 
            'message': 'All zones stopped'
        })
        
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Emergency stop exception', error=str(e))
        return jsonify({'error': str(e)}), 500

# New Incremental JSON Operations Endpoints
@app.route('/api/locations/add', methods=['POST'])
def add_location():
    """Add a new location to the locations array"""
    data = request.json
    if not data or 'location_id' not in data:
        log_event(locations_logger, 'WARN', f'Location creation failed - invalid data')
        return jsonify({'error': 'Invalid location data'}), 400
    
    if append_to_json_array(LOCATIONS_JSON_PATH, data, 'location_id'):
        log_event(locations_logger, 'INFO', f'Location created', 
                 location_id=data.get('location_id'), 
                 name=data.get('name', ''),
                 zones=data.get('zones', []))
        return jsonify({'status': 'success', 'message': 'Location added'})
    else:
        log_event(error_logger, 'ERROR', f'Location creation failed - save error', 
                 location_id=data.get('location_id'), 
                 name=data.get('name', ''))
        return jsonify({'error': 'Failed to add location'}), 500

@app.route('/api/locations/<int:location_id>', methods=['PUT'])
def update_location(location_id):
    """Update a specific location"""
    data = request.json
    if not data:
        log_event(locations_logger, 'WARN', f'Location update failed - invalid data', location_id=location_id)
        return jsonify({'error': 'Invalid location data'}), 400
    
    if update_json_array_item(LOCATIONS_JSON_PATH, location_id, data, 'location_id'):
        log_event(locations_logger, 'INFO', f'Location updated', 
                 location_id=location_id, 
                 name=data.get('name', ''),
                 zones=data.get('zones', []))
        return jsonify({'status': 'success', 'message': 'Location updated'})
    else:
        log_event(locations_logger, 'WARN', f'Location update failed - not found', location_id=location_id)
        return jsonify({'error': 'Location not found'}), 404

@app.route('/api/schedule/add', methods=['POST'])
def add_zone():
    """Add a new zone to the schedule"""
    data = request.json
    
    from core.scheduler import scheduler
    result = scheduler.add_zone_to_schedule(data)
    
    if result['status'] == 'success':
        return jsonify(result)
    else:
        return jsonify(result), 500

@app.route('/api/schedule/<int:zone_id>', methods=['PUT'])
def update_zone(zone_id):
    """Update a specific zone"""
    data = request.json
    
    from core.scheduler import scheduler
    result = scheduler.update_zone_in_schedule(zone_id, data)
    
    if result['status'] == 'success':
        return jsonify(result)
    else:
        status_code = 404 if 'not found' in result.get('message', '').lower() else 500
        return jsonify(result), status_code

@app.route('/api/schedule/<int:zone_id>', methods=['DELETE'])
def delete_zone(zone_id):
    """Delete a specific zone"""
    from core.scheduler import scheduler
    result = scheduler.delete_zone_from_schedule(zone_id)
    
    if result['status'] == 'success':
        return jsonify(result)
    else:
        status_code = 404 if 'not found' in result.get('message', '').lower() else 500
        return jsonify(result), status_code

# Health Alert Management Endpoints
@app.route('/api/health/alerts', methods=['GET'])
def get_health_alerts():
    """Get current health alerts and ignored status"""
    alerts_data = load_json_file(HEALTH_ALERTS_PATH, {
        'ignored_alerts': [],
        'last_check': None
    })
    return jsonify(alerts_data)

@app.route('/api/health/alerts/ignore', methods=['POST'])
def ignore_health_alert():
    """Ignore a specific health alert"""
    data = request.json
    alert_type = data.get('alert_type')
    alert_id = data.get('alert_id')
    
    if not alert_type or not alert_id:
        return jsonify({'error': 'alert_type and alert_id are required'}), 400
    
    alerts_data = load_json_file(HEALTH_ALERTS_PATH, {
        'ignored_alerts': [],
        'last_check': None
    })
    
    # Add to ignored alerts if not already there
    ignored_entry = {
        'alert_type': alert_type,
        'alert_id': alert_id,
        'ignored_at': datetime.now(tz).isoformat()
    }
    
    # Check if already ignored
    already_ignored = any(
        alert['alert_type'] == alert_type and alert['alert_id'] == alert_id
        for alert in alerts_data.get('ignored_alerts', [])
    )
    
    if not already_ignored:
        alerts_data.setdefault('ignored_alerts', []).append(ignored_entry)
        if save_json_file(HEALTH_ALERTS_PATH, alerts_data):
            return jsonify({'status': 'success', 'message': 'Alert ignored'})
        else:
            return jsonify({'error': 'Failed to save ignored alert'}), 500
    else:
        return jsonify({'status': 'success', 'message': 'Alert already ignored'})

@app.route('/api/health/alerts/unignore', methods=['POST'])
def unignore_health_alert():
    """Unignore a specific health alert"""
    data = request.json
    alert_type = data.get('alert_type')
    alert_id = data.get('alert_id')
    
    if not alert_type or not alert_id:
        return jsonify({'error': 'alert_type and alert_id are required'}), 400
    
    alerts_data = load_json_file(HEALTH_ALERTS_PATH, {
        'ignored_alerts': [],
        'last_check': None
    })
    
    # Remove from ignored alerts
    original_count = len(alerts_data.get('ignored_alerts', []))
    alerts_data['ignored_alerts'] = [
        alert for alert in alerts_data.get('ignored_alerts', [])
        if not (alert['alert_type'] == alert_type and alert['alert_id'] == alert_id)
    ]
    
    if len(alerts_data['ignored_alerts']) < original_count:
        if save_json_file(HEALTH_ALERTS_PATH, alerts_data):
            return jsonify({'status': 'success', 'message': 'Alert unignored'})
        else:
            return jsonify({'error': 'Failed to save changes'}), 500
    else:
        return jsonify({'status': 'success', 'message': 'Alert was not ignored'})

# Logging API Endpoints
@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Get log entries with optional filtering"""
    log_file = request.args.get('file', 'system.log')
    level = request.args.get('level')
    category = request.args.get('category')
    limit = int(request.args.get('limit', 100))
    search = request.args.get('search')
    
    print(f"=== LOGS API CALLED ===")
    print(f"file={log_file}, level={level}, category={category}, limit={limit}, search={search}")
    print(f"LOGS_DIR={LOGS_DIR}")
    print(f"LOGS_DIR exists: {os.path.exists(LOGS_DIR)}")
    
    # Handle "View All" option
    if log_file == 'all.log':
        print("Handling 'all.log' request")
        entries = get_all_log_entries(level, category, limit, search)
    else:
        print(f"Handling single file request: {log_file}")
        entries = get_log_entries(log_file, level, category, limit, search)
    
    print(f"Returning {len(entries)} log entries")
    print(f"=== END LOGS API ===")
    
    return jsonify({
        'entries': entries,
        'file': log_file,
        'filters': {
            'level': level,
            'category': category,
            'limit': limit,
            'search': search
        }
    })

@app.route('/api/logs/files', methods=['GET'])
def list_log_files():
    """List available log files"""
    try:
        log_files = []
        for log_file in glob.glob(os.path.join(LOGS_DIR, "*.log")):
            filename = os.path.basename(log_file)
            file_size = os.path.getsize(log_file)
            file_time = datetime.fromtimestamp(os.path.getmtime(log_file))
            
            log_files.append({
                'filename': filename,
                'size': file_size,
                'modified': file_time.isoformat(),
                'size_mb': round(file_size / (1024 * 1024), 2)
            })
        
        # Sort by modification time, newest first
        log_files.sort(key=lambda x: x['modified'], reverse=True)
        return jsonify({'files': log_files})
    except Exception as e:
        error_logger.error(f"Error listing log files: {e}")
        return jsonify({'error': 'Failed to list log files'}), 500

@app.route('/api/logs/download/<path:filename>', methods=['GET'])
def download_log_file(filename):
    """Download a specific log file"""
    try:
        log_path = os.path.join(LOGS_DIR, filename)
        if not os.path.exists(log_path):
            return jsonify({'error': 'Log file not found'}), 404
        
        return send_from_directory(LOGS_DIR, filename, as_attachment=True)
    except Exception as e:
        error_logger.error(f"Error downloading log file {filename}: {e}")
        return jsonify({'error': 'Failed to download log file'}), 500

@app.route('/api/logs/clear', methods=['POST'])
def clear_old_logs():
    """Clear old log files"""
    try:
        data = request.json or {}
        days_to_keep = data.get('days', 30)
        
        cleanup_old_logs(days_to_keep)
        return jsonify({
            'status': 'success',
            'message': f'Cleaned up logs older than {days_to_keep} days'
        })
    except Exception as e:
        error_logger.error(f"Error clearing old logs: {e}")
        return jsonify({'error': 'Failed to clear old logs'}), 500

@app.route('/api/logs/clear-all', methods=['POST'])
def clear_all_logs():
    """Clear all log files completely"""
    try:
        logs_dir = os.path.join(os.path.dirname(__file__), 'logs')
        
        if not os.path.exists(logs_dir):
            return jsonify({
                'status': 'success',
                'message': 'No logs directory found'
            })
        
        # Get all log files
        log_files = [f for f in os.listdir(logs_dir) if f.endswith('.log')]
        
        if not log_files:
            return jsonify({
                'status': 'success',
                'message': 'No log files found to clear'
            })
        
        # Clear each log file
        cleared_count = 0
        for log_file in log_files:
            log_path = os.path.join(logs_dir, log_file)
            try:
                # Truncate the file to 0 bytes (clear content but keep file)
                with open(log_path, 'w') as f:
                    f.write('')
                cleared_count += 1
                print(f"Cleared log file: {log_file}")
            except Exception as e:
                print(f"Error clearing {log_file}: {e}")
        
        log_event(user_logger, 'INFO', f'All logs cleared manually - {cleared_count} files affected')
        
        return jsonify({
            'status': 'success',
            'message': f'Cleared all logs ({cleared_count} files)'
        })
    except Exception as e:
        error_logger.error(f"Error clearing all logs: {e}")
        return jsonify({'error': 'Failed to clear all logs'}), 500

# Scheduler Control Endpoints
@app.route('/api/scheduler/status', methods=['GET'])
def get_scheduler_status():
    """Get scheduler status"""
    try:
        from core.scheduler import scheduler
        return jsonify({
            'running': scheduler.running,
            'active_zones': list(scheduler.active_zones.keys()),
            'active_zone_count': len(scheduler.active_zones)
        })
    except Exception as e:
        error_logger.error(f"Error getting scheduler status: {e}")
        return jsonify({'error': 'Failed to get scheduler status'}), 500

@app.route('/api/scheduler/start', methods=['POST'])
def start_scheduler():
    """Start the scheduler"""
    try:
        from core.scheduler import scheduler
        scheduler.start()
        log_event(user_logger, 'INFO', 'Scheduler started manually')
        return jsonify({'status': 'success', 'message': 'Scheduler started'})
    except Exception as e:
        error_logger.error(f"Error starting scheduler: {e}")
        return jsonify({'error': 'Failed to start scheduler'}), 500

@app.route('/api/scheduler/stop', methods=['POST'])
def stop_scheduler():
    """Stop the scheduler"""
    try:
        from core.scheduler import scheduler
        scheduler.stop()
        log_event(user_logger, 'INFO', 'Scheduler stopped manually')
        return jsonify({'status': 'success', 'message': 'Scheduler stopped'})
    except Exception as e:
        error_logger.error(f"Error stopping scheduler: {e}")
        return jsonify({'error': 'Failed to stop scheduler'}), 500

@app.route('/api/scheduler/timers', methods=['GET'])
def get_active_timers():
    """Get status of active timers"""
    try:
        print("API: Starting active timers request")
        
        # Try to import scheduler with better error handling
        try:
            from core.scheduler import scheduler
            print("API: Scheduler imported successfully for timers")
        except ImportError as e:
            print(f"API: Failed to import scheduler: {e}")
            # Return empty timers instead of error
            return jsonify({'status': 'success', 'timers': {}})
        except Exception as e:
            print(f"API: Unexpected error importing scheduler: {e}")
            # Return empty timers instead of error
            return jsonify({'status': 'success', 'timers': {}})
        
        # Check if scheduler is properly initialized
        if not hasattr(scheduler, 'get_active_zones'):
            print("API: Scheduler not properly initialized - missing get_active_zones method")
            return jsonify({'status': 'success', 'timers': {}})
        
        # Check if scheduler is running
        print(f"API: Scheduler running: {scheduler.running}")
        print(f"API: Scheduler thread alive: {scheduler.thread.is_alive() if scheduler.thread else False}")
        
        try:
            active_zones = scheduler.get_active_zones()
            print(f"API: Got active zones: {active_zones}")
        except Exception as e:
            print(f"API: Error getting active zones: {e}")
            return jsonify({'status': 'success', 'timers': {}})
        
        timers = {}
        for zone_id, end_time in active_zones.items():
            try:
                remaining = scheduler.get_remaining_time(zone_id)
                timers[zone_id] = {
                    'end_time': end_time.isoformat(),
                    'remaining_seconds': remaining,
                    'active': True
                }
            except Exception as zone_error:
                print(f"API: Error processing zone {zone_id}: {zone_error}")
                # Continue with other zones even if one fails
                timers[zone_id] = {
                    'end_time': str(end_time),
                    'remaining_seconds': 0,
                    'active': True,
                    'error': str(zone_error)
                }
        
        print(f"API: Returning timers: {timers}")
        return jsonify({
            'status': 'success',
            'timers': timers
        })
    except Exception as e:
        import traceback
        print(f"API: Unexpected error in get_active_timers: {e}")
        print(f"API: Traceback: {traceback.format_exc()}")
        # Return empty timers instead of error to prevent frontend crashes
        return jsonify({'status': 'success', 'timers': {}})

# Backup and Restore Functions
def create_backup():
    """Create a complete backup of all configuration and data files"""
    try:
        # Create a temporary directory for the backup
        with tempfile.TemporaryDirectory() as temp_dir:
            backup_dir = os.path.join(temp_dir, 'waterme_backup')
            os.makedirs(backup_dir)
            
            # Define files to backup
            # Define backup file mapping
            from core.library import get_library_file_paths
            
            backup_files = {
                'config/settings.cfg': SETTINGS_PATH,
                'config/gpio.cfg': GPIO_PATH,
                'data/schedule.json': SCHEDULE_JSON_PATH,
                'data/locations.json': LOCATIONS_JSON_PATH,
                'data/map.json': MAP_JSON_PATH,
                'data/health_alerts.json': HEALTH_ALERTS_PATH,
                'data/logs.json': LOGS_JSON_PATH,
            }
            
            # Add library files to backup
            library_paths = get_library_file_paths()
            for filename, file_path in library_paths.items():
                backup_files[f'library/{filename}'] = file_path
            
            # Copy files to backup directory
            for backup_path, source_path in backup_files.items():
                if os.path.exists(source_path):
                    full_backup_path = os.path.join(backup_dir, backup_path)
                    os.makedirs(os.path.dirname(full_backup_path), exist_ok=True)
                    shutil.copy2(source_path, full_backup_path)
            
            # Create metadata file
            try:
                settings = load_ini_settings()
                timezone = settings.get('timezone', 'UTC')
                tz = pytz.timezone(timezone)
            except:
                tz = pytz.UTC
                
            metadata = {
                'backup_date': datetime.now(tz).isoformat(),
                'version': '1.0.0',
                'files_backed_up': list(backup_files.keys()),
                'system_info': {
                    'platform': os.name,
                    'python_version': '3.x'
                }
            }
            
            metadata_path = os.path.join(backup_dir, 'backup_metadata.json')
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2)
            
            # Create ZIP file
            zip_path = os.path.join(temp_dir, 'waterme_backup.zip')
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(backup_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, backup_dir)
                        zipf.write(file_path, arcname)
            
            # Read the ZIP file and return it
            with open(zip_path, 'rb') as f:
                return f.read()
                
    except Exception as e:
        error_logger.error(f"Error creating backup: {e}")
        raise

def restore_backup(backup_data):
    """Restore configuration and data from backup"""
    try:
        # Create a temporary directory for extraction
        with tempfile.TemporaryDirectory() as temp_dir:
            # Write backup data to temporary file
            backup_file = os.path.join(temp_dir, 'backup.zip')
            with open(backup_file, 'wb') as f:
                f.write(backup_data)
            
            # Extract backup
            extract_dir = os.path.join(temp_dir, 'extracted')
            with zipfile.ZipFile(backup_file, 'r') as zipf:
                zipf.extractall(extract_dir)
            
            # Verify backup metadata
            metadata_path = os.path.join(extract_dir, 'backup_metadata.json')
            if not os.path.exists(metadata_path):
                raise ValueError("Invalid backup: missing metadata file")
            
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            
            # Define restore mapping
            from core.library import get_library_file_paths
            
            restore_files = {
                'config/settings.cfg': SETTINGS_PATH,
                'config/gpio.cfg': GPIO_PATH,
                'data/schedule.json': SCHEDULE_JSON_PATH,
                'data/locations.json': LOCATIONS_JSON_PATH,
                'data/map.json': MAP_JSON_PATH,
                'data/health_alerts.json': HEALTH_ALERTS_PATH,
                'data/logs.json': LOGS_JSON_PATH,
            }
            
            # Add library files to restore
            library_paths = get_library_file_paths()
            for filename, file_path in library_paths.items():
                restore_files[f'library/{filename}'] = file_path
            
            # Restore files
            restored_files = []
            for backup_path, target_path in restore_files.items():
                source_path = os.path.join(extract_dir, backup_path)
                if os.path.exists(source_path):
                    # Ensure target directory exists
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    # Create backup of existing file
                    if os.path.exists(target_path):
                        backup_name = f"{target_path}.backup.{datetime.now(tz).strftime('%Y%m%d_%H%M%S')}"
                        shutil.copy2(target_path, backup_name)
                    # Restore file
                    shutil.copy2(source_path, target_path)
                    restored_files.append(backup_path)
            
            return {
                'status': 'success',
                'restored_files': restored_files,
                'backup_date': metadata.get('backup_date'),
                'version': metadata.get('version')
            }
            
    except Exception as e:
        error_logger.error(f"Error restoring backup: {e}")
        raise

@app.route('/api/backup/create', methods=['POST'])
def create_backup_endpoint():
    """Create a backup of all configuration and data"""
    try:
        print("DEBUG: Backup endpoint called")
        backup_data = create_backup()
        print(f"DEBUG: Backup data created, size: {len(backup_data)} bytes")
        
        # Generate filename with timestamp
        try:
            print("DEBUG: Loading settings for timezone")
            settings = load_ini_settings()
            timezone = settings.get('timezone', 'UTC')
            print(f"DEBUG: Using timezone: {timezone}")
            tz = pytz.timezone(timezone)
        except Exception as tz_error:
            print(f"DEBUG: Error loading timezone, using UTC: {tz_error}")
            tz = pytz.UTC
        
        timestamp = datetime.now(tz).strftime('%Y%m%d_%H%M%S')
        filename = f'waterme_backup_{timestamp}.zip'
        print(f"DEBUG: Generated filename: {filename}")
        
        print("DEBUG: Logging backup event")
        log_event(system_logger, 'INFO', 'System backup created', backup_file=filename)
        
        print("DEBUG: Creating send_file response")
        response = send_file(
            io.BytesIO(backup_data),
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename
        )
        print("DEBUG: Response created successfully")
        return response
    except Exception as e:
        print(f"DEBUG: Error in backup endpoint: {e}")
        import traceback
        traceback.print_exc()
        error_logger.error(f"Error creating backup: {e}")
        return jsonify({'error': 'Failed to create backup'}), 500

@app.route('/api/backup/restore', methods=['POST'])
def restore_backup_endpoint():
    """Restore configuration and data from backup"""
    try:
        if 'backup_file' not in request.files:
            return jsonify({'error': 'No backup file provided'}), 400
        
        backup_file = request.files['backup_file']
        if backup_file.filename == '':
            return jsonify({'error': 'No backup file selected'}), 400
        
        if not backup_file.filename.endswith('.zip'):
            return jsonify({'error': 'Invalid backup file format'}), 400
        
        # Read backup data
        backup_data = backup_file.read()
        
        # Restore backup
        result = restore_backup(backup_data)
        
        log_event(system_logger, 'INFO', 'System backup restored', 
                 restored_files=result['restored_files'],
                 backup_date=result['backup_date'])
        
        return jsonify(result)
    except Exception as e:
        error_logger.error(f"Error restoring backup: {e}")
        return jsonify({'error': f'Failed to restore backup: {str(e)}'}), 500

@app.route('/api/backup/info', methods=['GET'])
def get_backup_info():
    """Get information about backup functionality"""
    try:
        # Check which files exist and their sizes
        from core.library import get_library_file_paths
        
        backup_files = {
            'config/settings.cfg': SETTINGS_PATH,
            'config/gpio.cfg': GPIO_PATH,
            'data/schedule.json': SCHEDULE_JSON_PATH,
            'data/locations.json': LOCATIONS_JSON_PATH,
            'data/map.json': MAP_JSON_PATH,
            'data/health_alerts.json': HEALTH_ALERTS_PATH,
            'data/logs.json': LOGS_JSON_PATH,
        }
        
        # Add library files to backup info
        library_paths = get_library_file_paths()
        for filename, file_path in library_paths.items():
            backup_files[f'library/{filename}'] = file_path
        
        file_info = {}
        total_size = 0
        
        for backup_path, file_path in backup_files.items():
            if os.path.exists(file_path):
                size = os.path.getsize(file_path)
                modified = datetime.fromtimestamp(os.path.getmtime(file_path)).isoformat()
                file_info[backup_path] = {
                    'size': size,
                    'size_mb': round(size / (1024 * 1024), 2),
                    'modified': modified,
                    'exists': True
                }
                total_size += size
            else:
                file_info[backup_path] = {
                    'exists': False
                }
        
        return jsonify({
            'status': 'success',
            'files': file_info,
            'total_size': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2),
            'backup_version': '1.0.0'
        })
    except Exception as e:
        error_logger.error(f"Error getting backup info: {e}")
        return jsonify({'error': 'Failed to get backup info'}), 500

@app.route('/api/system/time', methods=['GET'])
def get_system_time():
    """Get current system time in configured timezone"""
    try:
        # Load settings to get timezone
        settings_file = os.path.join(os.path.dirname(__file__), 'config', 'settings.cfg')
        timezone = 'UTC'  # Default
        
        if os.path.exists(settings_file):
            config = configparser.ConfigParser()
            config.read(settings_file)
            if 'Garden' in config:
                timezone = config['Garden'].get('timezone', 'UTC')
        
        # Get current time in configured timezone
        import pytz
        from datetime import datetime
        
        tz = pytz.timezone(timezone)
        now = datetime.now(tz)
        
        # Format for display
        formatted_time = now.strftime('%b %d, %Y %H:%M:%S')
        
        return jsonify({
            'formatted_time': formatted_time,
            'timezone': timezone,
            'timestamp': now.isoformat()
        })
        
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Failed to get system time', error=str(e))
        return jsonify({'error': str(e)}), 500

# Start the scheduled watering system (scheduler handles GPIO initialization)
def start_watering_scheduler():
    try:
        from core.scheduler import scheduler
        scheduler.start()
        system_logger.info("Scheduled watering system started")
        
        # Trigger initial smart refresh after scheduler is fully loaded
        def trigger_initial_smart_refresh():
            import time
            time.sleep(3)  # Wait 3 seconds for everything to initialize
            try:
                print("API: Triggering initial smart refresh after scheduler start")
                scheduler.trigger_initial_smart_refresh()
            except Exception as e:
                print(f"API: Failed to trigger initial smart refresh: {e}")
        
        # Start the initial smart refresh in a background thread
        import threading
        initial_refresh_thread = threading.Thread(target=trigger_initial_smart_refresh, daemon=True)
        initial_refresh_thread.start()
        
    except Exception as e:
        system_logger.error(f"Failed to start scheduled watering system: {e}")

@app.route('/api/gpio/test/<int:zone_id>', methods=['POST'])
def test_gpio_direct(zone_id):
    """Test GPIO functionality directly without scheduler"""
    try:
        data = request.get_json() or {}
        duration = data.get('duration', 2)
        
        from core.gpio import test_gpio_direct
        success = test_gpio_direct(zone_id, duration)
        
        if success:
            log_event(user_logger, 'INFO', f'Direct GPIO test successful', zone_id=zone_id, duration=duration)
            return jsonify({
                'status': 'success',
                'message': f'GPIO test completed for zone {zone_id}'
            })
        else:
            log_event(error_logger, 'ERROR', f'Direct GPIO test failed', zone_id=zone_id)
            return jsonify({'error': f'GPIO test failed for zone {zone_id}'}), 500
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Direct GPIO test exception', zone_id=zone_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/gpio/status/detailed', methods=['GET'])
def get_gpio_status_detailed():
    """Get detailed GPIO status"""
    try:
        from core.gpio import get_gpio_status
        status = get_gpio_status()
        return jsonify(status)
    except Exception as e:
        log_event(error_logger, 'ERROR', f'GPIO status query failed', error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduler/test', methods=['GET'])
def test_scheduler():
    """Test if scheduler is running and show debug info"""
    try:
        print("API: Testing scheduler basic functionality")
        from core.scheduler import scheduler
        print(f"API: Scheduler running: {scheduler.running}")
        print(f"API: Scheduler thread alive: {scheduler.thread.is_alive() if scheduler.thread else False}")
        print(f"API: Active zones: {scheduler.active_zones}")
        print(f"API: Zone states: {scheduler.zone_states}")
        
        return jsonify({
            'scheduler_running': scheduler.running,
            'active_zones': scheduler.active_zones,
            'zone_states': scheduler.zone_states,
            'thread_alive': scheduler.thread.is_alive() if scheduler.thread else False,
            'current_time': datetime.now(tz).isoformat()
        })
    except Exception as e:
        import traceback
        print(f"API: Scheduler test failed: {e}")
        print(f"API: Traceback: {traceback.format_exc()}")
        return jsonify({
            'error': str(e),
            'scheduler_running': False,
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/gpio/manual-timer/<int:zone_id>', methods=['POST'])
def start_direct_manual_timer(zone_id):
    """Start a manual timer using direct GPIO control with scheduler integration"""
    try:
        data = request.get_json() or {}
        duration = data.get('duration', 2)
        
        if not isinstance(duration, int) or duration <= 0:
            log_event(user_logger, 'WARN', f'Direct manual timer failed - invalid duration', zone_id=zone_id)
            return jsonify({'error': 'Duration must be a positive integer'}), 400
        
        # Use scheduler to activate zone with timer - scheduler is primary controller
        try:
            from core.scheduler import scheduler
            success = scheduler.add_manual_timer(zone_id, duration)
            if not success:
                log_event(error_logger, 'ERROR', f'Direct manual timer failed - scheduler activation failed', zone_id=zone_id, duration=duration)
                return jsonify({'error': f'Failed to activate zone {zone_id}'}), 400
        except Exception as e:
            log_event(error_logger, 'ERROR', f'Direct manual timer failed - scheduler error', zone_id=zone_id, duration=duration, error=str(e))
            return jsonify({'error': f'Scheduler error: {str(e)}'}), 500
        
        log_event(user_logger, 'INFO', f'Direct manual timer started', zone_id=zone_id, duration=duration)
        return jsonify({
            'status': 'success', 
            'message': f'Direct manual timer started for zone {zone_id} for {duration} seconds'
        })
        
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Direct manual timer exception', zone_id=zone_id, error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduler/calculate-duration/<int:zone_id>', methods=['POST'])
def calculate_zone_duration(zone_id):
    """Calculate and update optimal watering duration for a zone using scheduler"""
    try:
        print(f"Starting duration calculation for zone {zone_id}")
        
        # Import the scheduler
        from core.scheduler import scheduler
        print("Scheduler imported successfully")
        
        # Calculate and update the zone duration
        result = scheduler.calculate_and_update_zone_duration(zone_id)
        print(f"Duration calculation result: {result}")
        
        return jsonify(result)
        
    except ImportError as e:
        print(f"Import error in calculate_zone_duration: {e}")
        return jsonify({
            'success': False,
            'error': f'Import error: {str(e)}',
            'calculated_duration': '00:20:00'  # Default 20 minutes
        }), 500
    except Exception as e:
        import traceback
        print(f"Error calculating zone duration: {e}")
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Failed to calculate duration: {str(e)}',
            'calculated_duration': '00:20:00'  # Default 20 minutes
        }), 500

@app.route('/api/scheduler/refresh-smart-durations', methods=['POST'])
def refresh_all_smart_durations():
    """Refresh durations for all zones in smart mode"""
    try:
        # Import the scheduler
        from core.scheduler import scheduler
        
        # Refresh all smart durations
        result = scheduler.refresh_all_smart_durations()
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error refreshing smart durations: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to refresh smart durations: {str(e)}',
            'zones_updated': 0,
            'total_zones_checked': 0,
            'results': {}
        }), 500

@app.route('/api/scheduler/refresh-zone-duration/<int:zone_id>', methods=['POST'])
def refresh_zone_duration(zone_id):
    """Refresh smart duration for a specific zone (triggered by plant changes)"""
    try:
        # Import the scheduler
        from core.scheduler import scheduler
        
        # Refresh duration for the specific zone
        result = scheduler.calculate_and_update_zone_duration(zone_id)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error refreshing zone duration: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to refresh zone duration: {str(e)}',
            'calculated_duration': '00:20:00'  # Default 20 minutes
        }), 500

@app.route('/api/debug/plant-map', methods=['GET'])
def debug_plant_map():
    """Debug endpoint to check plant map structure"""
    try:
        from core.plant_manager import plant_manager
        # Reload data to ensure fresh data
        plant_manager.reload_data()
        debug_info = plant_manager.debug_plant_map()
        return jsonify(debug_info)
    except Exception as e:
        return jsonify({
            'error': f'Failed to debug plant map: {str(e)}'
        }), 500

@app.route('/api/debug/zone-plants/<int:zone_id>', methods=['GET'])
def debug_zone_plants(zone_id):
    """Debug endpoint to check plants in a specific zone"""
    try:
        from core.plant_manager import plant_manager
        # Reload data to ensure fresh data
        plant_manager.reload_data()
        zone_plants = plant_manager.get_zone_plants(zone_id)
        zone_mode = plant_manager._get_zone_mode(zone_id)
        return jsonify({
            'zone_id': zone_id,
            'zone_mode': zone_mode,
            'plant_count': len(zone_plants),
            'plants': zone_plants
        })
    except Exception as e:
        return jsonify({
            'error': f'Failed to debug zone plants: {str(e)}'
        }), 500

@app.route('/api/debug/test-plant-manager', methods=['GET'])
def test_plant_manager():
    """Test endpoint to check if plant manager is working"""
    try:
        from core.plant_manager import plant_manager
        # Reload data to ensure fresh data
        plant_manager.reload_data()
        debug_info = plant_manager.debug_plant_map()
        return jsonify({
            'success': True,
            'plant_manager_loaded': True,
            'debug_info': debug_info
        })
    except Exception as e:
        import traceback
        return jsonify({
            'success': False,
            'error': f'Plant manager test failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/debug/test-scheduler', methods=['GET'])
def debug_test_scheduler():
    """Test endpoint to check if scheduler is working"""
    try:
        print("API: Testing scheduler import")
        from core.scheduler import scheduler
        print("API: Scheduler imported successfully")
        
        # Test basic scheduler methods
        print("API: Testing scheduler methods")
        status = scheduler.get_all_zone_status()
        active_zones = scheduler.get_active_zones()
        
        return jsonify({
            'success': True,
            'scheduler_loaded': True,
            'zone_status_count': len(status),
            'active_zones_count': len(active_zones),
            'sample_status': dict(list(status.items())[:2]) if status else {},
            'active_zones': active_zones
        })
    except Exception as e:
        import traceback
        print(f"API: Scheduler test failed: {e}")
        print(f"API: Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Scheduler test failed: {str(e)}',
            'traceback': traceback.format_exc()
        }), 500

@app.route('/api/scheduler/cleanup-schedule', methods=['POST'])
def cleanup_schedule():
    """Manually trigger cleanup of schedule.json to remove UI fields and purge disabled zones"""
    try:
        from core.scheduler import scheduler
        success = scheduler.cleanup_schedule_file()
        if success:
            return jsonify({'status': 'success', 'message': 'Schedule cleanup completed'})
        else:
            return jsonify({'status': 'error', 'message': 'Schedule cleanup failed'}), 500
    except Exception as e:
        return jsonify({'status': 'error', 'message': f'Cleanup failed: {str(e)}'}), 500

@app.route('/api/scheduler/trigger-initial-refresh', methods=['POST'])
def trigger_initial_smart_refresh():
    """Trigger initial smart duration refresh after scheduler is fully loaded"""
    try:
        print("API: Triggering initial smart refresh")
        from core.scheduler import scheduler
        scheduler.trigger_initial_smart_refresh()
        return jsonify({
            'success': True,
            'message': 'Initial smart refresh triggered'
        })
    except Exception as e:
        import traceback
        print(f"API: Failed to trigger initial smart refresh: {e}")
        print(f"API: Traceback: {traceback.format_exc()}")
        return jsonify({
            'success': False,
            'error': f'Failed to trigger initial smart refresh: {str(e)}'
        }), 500

@app.route('/api/scheduler/update-zone-mode', methods=['POST'])
def update_zone_mode():
    """Update zone mode and trigger smart duration calculation if converting to smart mode"""
    try:
        data = request.get_json()
        zone_id = data.get('zone_id')
        new_mode = data.get('new_mode') or data.get('mode')  # Support both field names
        old_mode = data.get('old_mode')
        purge_config = data.get('purge_config', False)
        
        if not zone_id or not new_mode:
            return jsonify({
                'success': False,
                'error': 'Missing zone_id or new_mode'
            }), 400
        
        # Import the scheduler
        from core.scheduler import scheduler
        
        # Update zone mode and trigger smart calculation if needed
        success = scheduler.update_zone_mode(zone_id, new_mode, old_mode, purge_config)
        
        if success:
            return jsonify({
                'success': True,
                'message': f'Zone {zone_id} mode updated to {new_mode}'
            })
        else:
            return jsonify({
                'success': False,
                'error': f'Failed to update zone {zone_id} mode'
            }), 500
        
    except Exception as e:
        print(f"Error updating zone mode: {e}")
        return jsonify({
            'success': False,
            'error': f'Failed to update zone mode: {str(e)}'
        }), 500

@app.route('/api/logs/event', methods=['POST'])
def log_event_from_frontend():
    """Log an event from the frontend (e.g., red light errors)"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        event_type = data.get('event_type', 'unknown')
        zone_id = data.get('zone_id')
        message = data.get('message', '')
        timestamp = data.get('timestamp')
        
        # Determine which logger to use based on event type
        if event_type == 'red_light_error':
            logger = error_logger
            level = 'ERROR'
        elif event_type == 'zone_status_change':
            logger = watering_logger
            level = 'INFO'
        elif event_type == 'manual_timer':
            logger = user_logger
            level = 'INFO'
        else:
            logger = system_logger
            level = 'INFO'
        
        # Build log message with context
        log_message = message
        if zone_id:
            log_message = f"Zone {zone_id}: {message}"
        
        # Add additional context if available
        context_parts = []
        if data.get('expected_state'):
            context_parts.append(f"expected={data['expected_state']}")
        if data.get('actual_state'):
            context_parts.append(f"actual={data['actual_state']}")
        if data.get('duration_seconds'):
            context_parts.append(f"duration={data['duration_seconds']}s")
        if data.get('expected_type'):
            context_parts.append(f"expected_type={data['expected_type']}")
        if data.get('actual_type'):
            context_parts.append(f"actual_type={data['actual_type']}")
        
        if context_parts:
            log_message += f" | {' '.join(context_parts)}"
        
        # Log the event
        log_event(logger, level, log_message, 
                 event_type=event_type,
                 zone_id=zone_id,
                 timestamp=timestamp)
        
        return jsonify({'status': 'success', 'message': 'Event logged successfully'})
        
    except Exception as e:
        error_logger.error(f"Error logging frontend event: {e}")
        return jsonify({'error': 'Failed to log event'}), 500

if __name__ == '__main__':
    start_watering_scheduler()
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False) 