# scheduler.py
# Scheduling logic for watering events - PRIMARY GPIO CONTROLLER

import json
import os
import time
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
import logging
import configparser
import pytz
from astral.sun import sun
from astral import LocationInfo
import re

# Import GPIO functions directly - scheduler is now primary controller
from .gpio import setup_gpio, activate_zone, deactivate_zone, cleanup_gpio, get_zone_state, ZONE_PINS

class WateringScheduler:
    def __init__(self):
        self.schedule_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "schedule.json")
        self.settings_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "settings.cfg")
        self.running = False
        self.active_zones = {}  # zone_id -> end_time
        self.zone_states = {}   # zone_id -> {'active': bool, 'end_time': datetime, 'type': 'manual'|'scheduled'}
        self.active_zones_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "active_zones.json")
        self.thread = None
        
        # Initialize zone states
        self._initialize_zone_states()
        
        # Load any existing active zones from persistent storage
        self.load_active_zones()
        
        # Catch up on missed events
        self.catch_up_missed_events()
    
    def _initialize_zone_states(self):
        """Initialize zone states for all configured zones"""
        for zone_id in ZONE_PINS.keys():
            self.zone_states[zone_id] = {
                'active': False,
                'end_time': None,
                'type': None,
                'remaining': 0
            }
    
    def _setup_logging(self):
        """Setup logging for scheduler events"""
        logs_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
        os.makedirs(logs_dir, exist_ok=True)
        
        # Create loggers if they don't exist
        self.watering_logger = logging.getLogger('watering')
        self.user_logger = logging.getLogger('user')
        self.error_logger = logging.getLogger('error')
        
        # Set up handlers if not already set
        if not self.watering_logger.handlers:
            handler = logging.FileHandler(os.path.join(logs_dir, 'watering.log'))
            formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            self.watering_logger.addHandler(handler)
            self.watering_logger.setLevel(logging.INFO)
    
    def log_event(self, logger, level, message, **kwargs):
        """Log an event with optional context"""
        try:
            context = " | ".join([f"{k}={v}" for k, v in kwargs.items()])
            full_message = f"{message} | {context}" if context else message
            getattr(logger, level.lower())(full_message)
        except Exception as e:
            print(f"Logging error: {e}")
    
    # =============================================================================
    # PRIMARY GPIO CONTROL METHODS - Scheduler is now the authority
    # =============================================================================
    
    def activate_zone_direct(self, zone_id: int, duration_seconds: int = None, event_type: str = 'manual') -> bool:
        """
        Directly activate a zone through scheduler (primary GPIO controller)
        Args:
            zone_id: Zone to activate
            duration_seconds: Duration in seconds, None for indefinite
            event_type: 'manual' or 'scheduled'
        Returns:
            bool: Success status
        """
        try:
            # Activate the hardware
            activate_zone(zone_id)
            
            # Update zone state
            end_time = None
            if duration_seconds:
                end_time = datetime.now() + timedelta(seconds=duration_seconds)
            
            self.zone_states[zone_id] = {
                'active': True,
                'end_time': end_time,
                'type': event_type,
                'remaining': duration_seconds if duration_seconds else 0
            }
            
            # Add to active zones if duration specified
            if duration_seconds:
                self.active_zones[zone_id] = end_time
                self.save_active_zones()
            
            self._setup_logging()
            self.log_event(self.watering_logger, 'INFO', f'{event_type.title()} zone activation', 
                         zone_id=zone_id, duration=duration_seconds)
            
            print(f"Scheduler: Activated zone {zone_id} for {duration_seconds}s ({event_type})")
            return True
            
        except Exception as e:
            self._setup_logging()
            self.log_event(self.error_logger, 'ERROR', f'Zone activation failed', 
                         zone_id=zone_id, error=str(e))
            print(f"Scheduler: Failed to activate zone {zone_id}: {e}")
            return False
    
    def deactivate_zone_direct(self, zone_id: int, reason: str = 'manual') -> bool:
        """
        Directly deactivate a zone through scheduler (primary GPIO controller)
        Args:
            zone_id: Zone to deactivate  
            reason: Reason for deactivation ('manual', 'timer_expired', 'scheduled')
        Returns:
            bool: Success status
        """
        try:
            # Deactivate the hardware
            deactivate_zone(zone_id)
            
            # Update zone state
            self.zone_states[zone_id] = {
                'active': False,
                'end_time': None,
                'type': None,
                'remaining': 0
            }
            
            # Remove from active zones
            if zone_id in self.active_zones:
                del self.active_zones[zone_id]
                self.save_active_zones()
            
            self._setup_logging()
            self.log_event(self.watering_logger, 'INFO', f'Zone deactivated - {reason}', zone_id=zone_id)
            
            print(f"Scheduler: Deactivated zone {zone_id} - {reason}")
            return True
            
        except Exception as e:
            self._setup_logging()
            self.log_event(self.error_logger, 'ERROR', f'Zone deactivation failed', 
                         zone_id=zone_id, error=str(e))
            print(f"Scheduler: Failed to deactivate zone {zone_id}: {e}")
            return False
    
    def get_zone_status(self, zone_id: int) -> Dict:
        """Get current status of a zone"""
        state = self.zone_states.get(zone_id, {
            'active': False,
            'end_time': None,
            'type': None,
            'remaining': 0
        })
        
        # Update remaining time if active with timer
        if state['active'] and state['end_time']:
            remaining = (state['end_time'] - datetime.now()).total_seconds()
            state['remaining'] = max(0, int(remaining))
        
        return state.copy()
    
    def get_all_zone_status(self) -> Dict[int, Dict]:
        """Get status of all zones"""
        status = {}
        for zone_id in ZONE_PINS.keys():
            status[zone_id] = self.get_zone_status(zone_id)
        return status
    
    def emergency_stop_all_zones(self) -> bool:
        """Emergency stop all zones"""
        try:
            success_count = 0
            for zone_id in ZONE_PINS.keys():
                if self.zone_states.get(zone_id, {}).get('active', False):
                    if self.deactivate_zone_direct(zone_id, 'emergency_stop'):
                        success_count += 1
            
            self._setup_logging()
            self.log_event(self.user_logger, 'WARN', f'Emergency stop executed', zones_stopped=success_count)
            return True
            
        except Exception as e:
            self._setup_logging()  
            self.log_event(self.error_logger, 'ERROR', f'Emergency stop failed', error=str(e))
            return False
    
    # =============================================================================
    # IMPROVED MISSED EVENT DETECTION AND RESTORATION
    # =============================================================================
    
    def catch_up_missed_events(self):
        """On startup, catch up on any missed watering events that are still within their window"""
        try:
            # Load schedule
            if not os.path.exists(self.schedule_file):
                print("Debug: Schedule file does not exist, skipping catch-up")
                return
            print(f"Debug: Loading schedule from {self.schedule_file}")
            
            with open(self.schedule_file, 'r') as f:
                schedule = json.load(f)
            
            now = datetime.now()
            print(f"Debug: Current time: {now}")
            
            # Load settings for lat/lon/timezone
            if not os.path.exists(self.settings_file):
                print("Debug: Settings file does not exist, using defaults for catch-up")
                lat, lon, tz = 0.0, 0.0, 'UTC'
            else:
                print(f"Debug: Loading settings from {self.settings_file}")
                config = configparser.ConfigParser()
                config.read(self.settings_file)
                if 'Garden' in config:
                    garden = config['Garden']
                    lat = float(garden.get('gps_lat', 0.0))
                    lon = float(garden.get('gps_lon', 0.0))
                    tz = garden.get('timezone', 'UTC')
                    print(f"Debug: Loaded settings - lat: {lat}, lon: {lon}, tz: {tz}")
                else:
                    lat, lon, tz = 0.0, 0.0, 'UTC'
                    print(f"Debug: No Garden section in settings, using defaults")
            
            # Get solar times for today
            city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
            dt = now.astimezone(pytz.timezone(tz))
            s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)
            print(f"Debug: Solar times for today: sunrise={s['sunrise']}, sunset={s['sunset']}, noon={s['noon']}")
            
            def parse_offset(code, base_name):
                """Parse offset from solar time code (e.g., SUNRISE+30 -> +30 minutes)"""
                m = re.search(r'([+-])(\d+)$', code)
                if m:
                    sign = 1 if m.group(1) == '+' else -1
                    minutes = int(m.group(2))
                    return timedelta(minutes=sign * minutes)
                return timedelta()
            
            restored_count = 0
            
            for zone_id_str, zone_data in schedule.items():
                zone_id = int(zone_id_str)
                
                # Skip disabled zones  
                mode = zone_data.get('mode', 'manual')
                if mode == 'disabled':
                    print(f"Debug: Zone {zone_id} is disabled, skipping")
                    continue
                
                # Skip if zone is already active
                if self.zone_states.get(zone_id, {}).get('active', False):
                    print(f"Debug: Zone {zone_id} is already active, skipping catch-up")
                    continue
                
                period = zone_data.get('period', 'D')
                start_day = zone_data.get('startDay', '')
                times = zone_data.get('times', [])
                print(f"Debug: Checking zone {zone_id} - mode: {mode}, period: {period}, events: {len(times)}")
                
                # Check if this zone should run today based on period
                should_run_today = self._should_run_today(period, start_day, dt)
                
                if not should_run_today:
                    print(f"Debug:   Zone {zone_id} not scheduled for today, skipping")
                    continue
                
                # Check each scheduled time
                for event_idx, event in enumerate(times):
                    value = event.get('value')
                    duration_str = event.get('duration', '000100')
                    print(f"Debug:   Event {event_idx+1} - code: {value}, duration: {duration_str}")
                    
                    # Resolve start_time
                    start_time = self._resolve_event_time(value, s, dt)
                    if not start_time:
                        print(f"Debug:     Skipping unknown code: {value}")
                        continue
                    
                    # Parse duration
                    try:
                        duration = self._parse_duration(duration_str)
                        print(f"Debug:     Duration parsed as {duration}")
                    except Exception as e:
                        print(f"Debug:     Duration parse failed: {e}, using default 1 min")
                        duration = timedelta(minutes=1)
                    
                    end_time = start_time + duration
                    print(f"Debug:     Event window: {start_time} to {end_time}")
                    
                    # Check if we're currently within the event window
                    if start_time <= dt <= end_time:
                        remaining = (end_time - dt).total_seconds()
                        print(f"Debug:     Event is ongoing! Remaining: {remaining:.1f} sec")
                        
                        if remaining > 5:  # Only restore if more than 5 seconds remaining
                            print(f"Debug:     Restoring zone {zone_id} for remaining {int(remaining)} sec")
                            success = self.activate_zone_direct(zone_id, int(remaining), 'scheduled')
                            if success:
                                restored_count += 1
                                self._setup_logging()
                                self.log_event(self.watering_logger, 'INFO', 
                                             'Catch-up: Restored missed scheduled event', 
                                             zone_id=zone_id, remaining=int(remaining))
                            else:
                                print(f"Debug:     Failed to restore zone {zone_id}")
                        else:
                            print(f"Debug:     Too little time remaining ({remaining:.1f}s), skipping")
                    else:
                        print("Debug:     Event not currently active")
            
            if restored_count > 0:
                print(f"Catch-up complete: Restored {restored_count} missed events")
                self._setup_logging()
                self.log_event(self.watering_logger, 'INFO', f'Startup catch-up completed', events_restored=restored_count)
            else:
                print("Catch-up complete: No missed events to restore")
                
        except Exception as e:
            print(f"Error in catch_up_missed_events: {e}")
            self._setup_logging()
            self.log_event(self.error_logger, 'ERROR', f'Catch-up failed', error=str(e))
    
    def _should_run_today(self, period: str, start_day: str, dt: datetime) -> bool:
        """Check if a scheduled event should run today"""
        if period == 'D':
            return True
        elif period == 'W' and start_day:
            try:
                start_date = datetime.strptime(start_day, '%Y-%m-%d')
                if dt.weekday() == start_date.weekday():
                    print(f"Debug:   Weekly schedule matches today's weekday")
                    return True
                else:
                    print(f"Debug:   Weekly schedule doesn't match today (start: {start_date.strftime('%A')}, today: {dt.strftime('%A')})")
                    return False
            except:
                print(f"Debug:   Failed to parse start_day: {start_day}")
                return False
        elif period == 'M' and start_day:
            try:
                start_date = datetime.strptime(start_day, '%Y-%m-%d')
                if dt.day == start_date.day:
                    print(f"Debug:   Monthly schedule matches today's day")
                    return True
                else:
                    print(f"Debug:   Monthly schedule doesn't match today (start: day {start_date.day}, today: day {dt.day})")
                    return False
            except:
                print(f"Debug:   Failed to parse start_day: {start_day}")
                return False
        return False
    
    def _resolve_event_time(self, value: str, solar_times: dict, dt: datetime) -> Optional[datetime]:
        """Resolve event time from various formats"""
        if not value:
            return None
            
        if value.isdigit() and len(value) == 4:
            # Absolute time like "0800"
            hour = int(value[:2])
            minute = int(value[2:])
            start_time = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
            print(f"Debug:     Absolute time resolved to {start_time}")
            return start_time
        elif value.startswith('SUNRISE'):
            base = solar_times['sunrise']
            offset = self._parse_offset(value, 'SUNRISE')
            start_time = base + offset
            print(f"Debug:     SUNRISE resolved to {start_time} (base={base}, offset={offset})")
            return start_time
        elif value.startswith('SUNSET'):
            base = solar_times['sunset']
            offset = self._parse_offset(value, 'SUNSET')
            start_time = base + offset
            print(f"Debug:     SUNSET resolved to {start_time} (base={base}, offset={offset})")
            return start_time
        elif value.startswith('ZENITH'):
            base = solar_times['noon']
            offset = self._parse_offset(value, 'ZENITH')
            start_time = base + offset
            print(f"Debug:     ZENITH resolved to {start_time} (base={base}, offset={offset})")
            return start_time
        
        return None
    
    def _parse_offset(self, code: str, base_name: str) -> timedelta:
        """Parse offset from solar time code"""
        m = re.search(r'([+-])(\d+)$', code)
        if m:
            sign = 1 if m.group(1) == '+' else -1
            minutes = int(m.group(2))
            return timedelta(minutes=sign * minutes)
        return timedelta()
    
    def _parse_duration(self, duration_str: str) -> timedelta:
        """Parse duration string into timedelta"""
        if len(duration_str) == 6:
            h = int(duration_str[:2])
            m = int(duration_str[2:4])
            s = int(duration_str[4:])
            return timedelta(hours=h, minutes=m, seconds=s)
        elif len(duration_str) == 4:
            m = int(duration_str[:2])
            s = int(duration_str[2:])
            return timedelta(minutes=m, seconds=s)
        else:
            return timedelta(minutes=1)
    
    # =============================================================================
    # EXISTING TIMER MANAGEMENT METHODS (Updated)
    # =============================================================================
    
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
                            zone_id_int = int(zone_id)
                            self.active_zones[zone_id_int] = end_time
                            # Activate the hardware
                            activate_zone(zone_id_int)
                            # Update zone state
                            remaining = int((end_time - datetime.now()).total_seconds())
                            self.zone_states[zone_id_int] = {
                                'active': True,
                                'end_time': end_time,
                                'type': 'restored',
                                'remaining': remaining
                            }
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
    
    def add_manual_timer(self, zone_id: int, duration_seconds: int) -> bool:
        """Add a manual timer for a zone (used by API)"""
        return self.activate_zone_direct(zone_id, duration_seconds, 'manual')
    
    def remove_manual_timer(self, zone_id: int) -> bool:
        """Remove a manual timer for a zone (used by API)"""
        return self.deactivate_zone_direct(zone_id, 'manual')
    
    def get_active_zones(self) -> Dict[int, datetime]:
        """Get currently active zones with timers"""
        return self.active_zones.copy()
    
    def is_zone_active(self, zone_id: int) -> bool:
        """Check if a zone is currently active"""
        return self.zone_states.get(zone_id, {}).get('active', False)
    
    def get_remaining_time(self, zone_id: int) -> Optional[int]:
        """Get remaining time in seconds for a zone"""
        state = self.zone_states.get(zone_id, {})
        if state.get('active', False) and state.get('end_time'):
            remaining = (state['end_time'] - datetime.now()).total_seconds()
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
            success = self.deactivate_zone_direct(zone_id, 'timer_expired')
            if not success:
                self._setup_logging()
                self.log_event(self.error_logger, 'ERROR', f'Failed to stop expired zone', zone_id=zone_id)
    
    def run_scheduler_loop(self):
        """Main scheduler loop"""
        while self.running:
            try:
                # Check for expired manual timers
                self.check_and_stop_expired_zones()
                
                # Update remaining times for active zones
                for zone_id in list(self.zone_states.keys()):
                    state = self.zone_states[zone_id]
                    if state['active'] and state['end_time']:
                        remaining = (state['end_time'] - datetime.now()).total_seconds()
                        state['remaining'] = max(0, int(remaining))
                
                # TODO: Check for scheduled events (future implementation)
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
        """Stop the scheduler and clean up GPIO"""
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        
        # Turn off all active zones
        for zone_id in list(self.zone_states.keys()):
            if self.zone_states[zone_id]['active']:
                self.deactivate_zone_direct(zone_id, 'system_shutdown')
        
        # Clean up GPIO
        cleanup_gpio()
        print("Watering scheduler stopped")

# Global scheduler instance
scheduler = WateringScheduler() 