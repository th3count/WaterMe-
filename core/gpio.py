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
    pin = ZONE_PINS[zone_id]
    # For activeLow, ON = LOW; for activeHigh, ON = HIGH
    GPIO.output(pin, GPIO.LOW if ACTIVE_LOW else GPIO.HIGH)

def deactivate_zone(zone_id):
    setup_gpio()
    pin = ZONE_PINS[zone_id]
    # For activeLow, OFF = HIGH; for activeHigh, OFF = LOW
    GPIO.output(pin, GPIO.HIGH if ACTIVE_LOW else GPIO.LOW)

def cleanup_gpio():
    GPIO.cleanup() 