# gpio.py
# GPIO abstraction (simulator/real hardware)
#
# 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
# 📖 System Overview: ~/rules/system-overview.md
# 🏗️ Project Structure: ~/rules/project-structure.md  
# 🌐 API Patterns: ~/rules/api-patterns.md
# 💻 Coding Standards: ~/rules/coding-standards.md 
import os
import configparser
import logging
from datetime import datetime

# Import unified logging system
from .logging import log_event, setup_logger

# Check if simulation mode is enabled
def should_simulate():
    """Check if simulation mode is enabled in settings"""
    try:
        config = configparser.ConfigParser()
        config_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'config', 'settings.cfg')
        config.read(config_path)
        if 'Garden' in config:
            return config.getboolean('Garden', 'simulate', fallback=False)
    except:
        pass
    return False

# Conditional GPIO import
SIMULATION_MODE = should_simulate()

if SIMULATION_MODE:
    print("Core GPIO: Simulation mode enabled - using mock GPIO")
    # Create a mock GPIO module for simulation
    class MockGPIO:
        BCM = "BCM"
        OUT = "OUT"
        LOW = False
        HIGH = True
        
        def __init__(self):
            self.pin_states = {}  # Track pin states for simulation
            
        def setmode(self, mode):
            print(f"Mock GPIO: Set mode to {mode}")
            
        def setwarnings(self, warnings):
            print(f"Mock GPIO: Set warnings to {warnings}")
            
        def setup(self, pin, mode):
            print(f"Mock GPIO: Setup pin {pin} as {mode}")
            self.pin_states[pin] = False  # Initialize as OFF
            
        def output(self, pin, state):
            self.pin_states[pin] = state
            print(f"Mock GPIO: Pin {pin} set to {state}")
            
        def input(self, pin):
            return self.pin_states.get(pin, False)
            
        def cleanup(self):
            print("Mock GPIO: Cleanup called")
            self.pin_states.clear()
    
    GPIO = MockGPIO()
else:
    try:
        import RPi.GPIO as GPIO
        print("Core GPIO: Using real GPIO hardware")
    except ImportError:
        print("Core GPIO: RPi.GPIO not available - falling back to mock GPIO")
        # Create a mock GPIO module for simulation
        class MockGPIO:
            BCM = "BCM"
            OUT = "OUT"
            LOW = False
            HIGH = True
            
            def __init__(self):
                self.pin_states = {}  # Track pin states for simulation
                
            def setmode(self, mode):
                print(f"Mock GPIO: Set mode to {mode}")
                
            def setwarnings(self, warnings):
                print(f"Mock GPIO: Set warnings to {warnings}")
                
            def setup(self, pin, mode):
                print(f"Mock GPIO: Setup pin {pin} as {mode}")
                self.pin_states[pin] = False  # Initialize as OFF
                
            def output(self, pin, state):
                self.pin_states[pin] = state
                print(f"Mock GPIO: Pin {pin} set to {state}")
                
            def input(self, pin):
                return self.pin_states.get(pin, False)
                
            def cleanup(self):
                print("Mock GPIO: Cleanup called")
                self.pin_states.clear()
        
        GPIO = MockGPIO()

# Setup loggers using unified system
gpio_logger = setup_logger('gpio', 'gpio.log')
system_logger = setup_logger('system', 'system.log')

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

# Log configuration using unified logging
log_event(gpio_logger, 'INFO', 'GPIO configuration loaded',
         zone_count=ZONE_COUNT,
         pins=PINS,
         zone_pins=ZONE_PINS,
         pump_index=PUMP_INDEX,
         active_low=ACTIVE_LOW,
         mode=MODE)

_initialized = False
_active_zones = set()  # Track which zones are currently active

def setup_gpio():
    global _initialized
    if _initialized:
        return
    
    log_event(gpio_logger, 'INFO', 'Initializing GPIO', mode=MODE)
    try:
        if MODE == 'BCM':
            GPIO.setmode(GPIO.BCM)
        elif MODE == 'BOARD':
            GPIO.setmode(GPIO.BOARD)
        else:
            raise ValueError(f"Unknown GPIO mode: {MODE}")
        
        for zone_id, pin in ZONE_PINS.items():
            GPIO.setup(pin, GPIO.OUT)
            # Ensure all are off at start
            initial_state = GPIO.LOW if not ACTIVE_LOW else GPIO.HIGH
            GPIO.output(pin, initial_state)
        
        _initialized = True
        log_event(gpio_logger, 'INFO', 'GPIO initialization completed', 
                 zone_count=len(ZONE_PINS),
                 pins=list(ZONE_PINS.values()),
                 mode=MODE)
    except Exception as e:
        log_event(gpio_logger, 'ERROR', 'GPIO initialization failed', error=str(e))
        raise

