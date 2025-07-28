#!/usr/bin/env python3

import sys
import os

# Add the current directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from core.library import get_library_files
    print("✅ Library module imported successfully")
    
    files = get_library_files()
    print(f"✅ Found {len(files)} library files:")
    for file_info in files:
        print(f"  - {file_info['filename']}: {file_info['plant_count']} plants")
        
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc() 