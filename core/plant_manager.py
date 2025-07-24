# plant_manager.py
# Plant management and smart placement logic
import os
import json
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime

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
                
                # Convert the schedule data structure to match what the plant manager expects
                # The schedule.json has zone IDs as keys, but we need a zones array
                zones_array = []
                for zone_id_str, zone_data in raw_schedule_data.items():
                    zone_data['zone_id'] = int(zone_id_str)
                    zones_array.append(zone_data)
                
                self.schedule_data = {'zones': zones_array}
                
                log_event(plants_logger, 'INFO', 'Schedule data loaded', 
                         zone_count=len(zones_array))
            else:
                self.schedule_data = {'zones': []}
                log_event(plants_logger, 'INFO', 'Schedule file not found, using empty schedule')
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to load schedule data', error=str(e))
            self.schedule_data = {'zones': []}
    
    def reload_data(self):
        """Reload all data files"""
        self._load_data()
    
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
        
        # Add smart_overrides if not present
        if 'smart_overrides' not in plant_data:
            plant_data['smart_overrides'] = {
                'zone_selection': 'manual',
                'emitter_sizing': 'manual',
                'duration': 'manual'
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
            
            return True, "Plant instance added successfully", instance_id
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to add plant instance', 
                     instance_id=instance_id, error=str(e))
            return False, f"Failed to save plant instance: {str(e)}", None
    
    def get_plant_instances(self) -> Dict[str, Any]:
        """Get all plant instances"""
        return self.plant_map
    
    def reassign_plant(self, instance_id: str, new_location_id: int) -> Tuple[bool, str]:
        """
        Reassign a plant instance to a new location
        
        Returns:
            Tuple[bool, str]: (success, message)
        """
        if instance_id not in self.plant_map:
            return False, "Plant instance not found"
        
        old_location_id = self.plant_map[instance_id].get('location_id')
        self.plant_map[instance_id]['location_id'] = new_location_id
        
        try:
            # Save to file
            with open(MAP_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(self.plant_map, f, indent=2)
            
            log_event(plants_logger, 'INFO', 'Plant instance reassigned', 
                     instance_id=instance_id,
                     old_location=old_location_id,
                     new_location=new_location_id)
            
            return True, f"Plant instance {instance_id} reassigned to location {new_location_id}"
            
        except Exception as e:
            log_event(plants_logger, 'ERROR', 'Failed to reassign plant instance', 
                     instance_id=instance_id, error=str(e))
            return False, f"Failed to reassign plant: {str(e)}"
    
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
            unique_plant_id = f"{library_book}_{plant_id}"
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
    
    def get_zone_frequency(self, zone_id: int) -> Optional[str]:
        """Get the frequency setting for a zone"""
        for zone in self.schedule_data.get('zones', []):
            if zone.get('zone_id') == zone_id:
                period = zone.get('period')
                cycles = zone.get('cycles', 1)
                if period:
                    # Combine period and cycles to create frequency code (e.g., 'D1', 'W2', 'M3')
                    return f"{period}{cycles}"
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
        
        best_score = 0.0
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
                best_score = max(best_score, score)
        
        return best_score
    
    def find_optimal_zone_for_plant(self, plant_data: Dict[str, Any]) -> Tuple[Optional[int], float, str]:
        """
        Find the optimal zone for a plant
        
        Returns:
            Tuple[Optional[int], float, str]: (zone_id, score, reason)
        """
        best_zone = None
        best_score = 0.0
        best_reason = "No compatible zones found"
        
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
        
        return {
            'success': True,
            'plant_data': plant_library_data,
            'has_compatible_zones': has_compatible_zones,
            'optimal_zone': optimal_zone,
            'optimal_score': optimal_score,
            'optimal_reason': optimal_reason,
            'recommendations': recommendations,
            'total_zones_checked': len(self.schedule_data.get('zones', [])),
            'compatible_zones_count': len(recommendations)
        }
    
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
        
        return {
            'valid': overall_compatible,
            'zone_id': zone_id,
            'zone_frequency': zone_frequency,
            'plant_frequencies': plant_frequencies,
            'compatibility_results': compatibility_results,
            'best_compatibility_level': best_level,
            'score': self.calculate_zone_compatibility_score(plant_data, zone_id)
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
        for zone in self.schedule_data.get('zones', []):
            zone_id = zone.get('zone_id')
            if zone_id and zone.get('mode') != 'disabled':
                available_zones.append({
                    'zone_id': zone_id,
                    'period': zone.get('period'),
                    'comment': zone.get('comment', ''),
                    'mode': zone.get('mode', 'manual')
                })
        
        return {
            'success': True,
            'message': 'No compatible zones found for this plant',
            'plant_data': plant_library_data,
            'available_zones': available_zones,
            'suggestions': [
                'Create a new zone with compatible frequency',
                'Force assign to an existing zone (manual override)',
                'Modify plant watering requirements',
                'Adjust zone frequency settings'
            ]
        }

# Create global instance
plant_manager = PlantManager() 