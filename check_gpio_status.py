#!/usr/bin/env python3
"""
Simple script to check GPIO status of all zones
Usage: python check_gpio_status.py
"""

import sys
import os

# Add the core directory to the path so we can import gpio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'core'))

try:
    from gpio import setup_gpio, get_zone_state, ZONE_PINS, cleanup_gpio
except ImportError as e:
    print(f"Error importing GPIO module: {e}")
    print("Make sure you're running this from the backend directory")
    sys.exit(1)

def main():
    print("Checking GPIO status for all zones...")
    print("=" * 50)
    
    try:
        # Setup GPIO
        setup_gpio()
        
        # Check each zone
        for zone_id in sorted(ZONE_PINS.keys()):
            pin = ZONE_PINS[zone_id]
            state = get_zone_state(zone_id)
            
            status = "ACTIVE" if state.get('active', False) else "INACTIVE"
            remaining = state.get('remaining', 0)
            event_type = state.get('type', 'none')
            
            print(f"Zone {zone_id} (Pin {pin}): {status}")
            if state.get('active', False):
                print(f"  Type: {event_type}")
                print(f"  Remaining: {remaining}s")
            print()
        
        print("=" * 50)
        print("Status check completed!")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Cleanup GPIO
        cleanup_gpio()

if __name__ == "__main__":
    main() 