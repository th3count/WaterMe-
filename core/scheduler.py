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
        """Initialize the watering scheduler"""
        self.running = False
        self.thread = None
        self.active_zones = {}  # zone_id -> end_time
        self.zone_states = {}   # zone_id -> state dict
        
        # File paths
        self.active_zones_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'active_zones.json')
        self.schedule_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'schedule.json')
        self.settings_file = os.path.join(os.path.dirname(__file__), '..', 'config', 'settings.cfg')
        
        # Caching for performance
        self.schedule = {}  # Cached schedule
        self.settings = {}  # Cached settings
        self._load_schedule()
        self._load_settings()
        
        # Debug counters
        self.check_count = 0
        self.last_check_time = None
        
        # Initialize zone states
        self._initialize_zone_states()
        
        # Setup logging
        self._setup_logging()
        
        # Load any existing active zones from persistent storage
        self.load_active_zones()
        
        # Catch up on missed events
        self.catch_up_missed_events()
    
    def _load_schedule(self):
        """Load schedule from file"""
        try:
            if os.path.exists(self.schedule_file):
                with open(self.schedule_file, 'r') as f:
                    self.schedule = json.load(f)
                print(f"Loaded {len(self.schedule)} zones from schedule")
            else:
                print(f"No schedule file found at {self.schedule_file}")
        except Exception as e:
            print(f"Error loading schedule: {e}")

    def _load_settings(self):
        """Load settings from file"""
        try:
            if os.path.exists(self.settings_file):
                config = configparser.ConfigParser()
                config.read(self.settings_file)
                if 'Garden' in config:
                    garden = config['Garden']
                    self.settings = {
                        'gps_lat': float(garden.get('gps_lat', 0.0)),
                        'gps_lon': float(garden.get('gps_lon', 0.0)),
                        'timezone': garden.get('timezone', 'UTC')
                    }
                    print(f"Loaded settings: {self.settings}")
                else:
                    print("No Garden section in settings")
            else:
                print(f"No settings file found at {self.settings_file}")
        except Exception as e:
            print(f"Error loading settings: {e}")

    def reload_schedule(self):
        """Reload schedule from file (call when schedule changes)"""
        self._load_schedule()

    def reload_settings(self):
        """Reload settings from file (call when settings change)"""
        self._load_settings()
    
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
        Activate a zone by telling gpio.py to control the hardware
        Args:
            zone_id: Zone to activate
            duration_seconds: Duration in seconds, None for indefinite
            event_type: 'manual' or 'scheduled'
        Returns:
            bool: Success status
        """
        try:
            print(f"DEBUG: activate_zone_direct called - zone_id={zone_id}, duration={duration_seconds}, type={event_type}")
            
            # Tell gpio.py to activate the hardware
            activate_zone(zone_id)
            
            # Update zone state using timezone-aware datetime
            end_time = None
            if duration_seconds:
                # Use timezone-aware datetime
                tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
                tz = pytz.timezone(tz_name)
                now = datetime.now(tz)
                end_time = now + timedelta(seconds=duration_seconds)
                print(f"DEBUG: Calculated end_time = {end_time} (timezone: {tz_name})")
            
            self.zone_states[zone_id] = {
                'active': True,
                'end_time': end_time,
                'type': event_type,
                'remaining': duration_seconds if duration_seconds else 0
            }
            
            print(f"DEBUG: Updated zone_states[{zone_id}] = {self.zone_states[zone_id]}")
            
            # Add to active zones if duration specified
            if duration_seconds:
                self.active_zones[zone_id] = end_time
                print(f"DEBUG: Added to active_zones[{zone_id}] = {end_time}")
                print(f"DEBUG: active_zones now contains: {self.active_zones}")
                self.save_active_zones()
            else:
                print(f"DEBUG: No duration specified, not adding to active_zones")
            
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
            print(f"DEBUG: deactivate_zone_direct called - zone_id={zone_id}, reason={reason}")
            print(f"DEBUG: active_zones before deactivation: {self.active_zones}")
            print(f"DEBUG: zone_states[{zone_id}] before deactivation: {self.zone_states.get(zone_id, {})}")
            
            # Deactivate the hardware
            deactivate_zone(zone_id)
            print(f"DEBUG: Hardware deactivation completed for zone {zone_id}")
            
            # Update zone state
            self.zone_states[zone_id] = {
                'active': False,
                'end_time': None,
                'type': None,
                'remaining': 0
            }
            print(f"DEBUG: Updated zone_states[{zone_id}] = {self.zone_states[zone_id]}")
            
            # Remove from active zones
            if zone_id in self.active_zones:
                del self.active_zones[zone_id]
                print(f"DEBUG: Removed zone {zone_id} from active_zones")
                print(f"DEBUG: active_zones after removal: {self.active_zones}")
                self.save_active_zones()
            else:
                print(f"DEBUG: Zone {zone_id} not in active_zones, skipping removal")
            
            self._setup_logging()
            self.log_event(self.watering_logger, 'INFO', f'Zone deactivated - {reason}', zone_id=zone_id)
            
            print(f"Scheduler: Deactivated zone {zone_id} - {reason}")
            return True
            
        except Exception as e:
            print(f"ERROR in deactivate_zone_direct: {e}")
            import traceback
            traceback.print_exc()
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
            # Use timezone-aware datetime for calculation
            tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
            tz = pytz.timezone(tz_name)
            current_time = datetime.now(tz)
            
            end_time = state['end_time']
            # Ensure end_time is timezone-aware
            if end_time.tzinfo is None:
                end_time = tz.localize(end_time)
            
            remaining = (end_time - current_time).total_seconds()
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
            print(f"DEBUG: emergency_stop_all_zones called")
            print(f"DEBUG: active_zones before emergency stop: {self.active_zones}")
            
            success_count = 0
            for zone_id in ZONE_PINS.keys():
                if self.zone_states.get(zone_id, {}).get('active', False):
                    if self.deactivate_zone_direct(zone_id, 'emergency_stop'):
                        success_count += 1
            
            print(f"DEBUG: active_zones after emergency stop: {self.active_zones}")
            
            self._setup_logging()
            self.log_event(self.user_logger, 'WARN', f'Emergency stop executed', zones_stopped=success_count)
            return True
            
        except Exception as e:
            self._setup_logging()  
            self.log_event(self.error_logger, 'ERROR', f'Emergency stop failed', error=str(e))
            return False
    
    def shutdown_stop_all_zones(self) -> bool:
        """Shutdown stop all zones - preserves active_zones for restoration"""
        try:
            print(f"DEBUG: shutdown_stop_all_zones called")
            print(f"DEBUG: active_zones before shutdown stop: {self.active_zones}")
            
            success_count = 0
            for zone_id in ZONE_PINS.keys():
                if self.zone_states.get(zone_id, {}).get('active', False):
                    print(f"DEBUG: Shutdown stop preserving active_zones for zone {zone_id}")
                    # Only deactivate hardware, preserve active_zones
                    deactivate_zone(zone_id)
                    # Update zone state but keep end_time for restoration
                    self.zone_states[zone_id] = {
                        'active': False,
                        'end_time': self.zone_states[zone_id]['end_time'],  # Keep for restoration
                        'type': self.zone_states[zone_id]['type'],
                        'remaining': 0
                    }
                    success_count += 1
            
            print(f"DEBUG: active_zones after shutdown stop: {self.active_zones}")
            
            self._setup_logging()
            self.log_event(self.user_logger, 'INFO', f'Shutdown stop executed', zones_stopped=success_count)
            return True
            
        except Exception as e:
            self._setup_logging()  
            self.log_event(self.error_logger, 'ERROR', f'Shutdown stop failed', error=str(e))
            return False
    
    # =============================================================================
    # IMPROVED MISSED EVENT DETECTION AND RESTORATION
    # =============================================================================
    
    def catch_up_missed_events(self):
        """On startup, catch up on any missed watering events that are still within their window"""
        try:
            # Use cached schedule and settings
            if not self.schedule:
                print("Debug: No cached schedule, skipping catch-up")
                return
            print(f"Debug: Using cached schedule with {len(self.schedule)} zones")
            
            schedule = self.schedule
            
            now = datetime.now()
            print(f"Debug: Current time: {now}")
            
            # Use cached settings
            if not self.settings:
                print("Debug: No cached settings, using defaults for catch-up")
                lat, lon, tz = 0.0, 0.0, 'UTC'
            else:
                lat = self.settings.get('gps_lat', 0.0)
                lon = self.settings.get('gps_lon', 0.0)
                tz = self.settings.get('timezone', 'UTC')
                print(f"Debug: Using cached settings - lat: {lat}, lon: {lon}, tz: {tz}")
            
            # Get solar times for today
            city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
            dt = now.astimezone(pytz.timezone(tz))
            s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)
            print(f"Debug: Solar times for today: sunrise={s['sunrise']}, sunset={s['sunset']}, noon={s['noon']}")
            
            # Determine outage window to check for missed events
            # Check events from the last 24 hours that might have been missed
            outage_start = dt - timedelta(hours=24)
            print(f"Debug: Checking for missed events since {outage_start}")
            
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
                    
                    # NEW: Check for events that should have started during outage but are now past their window
                    elif start_time >= outage_start and start_time < dt:
                        # Event should have started during the outage window but is now past
                        time_since_start = (dt - start_time).total_seconds()
                        event_duration_seconds = duration.total_seconds()
                        
                        print(f"Debug:     Event should have started during outage (started {time_since_start:.0f}s ago)")
                        
                        # If the event would still be running (within its duration), start it for remaining time
                        if time_since_start < event_duration_seconds:
                            remaining = event_duration_seconds - time_since_start
                            print(f"Debug:     Event would still be running! Starting for remaining {int(remaining)} sec")
                            success = self.activate_zone_direct(zone_id, int(remaining), 'scheduled')
                            if success:
                                restored_count += 1
                                self._setup_logging()
                                self.log_event(self.watering_logger, 'INFO', 
                                             'Catch-up: Started missed event from outage', 
                                             zone_id=zone_id, 
                                             missed_start=start_time.strftime('%H:%M'),
                                             remaining=int(remaining))
                            else:
                                print(f"Debug:     Failed to start missed event for zone {zone_id}")
                        else:
                            print(f"Debug:     Event would have already finished ({time_since_start:.0f}s > {event_duration_seconds:.0f}s), skipping")
                    else:
                        print("Debug:     Event not currently active and not in outage window")
            
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
            # Ensure timezone is preserved
            start_time = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
            print(f"DEBUG: Absolute time {value} resolved to {start_time} (timezone: {start_time.tzinfo})")
            return start_time
        elif value.startswith('SUNRISE'):
            base = solar_times['sunrise']
            offset = self._parse_offset(value, 'SUNRISE')
            start_time = base + offset
            print(f"DEBUG: SUNRISE {value} resolved to {start_time} (base={base}, offset={offset})")
            return start_time
        elif value.startswith('SUNSET'):
            base = solar_times['sunset']
            offset = self._parse_offset(value, 'SUNSET')
            start_time = base + offset
            print(f"DEBUG: SUNSET {value} resolved to {start_time} (base={base}, offset={offset})")
            return start_time
        elif value.startswith('ZENITH'):
            base = solar_times['noon']
            offset = self._parse_offset(value, 'ZENITH')
            start_time = base + offset
            print(f"DEBUG: ZENITH {value} resolved to {start_time} (base={base}, offset={offset})")
            return start_time
        
        print(f"DEBUG: Could not resolve event time for value: {value}")
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
            print(f"Debug: Loading active zones from {self.active_zones_file}")
            if os.path.exists(self.active_zones_file):
                with open(self.active_zones_file, 'r') as f:
                    data = json.load(f)
                    print(f"Debug: Found {len(data)} active zones in file: {data}")
                    
                    # Get timezone for proper datetime handling
                    tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
                    tz = pytz.timezone(tz_name)
                    current_time = datetime.now(tz)
                    
                    # Handle both old format (string) and new format (dict)
                    for zone_id, zone_data in data.items():
                        # Handle old format where zone_data is just a string
                        if isinstance(zone_data, str):
                            end_time_str = zone_data
                            event_type = 'manual'  # Default for old format
                        else:
                            # New format where zone_data is a dict
                            end_time_str = zone_data.get('end_time')
                            event_type = zone_data.get('type', 'manual')
                        
                        # Parse the datetime and make it timezone-aware
                        end_time = datetime.fromisoformat(end_time_str)
                        if end_time.tzinfo is None:
                            # If stored time is naive, assume it's in the configured timezone
                            end_time = tz.localize(end_time)
                        
                        print(f"Debug: Zone {zone_id} end time: {end_time}, type: {event_type} (now: {current_time})")
                        
                        # Only restore if the timer hasn't expired
                        if end_time > current_time:
                            zone_id_int = int(zone_id)
                            self.active_zones[zone_id_int] = end_time
                            # Activate the hardware
                            activate_zone(zone_id_int)
                            # Update zone state with the correct event type
                            remaining = int((end_time - current_time).total_seconds())
                            self.zone_states[zone_id_int] = {
                                'active': True,
                                'end_time': end_time,
                                'type': event_type,  # Use the saved event type
                                'remaining': remaining
                            }
                            print(f"✅ Restored active zone {zone_id} with end time {end_time}, type: {event_type} (remaining: {remaining}s)")
                        else:
                            print(f"⚠️  Zone {zone_id} timer expired at {end_time}, not restoring")
            else:
                print(f"Debug: Active zones file does not exist: {self.active_zones_file}")
        except Exception as e:
            print(f"❌ Error loading active zones: {e}")
            import traceback
            traceback.print_exc()
    
    def save_active_zones(self):
        """Save active zones to persistent storage"""
        try:
            print(f"DEBUG: save_active_zones called")
            print(f"DEBUG: Saving {len(self.active_zones)} active zones to {self.active_zones_file}")
            print(f"DEBUG: Active zones: {self.active_zones}")
            
            # Save both end_time and event_type for each zone
            data = {}
            for zone_id, end_time in self.active_zones.items():
                zone_state = self.zone_states.get(zone_id, {})
                event_type = zone_state.get('type', 'manual')  # Default to manual if not set
                data[str(zone_id)] = {
                    'end_time': end_time.isoformat(),
                    'type': event_type
                }
            
            print(f"DEBUG: Saving data: {data}")
            
            with open(self.active_zones_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            print(f"✅ Active zones saved successfully")
        except Exception as e:
            print(f"❌ Error saving active zones: {e}")
            import traceback
            traceback.print_exc()
    
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
        # Increment debug counter
        self.check_count += 1
        self.last_check_time = datetime.now()
        
        # Use timezone-aware datetime for comparison
        tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
        tz = pytz.timezone(tz_name)
        current_time = datetime.now(tz)
        zones_to_stop = []
        
        print(f"DEBUG: check_and_stop_expired_zones #{self.check_count} - current_time={current_time} (timezone: {tz_name})")
        print(f"DEBUG: active_zones={self.active_zones}")
        
        for zone_id, end_time in self.active_zones.items():
            # Ensure end_time is timezone-aware for comparison
            if end_time.tzinfo is None:
                # If stored end_time is naive, assume it's in the configured timezone
                end_time = tz.localize(end_time)
                print(f"DEBUG: Converted naive end_time to timezone-aware: {end_time}")
            else:
                # If it has timezone info, convert to our timezone for comparison
                end_time = end_time.astimezone(tz)
                print(f"DEBUG: Converted end_time to local timezone: {end_time}")
            
            print(f"DEBUG: Checking zone {zone_id}, end_time={end_time}, expired={current_time >= end_time}")
            if current_time >= end_time:
                zones_to_stop.append(zone_id)
                print(f"DEBUG: Zone {zone_id} marked for stopping (expired)")
        
        print(f"DEBUG: Zones to stop: {zones_to_stop}")
        
        # Process zones one at a time to avoid race conditions
        for zone_id in zones_to_stop:
            print(f"Stopping expired zone {zone_id}")
            
            # Add a small delay between deactivations to prevent race conditions
            if len(zones_to_stop) > 1:
                time.sleep(0.1)  # 100ms delay between multiple zone deactivations
            
            success = self.deactivate_zone_direct(zone_id, 'timer_expired')
            if not success:
                self._setup_logging()
                self.log_event(self.error_logger, 'ERROR', f'Failed to stop expired zone', zone_id=zone_id)
                print(f"ERROR: Failed to stop expired zone {zone_id}")
            else:
                print(f"SUCCESS: Stopped expired zone {zone_id}")
                
        # If we stopped any zones, add a small delay before next check
        if zones_to_stop:
            time.sleep(0.2)  # 200ms delay after stopping zones
            print(f"DEBUG: Stopped {len(zones_to_stop)} expired zones")
        else:
            print(f"DEBUG: No expired zones to stop")
    
    def check_scheduled_events(self):
        """Check for scheduled events that should start now"""
        try:
            # Use cached schedule and settings
            if not self.schedule or not self.settings:
                print("DEBUG: No schedule or settings available")
                return

            schedule = self.schedule
            lat = self.settings.get('gps_lat', 0.0)
            lon = self.settings.get('gps_lon', 0.0)
            tz = self.settings.get('timezone', 'UTC')

            print(f"DEBUG: check_scheduled_events - tz={tz}, lat={lat}, lon={lon}")

            # Get solar times for today
            city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
            dt = datetime.now().astimezone(pytz.timezone(tz))
            s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)
            
            print(f"DEBUG: Current time in {tz}: {dt}")
            print(f"DEBUG: Schedule zones: {list(schedule.keys())}")
            
            for zone_id_str, zone_data in schedule.items():
                zone_id = int(zone_id_str)
                
                print(f"DEBUG: Checking zone {zone_id}")
                
                # Skip disabled zones
                mode = zone_data.get('mode', 'manual')
                if mode == 'disabled':
                    print(f"DEBUG: Zone {zone_id} is disabled, skipping")
                    continue
                
                # Skip if zone is already active
                zone_state = self.zone_states.get(zone_id, {})
                if zone_state.get('active', False):
                    print(f"DEBUG: Zone {zone_id} is already active, skipping")
                    continue
                
                period = zone_data.get('period', 'D')
                start_day = zone_data.get('startDay', '')
                times = zone_data.get('times', [])
                
                print(f"DEBUG: Zone {zone_id} - period={period}, start_day={start_day}, times={times}")
                
                # Check if this zone should run today
                should_run_today = self._should_run_today(period, start_day, dt)
                if not should_run_today:
                    print(f"DEBUG: Zone {zone_id} should not run today")
                    continue
                
                print(f"DEBUG: Zone {zone_id} should run today")
                
                # Check each scheduled time
                for event in times:
                    value = event.get('value')
                    duration_str = event.get('duration', '000100')
                    
                    print(f"DEBUG: Checking event - value={value}, duration={duration_str}")
                    
                    # Resolve start_time
                    start_time = self._resolve_event_time(value, s, dt)
                    if not start_time:
                        print(f"DEBUG: Could not resolve start_time for event {value}")
                        continue
                    
                    print(f"DEBUG: Resolved start_time={start_time}")
                    
                    # Parse duration
                    try:
                        duration = self._parse_duration(duration_str)
                    except Exception as e:
                        print(f"Duration parse failed: {e}, using default 1 min")
                        duration = timedelta(minutes=1)
                    
                    # Check if it's time to start this event (within 5 seconds after start time)
                    time_since_start = (dt - start_time).total_seconds()
                    print(f"DEBUG: time_since_start={time_since_start:.1f}s")
                    
                    if 0 <= time_since_start < 5:  # Trigger within 5 seconds after scheduled time
                        print(f"Scheduled event triggered for zone {zone_id} at {start_time} (detected {time_since_start:.1f}s after)")
                        success = self.activate_zone_direct(zone_id, int(duration.total_seconds()), 'scheduled')
                        if success:
                            self._setup_logging()
                            self.log_event(self.watering_logger, 'INFO', 
                                         'Scheduled event started', 
                                         zone_id=zone_id, 
                                         scheduled_time=start_time.strftime('%H:%M'),
                                         duration=int(duration.total_seconds()))
                            print(f"SUCCESS: Scheduled event started for zone {zone_id}")
                        else:
                            self._setup_logging()
                            self.log_event(self.error_logger, 'ERROR', 
                                         'Failed to start scheduled event', 
                                         zone_id=zone_id, 
                                         scheduled_time=start_time.strftime('%H:%M'))
                            print(f"ERROR: Failed to start scheduled event for zone {zone_id}")
                        break  # Only start one event per zone per check
                    else:
                        print(f"DEBUG: Not time yet for zone {zone_id} event (time_since_start={time_since_start:.1f}s)")
                        
        except Exception as e:
            print(f"ERROR in check_scheduled_events: {e}")
            import traceback
            traceback.print_exc()
            self._setup_logging()
            self.log_event(self.error_logger, 'ERROR', f'Scheduled event check failed', error=str(e))
    
    def run_scheduler_loop(self):
        """Main scheduler loop"""
        print("DEBUG: Scheduler loop started")
        loop_count = 0
        
        while self.running:
            try:
                loop_count += 1
                if loop_count % 60 == 0:  # Log every 60 seconds
                    print(f"DEBUG: Scheduler loop iteration {loop_count}")
                
                # Check for expired manual timers (MOST IMPORTANT - check every loop)
                self.check_and_stop_expired_zones()
                
                # Check for scheduled events (less frequent)
                if loop_count % 10 == 0:  # Check every 10 seconds
                    self.check_scheduled_events()
                
                # Update remaining times for active zones
                tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
                tz = pytz.timezone(tz_name)
                current_time = datetime.now(tz)
                
                for zone_id in list(self.zone_states.keys()):
                    state = self.zone_states[zone_id]
                    if state['active'] and state['end_time']:
                        end_time = state['end_time']
                        # Ensure end_time is timezone-aware
                        if end_time.tzinfo is None:
                            end_time = tz.localize(end_time)
                        
                        remaining = (end_time - current_time).total_seconds()
                        state['remaining'] = max(0, int(remaining))
                        if loop_count % 10 == 0:  # Log every 10 seconds
                            print(f"DEBUG: Zone {zone_id} remaining time: {state['remaining']}s")
                
                # Debug zone states every 30 seconds to catch mismatches
                if loop_count % 30 == 0:
                    self.debug_zone_states()
                
                # Sleep for a shorter interval to catch expired timers faster
                time.sleep(0.5)  # Check every 500ms instead of 1 second
                
            except Exception as e:
                print(f"ERROR in scheduler loop: {e}")
                import traceback
                traceback.print_exc()
                time.sleep(5)  # Wait longer on error
        
        print("DEBUG: Scheduler loop ended")
    
    def start(self):
        """Start the scheduler"""
        print("DEBUG: Scheduler start() method called")
        if not self.running:
            print("DEBUG: Scheduler not running, starting now...")
            self.running = True
            self.thread = threading.Thread(target=self.run_scheduler_loop, daemon=True)
            self.thread.start()
            
            # Wait a moment and verify the thread is alive
            time.sleep(0.5)
            if self.thread.is_alive():
                print("DEBUG: Scheduler thread started and is alive")
                print("Watering scheduler started")
            else:
                print("ERROR: Scheduler thread failed to start!")
                self.running = False
        else:
            print("DEBUG: Scheduler already running")
    
    def shutdown(self):
        """Proper shutdown that saves active zones before stopping"""
        try:
            print("Scheduler: Saving active zones before shutdown...")
            print(f"DEBUG: active_zones before save: {self.active_zones}")
            
            # Save active zones BEFORE any deactivation
            self.save_active_zones()
            
            # Use shutdown_stop_all_zones instead of emergency_stop_all_zones
            print("DEBUG: Calling shutdown_stop_all_zones to preserve active_zones")
            self.shutdown_stop_all_zones()
            
            print(f"DEBUG: active_zones after shutdown stop: {self.active_zones}")
            
            # Stop the scheduler loop
            self.running = False
            if self.thread:
                self.thread.join(timeout=5)
            
            # Clean up GPIO (but don't call emergency_stop)
            print("DEBUG: Calling cleanup_gpio() without emergency_stop")
            cleanup_gpio()
            print("Scheduler: Shutdown complete - active zones saved for restoration")
            
        except Exception as e:
            print(f"Scheduler: Error during shutdown: {e}")
            import traceback
            traceback.print_exc()
    
    def stop(self):
        """Stop the scheduler and clean up GPIO"""
        self.shutdown()

    def debug_zone_states(self):
        """Debug method to show current state of all zones"""
        print("\n=== ZONE STATE DEBUG ===")
        print(f"Active zones (scheduler): {self.active_zones}")
        print(f"Zone states (scheduler): {self.zone_states}")
        
        # Get actual GPIO states
        from .gpio import get_all_zone_states, ZONE_PINS
        gpio_states = get_all_zone_states()
        print(f"GPIO states (hardware): {gpio_states}")
        
        print("\nDetailed zone status:")
        for zone_id in sorted(ZONE_PINS.keys()):
            scheduler_state = self.zone_states.get(zone_id, {})
            gpio_state = gpio_states.get(zone_id, False)
            active_in_scheduler = zone_id in self.active_zones
            
            print(f"Zone {zone_id}:")
            print(f"  Scheduler active: {active_in_scheduler}")
            print(f"  Scheduler state: {scheduler_state}")
            print(f"  GPIO state: {gpio_state}")
            print(f"  Mismatch: {'YES' if scheduler_state.get('active', False) != gpio_state else 'NO'}")
        
        print("=== END DEBUG ===\n")

# Global scheduler instance
scheduler = WateringScheduler() 