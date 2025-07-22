#!/usr/bin/env python3
"""
Direct GPIO Manipulation Tool
Forces GPIO relays on/off to test if WaterMe! detects hardware changes

Usage:
    python zone_test.py <zone_id> on|off|toggle|status
    python zone_test.py all status
    python zone_test.py test <zone_id>  # Test on/off cycle

Examples:
    python zone_test.py 5 on          # Force zone 5 ON
    python zone_test.py 3 off         # Force zone 3 OFF  
    python zone_test.py 1 toggle      # Toggle zone 1
    python zone_test.py all status    # Check all zones
    python zone_test.py test 5        # Test zone 5 (on for 3s, then off)
"""

import sys
import os
import time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'core'))

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    try:
        zone_id = sys.argv[1]
        action = sys.argv[2].lower()
    except (ValueError, IndexError):
        print("Error: Invalid arguments")
        print(__doc__)
        sys.exit(1)

    from gpio import setup_gpio, activate_zone, deactivate_zone, get_zone_state, cleanup_gpio, ZONE_PINS

    setup_gpio()

    if zone_id == 'all':
        if action == 'status':
            print("=== ALL ZONE STATUS ===")
            for zid in sorted(ZONE_PINS.keys()):
                state = get_zone_state(zid)
                status = "ON" if state else "OFF"
                print(f"Zone {zid} (Pin {ZONE_PINS[zid]}): {status}")
        else:
            print("Error: 'all' only supports 'status' action")
            sys.exit(1)
    
    elif zone_id == 'test':
        if len(sys.argv) < 4:
            print("Error: test requires zone_id")
            print("Example: python zone_test.py test 5")
            sys.exit(1)
        
        test_zone = int(sys.argv[3])
        if test_zone not in ZONE_PINS:
            print(f"Error: Zone {test_zone} not found. Available zones: {list(ZONE_PINS.keys())}")
            sys.exit(1)
        
        print(f"Testing zone {test_zone} - ON for 3 seconds, then OFF")
        print(f"Check if WaterMe! UI detects this change...")
        
        # Force ON
        activate_zone(test_zone)
        print(f"Zone {test_zone} FORCED ON")
        time.sleep(3)
        
        # Force OFF
        deactivate_zone(test_zone)
        print(f"Zone {test_zone} FORCED OFF")
        
    else:
        try:
            zone_id_int = int(zone_id)
        except ValueError:
            print("Error: zone_id must be an integer")
            sys.exit(1)

        if zone_id_int not in ZONE_PINS:
            print(f"Error: Zone {zone_id_int} not found. Available zones: {list(ZONE_PINS.keys())}")
            sys.exit(1)

        # Check current state
        current_state = get_zone_state(zone_id_int)
        print(f"Zone {zone_id_int} (Pin {ZONE_PINS[zone_id_int]}) current state: {'ON' if current_state else 'OFF'}")

        if action == 'on':
            print(f"FORCING Zone {zone_id_int} ON (bypassing WaterMe!)")
            activate_zone(zone_id_int)
            print(f"Zone {zone_id_int} is now ON")
            print("Check WaterMe! UI to see if it detects this change...")
            
        elif action == 'off':
            print(f"FORCING Zone {zone_id_int} OFF (bypassing WaterMe!)")
            deactivate_zone(zone_id_int)
            print(f"Zone {zone_id_int} is now OFF")
            print("Check WaterMe! UI to see if it detects this change...")
            
        elif action == 'toggle':
            if current_state:
                print(f"FORCING Zone {zone_id_int} OFF (bypassing WaterMe!)")
                deactivate_zone(zone_id_int)
                print(f"Zone {zone_id_int} is now OFF")
            else:
                print(f"FORCING Zone {zone_id_int} ON (bypassing WaterMe!)")
                activate_zone(zone_id_int)
                print(f"Zone {zone_id_int} is now ON")
            print("Check WaterMe! UI to see if it detects this change...")
            
        elif action == 'status':
            status = "ON" if current_state else "OFF"
            print(f"Zone {zone_id_int} (Pin {ZONE_PINS[zone_id_int]}): {status}")
            
        else:
            print(f"Error: Unknown action '{action}'. Use: on, off, toggle, or status")
            sys.exit(1)

    cleanup_gpio()

if __name__ == "__main__":
    main() 