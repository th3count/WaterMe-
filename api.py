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

# Conditional GPIO import for development vs production
try:
    import RPi.GPIO as GPIO
    GPIO_AVAILABLE = True
except ImportError:
    print("RPi.GPIO not available - running in development mode")
    GPIO_AVAILABLE = False
    # Create a mock GPIO module for development
    class MockGPIO:
        BCM = "BCM"
        OUT = "OUT"
        LOW = False
        HIGH = True
        
        @staticmethod
        def setmode(mode):
            pass
            
        @staticmethod
        def setwarnings(warnings):
            pass
            
        @staticmethod
        def setup(pin, mode):
            pass
            
        @staticmethod
        def output(pin, state):
            print(f"Mock GPIO: Pin {pin} set to {state}")
            
        @staticmethod
        def input(pin):
            return False
    
    GPIO = MockGPIO()

app = Flask(__name__)
CORS(app)

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
    
    # Check for unique pins
    if len(set(pins)) != len(pins):
        errors.append('Each zone must use a unique GPIO pin')
    
    # Validate pin numbers
    valid_pins = list(range(2, 28))  # GPIO 2-27
    for i, pin in enumerate(pins):
        if not isinstance(pin, int) or pin not in valid_pins:
            errors.append(f'Zone {i+1}: Invalid GPIO pin {pin} (must be 2-27)')
    
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
        if mode not in ['manual', 'disabled']:
            errors.append(f'Zone {i+1}: Invalid mode (must be manual or disabled)')
        
        # Period validation
        period = zone.get('period', '')
        if period not in ['D', 'W', 'M']:
            errors.append(f'Zone {i+1}: Invalid period (must be D, W, or M)')
        
        # Time validation - only times array is used
        times = zone.get('times', [])
        if not times or len(times) == 0:
            errors.append(f'Zone {i+1}: Must have at least one time in times array')
        
        # Validate time codes
        time_codes = []
        for t in times:
            if t.get('value'):
                time_codes.append(t['value'])
        
        for code in time_codes:
            if not validate_time_code(code):
                errors.append(f'Zone {i+1}: Invalid time code "{code}"')
    
    return errors

def validate_time_code(code):
    """Validate a time code (HHMM, SUNRISE, SUNSET, etc.)"""
    if not isinstance(code, str):
        return False
    
    # Check for HHMM format
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

