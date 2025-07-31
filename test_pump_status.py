#!/usr/bin/env python3
import urllib.request
import json

def test_pump_status():
    try:
        # Test pump status (channel 8)
        url = "http://localhost:5000/api/gpio/status/8"
        req = urllib.request.Request(url)
        req.add_header('Content-Type', 'application/json')
        
        with urllib.request.urlopen(req) as response:
            data = response.read()
            result = json.loads(data.decode('utf-8'))
            print("Pump Status Response:")
            print(json.dumps(result, indent=2))
            
            # Check if 'active' field is present
            if 'active' in result:
                print(f"\nPump active: {result['active']}")
            else:
                print("\nERROR: 'active' field missing from response")
                
    except Exception as e:
        print(f"Error testing pump status: {e}")

if __name__ == "__main__":
    test_pump_status() 