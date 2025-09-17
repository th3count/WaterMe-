# plant_manager.py
# Plant management and smart placement logic
#
# 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
# 📖 System Overview: ~/rules/system-overview.md
# 🏗️ Project Structure: ~/rules/project-structure.md  
# 🌐 API Patterns: ~/rules/api-patterns.md
# 💻 Coding Standards: ~/rules/coding-standards.md
import os
import json
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
from flask import Blueprint, request, jsonify

# Import unified logging system
from .logging import setup_logger, log_event

# Setup logger
plants_logger = setup_logger('PLANTS', 'plants.log')

# File paths
MAP_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "map.json")
SCHEDULE_JSON_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "schedule.json")
LIBRARY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "library")

# Library file names
LIBRARY_FILES = ['fruitbushes.json', 'fruittrees.json', 'vegetables.json', 'custom.json']

# Available emitter sizes (GPH)
EMITTER_SIZES = [0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0, 30.0, 35.0, 40.0, 45.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0]

# Flask Blueprint for Plant Manager API endpoints
plant_bp = Blueprint('plant_manager', __name__)

class PlantManager:
    """Manages plant instances, library data, and smart placement logic"""
    
    def __init__(self):
        self.plant_map = {}
        self.plant_library = {}
        self.schedule_data = {}
        self._load_data()
    
    def _load_data(self):
        """Load all plant-related data files"""
        self._load_plant_map()
        self._load_plant_library()
        self._load_schedule()
    
    def _load_plant_map(self):
        """Load plant instance data from map.json"""
        try:
            if os.path.exists(MAP_JSON_PATH):
                with open(MAP_JSON_PATH, 'r', encoding='utf-8') as f:
                    self.plant_map = json.load(f)
                log_event(plants_logger, 'INFO', 'Plant map loaded', 
                         instance_count=len(self.plant_map))
            else:
                self.plant_map = {}
                log_event(plants_logger, 'INFO', 'Plant map file not found, using empty map')
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to load plant map', error=str(e))
            self.plant_map = {}
    
    def _load_plant_library(self):
        """Load plant library data from all library files"""
        self.plant_library = {}
        for filename in LIBRARY_FILES:
            filepath = os.path.join(LIBRARY_DIR, filename)
            try:
                if os.path.exists(filepath):
                    with open(filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        if 'plants' in data:
                            for plant in data['plants']:
                                plant_id = plant.get('plant_id')
                                if plant_id:
                                    # Create unique plant ID by combining library name and plant ID
                                    # This prevents conflicts between different library files
                                    library_name = filename.replace('.json', '')
                                    unique_plant_id = f"{library_name}_{plant_id}"
                                    
                                    # Store both the original plant_id and the unique ID
                                    plant_data = plant.copy()
                                    plant_data['original_plant_id'] = plant_id
                                    plant_data['library_name'] = library_name
                                    
                                    self.plant_library[unique_plant_id] = {
                                        'data': plant_data,
                                        'source': filename,
                                        'original_plant_id': plant_id,
                                        'unique_plant_id': unique_plant_id
                                    }
                    log_event(plants_logger, 'INFO', f'Library file loaded', 
                             filename=filename, plant_count=len(data.get('plants', [])))
            except Exception as e:
                log_event(plants_logger, 'ERROR', f'Failed to load library file', 
                         filename=filename, error=str(e))
        
        log_event(plants_logger, 'INFO', 'Plant library loaded', 
                 total_plants=len(self.plant_library))
    
    def _load_schedule(self):
        """Load schedule data for zone information"""
        try:
            if os.path.exists(SCHEDULE_JSON_PATH):
                with open(SCHEDULE_JSON_PATH, 'r', encoding='utf-8') as f:
                    raw_schedule_data = json.load(f)
                
                # Store the schedule data in its original format (zone IDs as keys)
                # This matches the actual schedule.json structure
                self.schedule_data = raw_schedule_data
                
                log_event(plants_logger, 'INFO', 'Schedule data loaded', 
                         zone_count=len(raw_schedule_data))
            else:
                self.schedule_data = {}
                log_event(plants_logger, 'INFO', 'Schedule file not found, using empty schedule')
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to load schedule data', error=str(e))
            self.schedule_data = {}
    
    def reload_data(self):
        """Reload all data files"""
        self._load_data()
    
    # Smart Emitter Sizing Methods
    
    def calculate_cycles_per_week(self, zone_frequency: str) -> float:
        """Calculate cycles per week for a zone frequency code"""
        if not zone_frequency:
            return 0.0
        
        code = zone_frequency.upper()
        if code.startswith('D'):
            try:
                cycles_per_day = int(code[1:])
                return cycles_per_day * 7.0  # 7 days per week
            except ValueError:
                return 0.0
        elif code.startswith('W'):
            try:
                cycles_per_week = int(code[1:])
                return float(cycles_per_week)
            except ValueError:
                return 0.0
        elif code.startswith('M'):
            try:
                cycles_per_month = int(code[1:])
                return (cycles_per_month * 4.0) / 12.0  # Average weeks per month
            except ValueError:
                return 0.0
        return 0.0
    
    def get_zone_duration_hours(self, zone_id: int) -> float:
        """Get zone duration in hours"""
        # Handle the actual schedule.json structure where zones are direct keys
        zone_key = str(zone_id)
        if zone_key in self.schedule_data:
            zone = self.schedule_data[zone_key]
            # Check for times array (multiple watering events)
            if 'times' in zone and isinstance(zone['times'], list) and len(zone['times']) > 0:
                # Use the first time's duration as representative
                duration_str = zone['times'][0].get('duration', '00:20:00')
                return self._parse_duration_to_hours(duration_str)
            # Check for single time
            elif 'time' in zone and isinstance(zone['time'], dict):
                duration_str = zone['time'].get('duration', '00:20:00')
                return self._parse_duration_to_hours(duration_str)
        
        # Also check the legacy zones array structure for backward compatibility
        for zone in self.schedule_data.get('zones', []):
            if zone.get('zone_id') == zone_id:
                # Check for times array (multiple watering events)
                if 'times' in zone and isinstance(zone['times'], list) and len(zone['times']) > 0:
                    # Use the first time's duration as representative
                    duration_str = zone['times'][0].get('duration', '00:20:00')
                    return self._parse_duration_to_hours(duration_str)
                # Check for single time
                elif 'time' in zone and isinstance(zone['time'], dict):
                    duration_str = zone['time'].get('duration', '00:20:00')
                    return self._parse_duration_to_hours(duration_str)
        
        return 0.333  # Default to 20 minutes if not found
    
    def _parse_duration_to_hours(self, duration_str: str) -> float:
        """Parse HH:mm:ss or legacy HHmmss duration string to hours"""
        if not duration_str:
            return 0.333  # Default 20 minutes
        
        try:
            # Handle new HH:mm:ss format
            if ':' in duration_str and len(duration_str) == 8:
                parts = duration_str.split(':')
                if len(parts) == 3:
                    hours = int(parts[0])
                    minutes = int(parts[1])
                    seconds = int(parts[2])
                    return hours + (minutes / 60.0) + (seconds / 3600.0)
            
            # Handle legacy HHmmss format (6 digits)
            elif len(duration_str) == 6 and duration_str.isdigit():
                hours = int(duration_str[0:2])
                minutes = int(duration_str[2:4])
                seconds = int(duration_str[4:6])
                return hours + (minutes / 60.0) + (seconds / 3600.0)
            
            return 0.333  # Default 20 minutes
        except ValueError:
            return 0.333  # Default 20 minutes
    
    def calculate_flexible_duration_target(self, plant_data: Dict[str, Any], cycles_per_week: float, zone_id: int) -> Tuple[float, str, str]:
        """
        Calculate flexible duration target using 4-tier logic:
        1. Target 15-25 minutes using 4-10 GPH emitters
        2. Fallback to 10 GPH emitter if tier 1 fails
        3. Use 25 GPH if duration > max_duration_threshold
        4. Beyond threshold warning (yellow compatibility)
        
        Returns:
            Tuple[target_duration_hours, emitter_tier, tier_reason]
        """
        water_optimal_in_week = plant_data.get('water_optimal_in_week', 0)
        root_area_sqft = plant_data.get('root_area_sqft', 0)
        
        if water_optimal_in_week <= 0 or root_area_sqft <= 0:
            return 20.0 / 60.0, "default", "Invalid plant data, using default 20 minutes"
        
        # Calculate required water volume
        weekly_water_volume = water_optimal_in_week * root_area_sqft * 0.623  # gallons
        per_cycle_volume = weekly_water_volume / cycles_per_week  # gallons per cycle
        
        # Get max duration threshold from settings
        max_duration_threshold_hours = self.get_max_duration_threshold_hours()
        
        # Tier 1: Target 15-25 minutes using 4-10 GPH emitters
        for target_minutes in [15, 20, 25]:
            target_duration_hours = target_minutes / 60.0
            required_gph = per_cycle_volume / target_duration_hours
            
            # Check if we can use 4-10 GPH emitters
            if 4.0 <= required_gph <= 10.0:
                return target_duration_hours, "tier1_optimal", f"Tier 1: {target_minutes} min with {required_gph:.1f} GPH (4-10 GPH range)"
        
        # Tier 2: Fallback to 10 GPH emitter
        target_duration_hours = per_cycle_volume / 10.0
        if target_duration_hours <= max_duration_threshold_hours:
            return target_duration_hours, "tier2_fallback", f"Tier 2: {target_duration_hours*60:.1f} min with 10 GPH emitter"
        
        # Tier 3: Use 25 GPH if duration > threshold
        target_duration_hours = per_cycle_volume / 25.0
        if target_duration_hours <= max_duration_threshold_hours:
            return target_duration_hours, "tier3_25gph", f"Tier 3: {target_duration_hours*60:.1f} min with 25 GPH emitter (under threshold)"
        
        # Tier 4: Beyond threshold warning
        target_duration_hours = per_cycle_volume / 25.0
        return target_duration_hours, "tier4_beyond_threshold", f"Tier 4: {target_duration_hours*60:.1f} min with 25 GPH emitter (BEYOND {max_duration_threshold_hours*60:.0f} min threshold)"
    
    def get_max_duration_threshold_hours(self) -> float:
        """Get max duration threshold from settings, default 2 hours"""
        try:
            import sys
            import os
            sys.path.append(os.path.dirname(os.path.dirname(__file__)))
            from api import load_ini_settings
            settings = load_ini_settings()
            threshold_str = settings.get('max_duration_threshold', '02:00')
            
            # Parse HH:MM format
            if ':' in threshold_str:
                hours, minutes = threshold_str.split(':')
                return float(hours) + float(minutes) / 60.0
            else:
                return float(threshold_str)  # Assume hours if no colon
        except Exception as e:
            log_event(plants_logger, 'WARNING', 'Failed to load max_duration_threshold, using default', error=str(e))
            return 2.0  # Default 2 hours
    
    def calculate_optimal_emitter_size(self, plant_data: Dict[str, Any], zone_id: int, is_new_placement: bool = False) -> Dict[str, Any]:
        """
        Calculate optimal emitter size for a plant in a specific zone
        
        Returns:
            Dict with calculation results and health validation
        """
        plant_library_data = self.get_plant_data(
            plant_data.get('plant_id'), 
            plant_data.get('library_book')
        )
        if not plant_library_data:
            return {
                'success': False,
                'error': 'Plant not found in library'
            }
        
        # Check zone mode first
        zone_mode = self._get_zone_mode(zone_id)
        if zone_mode != 'smart':
            # Manual mode - return default 4 GPH
            return {
                'success': True,
                'calculated_gph': 4.0,
                'recommended_emitter': 4.0,
                'actual_weekly_water': 0.0,  # Not calculated in manual mode
                'is_within_tolerance': True,
                'health_status': 'manual_mode',
                'tolerance_delta': 0,
                'tolerance_status': 'Manual mode - using default 4 GPH',
                'calculation_details': {
                    'zone_mode': zone_mode,
                    'reason': 'Manual mode - no calculation performed'
                }
            }
        
        zone_frequency = self.get_zone_frequency(zone_id)
        if not zone_frequency:
            return {
                'success': False,
                'error': 'Zone not found or no frequency set'
            }
        
        # Get plant water requirements
        water_optimal_in_week = plant_library_data.get('water_optimal_in_week', 0)
        root_area_sqft = plant_library_data.get('root_area_sqft', 0)
        tolerance_min_in_week = plant_library_data.get('tolerance_min_in_week', 0)
        tolerance_max_in_week = plant_library_data.get('tolerance_max_in_week', 0)
        
        if water_optimal_in_week <= 0 or root_area_sqft <= 0:
            return {
                'success': False,
                'error': 'Invalid plant water requirements'
            }
        
        # Calculate cycles per week
        cycles_per_week = self.calculate_cycles_per_week(zone_frequency)
        
        if cycles_per_week <= 0:
            return {
                'success': False,
                'error': 'Invalid zone schedule configuration'
            }
        
        # Check if zone is empty (no plants currently in the zone)
        zone_plants = self.get_zone_plants(zone_id)
        is_empty_zone = len(zone_plants) == 0
        
        # Smart mode duration logic with 4-tier flexible targeting:
        if is_empty_zone:
            # For empty zones, use flexible duration targeting
            target_duration_hours, emitter_tier, tier_reason = self.calculate_flexible_duration_target(
                plant_library_data, cycles_per_week, zone_id
            )
        else:
            # For zones with plants in smart mode, use current zone duration
            zone_duration_hours = self.get_zone_duration_hours(zone_id)
            if zone_duration_hours <= 0:
                return {
                    'success': False,
                    'error': 'Invalid zone schedule configuration'
                }
            target_duration_hours = zone_duration_hours
            emitter_tier = "existing_zone"
            tier_reason = "Using existing zone duration"
        
        # Calculate optimal emitter size
        # Formula: (water_optimal_in_week × root_area_sqft × 0.623) ÷ (cycles_per_week × target_duration_hours)
        weekly_water_volume = water_optimal_in_week * root_area_sqft * 0.623  # gallons
        per_cycle_volume = weekly_water_volume / cycles_per_week  # gallons per cycle
        calculated_gph = per_cycle_volume / target_duration_hours  # gallons per hour
        
        # For flexible targeting, use the tier-specific emitter size
        if is_empty_zone and emitter_tier != "existing_zone":
            if emitter_tier == "tier1_optimal":
                # Use calculated GPH (should be 4-10 range)
                target_emitter_gph = calculated_gph
            elif emitter_tier == "tier2_fallback":
                # Use 10 GPH emitter
                target_emitter_gph = 10.0
            elif emitter_tier in ["tier3_25gph", "tier4_beyond_threshold"]:
                # Use 25 GPH emitter
                target_emitter_gph = 25.0
            else:
                target_emitter_gph = calculated_gph
        else:
            target_emitter_gph = calculated_gph
        
        # Debug logging
        log_event(plants_logger, 'DEBUG', 'Emitter calculation details', 
                 zone_id=zone_id,
                 zone_mode=zone_mode,
                 water_optimal_in_week=water_optimal_in_week,
                 root_area_sqft=root_area_sqft,
                 zone_frequency=zone_frequency,
                 cycles_per_week=cycles_per_week,
                 target_duration_hours=target_duration_hours,
                 weekly_water_volume=weekly_water_volume,
                 per_cycle_volume=per_cycle_volume,
                 calculated_gph=calculated_gph,
                 is_empty_zone=is_empty_zone,
                 is_new_placement=is_new_placement,
                 plant_id=plant_data.get('plant_id'),
                 library_book=plant_data.get('library_book'),
                 plant_name=plant_library_data.get('common_name', 'Unknown'))
        
        # For existing zones, use current emitter size instead of calculating new one
        if emitter_tier == "existing_zone":
            current_emitter = self.get_current_zone_emitter_size(zone_id)
            if current_emitter is not None:
                nearest_emitter = current_emitter
                log_event(plants_logger, 'DEBUG', 'Using existing zone emitter', 
                         zone_id=zone_id,
                         current_emitter=current_emitter,
                         calculated_optimal=calculated_gph)
            else:
                # Fallback if no current emitter found (shouldn't happen)
                nearest_emitter = min(EMITTER_SIZES, key=lambda x: abs(x - target_emitter_gph))
        else:
            # Find nearest available emitter size for new zones
            nearest_emitter = min(EMITTER_SIZES, key=lambda x: abs(x - target_emitter_gph))
        
        log_event(plants_logger, 'DEBUG', 'Emitter selection', 
                 calculated_gph=calculated_gph,
                 nearest_emitter=nearest_emitter,
                 available_emitters=EMITTER_SIZES)
        
        # Calculate actual water delivery with nearest emitter
        actual_weekly_water = (nearest_emitter * target_duration_hours * cycles_per_week) / (root_area_sqft * 0.623)
        
        # Health validation with tier-based logic
        is_within_tolerance = tolerance_min_in_week <= actual_weekly_water <= tolerance_max_in_week
        
        # Adjust health status based on emitter tier
        if emitter_tier == "tier4_beyond_threshold":
            health_status = "warning_beyond_threshold"
            is_within_tolerance = True  # Allow but warn
        elif emitter_tier == "tier3_25gph":
            health_status = "acceptable_25gph"
        elif emitter_tier == "tier2_fallback":
            health_status = "acceptable_10gph"
        elif emitter_tier == "tier1_optimal":
            health_status = "optimal_4to10gph"
        else:
            health_status = "healthy" if is_within_tolerance else "unhealthy"
        
        # Enhanced debugging for tolerance calculation
        log_event(plants_logger, 'DEBUG', 'Tolerance validation', 
                 plant_name=plant_library_data.get('common_name'),
                 zone_id=zone_id,
                 actual_weekly_water=actual_weekly_water,
                 tolerance_min=tolerance_min_in_week,
                 tolerance_max=tolerance_max_in_week,
                 is_within_tolerance=is_within_tolerance,
                 health_status=health_status,
                 calculated_gph=calculated_gph,
                 nearest_emitter=nearest_emitter,
                 target_duration_hours=target_duration_hours,
                 cycles_per_week=cycles_per_week,
                 root_area_sqft=root_area_sqft)
        
        # Calculate tolerance delta
        if actual_weekly_water < tolerance_min_in_week:
            tolerance_delta = tolerance_min_in_week - actual_weekly_water
            tolerance_status = f"Under by {tolerance_delta:.2f} inches/week"
        elif actual_weekly_water > tolerance_max_in_week:
            tolerance_delta = actual_weekly_water - tolerance_max_in_week
            tolerance_status = f"Over by {tolerance_delta:.2f} inches/week"
        else:
            tolerance_delta = 0
            tolerance_status = "Within tolerance"
        
        return {
            'success': True,
            'calculated_gph': calculated_gph,
            'target_emitter_gph': target_emitter_gph,
            'recommended_emitter': nearest_emitter,
            'actual_weekly_water': actual_weekly_water,
            'is_within_tolerance': is_within_tolerance,
            'health_status': health_status,
            'tolerance_delta': tolerance_delta,
            'tolerance_status': tolerance_status,
            'emitter_tier': emitter_tier,
            'tier_reason': tier_reason,
            'calculation_details': {
                'water_optimal_in_week': water_optimal_in_week,
                'root_area_sqft': root_area_sqft,
                'cycles_per_week': cycles_per_week,
                'target_duration_hours': target_duration_hours,
                'is_empty_zone': is_empty_zone,
                'weekly_water_volume': weekly_water_volume,
                'per_cycle_volume': per_cycle_volume,
                'tolerance_min_in_week': tolerance_min_in_week,
                'tolerance_max_in_week': tolerance_max_in_week,
                'zone_mode': zone_mode
            }
        }
    
    def validate_emitter_compatibility(self, plant_data: Dict[str, Any], zone_id: int) -> Dict[str, Any]:
        """
        Validate if a plant can be placed in a zone with smart emitter sizing
        
        Returns:
            Dict with validation results
        """
        # Check zone mode first
        zone_mode = self._get_zone_mode(zone_id)
        if zone_mode != 'smart':
            # Manual mode - always compatible (uses default 4 GPH)
            return {
                'compatible': True,
                'reason': 'Manual mode - using default 4 GPH emitter',
                'emitter_calculation': {
                    'success': True,
                    'recommended_emitter': 4.0,
                    'zone_mode': zone_mode
                }
            }
        
        emitter_calculation = self.calculate_optimal_emitter_size(plant_data, zone_id, is_new_placement=True)
        
        if not emitter_calculation.get('success'):
            return {
                'compatible': False,
                'reason': emitter_calculation.get('error', 'Unknown error'),
                'emitter_calculation': emitter_calculation
            }
        
        is_within_tolerance = emitter_calculation.get('is_within_tolerance', False)
        
        return {
            'compatible': is_within_tolerance,
            'reason': 'Emitter sizing within tolerance' if is_within_tolerance else 'Emitter sizing outside tolerance',
            'emitter_calculation': emitter_calculation
        }
    
    # Basic plant management functions (moved from API)
    
    def add_plant_instance(self, plant_data: Dict[str, Any]) -> Tuple[bool, str, Optional[str]]:
        """
        Add a new plant instance to the map
        
        Returns:
            Tuple[bool, str, Optional[str]]: (success, message, instance_id)
        """
        if not plant_data:
            return False, "Invalid plant data", None
        
        # Find next available instance ID
        next_instance_id = 1
        while str(next_instance_id) in self.plant_map:
            next_instance_id += 1
        
        instance_id = str(next_instance_id)
        
        # Add smart_overrides if not present (duration is handled by schedule.json)
        if 'smart_overrides' not in plant_data:
            plant_data['smart_overrides'] = {
                'zone_selection': 'manual',
                'emitter_sizing': 'manual'
            }
        
        # Save to map
        try:
            self.plant_map[instance_id] = plant_data
            
            # Save to file
            with open(MAP_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.plant_map, f, indent=2)
            
            log_event(plants_logger, 'INFO', 'Plant instance added', 
                     instance_id=instance_id,
                     plant_id=plant_data.get('plant_id'),
                     location_id=plant_data.get('location_id'),
                     zone=plant_data.get('zone'),
                     quantity=plant_data.get('quantity'))
            
            # Trigger smart duration refresh for the affected zone
            zone_id = plant_data.get('zone_id')
            if zone_id:
                self._trigger_zone_smart_refresh(zone_id)
            
            return True, "Plant instance added successfully", instance_id
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to add plant instance', 
                     instance_id=instance_id, error=str(e))
            return False, f"Failed to save plant instance: {str(e)}", None
    
    def get_plant_instances(self) -> Dict[str, Any]:
        """Get all plant instances"""
        return self.plant_map
    
    def reassign_plant(self, instance_id: str, new_location_id: int, new_zone_id: Optional[int] = None) -> Tuple[bool, str]:
        """
        Reassign a plant instance to a new location and optionally a new zone
        
        Args:
            instance_id: The plant instance ID to reassign
            new_location_id: New location ID
            new_zone_id: New zone ID (optional, keeps existing if not provided)
        
        Returns:
            Tuple[bool, str]: (success, message)
        """
        if instance_id not in self.plant_map:
            return False, "Plant instance not found"
        
        old_location_id = self.plant_map[instance_id].get('location_id')
        old_zone_id = self.plant_map[instance_id].get('zone_id')
        
        # Update location_id
        self.plant_map[instance_id]['location_id'] = new_location_id
        
        # Update zone_id if provided
        if new_zone_id is not None:
            self.plant_map[instance_id]['zone_id'] = new_zone_id
        
        try:
            # Save to file
            with open(MAP_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.plant_map, f, indent=2)
            
            changes = f"location {old_location_id} → {new_location_id}"
            if new_zone_id is not None and new_zone_id != old_zone_id:
                changes += f", zone {old_zone_id} → {new_zone_id}"
            
            log_event(plants_logger, 'INFO', 'Plant instance reassigned', 
                     instance_id=instance_id,
                     old_location=old_location_id,
                     new_location=new_location_id,
                     old_zone=old_zone_id,
                     new_zone=new_zone_id)
            
            # Trigger smart duration refresh for affected zones (only if they're in smart mode)
            if old_zone_id:
                self._trigger_zone_smart_refresh(old_zone_id)
            if new_zone_id and new_zone_id != old_zone_id:
                self._trigger_zone_smart_refresh(new_zone_id)
            
            return True, f"Plant instance {instance_id} reassigned ({changes})"
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to reassign plant instance', 
                     instance_id=instance_id, error=str(e))
            return False, f"Failed to reassign plant: {str(e)}"
    
    def update_plant_instance(self, instance_id: str, updated_data: Dict[str, Any]) -> Tuple[bool, str]:
        """
        Update a plant instance with new data
        
        Args:
            instance_id: The plant instance ID to update
            updated_data: Dictionary containing fields to update
        
        Returns:
            Tuple[bool, str]: (success, message)
        """
        if instance_id not in self.plant_map:
            return False, "Plant instance not found"
        
        old_data = self.plant_map[instance_id].copy()
        
        # Update the fields
        for key, value in updated_data.items():
            if key != 'instance_id':  # Don't allow changing the instance ID
                self.plant_map[instance_id][key] = value
        
        try:
            # Save to file
            with open(MAP_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.plant_map, f, indent=2)
            
            # Log the changes
            changes = []
            for key, new_value in updated_data.items():
                if key in old_data and old_data[key] != new_value:
                    changes.append(f"{key}: {old_data[key]} → {new_value}")
                elif key not in old_data:
                    changes.append(f"{key}: → {new_value}")
            
            log_event(plants_logger, 'INFO', 'Plant instance updated', 
                     instance_id=instance_id,
                     changes=', '.join(changes))
            
            # Trigger smart duration refresh if zone changed
            old_zone_id = old_data.get('zone_id')
            new_zone_id = updated_data.get('zone_id', old_zone_id)
            
            if old_zone_id and old_zone_id != new_zone_id:
                self._trigger_zone_smart_refresh(old_zone_id)
            if new_zone_id:
                self._trigger_zone_smart_refresh(new_zone_id)
            
            return True, f"Plant instance {instance_id} updated successfully"
            
        except Exception as e:
            # Restore original data on error
            self.plant_map[instance_id] = old_data
            log_event(plants_logger, 'ERROR', 'Failed to update plant instance', 
                     instance_id=instance_id, error=str(e))
            return False, f"Failed to update plant instance: {str(e)}"

    def delete_plant_instance(self, instance_id: str) -> Tuple[bool, str]:
        """
        Delete a plant instance
        
        Returns:
            Tuple[bool, str]: (success, message)
        """
        if instance_id not in self.plant_map:
            return False, "Plant instance not found"
        
        plant_info = self.plant_map[instance_id]
        del self.plant_map[instance_id]
        
        try:
            # Save to file
            with open(MAP_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.plant_map, f, indent=2)
            
            log_event(plants_logger, 'INFO', 'Plant instance deleted', 
                     instance_id=instance_id,
                     plant_id=plant_info.get('plant_id'),
                     location_id=plant_info.get('location_id'),
                     zone=plant_info.get('zone'),
                     quantity=plant_info.get('quantity'))
            
            # Trigger smart duration refresh for the affected zone
            zone_id = plant_info.get('zone_id')
            if zone_id:
                self._trigger_zone_smart_refresh(zone_id)
                # Check if the zone is now empty and disable if so
                zone_plants = self.get_zone_plants(zone_id)
                if len(zone_plants) == 0:
                    try:
                        # Purge zone configuration when it becomes empty (same as UI deactivation)
                        # Use API endpoint to avoid circular import
                        import requests
                        response = requests.post(f'http://localhost:5000/api/scheduler/update-zone-mode', 
                                               json={'zone_id': zone_id, 'new_mode': 'disabled', 'purge_config': True})
                        if response.status_code != 200:
                            log_event(plants_logger, 'ERROR', 'Failed to disable empty zone via API', 
                                    zone_id=zone_id, status_code=response.status_code)
                    except Exception as e:
                        log_event(plants_logger, 'ERROR', 'Failed to disable empty zone', zone_id=zone_id, error=str(e))
            
            return True, f"Plant instance {instance_id} deleted successfully"
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to delete plant instance', 
                     instance_id=instance_id, error=str(e))
            return False, f"Failed to delete plant: {str(e)}"
    
    def get_plant_data(self, plant_id: int, library_book: str = None) -> Optional[Dict[str, Any]]:
        """Get plant library data by plant_id and optionally library_book"""
        # Debug logging
        log_event(plants_logger, 'DEBUG', 'get_plant_data called', 
                 plant_id=plant_id, library_book=library_book)
        
        # If library_book is provided, create the unique plant ID
        if library_book:
            # Strip .json extension to match how it's stored in _load_plant_library
            library_name = library_book.replace('.json', '')
            unique_plant_id = f"{library_name}_{plant_id}"
            plant_info = self.plant_library.get(unique_plant_id)
            if plant_info:
                log_event(plants_logger, 'DEBUG', 'Plant found with unique ID', 
                         unique_plant_id=unique_plant_id,
                         plant_name=plant_info['data'].get('common_name'))
                return plant_info['data']
            else:
                log_event(plants_logger, 'DEBUG', 'Plant not found with unique ID', 
                         unique_plant_id=unique_plant_id)
                # If library_book is provided but plant not found, don't fallback
                # This prevents finding the wrong plant from a different library
                return None
        
        # Fallback: search for plant_id across all libraries (only when library_book is not provided)
        for unique_id, plant_info in self.plant_library.items():
            if plant_info.get('original_plant_id') == plant_id:
                log_event(plants_logger, 'DEBUG', 'Plant found with fallback search', 
                         unique_id=unique_id,
                         plant_name=plant_info['data'].get('common_name'))
                return plant_info['data']
        
        log_event(plants_logger, 'DEBUG', 'Plant not found in any library', 
                 plant_id=plant_id, library_book=library_book)
        return None
    
    def get_zone_plants(self, zone_id: int) -> List[Dict[str, Any]]:
        """Get all plants in a specific zone"""
        zone_plants = []
        for instance_id, plant_data in self.plant_map.items():
            if plant_data.get('zone_id') == zone_id:
                zone_plants.append({
                    'instance_id': instance_id,
                    **plant_data
                })
        return zone_plants
    
    def get_current_zone_emitter_size(self, zone_id: int) -> Optional[float]:
        """Get the current emitter size for a zone if it has plants"""
        for instance_id, plant_data in self.plant_map.items():
            if plant_data.get('zone_id') == zone_id:
                emitter_size = plant_data.get('emitter_size')
                if emitter_size is not None:
                    return float(emitter_size)
        return None
    
    def get_zone_frequency(self, zone_id: int) -> Optional[str]:
        """Get the frequency setting for a zone"""
        # Handle the actual schedule.json structure where zones are direct keys
        zone_key = str(zone_id)
        if zone_key in self.schedule_data:
            zone = self.schedule_data[zone_key]
            period = zone.get('period')
            cycles = zone.get('cycles', 1)
            if period:
                # Combine period and cycles to create frequency code (e.g., 'D1', 'W2', 'M3')
                frequency = f"{period}{cycles}"
                log_event(plants_logger, 'DEBUG', 'Zone frequency found', 
                         zone_id=zone_id, period=period, cycles=cycles, frequency=frequency, 
                         zone_mode=zone.get('mode'), zone_comment=zone.get('comment', ''))
                return frequency
            else:
                log_event(plants_logger, 'WARNING', 'Zone found but no period set', 
                         zone_id=zone_id, zone_data=zone)
        else:
            log_event(plants_logger, 'DEBUG', 'Zone not found in schedule data', 
                     zone_id=zone_id, available_zones=list(self.schedule_data.keys()))
        
        # Also check the legacy zones array structure for backward compatibility
        for zone in self.schedule_data.get('zones', []):
            if zone.get('zone_id') == zone_id:
                period = zone.get('period')
                cycles = zone.get('cycles', 1)
                if period:
                    # Combine period and cycles to create frequency code (e.g., 'D1', 'W2', 'M3')
                    frequency = f"{period}{cycles}"
                    log_event(plants_logger, 'DEBUG', 'Zone frequency found (legacy)', 
                             zone_id=zone_id, period=period, cycles=cycles, frequency=frequency)
                    return frequency
        
        log_event(plants_logger, 'WARNING', 'Zone frequency not found', zone_id=zone_id)
        return None

    # Smart placement functions
    
    def has_primary_match(self, plant_frequency: str, zone_frequency: str) -> bool:
        """Check for exact frequency match (Primary compatibility)"""
        if isinstance(plant_frequency, list):
            return zone_frequency in plant_frequency
        return plant_frequency == zone_frequency
    
    def has_secondary_match(self, plant_frequency: str, zone_frequency: str, plant_data: Dict[str, Any] = None) -> bool:
        """Check for compatible frequency match (Secondary compatibility)"""
        # If plant_data is provided, use it directly
        if plant_data:
            compatible_frequencies = plant_data.get('compatible_watering_frequencies', [])
            if isinstance(compatible_frequencies, list):
                return zone_frequency in compatible_frequencies
            return compatible_frequencies == zone_frequency
        
        # Fallback: search through all plants (less efficient)
        for plant_info in self.plant_library.values():
            plant = plant_info['data']
            if isinstance(plant.get('watering_frequency'), list):
                if plant_frequency in plant.get('watering_frequency', []):
                    compatible_frequencies = plant.get('compatible_watering_frequencies', [])
                    if isinstance(compatible_frequencies, list):
                        if zone_frequency in compatible_frequencies:
                            return True
            elif plant.get('watering_frequency') == plant_frequency:
                compatible_frequencies = plant.get('compatible_watering_frequencies', [])
                if isinstance(compatible_frequencies, list):
                    if zone_frequency in compatible_frequencies:
                        return True
        
        return False
    
    def _calculate_cycles_per_month(self, frequency: str) -> int:
        """Calculate cycles per month for a frequency code"""
        if not frequency:
            return 0
        
        code = frequency.upper()
        if code.startswith('D'):
            try:
                cycles_per_day = int(code[1:])
                return cycles_per_day * 28  # 28 days per month
            except ValueError:
                return 0
        elif code.startswith('W'):
            try:
                cycles_per_week = int(code[1:])
                return cycles_per_week * 4  # 4 weeks per month
            except ValueError:
                return 0
        elif code.startswith('M'):
            try:
                cycles_per_month = int(code[1:])
                return cycles_per_month
            except ValueError:
                return 0
        return 0
    
    def has_tertiary_match(self, plant_frequency: str, zone_frequency: str) -> bool:
        """Check for adjacent frequency match (Tertiary compatibility)"""
        plant_cycles = self._calculate_cycles_per_month(plant_frequency)
        zone_cycles = self._calculate_cycles_per_month(zone_frequency)
        
        if plant_cycles == 0 or zone_cycles == 0:
            return False
        
        # Special pairings
        if (plant_frequency == 'W6' and zone_frequency == 'D1') or (plant_frequency == 'D1' and zone_frequency == 'W6'):
            return True  # 24 cycles ↔ 28 cycles
        if (plant_frequency == 'M3' and zone_frequency == 'W1') or (plant_frequency == 'W1' and zone_frequency == 'M3'):
            return True  # 3 cycles ↔ 4 cycles
        
        # Within-category rules
        plant_code = plant_frequency[0] if plant_frequency else ''
        zone_code = zone_frequency[0] if zone_frequency else ''
        
        if plant_code == zone_code:
            # Same category - check adjacency
            if plant_code == 'D':  # Daily codes
                return abs(plant_cycles - zone_cycles) <= 28
            elif plant_code == 'W':  # Weekly codes
                return abs(plant_cycles - zone_cycles) <= 4
            elif plant_code == 'M':  # Monthly codes
                return abs(plant_cycles - zone_cycles) <= 1
        
        return False
    
    def is_frequency_compatible(self, plant_frequency: str, zone_frequency: str, plant_data: Dict[str, Any] = None) -> Tuple[bool, str]:
        """
        Check overall frequency compatibility
        
        Returns:
            Tuple[bool, str]: (is_compatible, compatibility_level)
        """
        if self.has_primary_match(plant_frequency, zone_frequency):
            return True, "primary"
        elif self.has_secondary_match(plant_frequency, zone_frequency, plant_data):
            return True, "secondary"
        elif self.has_tertiary_match(plant_frequency, zone_frequency):
            return True, "tertiary"
        else:
            return False, "none"
    
    def calculate_zone_compatibility_score(self, plant_data: Dict[str, Any], zone_id: int) -> float:
        """Calculate compatibility score for a plant in a zone (0.0 to 1.0)"""
        plant_library_data = self.get_plant_data(
            plant_data.get('plant_id'), 
            plant_data.get('library_book')
        )
        if not plant_library_data:
            return 0.0
        
        zone_frequency = self.get_zone_frequency(zone_id)
        if not zone_frequency:
            return 0.0
        
        # Get plant frequency (handle multiple values)
        plant_frequencies = plant_library_data.get('watering_frequency', [])
        if not isinstance(plant_frequencies, list):
            plant_frequencies = [plant_frequencies]
        
        # Step 1: Calculate frequency compatibility score
        frequency_score = 0.0
        for plant_frequency in plant_frequencies:
            is_compatible, level = self.is_frequency_compatible(plant_frequency, zone_frequency, plant_library_data)
            if is_compatible:
                if level == "primary":
                    score = 1.0
                elif level == "secondary":
                    score = 0.8
                elif level == "tertiary":
                    score = 0.6
                else:
                    score = 0.0
                frequency_score = max(frequency_score, score)
        
        # If frequency is not compatible, return 0
        if frequency_score == 0.0:
            return 0.0
        
        # Step 2: Check emitter/duration compatibility for existing zones with plants
        emitter_analysis = self.calculate_optimal_emitter_size(plant_data, zone_id, is_new_placement=True)
        
        if not emitter_analysis.get('success'):
            log_event(plants_logger, 'DEBUG', 'Zone compatibility reduced - emitter analysis failed', 
                     zone_id=zone_id, plant_name=plant_library_data.get('common_name'))
            return 0.0
        
        # Step 3: Apply emitter tier penalties to the frequency score
        emitter_tier = emitter_analysis.get('emitter_tier', '')
        health_status = emitter_analysis.get('health_status', '')
        is_within_tolerance = emitter_analysis.get('is_within_tolerance', False)
        
        # If the plant cannot be grown within tolerance, mark as incompatible
        if not is_within_tolerance and emitter_tier != "tier4_beyond_threshold":
            log_event(plants_logger, 'DEBUG', 'Zone marked incompatible - outside tolerance', 
                     zone_id=zone_id, 
                     plant_name=plant_library_data.get('common_name'),
                     emitter_tier=emitter_tier,
                     health_status=health_status)
            return 0.0
        
        # Apply tier-based score modifiers
        if emitter_tier == "tier1_optimal":
            # Perfect emitter match - keep full frequency score
            final_score = frequency_score
        elif emitter_tier == "tier2_fallback":
            # Acceptable fallback - keep full score (still optimal)
            final_score = frequency_score
        elif emitter_tier == "tier3_25gph":
            # High flow emitter needed - moderate penalty
            final_score = frequency_score * 0.8
        elif emitter_tier == "tier4_beyond_threshold":
            # Beyond threshold - significant penalty (yellow warning)
            final_score = frequency_score * 0.5
        elif emitter_tier == "existing_zone":
            # Existing zone with plants - check if it can accommodate new plant
            if is_within_tolerance:
                # Can accommodate with existing duration - small penalty for complexity
                final_score = frequency_score * 0.9
            else:
                # Cannot accommodate with existing duration - FILTER OUT COMPLETELY
                log_event(plants_logger, 'DEBUG', 'Zone filtered out - existing zone cannot meet tolerance', 
                         zone_id=zone_id, 
                         plant_name=plant_library_data.get('common_name'),
                         is_within_tolerance=is_within_tolerance,
                         emitter_tier=emitter_tier)
                return 0.0
        else:
            # Unknown tier - default penalty
            final_score = frequency_score * 0.7
        
        log_event(plants_logger, 'DEBUG', 'Zone compatibility calculated with emitter analysis', 
                 zone_id=zone_id,
                 plant_name=plant_library_data.get('common_name'),
                 frequency_score=frequency_score,
                 emitter_tier=emitter_tier,
                 health_status=health_status,
                 is_within_tolerance=is_within_tolerance,
                 final_score=final_score)
        
        return final_score
    
    def find_optimal_zone_for_plant(self, plant_data: Dict[str, Any]) -> Tuple[Optional[int], float, str]:
        """
        Find the optimal zone for a plant
        
        Returns:
            Tuple[Optional[int], float, str]: (zone_id, score, reason)
        """
        best_zone = None
        best_score = 0.0
        best_reason = "No compatible zones found"
        
        # Handle the actual schedule.json structure where zones are direct keys
        for zone_key, zone in self.schedule_data.items():
            try:
                zone_id = int(zone_key)
            except ValueError:
                continue  # Skip non-numeric keys
            
            # Skip disabled zones
            if zone.get('mode') == 'disabled':
                continue
            
            score = self.calculate_zone_compatibility_score(plant_data, zone_id)
            if score > best_score:
                best_score = score
                best_zone = zone_id
                
                if score == 1.0:
                    best_reason = "Perfect frequency match"
                elif score == 0.8:
                    best_reason = "Compatible frequency match"
                elif score == 0.6:
                    best_reason = "Adjacent frequency match"
        
        # Also check the legacy zones array structure for backward compatibility
        for zone in self.schedule_data.get('zones', []):
            zone_id = zone.get('zone_id')
            if not zone_id:
                continue
            
            # Skip disabled zones
            if zone.get('mode') == 'disabled':
                continue
            
            score = self.calculate_zone_compatibility_score(plant_data, zone_id)
            if score > best_score:
                best_score = score
                best_zone = zone_id
                
                if score == 1.0:
                    best_reason = "Perfect frequency match"
                elif score == 0.8:
                    best_reason = "Compatible frequency match"
                elif score == 0.6:
                    best_reason = "Adjacent frequency match"
        
        return best_zone, best_score, best_reason
    
    def get_zone_recommendations(self, plant_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get ranked zone recommendations for a plant"""
        recommendations = []
        
        # Handle the actual schedule.json structure where zones are direct keys
        for zone_key, zone in self.schedule_data.items():
            try:
                zone_id = int(zone_key)
            except ValueError:
                continue  # Skip non-numeric keys
            
            # Skip disabled zones
            if zone.get('mode') == 'disabled':
                continue
            
            score = self.calculate_zone_compatibility_score(plant_data, zone_id)
            log_event(plants_logger, 'DEBUG', 'Zone compatibility score calculated', 
                     zone_id=zone_id, 
                     score=score, 
                     period=zone.get('period'),
                     mode=zone.get('mode'),
                     plant_name=plant_data.get('common_name'))
            if score > 0.0:  # Only include compatible zones
                recommendations.append({
                    'zone_id': zone_id,
                    'score': score,
                    'period': zone.get('period'),
                    'comment': zone.get('comment', ''),
                    'mode': zone.get('mode', 'manual')
                })
        
        # Also check the legacy zones array structure for backward compatibility
        for zone in self.schedule_data.get('zones', []):
            zone_id = zone.get('zone_id')
            if not zone_id:
                continue
            
            # Skip disabled zones
            if zone.get('mode') == 'disabled':
                continue
            
            score = self.calculate_zone_compatibility_score(plant_data, zone_id)
            if score > 0.0:  # Only include compatible zones
                recommendations.append({
                    'zone_id': zone_id,
                    'score': score,
                    'period': zone.get('period'),
                    'comment': zone.get('comment', ''),
                    'mode': zone.get('mode', 'manual')
                })
        
        # Sort by score (highest first)
        recommendations.sort(key=lambda x: x['score'], reverse=True)
        return recommendations
    
    def analyze_plant_placement(self, plant_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze plant placement and provide recommendations
        
        Returns:
            Dict with analysis results and recommendations
        """
        plant_library_data = self.get_plant_data(
            plant_data.get('plant_id'), 
            plant_data.get('library_book')
        )
        if not plant_library_data:
            return {
                'error': 'Plant not found in library',
                'success': False
            }
        
        # Get zone recommendations
        recommendations = self.get_zone_recommendations(plant_data)
        
        # Find optimal zone
        optimal_zone, optimal_score, optimal_reason = self.find_optimal_zone_for_plant(plant_data)
        
        # Check if there are any compatible zones
        has_compatible_zones = len(recommendations) > 0
        
        # Add emitter sizing analysis for each recommendation
        enhanced_recommendations = []
        for rec in recommendations:
            zone_id = rec['zone_id']
            log_event(plants_logger, 'DEBUG', 'Calling emitter calculation for zone', 
                     zone_id=zone_id, plant_id=plant_data.get('plant_id'))
            
            emitter_analysis = self.calculate_optimal_emitter_size(plant_data, zone_id, is_new_placement=True)
            rec['emitter_analysis'] = emitter_analysis
            
            log_event(plants_logger, 'DEBUG', 'Emitter calculation result', 
                     zone_id=zone_id, success=emitter_analysis.get('success'),
                     recommended_emitter=emitter_analysis.get('recommended_emitter'))
            
            # Filter out zones that fail emitter sizing health check
            # Allow tier 4 (beyond threshold) zones but mark them as warnings
            emitter_tier = emitter_analysis.get('emitter_tier', '')
            if emitter_analysis.get('success') and not emitter_analysis.get('is_within_tolerance') and emitter_tier != "tier4_beyond_threshold":
                log_event(plants_logger, 'DEBUG', 'Zone filtered out due to emitter sizing', 
                         zone_id=zone_id, 
                         plant_name=plant_library_data.get('common_name'),
                         is_within_tolerance=emitter_analysis.get('is_within_tolerance'),
                         health_status=emitter_analysis.get('health_status'),
                         tolerance_status=emitter_analysis.get('tolerance_status'),
                         emitter_tier=emitter_tier)
                continue  # Skip this zone due to emitter sizing incompatibility
            
            # Add tier information to the recommendation
            rec['emitter_tier'] = emitter_analysis.get('emitter_tier', 'unknown')
            rec['tier_reason'] = emitter_analysis.get('tier_reason', '')
            rec['health_status'] = emitter_analysis.get('health_status', 'unknown')
            enhanced_recommendations.append(rec)
        
        # Update optimal zone if it fails emitter sizing
        optimal_emitter_analysis = None
        if optimal_zone:
            optimal_emitter_analysis = self.calculate_optimal_emitter_size(plant_data, optimal_zone, is_new_placement=True)
            if optimal_emitter_analysis.get('success') and not optimal_emitter_analysis.get('is_within_tolerance'):
                # Find new optimal zone from filtered recommendations
                if enhanced_recommendations:
                    optimal_zone = enhanced_recommendations[0]['zone_id']
                    optimal_score = enhanced_recommendations[0]['score']
                    optimal_reason = "Best frequency match with compatible emitter sizing"
                else:
                    optimal_zone = None
                    optimal_score = 0.0
                    optimal_reason = "No zones with compatible emitter sizing"
        
        result = {
            'success': True,
            'plant_data': plant_library_data,
            'has_compatible_zones': len(enhanced_recommendations) > 0,
            'optimal_zone': optimal_zone,
            'optimal_score': optimal_score,
            'optimal_reason': optimal_reason,
            'recommendations': enhanced_recommendations,
            'total_zones_checked': len(self.schedule_data),
            'compatible_zones_count': len(enhanced_recommendations),
            'optimal_emitter_analysis': optimal_emitter_analysis
        }
        
        # Enhanced debugging for final analysis result
        log_event(plants_logger, 'DEBUG', 'Final analysis result', 
                 plant_name=plant_library_data.get('common_name'),
                 has_compatible_zones=result['has_compatible_zones'],
                 compatible_zones_count=result['compatible_zones_count'],
                 optimal_zone=result['optimal_zone'],
                 optimal_reason=result['optimal_reason'],
                 total_recommendations=len(enhanced_recommendations))
        
        return result
    
    def validate_plant_zone_compatibility(self, plant_data: Dict[str, Any], zone_id: int) -> Dict[str, Any]:
        """
        Validate if a plant can be placed in a specific zone
        
        Returns:
            Dict with validation results
        """
        plant_library_data = self.get_plant_data(
            plant_data.get('plant_id'), 
            plant_data.get('library_book')
        )
        if not plant_library_data:
            return {
                'valid': False,
                'error': 'Plant not found in library'
            }
        
        zone_frequency = self.get_zone_frequency(zone_id)
        if not zone_frequency:
            return {
                'valid': False,
                'error': 'Zone not found or no frequency set'
            }
        
        # Get plant frequency
        plant_frequencies = plant_library_data.get('watering_frequency', [])
        if not isinstance(plant_frequencies, list):
            plant_frequencies = [plant_frequencies]
        
        compatibility_results = []
        for plant_frequency in plant_frequencies:
            is_compatible, level = self.is_frequency_compatible(plant_frequency, zone_frequency, plant_library_data)
            compatibility_results.append({
                'plant_frequency': plant_frequency,
                'zone_frequency': zone_frequency,
                'is_compatible': is_compatible,
                'level': level
            })
        
        # Overall compatibility
        overall_compatible = any(result['is_compatible'] for result in compatibility_results)
        best_level = max((result['level'] for result in compatibility_results if result['is_compatible']), 
                        default='none')
        
        # Add emitter sizing validation
        emitter_validation = self.validate_emitter_compatibility(plant_data, zone_id)
        
        return {
            'valid': overall_compatible and emitter_validation['compatible'],
            'zone_id': zone_id,
            'zone_frequency': zone_frequency,
            'plant_frequencies': plant_frequencies,
            'compatibility_results': compatibility_results,
            'best_compatibility_level': best_level,
            'score': self.calculate_zone_compatibility_score(plant_data, zone_id),
            'emitter_validation': emitter_validation
        }
    
    def handle_no_compatible_zone(self, plant_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Handle the case where no compatible zone is found
        
        Returns:
            Dict with options and suggestions
        """
        plant_library_data = self.get_plant_data(
            plant_data.get('plant_id'), 
            plant_data.get('library_book')
        )
        if not plant_library_data:
            return {
                'error': 'Plant not found in library',
                'success': False
            }
        
        # Get all available zones (excluding disabled)
        available_zones = []
        
        # Handle the actual schedule.json structure where zones are direct keys
        for zone_key, zone in self.schedule_data.items():
            try:
                zone_id = int(zone_key)
            except ValueError:
                continue  # Skip non-numeric keys
            
            if zone.get('mode') != 'disabled':
                # Check both frequency and emitter compatibility
                frequency_compatible = False
                emitter_compatible = False
                
                # Check frequency compatibility
                zone_frequency = self.get_zone_frequency(zone_id)
                if zone_frequency:
                    plant_frequencies = plant_library_data.get('watering_frequency', [])
                    if not isinstance(plant_frequencies, list):
                        plant_frequencies = [plant_frequencies]
                    
                    for plant_frequency in plant_frequencies:
                        is_compatible, _ = self.is_frequency_compatible(plant_frequency, zone_frequency, plant_library_data)
                        if is_compatible:
                            frequency_compatible = True
                            break
                
                # Check emitter compatibility
                emitter_validation = self.validate_emitter_compatibility(plant_data, zone_id)
                emitter_compatible = emitter_validation['compatible']
                
                available_zones.append({
                    'zone_id': zone_id,
                    'period': zone.get('period'),
                    'comment': zone.get('comment', ''),
                    'mode': zone.get('mode', 'manual'),
                    'frequency_compatible': frequency_compatible,
                    'emitter_compatible': emitter_compatible,
                    'emitter_analysis': emitter_validation.get('emitter_calculation', {})
                })
        
        # Also check the legacy zones array structure for backward compatibility
        for zone in self.schedule_data.get('zones', []):
            zone_id = zone.get('zone_id')
            if zone_id and zone.get('mode') != 'disabled':
                # Check both frequency and emitter compatibility
                frequency_compatible = False
                emitter_compatible = False
                
                # Check frequency compatibility
                zone_frequency = self.get_zone_frequency(zone_id)
                if zone_frequency:
                    plant_frequencies = plant_library_data.get('watering_frequency', [])
                    if not isinstance(plant_frequencies, list):
                        plant_frequencies = [plant_frequencies]
                    
                    for plant_frequency in plant_frequencies:
                        is_compatible, _ = self.is_frequency_compatible(plant_frequency, zone_frequency, plant_library_data)
                        if is_compatible:
                            frequency_compatible = True
                            break
                
                # Check emitter compatibility
                emitter_validation = self.validate_emitter_compatibility(plant_data, zone_id)
                emitter_compatible = emitter_validation['compatible']
                
                available_zones.append({
                    'zone_id': zone_id,
                    'period': zone.get('period'),
                    'comment': zone.get('comment', ''),
                    'mode': zone.get('mode', 'manual'),
                    'frequency_compatible': frequency_compatible,
                    'emitter_compatible': emitter_compatible,
                    'emitter_analysis': emitter_validation.get('emitter_calculation', {})
                })
        
        # Determine why no compatible zones found
        frequency_only_zones = [z for z in available_zones if z['frequency_compatible'] and not z['emitter_compatible']]
        emitter_only_zones = [z for z in available_zones if not z['frequency_compatible'] and z['emitter_compatible']]
        neither_zones = [z for z in available_zones if not z['frequency_compatible'] and not z['emitter_compatible']]
        
        suggestions = []
        if frequency_only_zones:
            suggestions.append(f"Found {len(frequency_only_zones)} zones with compatible frequency but incompatible emitter sizing")
        if emitter_only_zones:
            suggestions.append(f"Found {len(emitter_only_zones)} zones with compatible emitter sizing but incompatible frequency")
        if neither_zones:
            suggestions.append(f"Found {len(neither_zones)} zones with neither frequency nor emitter compatibility")
        
        if not available_zones:
            suggestions.append("No zones available for analysis")
        
        suggestions.extend([
            'Create a new zone with compatible frequency and duration',
            'Use manual emitter sizing override',
            'Modify plant watering requirements',
            'Adjust zone frequency or duration settings'
        ])
        
        return {
            'success': True,
            'message': 'No compatible zones found for this plant',
            'plant_data': plant_library_data,
            'available_zones': available_zones,
            'frequency_only_zones': frequency_only_zones,
            'emitter_only_zones': emitter_only_zones,
            'neither_zones': neither_zones,
            'suggestions': suggestions
        }

    # REMOVED: calculate_optimal_zone_duration method
    # Duration calculations are now centralized in scheduler.py only
    # Use scheduler.calculate_smart_zone_duration(zone_id, mock_mode=True) for mock calculations
    # Use scheduler.calculate_smart_zone_duration(zone_id, mock_mode=False) to update schedule.json
    
    def _trigger_zone_smart_refresh(self, zone_id: int):
        """Trigger smart duration AND start time refresh for a specific zone ONLY if it's in smart mode"""
        try:
            # CRITICAL DEBUG: Track PlantManager refresh calls
            print(f"🌱 PLANT MANAGER: Triggering smart refresh for zone {zone_id}")
            
            # Check if the zone is in smart mode before calculating
            zone_mode = self._get_zone_mode(zone_id)
            print(f"🌱 PLANT MANAGER: Zone {zone_id} mode is '{zone_mode}'")
            
            if zone_mode != 'smart':
                print(f"🌱 PLANT MANAGER: Skipping refresh - zone {zone_id} is not in smart mode")
                log_event(plants_logger, 'DEBUG', 'Skipping smart refresh for zone - not in smart mode', 
                         zone_id=zone_id, zone_mode=zone_mode)
                return
            
            from .scheduler import scheduler
            
            # 1. Calculate smart duration
            print(f"🌱 PLANT MANAGER: Calling scheduler for zone {zone_id} duration calculation (mock_mode=False)")
            log_event(plants_logger, 'INFO', 'Plant change detected in smart zone - triggering duration refresh', 
                     zone_id=zone_id)
            
            duration_result = scheduler.calculate_smart_zone_duration(zone_id, mock_mode=False)
            
            if duration_result.get('success'):
                log_event(plants_logger, 'INFO', 'Smart duration refresh completed', 
                         zone_id=zone_id, new_duration=duration_result.get('calculated_duration'))
            else:
                log_event(plants_logger, 'ERROR', 'Smart duration refresh failed', 
                         zone_id=zone_id, error=duration_result.get('error'))
            
            # 2. Calculate smart start times
            print(f"🌱 PLANT MANAGER: Calling scheduler for zone {zone_id} start time calculation (mock_mode=False)")
            log_event(plants_logger, 'INFO', 'Plant change detected in smart zone - triggering start time refresh', 
                     zone_id=zone_id)
            
            start_time_result = scheduler.calculate_smart_zone_start_times(zone_id, mock_mode=False)
            
            if start_time_result.get('success'):
                calculated_times = start_time_result.get('calculated_times', [])
                start_times = [t.get('start_time') for t in calculated_times]
                log_event(plants_logger, 'INFO', 'Smart start time refresh completed', 
                         zone_id=zone_id, new_start_times=start_times, 
                         plant_count=start_time_result.get('plant_count', 0))
            else:
                log_event(plants_logger, 'ERROR', 'Smart start time refresh failed', 
                         zone_id=zone_id, error=start_time_result.get('error'))
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to trigger smart refresh', 
                     zone_id=zone_id, error=str(e))
    
    def _get_zone_mode(self, zone_id: int) -> str:
        """Get the mode setting for a zone"""
        # Handle the actual schedule.json structure where zones are direct keys
        zone_key = str(zone_id)
        if zone_key in self.schedule_data:
            zone = self.schedule_data[zone_key]
            return zone.get('mode', 'manual')
        
        # Also check the legacy zones array structure for backward compatibility
        for zone in self.schedule_data.get('zones', []):
            if zone.get('zone_id') == zone_id:
                return zone.get('mode', 'manual')
        
        return 'manual'  # Default mode
    
    def debug_plant_map(self) -> Dict[str, Any]:
        """Debug method to show current plant map structure"""
        try:
            return {
                'plant_map_keys': list(self.plant_map.keys()),
                'plant_map_sample': dict(list(self.plant_map.items())[:3]) if self.plant_map else {},
                'total_plants': len(self.plant_map)
            }
        except Exception as e:
            return {
                'error': f'Failed to debug plant map: {str(e)}',
                'plant_map_type': type(self.plant_map).__name__
            }
    
    def calculate_optimal_zone_schedule(self, zone_id: int) -> Dict[str, Any]:
        """
        Calculate optimal watering schedule (duration, times, cycles) for a zone based on installed plants
        
        Args:
            zone_id: The zone ID to calculate schedule for
            
        Returns:
            Dict with calculated schedule parameters
        """
        try:
            # Get plants in the zone
            zone_plants = self.get_zone_plants(zone_id)
            
            if not zone_plants:
                return {
                    'success': False,
                    'error': 'No plants found in zone',
                    'calculated_duration': '00:20:00'  # Default 20 minutes
                }
            
            # Calculate optimal duration first using scheduler
            from .scheduler import scheduler
            duration_result = scheduler.calculate_smart_zone_duration(zone_id, mock_mode=True)
            if not duration_result.get('success'):
                return duration_result
            
            # Analyze plant watering requirements to determine optimal schedule
            total_water_requirement = 0
            plant_frequencies = []
            
            for plant_instance in zone_plants:
                plant_id = plant_instance['plant_id']
                library_book = plant_instance['library_book']
                quantity = plant_instance.get('quantity', 1)
                
                # Get plant library data
                plant_library_data = self.get_plant_data(plant_id, library_book)
                if not plant_library_data:
                    continue
                
                # Get plant water requirements and frequency
                water_optimal_in_week = plant_library_data.get('water_optimal_in_week', 0)
                root_area_sqft = plant_library_data.get('root_area_sqft', 0)
                frequency = plant_library_data.get('frequency', 'moderate')
                
                # Calculate total water requirement for this plant type
                volume_per_plant = water_optimal_in_week * root_area_sqft * 0.623
                total_volume_for_type = volume_per_plant * quantity
                total_water_requirement += total_volume_for_type
                
                # Track frequency requirements
                plant_frequencies.extend([frequency] * quantity)
            
            if total_water_requirement <= 0:
                return {
                    'success': False,
                    'error': 'No valid water requirements found for plants in zone',
                    'calculated_duration': duration_result.get('calculated_duration', '00:20:00')
                }
            
            # Determine optimal frequency based on plant requirements
            # Analyze frequency distribution
            frequency_counts = {}
            for freq in plant_frequencies:
                frequency_counts[freq] = frequency_counts.get(freq, 0) + 1
            
            # Determine optimal period and cycles
            # This is a simplified algorithm - can be enhanced based on specific requirements
            if 'high' in frequency_counts and frequency_counts['high'] > len(plant_frequencies) * 0.5:
                # Majority need high frequency - daily watering
                calculated_period = 'D'
                calculated_cycles = 1  # Once per day
            elif 'moderate' in frequency_counts and frequency_counts['moderate'] > len(plant_frequencies) * 0.5:
                # Majority need moderate frequency - every few days
                calculated_period = 'D'
                calculated_cycles = 2  # Twice per week
            else:
                # Default to weekly
                calculated_period = 'W'
                calculated_cycles = 1  # Once per week
            
            # Calculate optimal watering times based on plant types and climate considerations
            # For now, use default morning time, but this could be enhanced with climate data
            calculated_times = [
                {
                    'start_time': '06:00',
                    'duration': duration_result.get('calculated_duration', '00:20:00')
                }
            ]
            
            # If daily with multiple cycles, add afternoon watering
            if calculated_period == 'D' and calculated_cycles > 1:
                calculated_times.append({
                    'start_time': '18:00',
                    'duration': duration_result.get('calculated_duration', '00:20:00')
                })
            
            log_event(plants_logger, 'INFO', 'Zone schedule calculated', 
                     zone_id=zone_id, 
                     calculated_period=calculated_period,
                     calculated_cycles=calculated_cycles,
                     calculated_duration=duration_result.get('calculated_duration'),
                     total_water_requirement=total_water_requirement,
                     plant_count=len(zone_plants))
            
            return {
                'success': True,
                'calculated_duration': duration_result.get('calculated_duration'),
                'calculated_period': calculated_period,
                'calculated_cycles': calculated_cycles,
                'calculated_times': calculated_times,
                'total_water_requirement': total_water_requirement,
                'plant_count': len(zone_plants),
                'frequency_analysis': frequency_counts
            }
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to calculate zone schedule', 
                     zone_id=zone_id, error=str(e))
            return {
                'success': False,
                'error': f'Schedule calculation failed: {str(e)}',
                'calculated_duration': '00:20:00'  # Default 20 minutes
        }

