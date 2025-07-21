# scheduler.py
# Scheduling logic for watering events

import json
import os
import time
import threading
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import logging

# Import GPIO functions from main api.py
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api import activate_channel, deactivate_channel, log_event, watering_logger, user_logger

class WateringScheduler:
    def __init__(self):
        self.schedule_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "schedule.json")
        self.settings_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "settings.cfg")
        self.running = False
        self.active_zones = {}  # zone_id -> end_time
        self.active_zones_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "active_zones.json")
        self.thread = None
        
        # Load any existing active zones from persistent storage
        self.load_active_zones()
    
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