def activate_zone(zone_id):
    setup_gpio()
    
    if zone_id not in ZONE_PINS:
        log_event(gpio_logger, 'WARNING', 'Zone activation failed - invalid zone', 
                 zone_id=zone_id, 
                 valid_zones=list(ZONE_PINS.keys()))
        return
    
    pin = ZONE_PINS[zone_id]
    
    # Check current state before activation
    try:
        current_state = GPIO.input(pin)
        current_on = (current_state == GPIO.LOW) == ACTIVE_LOW
    except Exception as e:
        log_event(gpio_logger, 'WARNING', 'Could not read current zone state', 
                 zone_id=zone_id, pin=pin, error=str(e))
        current_on = False
    
    # For activeLow, ON = LOW; for activeHigh, ON = HIGH
    target_state = GPIO.LOW if ACTIVE_LOW else GPIO.HIGH
    GPIO.output(pin, target_state)
    
    # Track active zone
    _active_zones.add(zone_id)
    
    # Log activation with structured data
    log_event(gpio_logger, 'INFO', 'Zone activated', 
             zone_id=zone_id, 
             pin=pin,
             previous_state='ON' if current_on else 'OFF',
             active_zones=sorted(_active_zones))
    
    # If pump is configured and this isn't the pump zone itself, activate pump
    if PUMP_INDEX > 0 and zone_id != PUMP_INDEX and PUMP_INDEX in ZONE_PINS:
        pump_pin = ZONE_PINS[PUMP_INDEX]
        GPIO.output(pump_pin, GPIO.LOW if ACTIVE_LOW else GPIO.HIGH)
        log_event(gpio_logger, 'INFO', 'Pump activated for zone', 
                 zone_id=zone_id, 
                 pump_zone=PUMP_INDEX, 
                 pump_pin=pump_pin)
    elif zone_id == PUMP_INDEX:
        log_event(gpio_logger, 'INFO', 'Pump zone activated directly', zone_id=zone_id)

def deactivate_zone(zone_id):
    setup_gpio()
    
    if zone_id not in ZONE_PINS:
        log_event(gpio_logger, 'WARNING', 'Zone deactivation failed - invalid zone', 
                 zone_id=zone_id, 
                 valid_zones=list(ZONE_PINS.keys()))
        return
        
    pin = ZONE_PINS[zone_id]
    
    # Check current state before deactivation
    try:
        current_state = GPIO.input(pin)
        current_on = (current_state == GPIO.LOW) == ACTIVE_LOW
    except Exception as e:
        log_event(gpio_logger, 'WARNING', 'Could not read current zone state', 
                 zone_id=zone_id, pin=pin, error=str(e))
        current_on = False
    
    # For activeLow, OFF = HIGH; for activeHigh, OFF = LOW
    target_state = GPIO.HIGH if ACTIVE_LOW else GPIO.LOW
    GPIO.output(pin, target_state)
    
    # Remove from active zones BEFORE checking pump status
    was_in_active = zone_id in _active_zones
    _active_zones.discard(zone_id)
    
    # Log deactivation with structured data
    log_event(gpio_logger, 'INFO', 'Zone deactivated', 
             zone_id=zone_id, 
             pin=pin,
             previous_state='ON' if current_on else 'OFF',
             was_tracked=was_in_active,
             active_zones=sorted(_active_zones))
    
    # If pump is configured and no other zones are active, deactivate pump
    if PUMP_INDEX > 0 and PUMP_INDEX in ZONE_PINS:
        # Check if any non-pump zones are still active
        other_active = _active_zones - {PUMP_INDEX}
        
        if not other_active:
            pump_pin = ZONE_PINS[PUMP_INDEX]
            GPIO.output(pump_pin, GPIO.HIGH if ACTIVE_LOW else GPIO.LOW)
            log_event(gpio_logger, 'INFO', 'Pump deactivated - no zones active', 
                     pump_zone=PUMP_INDEX, 
                     pump_pin=pump_pin)
        else:
            log_event(gpio_logger, 'INFO', 'Pump kept active - other zones running', 
                     pump_zone=PUMP_INDEX,
                     other_active_zones=sorted(other_active))

def get_zone_state(zone_id):
    """Get the current hardware state of a zone"""
    setup_gpio()
    if zone_id not in ZONE_PINS:
        log_event(gpio_logger, 'WARNING', 'Zone state check failed - invalid zone', 
                 zone_id=zone_id, 
                 valid_zones=list(ZONE_PINS.keys()))
        return False
    
    pin = ZONE_PINS[zone_id]
    try:
        state = GPIO.input(pin)
        # For active low: LOW = ON (True), HIGH = OFF (False)
        # For active high: HIGH = ON (True), LOW = OFF (False)
        is_on = (state == GPIO.LOW) if ACTIVE_LOW else (state == GPIO.HIGH)
        return is_on
    except Exception as e:
        log_event(gpio_logger, 'ERROR', 'Error reading zone state', 
                 zone_id=zone_id, pin=pin, error=str(e))
        return False