# Logging System
def setup_logger(name, log_file, level=logging.INFO):
    """Setup a logger with rotating file handler"""
    # Ensure logs directory exists
    os.makedirs(LOGS_DIR, exist_ok=True)
    
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(level)
    
    # Clear existing handlers to avoid duplicates
    logger.handlers.clear()
    
    # Create rotating file handler (10MB max, keep 5 backup files)
    handler = RotatingFileHandler(
        os.path.join(LOGS_DIR, log_file),
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    
    # Create formatter
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    
    # Add handler to logger
    logger.addHandler(handler)
    
    return logger

# Initialize loggers
system_logger = setup_logger('SYSTEM', 'system.log')
watering_logger = setup_logger('WATERING', 'watering.log')
plants_logger = setup_logger('PLANTS', 'plants.log')
locations_logger = setup_logger('LOCATIONS', 'locations.log')
health_logger = setup_logger('HEALTH', 'health.log')
user_logger = setup_logger('USER', 'user.log')
error_logger = setup_logger('ERROR', 'error.log')

def log_event(logger, level, message, **kwargs):
    """Log an event with optional additional context"""
    if kwargs:
        context = ' '.join([f"{k}={v}" for k, v in kwargs.items()])
        message = f"{message} | {context}"
    
    if level.upper() == 'DEBUG':
        logger.debug(message)
    elif level.upper() == 'INFO':
        logger.info(message)
    elif level.upper() == 'WARN':
        logger.warning(message)
    elif level.upper() == 'ERROR':
        logger.error(message)
    elif level.upper() == 'CRITICAL':
        logger.critical(message)

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
                    'timer_multiplier': garden.getfloat('timer_multiplier', 1.0)
                })
            
            # Load Well_Water section
            if 'Well_Water' in config:
                well = config['Well_Water']
                settings.update({
                    'max_flow_rate_gph': well.getint('max_flow_rate_gph', 0),
                    'reservoir_size_gallons': well.getint('reservoir_size_gallons', 0),
                    'recharge_time_minutes': well.getint('recharge_time_minutes', 0)
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
                'max_flow_rate_gph': 0,
                'reservoir_size_gallons': 0,
                'recharge_time_minutes': 0
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
                'timer_multiplier': str(settings_data.get('timer_multiplier', 1.0))
            },
            'Well_Water': {
                'max_flow_rate_gph': str(settings_data.get('max_flow_rate_gph', 0)),
                'reservoir_size_gallons': str(settings_data.get('reservoir_size_gallons', 0)),
                'recharge_time_minutes': str(settings_data.get('recharge_time_minutes', 0))
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
                "# Well Water Management Settings (Future Feature)\n",
                "# These settings will help manage water flow for well systems\n",
                "# by limiting total GPH usage and tracking reservoir capacity\n",
                "[Well_Water]\n",
                "# Maximum gallons per hour your well can safely provide\n",
                "# 0 = disabled (no limit)\n",
                "max_flow_rate_gph = 0\n",
                "\n",
                "# Capacity of your water storage tank in gallons\n",
                "# 0 = disabled (no reservoir tracking)\n",
                "reservoir_size_gallons = 0\n",
                "\n",
                "# Time needed for reservoir to refill after depletion (minutes)\n",
                "# 0 = disabled (no recharge time tracking)\n",
                "recharge_time_minutes = 0\n"
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
        log_event(system_logger, 'INFO', f'Garden settings saved', 
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
    data = load_json_file(SCHEDULE_JSON_PATH, {})
    # Convert dict to sorted list by zone_id, adding zone_id from key
    zones = []
    for zone_id_str, zone_data in data.items():
        zone_id = int(zone_id_str)
        zone_data['zone_id'] = zone_id  # Add zone_id for frontend compatibility
        zones.append(zone_data)
    
    # Sort by zone_id
    zones.sort(key=lambda x: x['zone_id'])
    return jsonify(zones)

@app.route('/api/schedule', methods=['POST'])
def save_schedule():
    data = request.json
    
    if not data:
        log_event(user_logger, 'WARN', f'Schedule save failed - invalid data')
        return jsonify({'status': 'error', 'message': 'Invalid schedule data'}), 400
    
    # If data is a list, convert to dict with str(zone_id) keys
    if isinstance(data, list):
        schedule_dict = {}
        for zone in data:
            if 'zone_id' in zone:
                zone_id = zone['zone_id']
                # Remove zone_id from zone data since it's stored as the key
                zone_copy = zone.copy()
                del zone_copy['zone_id']
                schedule_dict[str(zone_id)] = zone_copy
    else:
        schedule_dict = data
    
    # Validate the data
    errors = validate_schedule_data(list(schedule_dict.values()))
    if errors:
        log_event(user_logger, 'WARN', f'Schedule save failed - validation errors', errors=errors)
        return jsonify({'status': 'error', 'message': 'Validation failed', 'details': errors}), 400
    
    # Use the new incremental save function
    if save_json_file(SCHEDULE_JSON_PATH, schedule_dict):
        log_event(user_logger, 'INFO', f'Schedule saved', zone_count=len(schedule_dict))
        return jsonify({'status': 'success'})
    else:
        log_event(error_logger, 'ERROR', f'Schedule save failed - save error', zone_count=len(schedule_dict))
        return jsonify({'error': 'Failed to save schedule'}), 500

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
            h, m = int(code[:2]), int(code[2:])
            base = dt.replace(hour=h, minute=m, second=0, tzinfo=pytz.timezone(tz))
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
    library_dir = os.path.join(os.path.dirname(__file__), 'library')
    files = []
    
    for filename in os.listdir(library_dir):
        if filename.endswith('.json') and os.path.isfile(os.path.join(library_dir, filename)):
            try:
                with open(os.path.join(library_dir, filename), 'r') as f:
                    file_data = json.load(f)
                    files.append({
                        'filename': filename,
                        'plants': file_data.get('plants', [])
                    })
            except Exception as e:
                print(f"Error loading library file {filename}: {e}")
                continue
    
    return jsonify(files)

@app.route('/library/<path:filename>')
def get_library_file(filename):
    return send_from_directory('library', filename)

@app.route('/api/library/<path:filename>/<int:plant_id>', methods=['GET'])
def get_library_plant(filename, plant_id):
    library_dir = os.path.join(os.path.dirname(__file__), 'library')
    file_path = os.path.join(library_dir, filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Library file not found'}), 404
    
    try:
        with open(file_path, 'r') as f:
            file_data = json.load(f)
        
        plants = file_data.get('plants', [])
        plant = next((p for p in plants if p.get('plant_id') == plant_id), None)
        
        if not plant:
            return jsonify({'error': 'Plant not found'}), 404
        
        return jsonify(plant)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/library/custom/add', methods=['POST'])
def add_to_custom_library():
    custom_file_path = os.path.join(os.path.dirname(__file__), 'library', 'custom.json')
    
    try:
        plant_data = request.json
        
        if not plant_data:
            log_event(user_logger, 'WARN', f'Custom plant addition failed - invalid data')
            return jsonify({'error': 'Invalid plant data'}), 400
        
        # Load existing custom library or create new one
        custom_data = load_json_file(custom_file_path, {
            "Book Name": "Custom Plants",
            "plants": []
        })
        
        # Find the next available plant_id (start at 1, increment until we find a gap or the next number)
        existing_plant_ids = [plant.get('plant_id', 0) for plant in custom_data['plants']]
        next_plant_id = 1
        while next_plant_id in existing_plant_ids:
            next_plant_id += 1
        
        # Set the plant_id for the new plant
        plant_data['plant_id'] = next_plant_id
        
        # Add the new plant
        custom_data['plants'].append(plant_data)
        
        # Save the updated custom library
        if save_json_file(custom_file_path, custom_data):
            log_event(user_logger, 'INFO', f'Custom plant added', 
                     plant_id=next_plant_id, 
                     common_name=plant_data.get('common_name', ''),
                     latin_name=plant_data.get('latin_name', ''))
            return jsonify({'status': 'success', 'message': 'Plant added to custom library', 'plant_id': next_plant_id})
        else:
            log_event(error_logger, 'ERROR', f'Custom plant addition failed - save error', 
                     plant_id=next_plant_id, 
                     common_name=plant_data.get('common_name', ''))
            return jsonify({'error': 'Failed to save custom library'}), 500
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant addition exception', error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/library/custom.json', methods=['POST'])
def save_custom_library():
    custom_file_path = os.path.join(os.path.dirname(__file__), 'library', 'custom.json')
    
    try:
        library_data = request.json
        
        # Validate the data structure
        if not isinstance(library_data, dict) or 'plants' not in library_data:
            return jsonify({'error': 'Invalid library data format'}), 400
        
        # Save the custom library
        if save_json_file(custom_file_path, library_data):
            return jsonify({'status': 'success', 'message': 'Custom library saved'})
        else:
            return jsonify({'error': 'Failed to save custom library'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/map/save', methods=['POST'])
def save_map():
    data = request.json  # Single plant assignment
    
    if not data:
        log_event(plants_logger, 'WARN', f'Plant assignment failed - invalid data')
        return jsonify({"error": "Invalid plant data"}), 400
    
    # Load existing map to find the next available instance ID
    existing_map = load_json_file(MAP_JSON_PATH, {})
    
    # Find the next available instance ID (start at 1, increment until we find a gap or the next number)
    next_instance_id = 1
    while str(next_instance_id) in existing_map:
        next_instance_id += 1
    
    instance_id = str(next_instance_id)
    
    # Use the new incremental save function
    if append_to_json_object(MAP_JSON_PATH, instance_id, data):
        log_event(plants_logger, 'INFO', f'Plant assigned', 
                 instance_id=instance_id, 
                 plant_id=data.get('plant_id'),
                 location_id=data.get('location_id'),
                 zone=data.get('zone'),
                 quantity=data.get('quantity'))
        return jsonify({"status": "success", "instance_id": instance_id})
    else:
        log_event(error_logger, 'ERROR', f'Plant assignment failed - save error', 
                 instance_id=instance_id, 
                 plant_id=data.get('plant_id'))
        return jsonify({"error": "Failed to save plant assignment"}), 500

@app.route('/api/map', methods=['GET'])
def get_map():
    data = load_json_file(MAP_JSON_PATH, {})
    return jsonify(data)

@app.route('/api/map/<instance_id>/reassign', methods=['POST'])
def reassign_plant(instance_id):
    """Reassign a plant instance to a new location"""
    try:
        data = request.json
        location_id = data.get('location_id')
        
        if location_id is None:
            log_event(plants_logger, 'WARN', f'Plant reassignment failed - missing location_id', instance_id=instance_id)
            return jsonify({'error': 'location_id is required'}), 400
        
        existing_map = load_json_file(MAP_JSON_PATH, {})
        
        if instance_id not in existing_map:
            log_event(plants_logger, 'WARN', f'Plant reassignment failed - instance not found', instance_id=instance_id)
            return jsonify({'error': 'Plant instance not found'}), 404
        
        # Get old location for logging
        old_location_id = existing_map[instance_id].get('location_id')
        
        # Update only the location_id
        existing_map[instance_id]['location_id'] = location_id
        
        if save_json_file(MAP_JSON_PATH, existing_map):
            log_event(plants_logger, 'INFO', f'Plant reassigned', 
                     instance_id=instance_id, 
                     old_location=old_location_id, 
                     new_location=location_id)
            return jsonify({'status': 'success', 'message': f'Plant instance {instance_id} reassigned to location {location_id}'})
        else:
            log_event(error_logger, 'ERROR', f'Failed to save plant reassignment', 
                     instance_id=instance_id, 
                     old_location=old_location_id, 
                     new_location=location_id)
            return jsonify({'error': 'Failed to reassign plant'}), 500
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Plant reassignment exception', 
                 instance_id=instance_id, 
                 error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/api/map/<instance_id>', methods=['DELETE'])
def delete_plant_instance(instance_id):
    try:
        # Get plant info before deletion for logging
        map_data = load_json_file(MAP_JSON_PATH, {})
        plant_info = map_data.get(str(instance_id), {})
        
        if remove_from_json_object(MAP_JSON_PATH, instance_id):
            log_event(plants_logger, 'INFO', f'Plant instance deleted', 
                     instance_id=instance_id, 
                     plant_id=plant_info.get('plant_id'),
                     location_id=plant_info.get('location_id'),
                     zone=plant_info.get('zone'),
                     quantity=plant_info.get('quantity'))
            return jsonify({'status': 'success', 'message': f'Instance {instance_id} deleted'})
        else:
            log_event(plants_logger, 'WARN', f'Plant deletion failed - instance not found', instance_id=instance_id)
            return jsonify({'error': 'Instance not found'}), 404
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Plant deletion exception', instance_id=instance_id, error=str(e))
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
    status = get_channel_status(channel)
    return jsonify({'channel': channel, 'status': status})

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
        resp = jsonify({'status': 'ok'})
        resp.headers.add('Access-Control-Allow-Origin', '*')
        resp.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        resp.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return resp, 200
    
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
        except Exception as e:
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
        resp = jsonify({'status': 'ok'})
        resp.headers.add('Access-Control-Allow-Origin', '*')
        resp.headers.add('Access-Control-Allow-Methods', 'DELETE, OPTIONS')
        resp.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        return resp, 200
    
    print(f"DEBUG: Manual timer DELETE request received for zone {zone_id}")
    
    try:
        from core.scheduler import scheduler
        success = scheduler.remove_manual_timer(zone_id)
        if not success:
            log_event(error_logger, 'ERROR', f'Manual timer stop failed', zone_id=zone_id)
            resp = jsonify({'error': f'Failed to stop zone {zone_id}'})
            resp.headers.add('Access-Control-Allow-Origin', '*')
            return resp, 400
        
        log_event(user_logger, 'INFO', f'Manual timer stopped', zone_id=zone_id)
        resp = jsonify({
            'status': 'success', 
            'message': f'Manual timer stopped for zone {zone_id}'
        })
        resp.headers.add('Access-Control-Allow-Origin', '*')
        return resp
        
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Manual timer stop exception', zone_id=zone_id, error=str(e))
        resp = jsonify({'error': str(e)})
        resp.headers.add('Access-Control-Allow-Origin', '*')
        return resp, 500

@app.route('/api/zones/status', methods=['GET'])
def get_zone_status():
    """Get hardware status of all zones directly from GPIO (lock-free)"""
    try:
        from core.gpio import get_all_zone_states, ZONE_PINS
        from core.scheduler import scheduler
        
        # Get actual hardware states (no lock needed)
        hardware_states = get_all_zone_states()
        
        # Try to get remaining time from scheduler (with timeout to prevent hanging)
        remaining_times = {}
        try:
            # Quick check without blocking
            for zone_id in ZONE_PINS.keys():
                remaining = scheduler.get_remaining_time(zone_id)
                remaining_times[zone_id] = remaining if remaining is not None else 0
        except:
            # If scheduler is busy, just return 0 for all
            remaining_times = {zone_id: 0 for zone_id in ZONE_PINS.keys()}
        
        # Build response with hardware state as the source of truth
        status = {}
        for zone_id in ZONE_PINS.keys():
            hardware_active = hardware_states.get(zone_id, False)
            remaining = remaining_times.get(zone_id, 0)
            
            status[str(zone_id)] = {
                'active': hardware_active,
                'remaining': remaining if hardware_active else 0,
                'type': 'manual' if hardware_active and remaining > 0 else None
            }
        
        return jsonify(status)
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Zone status query failed', error=str(e))
        return jsonify({'error': str(e)}), 500

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
    if not data:
        log_event(user_logger, 'WARN', f'Zone creation failed - invalid data')
        return jsonify({'error': 'Invalid zone data'}), 400
    
    # Load existing schedule
    existing = load_json_file(SCHEDULE_JSON_PATH, {})
    
    # Find next available zone_id
    next_id = 1
    while str(next_id) in existing:
        next_id += 1
    
    key = str(next_id)
    
    # Add to dict (zone_id is stored as the key, not in the data)
    existing[key] = data
    
    if save_json_file(SCHEDULE_JSON_PATH, existing):
        log_event(user_logger, 'INFO', f'Zone created', 
                 zone_id=next_id, 
                 mode=data.get('mode', ''),
                 period=data.get('period', ''),
                 times_count=len(data.get('times', [])))
        return jsonify({'status': 'success', 'message': 'Zone added', 'zone_id': next_id})
    else:
        log_event(error_logger, 'ERROR', f'Zone creation failed - save error', 
                 zone_id=next_id, 
                 mode=data.get('mode', ''))
        return jsonify({'error': 'Failed to add zone'}), 500

@app.route('/api/schedule/<int:zone_id>', methods=['PUT'])
def update_zone(zone_id):
    """Update a specific zone"""
    data = request.json
    if not data:
        log_event(user_logger, 'WARN', f'Zone update failed - invalid data', zone_id=zone_id)
        return jsonify({'error': 'Invalid zone data'}), 400
    
    key = str(zone_id)
    existing = load_json_file(SCHEDULE_JSON_PATH, {})
    if key in existing:
        existing[key].update(data)
        if save_json_file(SCHEDULE_JSON_PATH, existing):
            log_event(user_logger, 'INFO', f'Zone updated', 
                     zone_id=zone_id, 
                     mode=data.get('mode', ''),
                     period=data.get('period', ''),
                     times_count=len(data.get('times', [])))
            return jsonify({'status': 'success', 'message': 'Zone updated'})
        else:
            log_event(error_logger, 'ERROR', f'Zone update failed - save error', zone_id=zone_id)
            return jsonify({'error': 'Failed to update zone'}), 500
    else:
        log_event(user_logger, 'WARN', f'Zone update failed - not found', zone_id=zone_id)
        return jsonify({'error': 'Zone not found'}), 404

@app.route('/api/schedule/<int:zone_id>', methods=['DELETE'])
def delete_zone(zone_id):
    """Delete a specific zone"""
    key = str(zone_id)
    existing = load_json_file(SCHEDULE_JSON_PATH, {})
    if key in existing:
        zone_info = existing[key]
        del existing[key]
        if save_json_file(SCHEDULE_JSON_PATH, existing):
            log_event(user_logger, 'INFO', f'Zone deleted', 
                     zone_id=zone_id, 
                     mode=zone_info.get('mode', ''),
                     period=zone_info.get('period', ''))
            return jsonify({'status': 'success', 'message': 'Zone deleted'})
        else:
            log_event(error_logger, 'ERROR', f'Zone deletion failed - save error', zone_id=zone_id)
            return jsonify({'error': 'Failed to delete zone'}), 500
    else:
        log_event(user_logger, 'WARN', f'Zone deletion failed - not found', zone_id=zone_id)
        return jsonify({'error': 'Zone not found'}), 404

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
        from core.scheduler import scheduler
        active_zones = scheduler.get_active_zones()
        
        timers = {}
        for zone_id, end_time in active_zones.items():
            remaining = scheduler.get_remaining_time(zone_id)
            timers[zone_id] = {
                'end_time': end_time.isoformat(),
                'remaining_seconds': remaining,
                'active': True
            }
        
        return jsonify({
            'status': 'success',
            'timers': timers
        })
    except Exception as e:
        error_logger.error(f"Error getting active timers: {e}")
        return jsonify({'error': 'Failed to get active timers'}), 500

# Backup and Restore Functions
def create_backup():
    """Create a complete backup of all configuration and data files"""
    try:
        # Create a temporary directory for the backup
        with tempfile.TemporaryDirectory() as temp_dir:
            backup_dir = os.path.join(temp_dir, 'waterme_backup')
            os.makedirs(backup_dir)
            
            # Define files to backup
            backup_files = {
                'config/settings.cfg': SETTINGS_PATH,
                'config/gpio.cfg': GPIO_PATH,
                'data/schedule.json': SCHEDULE_JSON_PATH,
                'data/locations.json': LOCATIONS_JSON_PATH,
                'data/map.json': MAP_JSON_PATH,
                'data/health_alerts.json': HEALTH_ALERTS_PATH,
                'data/logs.json': LOGS_JSON_PATH,
                'library/custom.json': os.path.join(os.path.dirname(__file__), 'library', 'custom.json'),
                'library/fruitbushes.json': os.path.join(os.path.dirname(__file__), 'library', 'fruitbushes.json')
            }
            
            # Copy files to backup directory
            for backup_path, source_path in backup_files.items():
                if os.path.exists(source_path):
                    full_backup_path = os.path.join(backup_dir, backup_path)
                    os.makedirs(os.path.dirname(full_backup_path), exist_ok=True)
                    shutil.copy2(source_path, full_backup_path)
            
            # Create metadata file
            metadata = {
                'backup_date': datetime.now(tz).isoformat(),
                'version': '1.0.0',
                'files_backed_up': list(backup_files.keys()),
                'system_info': {
                    'platform': os.name,
                    'python_version': os.sys.version
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
            restore_files = {
                'config/settings.cfg': SETTINGS_PATH,
                'config/gpio.cfg': GPIO_PATH,
                'data/schedule.json': SCHEDULE_JSON_PATH,
                'data/locations.json': LOCATIONS_JSON_PATH,
                'data/map.json': MAP_JSON_PATH,
                'data/health_alerts.json': HEALTH_ALERTS_PATH,
                'data/logs.json': LOGS_JSON_PATH,
                'library/custom.json': os.path.join(os.path.dirname(__file__), 'library', 'custom.json'),
                'library/fruitbushes.json': os.path.join(os.path.dirname(__file__), 'library', 'fruitbushes.json')
            }
            
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
        backup_data = create_backup()
        
        # Generate filename with timestamp
        timestamp = datetime.now(tz).strftime('%Y%m%d_%H%M%S')
        filename = f'waterme_backup_{timestamp}.zip'
        
        log_event(system_logger, 'INFO', 'System backup created', backup_file=filename)
        
        return send_file(
            io.BytesIO(backup_data),
            mimetype='application/zip',
            as_attachment=True,
            download_name=filename
        )
    except Exception as e:
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
        backup_files = {
            'config/settings.cfg': SETTINGS_PATH,
            'config/gpio.cfg': GPIO_PATH,
            'data/schedule.json': SCHEDULE_JSON_PATH,
            'data/locations.json': LOCATIONS_JSON_PATH,
            'data/map.json': MAP_JSON_PATH,
            'data/health_alerts.json': HEALTH_ALERTS_PATH,
            'data/logs.json': LOGS_JSON_PATH,
            'library/custom.json': os.path.join(os.path.dirname(__file__), 'library', 'custom.json'),
            'library/fruitbushes.json': os.path.join(os.path.dirname(__file__), 'library', 'fruitbushes.json')
        }
        
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
        from core.scheduler import scheduler
        return jsonify({
            'scheduler_running': scheduler.running,
            'active_zones': scheduler.active_zones,
            'zone_states': scheduler.zone_states,
            'thread_alive': scheduler.thread.is_alive() if scheduler.thread else False,
            'current_time': datetime.now(tz).isoformat()
        })
    except Exception as e:
        return jsonify({
            'error': str(e),
            'scheduler_running': False
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

if __name__ == '__main__':
    start_watering_scheduler()
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False) 