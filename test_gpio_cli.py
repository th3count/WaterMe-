#!/usr/bin/env python3
"""
Simple CLI script to test GPIO control directly
Usage: python test_gpio_cli.py <zone_id> <duration_seconds>
Example: python test_gpio_cli.py 1 30
"""

import sys
import time
import os

# Add the core directory to the path so we can import gpio
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'core'))

try:
    from gpio import setup_gpio, activate_zone, deactivate_zone, cleanup_gpio, ZONE_PINS
except ImportError as e:
    print(f"Error importing GPIO module: {e}")
    print("Make sure you're running this from the backend directory")
    sys.exit(1)

def main():
    if len(sys.argv) != 3:
        print("Usage: python test_gpio_cli.py <zone_id> <duration_seconds>")
        print("Example: python test_gpio_cli.py 1 30")
        sys.exit(1)
    
    try:
        zone_id = int(sys.argv[1])
        duration = int(sys.argv[2])
    except ValueError:
        print("Error: zone_id and duration must be integers")
        sys.exit(1)
    
    if zone_id not in ZONE_PINS:
        print(f"Error: Zone {zone_id} not found. Available zones: {list(ZONE_PINS.keys())}")
        sys.exit(1)
    
    if duration <= 0:
        print("Error: Duration must be positive")
        sys.exit(1)
    
    print(f"Testing GPIO control for zone {zone_id} for {duration} seconds...")
    print(f"Zone {zone_id} uses pin {ZONE_PINS[zone_id]}")
    
    try:
        # Setup GPIO
        print("Setting up GPIO...")
        setup_gpio()
        
        # Activate zone
        print(f"Activating zone {zone_id}...")
        activate_zone(zone_id)
        
        # Wait for duration
        print(f"Zone {zone_id} is now active. Waiting {duration} seconds...")
        for remaining in range(duration, 0, -1):
            print(f"  Remaining: {remaining}s", end='\r')
            time.sleep(1)
        print()  # New line after countdown
        
        # Deactivate zone
        print(f"Deactivating zone {zone_id}...")
        deactivate_zone(zone_id)
        
        print("Test completed successfully!")
        
    except KeyboardInterrupt:
        print("\nInterrupted by user!")
        print(f"Deactivating zone {zone_id}...")
        deactivate_zone(zone_id)
    except Exception as e:
        print(f"Error: {e}")
        # Try to deactivate zone on error
        try:
            deactivate_zone(zone_id)
        except:
            pass
    finally:
        # Cleanup GPIO
        print("Cleaning up GPIO...")
        cleanup_gpio()

if __name__ == "__main__":
    main() 