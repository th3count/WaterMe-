#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core'))

def main():
    if len(sys.argv) != 2:
        print("Usage: python activate_zone5.py <zone_id>")
        print("Example: python activate_zone5.py 5")
        sys.exit(1)
    
    try:
        zone_id = int(sys.argv[1])
    except ValueError:
        print("Error: zone_id must be an integer")
        sys.exit(1)
    
    from gpio import setup_gpio, activate_zone, deactivate_zone, get_zone_state, cleanup_gpio, ZONE_PINS
    
    if zone_id not in ZONE_PINS:
        print(f"Error: Zone {zone_id} not found. Available zones: {list(ZONE_PINS.keys())}")
        sys.exit(1)
    
    setup_gpio()
    
    # Check current state
    current_state = get_zone_state(zone_id)
    is_active = current_state.get('active', False)
    
    if is_active:
        print(f"Zone {zone_id} is currently active. Deactivating...")
        deactivate_zone(zone_id)
        print(f"Zone {zone_id} deactivated!")
    else:
        print(f"Zone {zone_id} is currently inactive. Activating...")
        activate_zone(zone_id)
        print(f"Zone {zone_id} activated!")
    
    cleanup_gpio()

if __name__ == "__main__":
    main() 