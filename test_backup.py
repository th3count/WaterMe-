#!/usr/bin/env python3
"""
Test script for WaterMe! backup/restore functionality
"""

import requests
import json
import os
import tempfile
import zipfile
from datetime import datetime

def test_backup_info():
    """Test the backup info endpoint"""
    print("Testing backup info endpoint...")
    try:
        response = requests.get('http://127.0.0.1:5000/api/backup/info')
        if response.status_code == 200:
            data = response.json()
            print("✅ Backup info endpoint working")
            print(f"   Total size: {data['total_size_mb']} MB")
            print(f"   Files: {len([f for f in data['files'].values() if f.get('exists')])} files exist")
            return True
        else:
            print(f"❌ Backup info failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Backup info error: {e}")
        return False

def test_backup_create():
    """Test the backup creation endpoint"""
    print("\nTesting backup creation...")
    try:
        response = requests.post('http://127.0.0.1:5000/api/backup/create')
        if response.status_code == 200:
            # Save the backup file
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = f'test_backup_{timestamp}.zip'
            with open(filename, 'wb') as f:
                f.write(response.content)
            print(f"✅ Backup created successfully: {filename}")
            print(f"   Size: {len(response.content)} bytes")
            return filename
        else:
            print(f"❌ Backup creation failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ Backup creation error: {e}")
        return None

def test_backup_validation(backup_file):
    """Validate the backup file structure"""
    print(f"\nValidating backup file: {backup_file}")
    try:
        with zipfile.ZipFile(backup_file, 'r') as zipf:
            files = zipf.namelist()
            print(f"   Files in backup: {len(files)}")
            
            # Check for required files
            required_files = [
                'backup_metadata.json',
                'config/settings.cfg',
                'config/gpio.cfg',
                'data/schedule.json',
                'data/locations.json',
                'data/map.json',
                'data/health_alerts.json',
                'data/logs.json'
            ]
            
            missing_files = []
            for required in required_files:
                if required not in files:
                    missing_files.append(required)
            
            if missing_files:
                print(f"   ❌ Missing files: {missing_files}")
                return False
            else:
                print("   ✅ All required files present")
            
            # Check metadata
            if 'backup_metadata.json' in files:
                metadata_content = zipf.read('backup_metadata.json')
                metadata = json.loads(metadata_content)
                print(f"   ✅ Metadata valid - Backup date: {metadata.get('backup_date')}")
                print(f"   ✅ Version: {metadata.get('version')}")
            
            return True
    except Exception as e:
        print(f"   ❌ Backup validation error: {e}")
        return False

def main():
    """Run all backup tests"""
    print("🧪 WaterMe! Backup/Restore Test Suite")
    print("=" * 50)
    
    # Test backup info
    if not test_backup_info():
        print("\n❌ Backup info test failed. Make sure the API server is running.")
        return
    
    # Test backup creation
    backup_file = test_backup_create()
    if not backup_file:
        print("\n❌ Backup creation test failed.")
        return
    
    # Test backup validation
    if test_backup_validation(backup_file):
        print("\n✅ All backup tests passed!")
        print(f"   Backup file: {backup_file}")
        print("   You can now test the restore functionality in the UI.")
    else:
        print("\n❌ Backup validation failed.")
    
    # Clean up test file
    try:
        os.remove(backup_file)
        print(f"   Cleaned up test file: {backup_file}")
    except:
        pass

if __name__ == '__main__':
    main() 