def get_all_zone_states():
    """Get the current hardware state of all zones"""
    states = {}
    for zone_id in ZONE_PINS.keys():
        states[zone_id] = get_zone_state(zone_id)
    
    active_zones = [zone_id for zone_id, is_on in states.items() if is_on]
    
    # Use unified logging structure
    log_event(system_logger, 'INFO', 'GPIO status check completed', 
             total_zones=len(states),
             active_zones=active_zones,
             zone_states=states)
    
    return states

def cleanup_gpio():
    """Clean up GPIO pins and turn everything off"""
    global _initialized
    logger.info("=== GPIO CLEANUP STARTED ===")
    
    if not _initialized:
        logger.info("GPIO not initialized, skipping cleanup")
        return
    
    try:
        logger.info(f"Active zones before cleanup: {sorted(_active_zones)}")
        
        # Turn off all zones before cleanup
        logger.info("Deactivating all zones before cleanup")
        for zone_id in ZONE_PINS.keys():
            logger.info(f"Deactivating zone {zone_id} during cleanup")
            deactivate_zone(zone_id)
        
        logger.info("Calling GPIO.cleanup()")
        GPIO.cleanup()
        logger.info("GPIO cleanup completed successfully")
        
    except Exception as e:
        logger.error(f"Error during GPIO cleanup: {e}")
        raise
    finally:
        _initialized = False
        _active_zones.clear()
        logger.info("GPIO state reset: _initialized=False, _active_zones cleared")
        logger.info("=== GPIO CLEANUP COMPLETED ===")

def get_active_zones():
    """Get the set of currently active zones (for debugging)"""
    logger.debug(f"Active zones query: {sorted(_active_zones)}")
    return _active_zones.copy()

def log_gpio_status():
    """Log comprehensive GPIO status for debugging"""
    logger.info("=== GPIO STATUS REPORT ===")
    logger.info(f"Initialized: {_initialized}")
    logger.info(f"Active zones: {sorted(_active_zones)}")
    logger.info(f"Zone pin mapping: {ZONE_PINS}")
    logger.info(f"Pump index: {PUMP_INDEX}")
    logger.info(f"Active low: {ACTIVE_LOW}")
    logger.info(f"Mode: {MODE}")
    
    if _initialized:
        logger.info("Hardware states:")
        for zone_id, pin in ZONE_PINS.items():
            try:
                state = GPIO.input(pin)
                is_on = (state == GPIO.LOW) if ACTIVE_LOW else (state == GPIO.HIGH)
                logger.info(f"  Zone {zone_id} (pin {pin}): {'ON' if is_on else 'OFF'} (raw: {state})")
            except Exception as e:
                logger.error(f"  Zone {zone_id} (pin {pin}): Error reading state - {e}")
    
    logger.info("=== END GPIO STATUS REPORT ===") 

def test_gpio_direct(zone_id: int, duration_seconds: int = 2):
    """
    Test GPIO functionality directly without scheduler
    This is a simple test function to verify GPIO is working
    """
    try:
        logger.info(f"=== DIRECT GPIO TEST - Zone {zone_id} for {duration_seconds}s ===")
        
        # Setup GPIO
        setup_gpio()
        
        # Check if zone exists
        if zone_id not in ZONE_PINS:
            logger.error(f"Zone {zone_id} not in configured pins: {list(ZONE_PINS.keys())}")
            return False
        
        pin = ZONE_PINS[zone_id]
        logger.info(f"Testing zone {zone_id} on pin {pin}")
        
        # Activate zone
        activate_zone(zone_id)
        logger.info(f"Zone {zone_id} activated")
        
        # Wait for duration
        import time
        time.sleep(duration_seconds)
        
        # Deactivate zone
        deactivate_zone(zone_id)
        logger.info(f"Zone {zone_id} deactivated")
        
        logger.info(f"=== DIRECT GPIO TEST COMPLETE ===")
        return True
        
    except Exception as e:
        logger.error(f"Direct GPIO test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def get_gpio_status():
    """Get current GPIO status for debugging"""
    try:
        setup_gpio()
        status = {
            'initialized': _initialized,
            'active_zones': sorted(_active_zones),
            'zone_pins': ZONE_PINS,
            'pump_index': PUMP_INDEX,
            'active_low': ACTIVE_LOW,
            'mode': MODE,
            'hardware_states': {}
        }
        
        # Get actual hardware states
        for zone_id, pin in ZONE_PINS.items():
            try:
                state = GPIO.input(pin)
                is_on = (state == GPIO.LOW) if ACTIVE_LOW else (state == GPIO.HIGH)
                status['hardware_states'][zone_id] = {
                    'pin': pin,
                    'raw_state': state,
                    'is_on': is_on
                }
            except Exception as e:
                status['hardware_states'][zone_id] = {
                    'pin': pin,
                    'error': str(e)
                }
        
        return status
        
    except Exception as e:
        logger.error(f"Failed to get GPIO status: {e}")
        return {'error': str(e)} 