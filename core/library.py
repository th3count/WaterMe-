"""
Library management module for WaterMe!
Handles reading and writing operations for plant library files.

🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
📖 System Overview: ~/rules/system-overview.md
🏗️ Project Structure: ~/rules/project-structure.md  
🌐 API Patterns: ~/rules/api-patterns.md
💻 Coding Standards: ~/rules/coding-standards.md
"""

import os
import json
from typing import Dict, List, Optional, Any
# Simplified logging for now - just use print statements
def log_event(logger, level, message, **kwargs):
    """Simple logging function"""
    if kwargs:
        context = ' '.join([f"{k}={v}" for k, v in kwargs.items()])
        message = f"{message} | {context}"
    print(f"[{level}] {message}")

# Create simple logger objects
class SimpleLogger:
    def info(self, message): print(f"[INFO] {message}")
    def error(self, message): print(f"[ERROR] {message}")
    def warning(self, message): print(f"[WARN] {message}")

user_logger = SimpleLogger()
error_logger = SimpleLogger()

# Paths
LIBRARY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'library')
CUSTOM_LIBRARY_PATH = os.path.join(LIBRARY_DIR, 'custom.json')

def load_json_file(file_path: str, default: Any = None) -> Any:
    """Load a JSON file with error handling"""
    try:
        if os.path.exists(file_path):
            with open(file_path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return default
    except Exception as e:
        print(f"Error loading JSON file {file_path}: {e}")
        return default

def save_json_file(file_path: str, data: Any) -> bool:
    """Save data to a JSON file with error handling"""
    try:
        # Ensure directory exists
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving JSON file {file_path}: {e}")
        return False

def get_next_plant_id(custom_data: Dict[str, Any]) -> int:
    """Find the next available plant_id in the custom library"""
    existing_plant_ids = [plant.get('plant_id', 0) for plant in custom_data.get('plants', [])]
    next_plant_id = 1
    while next_plant_id in existing_plant_ids:
        next_plant_id += 1
    return next_plant_id

def add_plant_to_custom_library(plant_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Add a plant to the custom library with a new plant_id
    
    Args:
        plant_data: Plant data to add (plant_id will be overwritten)
        
    Returns:
        Dict with status, message, and new plant_id
    """
    try:
        # Load existing custom library or create new one
        custom_data = load_json_file(CUSTOM_LIBRARY_PATH, {
            "Book Name": "Custom Plants",
            "plants": []
        })
        
        # Find the next available plant_id
        next_plant_id = get_next_plant_id(custom_data)
        
        # Create a copy of the plant data and set the new plant_id
        new_plant = plant_data.copy()
        new_plant['plant_id'] = next_plant_id
        
        # Add the new plant
        custom_data['plants'].append(new_plant)
        
        # Save the updated custom library
        if save_json_file(CUSTOM_LIBRARY_PATH, custom_data):
            log_event(user_logger, 'INFO', f'Custom plant added', 
                     plant_id=next_plant_id, 
                     common_name=plant_data.get('common_name', ''),
                     latin_name=plant_data.get('latin_name', ''))
            return {
                'status': 'success', 
                'message': 'Plant added to custom library', 
                'plant_id': next_plant_id
            }
        else:
            log_event(error_logger, 'ERROR', f'Custom plant addition failed - save error', 
                     plant_id=next_plant_id, 
                     common_name=plant_data.get('common_name', ''))
            return {'error': 'Failed to save custom library'}
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant addition exception', error=str(e))
        return {'error': str(e)}

def get_custom_library() -> Dict[str, Any]:
    """Get the current custom library data"""
    return load_json_file(CUSTOM_LIBRARY_PATH, {
        "Book Name": "Custom Plants",
        "plants": []
    })

def update_custom_library(custom_data: Dict[str, Any]) -> bool:
    """Update the entire custom library"""
    return save_json_file(CUSTOM_LIBRARY_PATH, custom_data)

def update_plant_in_custom_library(plant_id: int, plant_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update a specific plant in the custom library
    
    Args:
        plant_id: ID of the plant to update
        plant_data: Updated plant data
        
    Returns:
        Dict with status and message
    """
    try:
        custom_data = get_custom_library()
        
        # Find and update the plant
        plant_found = False
        for i, plant in enumerate(custom_data['plants']):
            if plant.get('plant_id') == plant_id:
                # Update the plant data while preserving the plant_id
                plant_data['plant_id'] = plant_id  # Ensure plant_id doesn't change
                custom_data['plants'][i] = plant_data
                plant_found = True
                break
        
        if not plant_found:
            log_event(user_logger, 'WARN', f'Custom plant update failed - plant not found', plant_id=plant_id)
            return {'error': 'Plant not found'}
        
        # Save the updated custom library
        if save_json_file(CUSTOM_LIBRARY_PATH, custom_data):
            log_event(user_logger, 'INFO', f'Custom plant updated', 
                     plant_id=plant_id, 
                     common_name=plant_data.get('common_name', ''))
            return {'status': 'success', 'message': 'Plant updated successfully'}
        else:
            log_event(error_logger, 'ERROR', f'Custom plant update failed - save error', 
                     plant_id=plant_id, 
                     common_name=plant_data.get('common_name', ''))
            return {'error': 'Failed to save custom library'}
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant update exception', plant_id=plant_id, error=str(e))
        return {'error': str(e)}

def delete_plant_from_custom_library(plant_id: int) -> Dict[str, Any]:
    """
    Delete a plant from the custom library
    
    Args:
        plant_id: ID of the plant to delete
        
    Returns:
        Dict with status and message
    """
    try:
        custom_data = get_custom_library()
        
        # Find and remove the plant
        original_count = len(custom_data['plants'])
        custom_data['plants'] = [
            plant for plant in custom_data['plants'] 
            if plant.get('plant_id') != plant_id
        ]
        
        if len(custom_data['plants']) < original_count:
            if save_json_file(CUSTOM_LIBRARY_PATH, custom_data):
                log_event(user_logger, 'INFO', f'Custom plant deleted', plant_id=plant_id)
                return {'status': 'success', 'message': f'Plant {plant_id} deleted'}
            else:
                return {'error': 'Failed to save custom library'}
        else:
            return {'error': 'Plant not found'}
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom plant deletion exception', plant_id=plant_id, error=str(e))
        return {'error': str(e)}

def get_library_files() -> List[Dict[str, Any]]:
    """Get list of all library files with their plant counts"""
    files = []
    
    if not os.path.exists(LIBRARY_DIR):
        return files
    
    for filename in os.listdir(LIBRARY_DIR):
        if filename.endswith('.json') and os.path.isfile(os.path.join(LIBRARY_DIR, filename)):
            try:
                file_path = os.path.join(LIBRARY_DIR, filename)
                file_data = load_json_file(file_path, {})
                files.append({
                    'filename': filename,
                    'plants': file_data.get('plants', [])
                })
            except Exception as e:
                print(f"Error loading library file {filename}: {e}")
                continue
    
    return files

def get_plant_from_library(filename: str, plant_id: int) -> Optional[Dict[str, Any]]:
    """
    Get a specific plant from a library file
    
    Args:
        filename: Name of the library file
        plant_id: ID of the plant to retrieve
        
    Returns:
        Plant data or None if not found
    """
    try:
        file_path = os.path.join(LIBRARY_DIR, filename)
        if not os.path.exists(file_path):
            return None
        
        file_data = load_json_file(file_path, {})
        plants = file_data.get('plants', [])
        
        return next((p for p in plants if p.get('plant_id') == plant_id), None)
        
    except Exception as e:
        print(f"Error getting plant from library: {e}")
        return None

def save_custom_library(library_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Save the entire custom library
    
    Args:
        library_data: Complete library data to save
        
    Returns:
        Dict with status and message
    """
    try:
        # Validate the data structure
        if not isinstance(library_data, dict) or 'plants' not in library_data:
            return {'error': 'Invalid library data format'}
        
        # Save the custom library
        if save_json_file(CUSTOM_LIBRARY_PATH, library_data):
            log_event(user_logger, 'INFO', f'Custom library saved', 
                     plant_count=len(library_data.get('plants', [])))
            return {'status': 'success', 'message': 'Custom library saved'}
        else:
            log_event(error_logger, 'ERROR', f'Custom library save failed')
            return {'error': 'Failed to save custom library'}
            
    except Exception as e:
        log_event(error_logger, 'ERROR', f'Custom library save exception', error=str(e))
        return {'error': str(e)}

def get_library_file_paths() -> Dict[str, str]:
    """
    Get the file paths for all library files
    
    Returns:
        Dict mapping library filenames to their full paths
    """
    library_paths = {}
    
    if not os.path.exists(LIBRARY_DIR):
        return library_paths
    
    for filename in os.listdir(LIBRARY_DIR):
        if filename.endswith('.json') and os.path.isfile(os.path.join(LIBRARY_DIR, filename)):
            library_paths[filename] = os.path.join(LIBRARY_DIR, filename)
    
    return library_paths

def validate_library_data(library_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate library data structure
    
    Args:
        library_data: Library data to validate
        
    Returns:
        Dict with validation result
    """
    try:
        if not isinstance(library_data, dict):
            return {'valid': False, 'error': 'Library data must be a dictionary'}
        
        if 'plants' not in library_data:
            return {'valid': False, 'error': 'Library data must contain "plants" array'}
        
        if not isinstance(library_data['plants'], list):
            return {'valid': False, 'error': 'Plants must be an array'}
        
        # Validate each plant
        for i, plant in enumerate(library_data['plants']):
            if not isinstance(plant, dict):
                return {'valid': False, 'error': f'Plant at index {i} must be a dictionary'}
            
            required_fields = ['plant_id', 'common_name', 'latin_name']
            for field in required_fields:
                if field not in plant:
                    return {'valid': False, 'error': f'Plant at index {i} missing required field: {field}'}
        
        return {'valid': True}
        
    except Exception as e:
        return {'valid': False, 'error': f'Validation error: {str(e)}'} 