# Create global instance
plant_manager = PlantManager()

@plant_bp.route('/api/smart/validate-compatibility', methods=['POST'])
def validate_plant_zone_compatibility():
    """
    API endpoint for validating plant-zone compatibility and calculating optimal emitter size
    
    Request JSON:
    {
        "plant_id": 1,
        "library_book": "fruitbushes",
        "zone_id": 1
    }
    
    Response JSON:
    {
        "status": "success",
        "data": {
            "emitter_validation": {
                "compatible": true,
                "reason": "Emitter sizing within tolerance",
                "emitter_calculation": {
                    "success": true,
                    "calculated_gph": 0.63,
                    "recommended_emitter": 0.5,
                    "actual_weekly_water": 1.19,
                    "is_within_tolerance": true,
                    "health_status": "healthy",
                    "tolerance_delta": 0,
                    "tolerance_status": "Within tolerance",
                    "calculation_details": {...}
                }
            }
        }
    }
    """
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Plant data and zone_id required"}), 400
        
        # Handle both formats: plant_data object or plant_id/library_book
        plant_data = data.get('plant_data')
        if not plant_data:
            # Build plant_data from plant_id and library_book
            plant_id = data.get('plant_id')
            library_book = data.get('library_book')
            if plant_id is not None and library_book:
                plant_data = {
                    'plant_id': plant_id,
                    'library_book': library_book
                }
        
        zone_id = data.get('zone_id')
        
        if not zone_id or not plant_data:
            return jsonify({"error": "plant_id, library_book, and zone_id required"}), 400
        
        log_event(plants_logger, 'DEBUG', 'API: Emitter compatibility validation requested', 
                 plant_id=plant_data.get('plant_id'), 
                 library_book=plant_data.get('library_book'),
                 zone_id=zone_id)
        
        # Use PlantManager to validate compatibility and calculate emitter size
        validation = plant_manager.validate_emitter_compatibility(plant_data, zone_id)
        
        log_event(plants_logger, 'DEBUG', 'API: Emitter compatibility validation completed', 
                 zone_id=zone_id, 
                 compatible=validation.get('compatible'),
                 recommended_emitter=validation.get('emitter_calculation', {}).get('recommended_emitter'))
        
        return jsonify({
            'status': 'success',
            'data': {
                'emitter_validation': validation
            }
        })
        
    except Exception as e:
        log_event(plants_logger, 'ERROR', 'API: Emitter compatibility validation failed', error=str(e))
        return jsonify({'error': str(e)}), 500

