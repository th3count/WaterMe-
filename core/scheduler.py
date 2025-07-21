# scheduler.py
# Scheduling logic for watering events

import json
import os
import time
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging
import configparser
import pytz
from astral.sun import sun
from astral import LocationInfo
import re

# Import GPIO functions from main api.py
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api import activate_channel, deactivate_channel, log_event, watering_logger, user_logger

class WateringScheduler:
    def catch_up_missed_events(self):
        """On startup, catch up on any missed watering events that are still within their window, including solar codes."""
        try:
            # Load schedule
            if not os.path.exists(self.schedule_file):
                return
            with open(self.schedule_file, 'r') as f:
                schedule = json.load(f)
            now = datetime.now()

            # Load settings for lat/lon/timezone
            if not os.path.exists(self.settings_file):
                return
            config = configparser.ConfigParser()
            config.read(self.settings_file)
            if 'Garden' in config:
                garden = config['Garden']
                lat = float(garden.get('gps_lat', 0.0))
                lon = float(garden.get('gps_lon', 0.0))
                tz = garden.get('timezone', 'UTC')
            else:
                lat, lon, tz = 0.0, 0.0, 'UTC'

            city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
            dt = now.astimezone(pytz.timezone(tz))
            s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)

            def parse_offset(code, base):
                m = re.search(r'([+-])(\d+)$', code)
                if m:
                    sign = 1 if m.group(1) == '+' else -1
                    minutes = int(m.group(2))
                    return timedelta(minutes=sign * minutes)
                return timedelta()

            for zone_id_str, zone_data in schedule.items():
                zone_id = int(zone_id_str)
                times = zone_data.get('times', [])
                for event in times:
                    value = event.get('value')
                    duration_str = event.get('duration', '000100')  # Default 1 min
                    # Resolve start_time
                    start_time = None
                    if value and value.isdigit() and len(value) == 4:
                        hour = int(value[:2])
                        minute = int(value[2:])
                        start_time = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    elif value and value.startswith('SUNRISE'):
                        base = s['sunrise']
                        offset = parse_offset(value, 'SUNRISE')
                        start_time = base + offset
                    elif value and value.startswith('SUNSET'):
                        base = s['sunset']
                        offset = parse_offset(value, 'SUNSET')
                        start_time = base + offset
                    elif value and value.startswith('ZENITH'):
                        base = s['noon']
                        offset = parse_offset(value, 'ZENITH')
                        start_time = base + offset
                    # else: skip unknown codes
                    if not start_time:
                        continue
                    # Parse duration (HHMMSS or MMSS)
                    try:
                        if len(duration_str) == 6:
                            h = int(duration_str[:2])
                            m = int(duration_str[2:4])
                            s_ = int(duration_str[4:])
                            duration = timedelta(hours=h, minutes=m, seconds=s_)
                        elif len(duration_str) == 4:
                            m = int(duration_str[:2])
                            s_ = int(duration_str[2:])
                            duration = timedelta(minutes=m, seconds=s_)
                        else:
                            duration = timedelta(minutes=1)
                    except Exception:
                        duration = timedelta(minutes=1)
                    end_time = start_time + duration
                    if start_time < dt < end_time:
                        remaining = (end_time - dt).total_seconds()
                        if remaining > 0:
                            # Only start if not already active
                            if not self.is_zone_active(zone_id):
                                from api import activate_channel, log_event, watering_logger
                                activate_channel(zone_id)
                                self.add_manual_timer(zone_id, int(remaining))
                                log_event(watering_logger, 'INFO', f'Catch-up: Started missed watering event', zone_id=zone_id, remaining=int(remaining))
        except Exception as e:
            print(f"Error in catch_up_missed_events: {e}")

    def __init__(self):
        self.schedule_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "schedule.json")
        self.settings_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "settings.cfg")
        self.running = False
        self.active_zones = {}  # zone_id -> end_time
        self.active_zones_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "active_zones.json")
        self.thread = None
        # Load any existing active zones from persistent storage
        self.load_active_zones()
        # Catch up on missed events
        self.catch_up_missed_events()
    
    def load_active_zones(self):
        """Load active zones from persistent storage"""
        try:
            if os.path.exists(self.active_zones_file):
                with open(self.active_zones_file, 'r') as f:
                    data = json.load(f)
                    # Convert string timestamps back to datetime objects
                    for zone_id, end_time_str in data.items():
                        end_time = datetime.fromisoformat(end_time_str)
                        # Only restore if the timer hasn't expired
                        if end_time > datetime.now():
                            self.active_zones[int(zone_id)] = end_time
                            print(f"Restored active zone {zone_id} with end time {end_time}")
                        else:
                            print(f"Zone {zone_id} timer expired, not restoring")
        except Exception as e:
            print(f"Error loading active zones: {e}")
    
    def save_active_zones(self):
        """Save active zones to persistent storage"""
        try:
            # Convert datetime objects to ISO format strings for JSON serialization
            data = {}
            for zone_id, end_time in self.active_zones.items():
                data[str(zone_id)] = end_time.isoformat()
            
            with open(self.active_zones_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"Error saving active zones: {e}")
    
    def add_manual_timer(self, zone_id: int, duration_seconds: int):
        """Add a manual timer for a zone"""
        end_time = datetime.now() + timedelta(seconds=duration_seconds)
        self.active_zones[zone_id] = end_time
        self.save_active_zones()  # Persist immediately
        print(f"Added manual timer for zone {zone_id}, ends at {end_time}")
    
    def remove_manual_timer(self, zone_id: int):
        """Remove a manual timer for a zone"""
        if zone_id in self.active_zones:
            del self.active_zones[zone_id]
            self.save_active_zones()  # Persist immediately
            print(f"Removed manual timer for zone {zone_id}")
    
    def get_active_zones(self) -> Dict[int, datetime]:
        """Get currently active zones"""
        return self.active_zones.copy()
    
    def is_zone_active(self, zone_id: int) -> bool:
        """Check if a zone is currently active"""
        return zone_id in self.active_zones
    
    def get_remaining_time(self, zone_id: int) -> Optional[int]:
        """Get remaining time in seconds for a zone"""
        if zone_id in self.active_zones:
            remaining = (self.active_zones[zone_id] - datetime.now()).total_seconds()
            return max(0, int(remaining))
        return None
    
    def check_and_stop_expired_zones(self):
        """Check for expired zones and stop them"""
        current_time = datetime.now()
        zones_to_stop = []
        
        for zone_id, end_time in self.active_zones.items():
            if current_time >= end_time:
                zones_to_stop.append(zone_id)
        
        for zone_id in zones_to_stop:
            print(f"Stopping expired zone {zone_id}")
            success = deactivate_channel(zone_id)
            if success:
                log_event(watering_logger, 'INFO', f'Manual timer expired - zone stopped', zone_id=zone_id)
                self.remove_manual_timer(zone_id)
            else:
                log_event(watering_logger, 'ERROR', f'Failed to stop expired zone', zone_id=zone_id)
    
    def run_scheduler_loop(self):
        """Main scheduler loop"""
        while self.running:
            try:
                # Check for expired manual timers
                self.check_and_stop_expired_zones()
                
                # Check for scheduled events (future implementation)
                # self.check_scheduled_events()
                
                # Sleep for a short interval
                time.sleep(1)
                
            except Exception as e:
                print(f"Error in scheduler loop: {e}")
                time.sleep(5)  # Wait longer on error
    
    def start(self):
        """Start the scheduler"""
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self.run_scheduler_loop, daemon=True)
            self.thread.start()
            print("Watering scheduler started")
    
    def stop(self):
        """Stop the scheduler"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        print("Watering scheduler stopped")

# Global scheduler instance
scheduler = WateringScheduler() 