#!/usr/bin/env python3
"""
STEALTHY GPIO Hardware Injection Tool
Directly manipulates GPIO pins without WaterMe! detection

Usage:
    python zone_test.py <pin_number> on|off|toggle|status
    python zone_test.py all status
    python zone_test.py test <pin_number>  # Test on/off cycle

Examples:
    python zone_test.py 19 on          # Force pin 19 ON (bypasses WaterMe!)
    python zone_test.py 5 off          # Force pin 5 OFF
    python zone_test.py 13 toggle      # Toggle pin 13
    python zone_test.py all status     # Check all configured pins
    python zone_test.py test 19        # Test pin 19 (on for 3s, then off)

Note: This tool is COMPLETELY STEALTHY - WaterMe! will not detect these changes!
"""

import sys
import os
import time
import configparser

# Read GPIO config directly (same as WaterMe!)
CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'config', 'gpio.cfg')
config = configparser.ConfigParser()
config.read(CONFIG_PATH)

def parse_pins(pin_str):
    return [int(p.strip()) for p in pin_str.split(',') if p.strip()]

# Load GPIO config
ZONE_COUNT = int(config.get('GPIO', 'zoneCount', fallback='8'))
PINS = parse_pins(config.get('GPIO', 'pins', fallback='5,6,13,16,19,20,21,26'))
PUMP_INDEX = int(config.get('GPIO', 'pumpIndex', fallback='0'))
ACTIVE_LOW = config.getboolean('GPIO', 'activeLow', fallback=True)
MODE = config.get('GPIO', 'mode', fallback='BCM').upper()

ZONE_PINS = {i+1: pin for i, pin in enumerate(PINS)}

try:
    import RPi.GPIO as GPIO
except ImportError:
    print("❌ RPi.GPIO not available - this tool requires a Raspberry Pi")
    sys.exit(1)

_initialized = False

def stealth_setup():
    """Initialize GPIO without any WaterMe! tracking"""
    global _initialized
    if _initialized:
        return
    
    if MODE == 'BCM':
        GPIO.setmode(GPIO.BCM)
    elif MODE == 'BOARD':
        GPIO.setmode(GPIO.BOARD)
    else:
        raise ValueError(f"Unknown GPIO mode: {MODE}")
    
    _initialized = True

def stealth_activate_pin(pin):
    """Activate a pin directly without any tracking"""
    stealth_setup()
    GPIO.setup(pin, GPIO.OUT)
    # For activeLow, ON = LOW; for activeHigh, ON = HIGH
    GPIO.output(pin, GPIO.LOW if ACTIVE_LOW else GPIO.HIGH)
    print(f"🔓 STEALTH ACTIVATED pin {pin}")

def stealth_deactivate_pin(pin):
    """Deactivate a pin directly without any tracking"""
    stealth_setup()
    GPIO.setup(pin, GPIO.OUT)
    # For activeLow, OFF = HIGH; for activeHigh, OFF = LOW
    GPIO.output(pin, GPIO.HIGH if ACTIVE_LOW else GPIO.LOW)
    print(f"🔓 STEALTH DEACTIVATED pin {pin}")

def stealth_get_pin_state(pin):
    """Get pin state directly from hardware"""
    stealth_setup()
    GPIO.setup(pin, GPIO.OUT)  # Set as output first
    try:
        state = GPIO.input(pin)
        # For active low: LOW = ON (True), HIGH = OFF (False)
        # For active high: HIGH = ON (True), LOW = OFF (False)
        return (state == GPIO.LOW) if ACTIVE_LOW else (state == GPIO.HIGH)
    except Exception as e:
        print(f"Error reading pin {pin} state: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    try:
        pin_or_zone = sys.argv[1]
        action = sys.argv[2].lower()
    except (ValueError, IndexError):
        print("Error: Invalid arguments")
        print(__doc__)
        sys.exit(1)

    if pin_or_zone == 'all':
        if action == 'status':
            print("=== STEALTH PIN STATUS ===")
            print(f"GPIO Mode: {MODE}")
            print(f"Active Low: {ACTIVE_LOW}")
            print()
            for zone_id, pin in ZONE_PINS.items():
                state = stealth_get_pin_state(pin)
                status = "ON" if state else "OFF"
                print(f"Zone {zone_id} (Pin {pin}): {status}")
        else:
            print("Error: 'all' only supports 'status' action")
            sys.exit(1)
    
    elif pin_or_zone == 'test':
        if len(sys.argv) < 4:
            print("Error: test requires pin_number")
            print("Example: python zone_test.py test 19")
            sys.exit(1)
        
        try:
            test_pin = int(sys.argv[3])
        except ValueError:
            print("Error: pin_number must be an integer")
            sys.exit(1)
        
        print(f"🧪 STEALTH TESTING pin {test_pin} - ON for 3 seconds, then OFF")
        print(f"Check if WaterMe! UI detects this change...")
        
        # Force ON
        stealth_activate_pin(test_pin)
        time.sleep(3)
        
        # Force OFF
        stealth_deactivate_pin(test_pin)
        print(f"✅ Test completed - pin {test_pin} should be OFF")
        
    else:
        # Handle both pin numbers and zone IDs
        try:
            if pin_or_zone.isdigit():
                pin_number = int(pin_or_zone)
                # Check if it's a zone ID first
                if pin_number in ZONE_PINS:
                    actual_pin = ZONE_PINS[pin_number]
                    print(f"Note: Zone {pin_number} maps to pin {actual_pin}")
                    pin_number = actual_pin
            else:
                print("Error: pin_number must be an integer")
                sys.exit(1)
        except ValueError:
            print("Error: pin_number must be an integer")
            sys.exit(1)

        # Check current state
        current_state = stealth_get_pin_state(pin_number)
        print(f"Pin {pin_number} current state: {'ON' if current_state else 'OFF'}")

        if action == 'on':
            print(f"🔓 STEALTH FORCING pin {pin_number} ON (WaterMe! won't see this!)")
            stealth_activate_pin(pin_number)
            print(f"✅ Pin {pin_number} is now STEALTH ON")
            print("💡 Check WaterMe! UI - it should NOT detect this change!")
            
        elif action == 'off':
            print(f"🔓 STEALTH FORCING pin {pin_number} OFF (WaterMe! won't see this!)")
            stealth_deactivate_pin(pin_number)
            print(f"✅ Pin {pin_number} is now STEALTH OFF")
            print("💡 Check WaterMe! UI - it should NOT detect this change!")
            
        elif action == 'toggle':
            if current_state:
                print(f"🔓 STEALTH FORCING pin {pin_number} OFF (WaterMe! won't see this!)")
                stealth_deactivate_pin(pin_number)
                print(f"✅ Pin {pin_number} is now STEALTH OFF")
            else:
                print(f"🔓 STEALTH FORCING pin {pin_number} ON (WaterMe! won't see this!)")
                stealth_activate_pin(pin_number)
                print(f"✅ Pin {pin_number} is now STEALTH ON")
            print("💡 Check WaterMe! UI - it should NOT detect this change!")
            
        elif action == 'status':
            status = "ON" if current_state else "OFF"
            print(f"Pin {pin_number}: {status}")
            
        else:
            print(f"Error: Unknown action '{action}'. Use: on, off, toggle, or status")
            sys.exit(1)

    print("\n🔓 STEALTH MODE: GPIO state left as-is. WaterMe! is completely unaware!")
    print("💡 This is perfect for testing if WaterMe! detects external hardware changes")

if __name__ == "__main__":
    main() 