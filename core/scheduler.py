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

# Import unified logging system
from .logging import log_event, setup_logger

class WateringScheduler:
    def __init__(self):
        self.lock = threading.Lock()  # Initialize lock first!
        self.running = False
        self.thread = None
        self.active_zones = {}  # zone_id -> end_time
        self.zone_states = {}   # zone_id -> state dict
        self.canceled_timers = set()  # Track manually canceled timers to prevent restoration
        
        # File paths
        self.active_zones_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'active_zones.json')
        self.schedule_file = os.path.join(os.path.dirname(__file__), '..', 'data', 'schedule.json')
        self.settings_file = os.path.join(os.path.dirname(__file__), '..', 'config', 'settings.cfg')
        
        # Caching for performance
        self.schedule = {}  # Cached schedule
        self.settings = {}  # Cached settings
        self.solar_times_cache = {}  # Cache solar times by date
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
        
        # Catch up on missed events with timeout protection
        try:
            # Use threading-based timeout for cross-platform compatibility
            catch_up_completed = threading.Event()
            catch_up_error = None
            
            def catch_up_worker():
                nonlocal catch_up_error
                try:
                    self.catch_up_missed_events()
                    catch_up_completed.set()
                except Exception as e:
                    catch_up_error = e
                    catch_up_completed.set()
            
            # Start catch-up in a separate thread
            catch_up_thread = threading.Thread(target=catch_up_worker, daemon=True)
            catch_up_thread.start()
            
            # Wait for completion with 30-second timeout
            if catch_up_completed.wait(timeout=30):
                if catch_up_error:
                    print(f"Debug: Catch-up failed: {catch_up_error}")
                    self._setup_logging()
                    log_event(self.error_logger, 'ERROR', f'Catch-up failed', error=str(catch_up_error))
            else:
                print("Debug: Catch-up timed out after 30 seconds, continuing without catch-up")
                self._setup_logging()
                log_event(self.error_logger, 'WARN', 'Catch-up timed out, continuing without catch-up')
                
        except Exception as e:
            print(f"Debug: Catch-up setup failed: {e}, skipping")
            self._setup_logging()
            log_event(self.error_logger, 'WARN', 'Catch-up setup failed, skipping', error=str(e))

    def get_current_time(self):
        """Get current time in configured timezone"""
        tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
        tz = pytz.timezone(tz_name)
        utc_now = datetime.now(pytz.UTC)
        return utc_now.astimezone(tz)

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
        """Setup logging for scheduler events using unified system"""
        # Setup unified loggers
        self.watering_logger = setup_logger('watering', 'watering.log')
        self.user_logger = setup_logger('user', 'user.log') 
        self.error_logger = setup_logger('error', 'error.log')
    
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
        # Do all calculations OUTSIDE the lock
        end_time = None
        if duration_seconds:
            tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
            tz = pytz.timezone(tz_name)
            utc_now = datetime.now(pytz.UTC)
            now = utc_now.astimezone(tz)
            end_time = now + timedelta(seconds=duration_seconds)
        
        zone_state = {
            'active': True,
            'end_time': end_time,
            'type': event_type,
            'remaining': duration_seconds if duration_seconds else 0
        }
        
        try:
            # Activate hardware OUTSIDE the lock (GPIO operations are atomic)
            activate_zone(zone_id)
            
            # Now acquire lock for minimal time to update data structures
            lock_acquired = False
            save_needed = False
            try:
                lock_acquired = self.lock.acquire(timeout=2.0)  # 2 second timeout
                if lock_acquired:
                    # Update zone state
                    self.zone_states[zone_id] = zone_state
                    
                    # Add to active zones if duration specified
                    if duration_seconds:
                        self.active_zones[zone_id] = end_time
                        # Don't save while holding lock - do it after
                        save_needed = True
                    else:
                        save_needed = False
                else:
                    print(f"WARNING: Zone {zone_id} GPIO activated but not tracked by scheduler!")
                    return False
            finally:
                if lock_acquired:
                    self.lock.release()
            
            # Save active zones after releasing lock (file I/O can be slow)
            if lock_acquired and save_needed:
                self.save_active_zones()
            
            # Logging outside the lock
            self._setup_logging()
            log_event(self.watering_logger, 'INFO', f'{event_type.title()} zone activation', 
                     zone_id=zone_id, duration=duration_seconds)
            
            print(f"Zone {zone_id} activated for {duration_seconds}s ({event_type})")
            return True
            
        except Exception as e:
            self._setup_logging()
            log_event(self.error_logger, 'ERROR', f'Zone activation failed', 
                     zone_id=zone_id, error=str(e))
            print(f"Scheduler: Failed to activate zone {zone_id}: {e}")
            return False
    
    def deactivate_zone_direct(self, zone_id: int, reason: str = 'manual', skip_lock: bool = False) -> bool:
        """
        Directly deactivate a zone through scheduler (primary GPIO controller)
        Args:
            zone_id: Zone to deactivate  
            reason: Reason for deactivation ('manual', 'timer_expired', 'scheduled')
            skip_lock: If True, skip acquiring the lock (for internal calls)
        Returns:
            bool: Success status
        """
        try:
            if skip_lock:
                # Internal call - assume lock is already held
                print(f"DEBUG: deactivate_zone_direct called (skip_lock=True) - zone_id={zone_id}, reason={reason}")
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
                    # Don't save while lock is held by caller - they should handle it
                    print(f"DEBUG: Skipping save_active_zones (skip_lock=True)")
                else:
                    print(f"DEBUG: Zone {zone_id} not in active_zones, skipping removal")
            else:
                # External call - acquire lock
                with self.lock:
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
                        print(f"DEBUG: About to call save_active_zones...")
                        self.save_active_zones(skip_lock=True)
                        print(f"DEBUG: save_active_zones call completed")
                    else:
                        print(f"DEBUG: Zone {zone_id} not in active_zones, skipping removal")
                
                self._setup_logging()
                log_event(self.watering_logger, 'INFO', f'Zone deactivated - {reason}', zone_id=zone_id)
                
                print(f"Scheduler: Deactivated zone {zone_id} - {reason}")
                return True
                
        except Exception as e:
            print(f"ERROR in deactivate_zone_direct: {e}")
            import traceback
            traceback.print_exc()
            self._setup_logging()
            log_event(self.error_logger, 'ERROR', f'Zone deactivation failed', 
                     zone_id=zone_id, error=str(e))
            print(f"Scheduler: Failed to deactivate zone {zone_id}: {e}")
            return False
    
    def get_zone_status(self, zone_id: int) -> Dict:
        """Get current status of a zone"""
        try:
            with self.lock:
                state = self.zone_states.get(zone_id, {
                    'active': False,
                    'end_time': None,
                    'type': None,
                    'remaining': 0
                })
                
                # Update remaining time if active with timer
                if state['active'] and state['end_time']:
                    try:
                        # Use timezone-aware datetime for calculation
                        tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
                        tz = pytz.timezone(tz_name)
                        # Get current UTC time and convert to configured timezone
                        utc_now = datetime.now(pytz.UTC)
                        current_time = utc_now.astimezone(tz)
                        
                        end_time = state['end_time']
                        # Ensure end_time is timezone-aware
                        if end_time.tzinfo is None:
                            end_time = tz.localize(end_time)
                        
                        remaining = (end_time - current_time).total_seconds()
                        state['remaining'] = max(0, int(remaining))
                    except Exception as e:
                        print(f"Error calculating remaining time for zone {zone_id}: {e}")
                        state['remaining'] = 0
                
                return state.copy()
        except Exception as e:
            print(f"Error in get_zone_status for zone {zone_id}: {e}")
            return {
                'active': False,
                'end_time': None,
                'type': None,
                'remaining': 0,
                'error': str(e)
            }
    
    def get_all_zone_status(self) -> Dict[int, Dict]:
        """Get status of all zones"""
        status = {}
        try:
            # Acquire lock once and copy all data quickly
            with self.lock:
                zone_states_copy = self.zone_states.copy()
                settings_copy = self.settings.copy()
            
            # Process data outside of lock
            tz_name = settings_copy.get('timezone', 'UTC') if settings_copy else 'UTC'
            tz = pytz.timezone(tz_name)
            utc_now = datetime.now(pytz.UTC)
            current_time = utc_now.astimezone(tz)
            
            for zone_id in ZONE_PINS.keys():
                try:
                    state = zone_states_copy.get(zone_id, {
                        'active': False,
                        'end_time': None,
                        'type': None,
                        'remaining': 0
                    })
                    
                    # Update remaining time if active with timer
                    if state.get('active', False) and state.get('end_time'):
                        try:
                            end_time = state['end_time']
                            if end_time.tzinfo is None:
                                end_time = tz.localize(end_time)
                            
                            remaining = (end_time - current_time).total_seconds()
                            state['remaining'] = max(0, int(remaining))
                        except Exception as e:
                            print(f"Error calculating remaining time for zone {zone_id}: {e}")
                            state['remaining'] = 0
                    
                    status[zone_id] = state.copy()
                except Exception as e:
                    print(f"Error getting status for zone {zone_id}: {e}")
                    status[zone_id] = {
                        'active': False,
                        'end_time': None,
                        'type': None,
                        'remaining': 0,
                        'error': str(e)
                    }
            return status
        except Exception as e:
            print(f"Error in get_all_zone_status: {e}")
            # Return a safe default status
            return {zone_id: {
                'active': False,
                'end_time': None,
                'type': None,
                'remaining': 0,
                'error': 'Status unavailable'
            } for zone_id in ZONE_PINS.keys()}
    
    def emergency_stop_all_zones(self) -> bool:
        """Emergency stop all zones"""
        try:
            print(f"DEBUG: emergency_stop_all_zones called")
            print(f"DEBUG: active_zones before emergency stop: {self.active_zones}")
            
            success_count = 0
            with self.lock:
                for zone_id in ZONE_PINS.keys():
                    if self.zone_states.get(zone_id, {}).get('active', False):
                        if self.deactivate_zone_direct(zone_id, 'emergency_stop'):
                            success_count += 1
            
            print(f"DEBUG: active_zones after emergency stop: {self.active_zones}")
            
            self._setup_logging()
            log_event(self.user_logger, 'WARN', f'Emergency stop executed', zones_stopped=success_count)
            return True
            
        except Exception as e:
            self._setup_logging()  
            log_event(self.error_logger, 'ERROR', f'Emergency stop failed', error=str(e))
            return False
    
    def shutdown_stop_all_zones(self) -> bool:
        """Shutdown stop all zones - preserves active_zones for restoration"""
        try:
            print(f"DEBUG: shutdown_stop_all_zones called")
            print(f"DEBUG: active_zones before shutdown stop: {self.active_zones}")
            
            success_count = 0
            with self.lock:
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
            log_event(self.user_logger, 'INFO', f'Shutdown stop executed', zones_stopped=success_count)
            return True
            
        except Exception as e:
            self._setup_logging()  
            log_event(self.error_logger, 'ERROR', f'Shutdown stop failed', error=str(e))
            return False
    
    # =============================================================================
    # IMPROVED MISSED EVENT DETECTION AND RESTORATION
    # =============================================================================
    
    def catch_up_missed_events(self):
        """On startup, catch up on any missed watering events that are still within their window"""
        try:
            with self.lock:
                # Use cached schedule and settings
                if not self.schedule:
                    return
                
                schedule = self.schedule
                
                now = self.get_current_time()
                
                # Use cached settings
                if not self.settings:
                    lat, lon, tz = 0.0, 0.0, 'UTC'
                else:
                    lat = self.settings.get('gps_lat', 0.0)
                    lon = self.settings.get('gps_lon', 0.0)
                    tz = self.settings.get('timezone', 'UTC')
                
                # Get solar times for today (cached)
                try:
                    dt = now.astimezone(pytz.timezone(tz))
                    s = self._get_solar_times(dt)
                except Exception as e:
                    return
                
                # Determine outage window to check for missed events
                # Check events from the last 24 hours that might have been missed
                outage_start = dt - timedelta(hours=24)
                
                restored_count = 0
                processed_zones = 0
                
                for zone_id_str, zone_data in schedule.items():
                    zone_id = int(zone_id_str)
                    processed_zones += 1
                    
                    # Add timeout protection - limit processing time
                    if processed_zones > 20:  # Limit to 20 zones max
                        break
                    
                    # Skip disabled zones  
                    mode = zone_data.get('mode', 'manual')
                    if mode == 'disabled':
                        continue
                    
                    # Skip if zone is already active
                    if self.zone_states.get(zone_id, {}).get('active', False):
                        continue
                    
                    # Skip if zone was manually canceled
                    if zone_id in self.canceled_timers:
                        continue
                    
                    period = zone_data.get('period', 'D')
                    start_day = zone_data.get('startDay', '')
                    times = zone_data.get('times', [])
                    
                    # Check if this zone should run today based on period
                    should_run_today = self._should_run_today(period, start_day, dt)
                    
                    if not should_run_today:
                        continue
                    
                    # Check each scheduled time - limit to 5 events per zone
                    for event_idx, event in enumerate(times[:5]):
                        start_time_code = event.get('start_time') or event.get('value')  # Support both old and new format
                        duration_str = event.get('duration', '000100')
                        print(f"Debug:   Event {event_idx+1} - code: {start_time_code}, duration: {duration_str}")
                        
                        # Resolve start_time
                        start_time = self._resolve_event_time(start_time_code, s, dt)
                        if not start_time:
                            print(f"Debug:     Skipping unknown code: {start_time_code}")
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
                                    log_event(self.watering_logger, 'INFO', 
                                             'Catch-up: Restored missed scheduled event', 
                                             zone_id=zone_id, remaining=int(remaining))
                                else:
                                    print(f"Debug:     Failed to restore zone {zone_id}")
                            else:
                                print(f"Debug:     Too little time remaining ({remaining:.1f}s), skipping")
                        
                        # Check for events that should have started during outage but are now past their window
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
                                    log_event(self.watering_logger, 'INFO', 
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
                    log_event(self.watering_logger, 'INFO', f'Startup catch-up completed', events_restored=restored_count)
                else:
                    print("Catch-up complete: No missed events to restore")
                    
        except Exception as e:
            print(f"Error in catch_up_missed_events: {e}")
            import traceback
            traceback.print_exc()
            self._setup_logging()
            log_event(self.error_logger, 'ERROR', f'Catch-up failed', error=str(e))
    
    def _should_run_today(self, period: str, start_day: str, dt: datetime) -> bool:
        """Check if a scheduled event should run today"""
        if period == 'D':
            return True
        elif period == 'W' and start_day:
            try:
                start_date = datetime.strptime(start_day, '%Y-%m-%d')
                if dt.weekday() == start_date.weekday():
                    return True
                else:
                    return False
            except:
                print(f"Debug:   Failed to parse start_day: {start_day}")
                return False
        elif period == 'M' and start_day:
            try:
                start_date = datetime.strptime(start_day, '%Y-%m-%d')
                if dt.day == start_date.day:
                    return True
                else:
                    return False
            except:
                print(f"Debug:   Failed to parse start_day: {start_day}")
                return False
        return False
    
    def _resolve_event_time(self, value: str, solar_times: dict, dt: datetime) -> Optional[datetime]:
        """Resolve event time from various formats"""
        if not value:
            return None
            
        # Handle HH:MM format (new standard)
        if ':' in value and len(value) == 5:
            try:
                hour = int(value[:2])
                minute = int(value[3:])
                # Ensure timezone is preserved
                start_time = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
                print(f"DEBUG: HH:MM time {value} resolved to {start_time} (timezone: {start_time.tzinfo})")
                return start_time
            except ValueError:
                print(f"DEBUG: Invalid HH:MM format: {value}")
                return None
        # Handle legacy HHMM format (for backward compatibility)
        elif value.isdigit() and len(value) == 4:
            # Absolute time like "0800"
            hour = int(value[:2])
            minute = int(value[2:])
            # Ensure timezone is preserved
            start_time = dt.replace(hour=hour, minute=minute, second=0, microsecond=0)
            print(f"DEBUG: Legacy HHMM time {value} resolved to {start_time} (timezone: {start_time.tzinfo})")
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
    
    def _get_solar_times(self, dt: datetime) -> dict:
        """Get solar times for a date, using cache if available"""
        date_key = dt.date().isoformat()
        
        # Check cache first
        if date_key in self.solar_times_cache:
            return self.solar_times_cache[date_key]
        
        # Calculate solar times if not cached
        try:
            lat = self.settings.get('gps_lat', 0.0)
            lon = self.settings.get('gps_lon', 0.0)
            tz = self.settings.get('timezone', 'UTC')
            
            city = LocationInfo(latitude=lat, longitude=lon, timezone=tz)
            s = sun(city.observer, date=dt.date(), tzinfo=city.timezone)
            
            # Cache the result
            self.solar_times_cache[date_key] = s
            
            # Clean up old cache entries (keep only last 7 days)
            cache_dates = list(self.solar_times_cache.keys())
            if len(cache_dates) > 7:
                for old_date in cache_dates[:-7]:
                    del self.solar_times_cache[old_date]
            
            return s
        except Exception as e:
            print(f"Error calculating solar times: {e}")
            return {}
    
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
            with self.lock:
                print(f"Debug: Loading active zones from {self.active_zones_file}")
                if os.path.exists(self.active_zones_file):
                    with open(self.active_zones_file, 'r') as f:
                        data = json.load(f)
                        print(f"Debug: Found {len(data)} active zones in file: {data}")
                        
                        # Get timezone for proper datetime handling
                        tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
                        tz = pytz.timezone(tz_name)
                        # Get current UTC time and convert to configured timezone
                        utc_now = datetime.now(pytz.UTC)
                        current_time = utc_now.astimezone(tz)
                        
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
                            
                            # Only restore if the timer hasn't expired and wasn't manually canceled
                            zone_id_int = int(zone_id)
                            if zone_id_int in self.canceled_timers:
                                print(f"⚠️  Zone {zone_id} was manually canceled, not restoring")
                            elif end_time > current_time:
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
    
    def save_active_zones(self, skip_lock: bool = False):
        """Save active zones to persistent storage"""
        try:
            if skip_lock:
                # Assume lock is already held by caller
                print(f"DEBUG: save_active_zones called (skip_lock=True)")
            else:
                # Acquire lock
                print(f"DEBUG: save_active_zones called (skip_lock=False)")
                self.lock.acquire()
            
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
            print(f"DEBUG: File path: {self.active_zones_file}")
            print(f"DEBUG: File exists before save: {os.path.exists(self.active_zones_file)}")
            
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.active_zones_file), exist_ok=True)
            
            with open(self.active_zones_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            print(f"DEBUG: File exists after save: {os.path.exists(self.active_zones_file)}")
            print(f"DEBUG: File size after save: {os.path.getsize(self.active_zones_file) if os.path.exists(self.active_zones_file) else 'N/A'}")
            print(f"✅ Active zones saved successfully")
            
        except Exception as e:
            print(f"❌ Error saving active zones: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if not skip_lock:
                self.lock.release()
    
    def add_manual_timer(self, zone_id: int, duration_seconds: int) -> bool:
        """Add a manual timer for a zone (used by API)"""
        print(f"DEBUG: add_manual_timer called - zone_id={zone_id}, duration={duration_seconds}")
        try:
            result = self.activate_zone_direct(zone_id, duration_seconds, 'manual')
            print(f"DEBUG: add_manual_timer result = {result}")
            return result
        except Exception as e:
            print(f"DEBUG: add_manual_timer exception: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def remove_manual_timer(self, zone_id: int) -> bool:
        """Remove a manual timer for a zone (used by API)"""
        print(f"DEBUG: remove_manual_timer called - zone_id={zone_id}")
        print(f"DEBUG: active_zones before removal: {self.active_zones}")
        try:
            # Mark this timer as manually canceled to prevent restoration
            self.canceled_timers.add(zone_id)
            print(f"DEBUG: Added zone {zone_id} to canceled_timers set")
            
            result = self.deactivate_zone_direct(zone_id, 'manual')
            print(f"DEBUG: remove_manual_timer result = {result}")
            print(f"DEBUG: active_zones after removal: {self.active_zones}")
            return result
        except Exception as e:
            print(f"DEBUG: remove_manual_timer exception: {e}")
            import traceback
            traceback.print_exc()
            return False
    
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
            remaining = (state['end_time'] - self.get_current_time()).total_seconds()
            return max(0, int(remaining))
        return None
    
    def check_and_stop_expired_zones(self):
        """Check for expired zones and stop them"""
        zones_changed = False
        with self.lock:
            initial_active_count = len(self.active_zones)
            self._check_and_stop_expired_zones_internal()
            final_active_count = len(self.active_zones)
            zones_changed = initial_active_count != final_active_count
        
        # Save active zones after releasing lock if any zones were stopped
        if zones_changed:
            self.save_active_zones()
    
    def _check_and_stop_expired_zones_internal(self):
        """Internal method - assumes lock is already held"""
        # Increment debug counter
        self.check_count += 1
        self.last_check_time = self.get_current_time()
        
        # Use timezone-aware datetime for comparison
        tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
        tz = pytz.timezone(tz_name)
        # Get current UTC time and convert to configured timezone
        utc_now = datetime.now(pytz.UTC)
        current_time = utc_now.astimezone(tz)
        zones_to_stop = []
        
        # Lock is already held by caller
        for zone_id, end_time in list(self.active_zones.items()):
            # Convert end_time to the same timezone as current_time for proper comparison
            if end_time.tzinfo is None:
                # If stored end_time is naive, assume it's in the configured timezone
                end_time_tz = tz.localize(end_time)
            else:
                # If it has timezone info, convert to our timezone for comparison
                end_time_tz = end_time.astimezone(tz)
            
            if current_time >= end_time_tz:
                zones_to_stop.append(zone_id)
        
        # Process zones one at a time to avoid race conditions
        for zone_id in zones_to_stop:
            print(f"Zone {zone_id} timer expired")
            
            # Add a small delay between deactivations to prevent race conditions
            if len(zones_to_stop) > 1:
                time.sleep(0.1)  # 100ms delay between multiple zone deactivations
            
            success = self.deactivate_zone_direct(zone_id, 'timer_expired', skip_lock=True)
            if not success:
                self._setup_logging()
                log_event(self.error_logger, 'ERROR', f'Failed to stop expired zone', zone_id=zone_id)
                print(f"ERROR: Failed to stop expired zone {zone_id}")
                
        # If we stopped any zones, add a small delay before next check
        if zones_to_stop:
            time.sleep(0.2)  # 200ms delay after stopping zones
    
    def check_scheduled_events(self):
        """Check for scheduled events that should start now"""
        try:
            # Copy data from cache quickly while holding lock
            with self.lock:
                if not self.schedule or not self.settings:
                    return
                schedule = self.schedule.copy()
                settings = self.settings.copy()
                zone_states = self.zone_states.copy()
            
            # Process everything outside the lock
            dt = self.get_current_time()
            
            # Get solar times for today (cached)
            s = self._get_solar_times(dt)
            
            for zone_id_str, zone_data in schedule.items():
                zone_id = int(zone_id_str)
                
                # Skip disabled zones
                mode = zone_data.get('mode', 'manual')
                if mode == 'disabled':
                    continue
                
                # Skip if zone is already active (check from copied state)
                zone_state = zone_states.get(zone_id, {})
                if zone_state.get('active', False):
                    continue
                
                period = zone_data.get('period', 'D')
                start_day = zone_data.get('startDay', '')
                times = zone_data.get('times', [])
                
                # Check if this zone should run today
                should_run_today = self._should_run_today(period, start_day, dt)
                if not should_run_today:
                    continue
                
                # Check each scheduled time
                for event in times:
                    start_time_code = event.get('start_time') or event.get('value')  # Support both old and new format
                    duration_str = event.get('duration', '000100')
                    
                    # Resolve start_time
                    start_time = self._resolve_event_time(start_time_code, s, dt)
                    if not start_time:
                        continue
                
                    # Parse duration
                    try:
                        duration = self._parse_duration(duration_str)
                    except Exception as e:
                        print(f"Duration parse failed: {e}, using default 1 min")
                        duration = timedelta(minutes=1)
                    
                    # Check if it's time to start this event (within 60 seconds after start time for catch-up)
                    time_since_start = (dt - start_time).total_seconds()
                    
                    if 0 <= time_since_start < 60:  # Trigger within 60 seconds after scheduled time
                        print(f"Scheduled event: Zone {zone_id} at {start_time.strftime('%H:%M:%S')} ({time_since_start:.1f}s after)")
                        success = self.activate_zone_direct(zone_id, int(duration.total_seconds()), 'scheduled')
                        if success:
                            self._setup_logging()
                            log_event(self.watering_logger, 'INFO', 
                                     'Scheduled event started', 
                                     zone_id=zone_id, 
                                     scheduled_time=start_time.strftime('%H:%M'),
                                     duration=int(duration.total_seconds()))
                        else:
                            self._setup_logging()
                            log_event(self.error_logger, 'ERROR', 
                                     'Failed to start scheduled event', 
                                     zone_id=zone_id, 
                                     scheduled_time=start_time.strftime('%H:%M'))
                            print(f"ERROR: Failed to start scheduled event for zone {zone_id}")
                        break  # Only start one event per zone per check
                            
        except Exception as e:
            print(f"Error in check_scheduled_events: {e}")
            self._setup_logging()
            log_event(self.error_logger, 'ERROR', f'Scheduled event check failed', error=str(e))
    
    def run_scheduler_loop(self):
        """Main scheduler loop"""
        print("Watering scheduler started")
        loop_count = 0
        
        try:
            while self.running:
                try:
                    loop_count += 1
                    
                    # Check for expired manual timers (MOST IMPORTANT - check every loop)
                    self.check_and_stop_expired_zones()
                    
                    # Check for scheduled events (more frequent)
                    if loop_count % 2 == 0:  # Check every 2 seconds (2 * 1s sleep)
                        self.check_scheduled_events()
                    
                    # Update remaining times for active zones
                    tz_name = self.settings.get('timezone', 'UTC') if self.settings else 'UTC'
                    tz = pytz.timezone(tz_name)
                    # Get current UTC time and convert to configured timezone
                    utc_now = datetime.now(pytz.UTC)
                    current_time = utc_now.astimezone(tz)
                    
                    for zone_id in list(self.zone_states.keys()):
                        state = self.zone_states[zone_id]
                        if state['active'] and state['end_time']:
                            end_time = state['end_time']
                            # Ensure end_time is timezone-aware
                            if end_time.tzinfo is None:
                                end_time = tz.localize(end_time)
                            else:
                                end_time = end_time.astimezone(tz)
                            
                            remaining = (end_time - current_time).total_seconds()
                            state['remaining'] = max(0, int(remaining))
                    
                    # Debug zone states every 5 minutes to catch mismatches
                    if loop_count % 300 == 0:  # Every 5 minutes
                        self.debug_zone_states()
                    
                    # Sleep for a reasonable interval - balance between responsiveness and performance
                    time.sleep(1.0)  # Check every 1 second
                    
                except Exception as e:
                    print(f"Scheduler error: {e}")
                    time.sleep(5)  # Wait longer on error
                    
        except Exception as e:
            print(f"Scheduler fatal error: {e}")
        
        print("Scheduler stopped")
    
    def start(self):
        """Start the scheduler"""
        if not self.running:
            self.running = True
            self.thread = threading.Thread(target=self.run_scheduler_loop, daemon=True)
            self.thread.start()
            
            # Wait a moment and verify the thread is alive
            time.sleep(0.5)
            if self.thread.is_alive():
                # Message will be printed by run_scheduler_loop
                pass
            else:
                print("ERROR: Scheduler thread failed to start!")
                self.running = False
    
    def shutdown(self):
        """Proper shutdown that saves active zones before stopping"""
        try:
            print("Saving active zones before shutdown...")
            
            # Save active zones BEFORE any deactivation
            self.save_active_zones()
            
            # Use shutdown_stop_all_zones instead of emergency_stop_all_zones
            self.shutdown_stop_all_zones()
            
            # Stop the scheduler loop
            self.running = False
            if self.thread:
                self.thread.join(timeout=5)
            
            # Clean up GPIO (but don't call emergency_stop)
            cleanup_gpio()
            print("Scheduler shutdown complete")
            
        except Exception as e:
            print(f"Scheduler shutdown error: {e}")
    
    def stop(self):
        """Stop the scheduler and clean up GPIO"""
        self.shutdown()

    def debug_zone_states(self):
        """Debug method to show current state of all zones (runs every 5 minutes)"""
        with self.lock:
            # Get actual GPIO states
            from .gpio import get_all_zone_states, ZONE_PINS
            gpio_states = get_all_zone_states()
            
            # Only print if there are mismatches or active zones
            mismatches = []
            for zone_id in sorted(ZONE_PINS.keys()):
                scheduler_state = self.zone_states.get(zone_id, {})
                gpio_state = gpio_states.get(zone_id, False)
                if scheduler_state.get('active', False) != gpio_state:
                    mismatches.append(f"Zone {zone_id}: scheduler={scheduler_state.get('active', False)}, gpio={gpio_state}")
            
            if self.active_zones or mismatches:
                print(f"Active zones: {list(self.active_zones.keys())}")
                if mismatches:
                    print("State mismatches:", ", ".join(mismatches))

# Global scheduler instance
scheduler = WateringScheduler() 