@plant_bp.route('/api/smart/calculate-emitter', methods=['POST'])
def calculate_emitter_size():
    """
    Dedicated API endpoint for calculating optimal emitter size
    
    Request JSON:
    {
        "plant_id": 1,
        "library_book": "fruitbushes",
        "zone_id": 1,
        "is_new_placement": true
    }
    
    Response JSON:
    {
        "status": "success",
        "data": {
            "emitter_calculation": {
                "success": true,
                "calculated_gph": 0.63,
                "recommended_emitter": 0.5,
                "actual_weekly_water": 1.19,
                "is_within_tolerance": true,
                "health_status": "healthy",
                "tolerance_delta": 0,
                "tolerance_status": "Within tolerance",
                "calculation_details": {...}
            }
        }
    }
    """
    try:
        data = request.json
        if not data:
            return jsonify({"error": "Plant data and zone_id required"}), 400
        
        # Build plant_data from request
        plant_id = data.get('plant_id')
        library_book = data.get('library_book')
        zone_id = data.get('zone_id')
        is_new_placement = data.get('is_new_placement', True)
        
        if plant_id is None or not library_book or zone_id is None:
            return jsonify({"error": "plant_id, library_book, and zone_id required"}), 400
        
        plant_data = {
            'plant_id': plant_id,
            'library_book': library_book
        }
        
        log_event(plants_logger, 'DEBUG', 'API: Emitter calculation requested', 
                 plant_id=plant_id, 
                 library_book=library_book,
                 zone_id=zone_id,
                 is_new_placement=is_new_placement)
        
        # Calculate optimal emitter size
        calculation = plant_manager.calculate_optimal_emitter_size(plant_data, zone_id, is_new_placement)
        
        log_event(plants_logger, 'DEBUG', 'API: Emitter calculation completed', 
                 zone_id=zone_id, 
                 success=calculation.get('success'),
                 recommended_emitter=calculation.get('recommended_emitter'))
        
        return jsonify({
            'status': 'success',
            'data': {
                'emitter_calculation': calculation
            }
        })
        
    except Exception as e:
        log_event(plants_logger, 'ERROR', 'API: Emitter calculation failed', error=str(e))
        return jsonify({'error': str(e)}), 500 