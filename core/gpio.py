# gpio.py
# GPIO abstraction (simulator/real hardware) 
import os
import configparser
try:
    import RPi.GPIO as GPIO
except ImportError:
    # Allow import on non-Pi systems for dev
    from unittest import mock
    GPIO = mock.MagicMock()

# Read config/gpio.cfg
CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config', 'gpio.cfg')
config = configparser.ConfigParser()
config.read(CONFIG_PATH)

def parse_pins(pin_str):
    return [int(p.strip()) for p in pin_str.split(',') if p.strip()]

# Defaults
ZONE_COUNT = int(config.get('GPIO', 'zoneCount', fallback='8'))
PINS = parse_pins(config.get('GPIO', 'pins', fallback='5,6,13,16,19,20,21,26'))
PUMP_INDEX = int(config.get('GPIO', 'pumpIndex', fallback='0'))
ACTIVE_LOW = config.getboolean('GPIO', 'activeLow', fallback=True)
MODE = config.get('GPIO', 'mode', fallback='BCM').upper()

ZONE_PINS = {i+1: pin for i, pin in enumerate(PINS)}

_initialized = False
_active_zones = set()  # Track which zones are currently active

def setup_gpio():
    global _initialized
    if _initialized:
        return
    if MODE == 'BCM':
        GPIO.setmode(GPIO.BCM)
    elif MODE == 'BOARD':
        GPIO.setmode(GPIO.BOARD)
    else:
        raise ValueError(f"Unknown GPIO mode: {MODE}")
    for pin in ZONE_PINS.values():
        GPIO.setup(pin, GPIO.OUT)
        # Ensure all are off at start
        GPIO.output(pin, GPIO.LOW if not ACTIVE_LOW else GPIO.HIGH)
    _initialized = True

def activate_zone(zone_id):
    setup_gpio()
    if zone_id not in ZONE_PINS:
        print(f"Warning: Zone {zone_id} not in configured pins")
        return
    
    pin = ZONE_PINS[zone_id]
    # For activeLow, ON = LOW; for activeHigh, ON = HIGH
    GPIO.output(pin, GPIO.LOW if ACTIVE_LOW else GPIO.HIGH)
    print(f"Activated zone {zone_id} on pin {pin}")
    
    # Track active zone
    _active_zones.add(zone_id)
    
    # If pump is configured and this isn't the pump zone itself, activate pump
    if PUMP_INDEX > 0 and zone_id != PUMP_INDEX and PUMP_INDEX in ZONE_PINS:
        pump_pin = ZONE_PINS[PUMP_INDEX]
        GPIO.output(pump_pin, GPIO.LOW if ACTIVE_LOW else GPIO.HIGH)
        print(f"Activated pump (zone {PUMP_INDEX}) on pin {pump_pin}")

def deactivate_zone(zone_id):
    setup_gpio()
    if zone_id not in ZONE_PINS:
        print(f"Warning: Zone {zone_id} not in configured pins")
        return
        
    pin = ZONE_PINS[zone_id]
    # For activeLow, OFF = HIGH; for activeHigh, OFF = LOW
    GPIO.output(pin, GPIO.HIGH if ACTIVE_LOW else GPIO.LOW)
    print(f"Deactivated zone {zone_id} on pin {pin}")
    
    # Remove from active zones BEFORE checking pump status
    was_in_active = zone_id in _active_zones
    _active_zones.discard(zone_id)
    print(f"DEBUG: Removed zone {zone_id} from _active_zones. Remaining: {_active_zones}")
    
    # If pump is configured and no other zones are active, deactivate pump
    if PUMP_INDEX > 0 and PUMP_INDEX in ZONE_PINS:
        # Check if any non-pump zones are still active
        other_active = _active_zones - {PUMP_INDEX}
        print(f"DEBUG: After deactivating zone {zone_id}, other_active zones: {other_active}")
        
        if not other_active:
            pump_pin = ZONE_PINS[PUMP_INDEX]
            GPIO.output(pump_pin, GPIO.HIGH if ACTIVE_LOW else GPIO.LOW)
            print(f"Deactivated pump (zone {PUMP_INDEX}) on pin {pump_pin} - no other zones active")
        else:
            print(f"DEBUG: Pump kept ON - other zones still active: {other_active}")

def get_zone_state(zone_id):
    """Get the current hardware state of a zone"""
    setup_gpio()
    if zone_id not in ZONE_PINS:
        return False
    
    pin = ZONE_PINS[zone_id]
    try:
        state = GPIO.input(pin)
        # For active low: LOW = ON (True), HIGH = OFF (False)
        # For active high: HIGH = ON (True), LOW = OFF (False)
        return (state == GPIO.LOW) if ACTIVE_LOW else (state == GPIO.HIGH)
    except Exception as e:
        print(f"Error reading zone {zone_id} state: {e}")
        return False

def get_all_zone_states():
    """Get the current hardware state of all zones"""
    states = {}
    for zone_id in ZONE_PINS.keys():
        states[zone_id] = get_zone_state(zone_id)
    return states

def cleanup_gpio():
    """Clean up GPIO pins and turn everything off"""
    global _initialized
    if _initialized:
        try:
            # Turn off all zones before cleanup
            for zone_id in ZONE_PINS.keys():
                deactivate_zone(zone_id)
            GPIO.cleanup()
            print("GPIO cleanup completed")
        except Exception as e:
            print(f"Error during GPIO cleanup: {e}")
        finally:
            _initialized = False
            _active_zones.clear() 