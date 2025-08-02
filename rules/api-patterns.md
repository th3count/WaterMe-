# API Patterns Documentation

## 🌐 Complete Backend API Architecture

The WaterMe! system uses a **Flask-based REST API** with 80+ endpoints, integrated with a real-time irrigation scheduler and smart plant management engine.

## 📡 API Server Structure

### Main Components
- **`api.py`** - Flask application with 80+ REST endpoints
- **`core/scheduler.py`** - Primary GPIO controller and irrigation scheduler
- **`core/plant_manager.py`** - Smart placement and zone optimization engine
- **`core/gpio.py`** - Hardware GPIO abstraction (simulator/real hardware)
- **`core/library.py`** - Plant library CRUD operations
- **`core/logging.py`** - Unified structured logging system
- **`/data/*.json`** - JSON data persistence with atomic operations
- **`/config/*.cfg`** - INI-based system configuration

## 🔗 Complete API Endpoint Reference

### 🏠 Garden & System Configuration
```
POST /api/garden                    # Save garden settings (name, location, timezone)
GET  /api/gpio                      # Get GPIO configuration
POST /api/gpio                      # Save GPIO configuration
GET  /config/gpio.cfg               # Get raw GPIO config file
GET  /config/settings.cfg           # Get raw settings config file
GET  /api/system/time               # Get system time with timezone
```

### 📍 Location Management
```
GET  /api/locations                 # Get all locations with zone assignments
POST /api/locations                 # Create new location
POST /api/locations/add             # Alternative location creation
PUT  /api/locations/{id}            # Update existing location
DELETE /api/locations/{id}          # Delete location (with plant reassignment)
```

### 🌱 Plant Library System
```
GET  /api/library-files             # List all plant library files
GET  /library/{filename}            # Get specific library file (vegetables.json, etc.)
GET  /api/library/{filename}/{id}   # Get specific plant from library
POST /api/library/custom/add        # Add plant to custom library
PUT  /api/library/custom/update/{id}  # Update custom plant
DELETE /api/library/custom/delete/{id}  # Delete custom plant
POST /library/custom.json           # Save entire custom library
```

### 🗺️ Plant Instance Management (Map)
```
GET  /api/map                       # Get all plant instances (UUID mapping)
POST /api/map/save                  # Create new plant instance
POST /api/map/{id}/reassign         # Reassign plant to different location/zone
DELETE /api/map/{id}                # Delete plant instance
```

### 🧠 Smart Placement System
```
POST /api/smart/analyze-placement   # Analyze plant placement compatibility
POST /api/smart/zone-recommendations  # Get zone recommendations with scores
POST /api/smart/validate-compatibility  # Validate plant-zone compatibility
POST /api/smart/no-compatible-zone  # Handle no compatible zone scenarios
```

### ⏰ Zone Scheduling & Control
```
GET  /api/schedule                  # Get all zone schedules
POST /api/schedule                  # Update zone schedules
POST /api/schedule/add              # Add new zone to schedule
PUT  /api/schedule/{zone_id}        # Update specific zone schedule
DELETE /api/schedule/{zone_id}      # Delete zone from schedule
POST /api/resolve_times             # Resolve solar time codes (SUNRISE+30, etc.)
```

### 🎯 Irrigation Control (Primary System)
```
POST /api/manual-timer/{zone_id}    # Start manual irrigation timer
DELETE /api/manual-timer/{zone_id}  # Stop manual irrigation timer
GET  /api/zones/status              # Get all zone hardware states
GET  /api/zones/{zone_id}/status    # Get specific zone status
POST /api/emergency-stop            # Emergency stop all zones
GET  /api/scheduler/timers          # Get active timer information
```

### 🔧 GPIO Hardware Control
```
POST /api/gpio/activate/{channel}   # Activate GPIO channel directly
POST /api/gpio/deactivate/{channel} # Deactivate GPIO channel directly
GET  /api/gpio/status/{channel}     # Get GPIO channel status
GET  /api/gpio/status               # Get all GPIO channel states
GET  /api/gpio/status/detailed      # Get detailed GPIO status with pin mapping
POST /api/gpio/test/{zone_id}       # Test GPIO zone directly (2-second test)
```

### 📊 Scheduler Management
```
GET  /api/scheduler/status          # Get scheduler status and statistics
POST /api/scheduler/start           # Start the irrigation scheduler
POST /api/scheduler/stop            # Stop the irrigation scheduler
POST /api/scheduler/calculate-duration/{zone_id}  # Calculate optimal zone duration
POST /api/scheduler/refresh-smart-durations  # Refresh all smart zone durations
POST /api/scheduler/refresh-zone-duration/{zone_id}  # Refresh specific zone
POST /api/scheduler/cleanup-schedule  # Clean up schedule file
POST /api/scheduler/trigger-initial-refresh  # Trigger initial smart refresh
POST /api/scheduler/update-zone-mode  # Update zone mode (manual/smart/disabled)
```

### 🏥 Health Monitoring
```
GET  /api/health/alerts             # Get health alerts (orphaned plants, etc.)
POST /api/health/alerts/ignore      # Ignore specific health alert
POST /api/health/alerts/unignore    # Un-ignore specific health alert
```

### 📝 Comprehensive Logging System
```
GET  /api/logs                      # Get filtered log entries (level, category, search)
GET  /api/logs/files                # List all log files with sizes
GET  /api/logs/download/{filename}  # Download specific log file
POST /api/logs/clear                # Clear old logs (30+ days)
POST /api/logs/clear-all            # Clear all logs
POST /api/logs/event                # Log event from frontend
```

### 💾 Backup & Restore
```
POST /api/backup/create             # Create complete system backup
POST /api/backup/restore            # Restore from backup file
GET  /api/backup/info               # Get backup information
```

### 🐛 Debug & Development
```
GET  /api/debug/plant-map           # Debug plant mapping data
GET  /api/debug/zone-plants/{zone_id}  # Debug plants in specific zone
GET  /api/debug/test-plant-manager  # Test PlantManager functionality
GET  /api/debug/test-scheduler      # Debug scheduler state
GET  /api/scheduler/test            # Test scheduler functionality
```

## 🔄 Request/Response Patterns

### Standard Success Response
```json
{
  "status": "success",
  "message": "Operation completed",
  "data": { /* response data */ }
}
```

### Standard Error Response
```json
{
  "status": "error", 
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

### Data Creation Pattern
```json
// POST Request Body
{
  "name": "Location Name",
  "description": "Description",
  "zones": [1, 2, 3]
}

// Response
{
  "status": "success",
  "data": {
    "location_id": 123,
    "name": "Location Name",
    "description": "Description", 
    "zones": [1, 2, 3],
    "created_at": "2024-01-01T12:00:00Z"
  }
}
```

## 🏗️ Core Module Patterns

### Data Access Pattern
```python
# /core/locations.py
def get_locations():
    """Load locations from data/locations.json"""
    try:
        with open('data/locations.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_location(location_data):
    """Save location to data/locations.json"""
    locations = get_locations()
    locations.append(location_data)
    with open('data/locations.json', 'w') as f:
        json.dump(locations, f, indent=2)
```

### API Route Pattern
```python
# api.py
@app.route('/api/locations', methods=['GET'])
def get_locations():
    try:
        locations = locations_module.get_locations()
        return jsonify({
            'status': 'success',
            'data': locations
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500
```

## 🎯 Frontend Integration Patterns

### API Base URL
```typescript
// utils.ts
export const getApiBaseUrl = () => {
  return process.env.NODE_ENV === 'development' 
    ? 'http://localhost:5000'
    : '';
};
```

### Standard Fetch Pattern
```typescript
// UI Components
const response = await fetch(`${getApiBaseUrl()}/api/endpoint`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});

if (!response.ok) {
  throw new Error(`HTTP error! status: ${response.status}`);
}

const result = await response.json();
if (result.status !== 'success') {
  throw new Error(result.message);
}
```

### Error Handling Pattern
```typescript
try {
  const result = await apiCall();
  setSuccess('Operation completed successfully!');
  // Update UI state
} catch (error) {
  console.error('API Error:', error);
  setError(error.message || 'Operation failed');
} finally {
  setLoading(false);
}
```

## 📊 Complete Data Models

### 📍 Location Model (`/data/locations.json`)
```json
{
  "location_id": 1,
  "name": "Vegetable Garden",
  "description": "Main growing area for seasonal vegetables",
  "zones": [1, 2, 3, 4]
}
```

### 🗺️ Plant Instance Model (`/data/map.json`)
```json
{
  "uuid-instance-id": {
    "plant_id": 1,
    "library_book": "vegetables",
    "common_name": "Tomato",
    "zone_id": 2,
    "location_id": 1,
    "quantity": 3,
    "emitter_size": 4,
    "comments": "Cherry tomatoes near fence",
    "planted_date": "2024-05-15",
    "smart_overrides": {
      "zone_selection": "smart",    // "smart" or "manual"
      "emitter_sizing": "smart"     // "smart" or "manual"
    }
  }
}
```

### ⏰ Zone Schedule Model (`/data/schedule.json`)
```json
{
  "1": {
    "mode": "smart",              // "smart", "manual", "disabled"
    "comment": "Tomato zone",
    "period": "W",                // "D" (daily), "W" (weekly)
    "cycles": 2,                  // Number of watering cycles per period
    "startDay": "2024-05-20",     // Start date for weekly schedules
    "times": [
      {
        "start_time": "SUNRISE+30",  // Solar time or HH:mm format
        "duration": "00:23:45",      // HH:mm:ss format
        "value": "SUNRISE+30"        // Original time code for resolution
      },
      {
        "start_time": "18:00",
        "duration": "00:15:00"
      }
    ]
  }
}
```

### 🌱 Plant Library Model (`/library/*.json`)
```json
{
  "Book Name": "Vegetables",
  "plants": [
    {
      "plant_id": 1,
      "common_name": "Tomato",
      "alternative_name": "",
      "latin_name": "Solanum lycopersicum",
      "watering_frequency": ["W1"],          // Primary frequency codes
      "compatible_watering_frequencies": ["W2"], // Compatible frequencies
      "preferred_time": ["SUNRISE+30"],      // Preferred watering times
      "compatible_watering_times": ["SUNRISE", "SUNSET-60"],
      "root_area_sqft": 4,                   // Root area in square feet
      "water_optimal_in_week": 1.75,        // Optimal inches per week
      "tolerance_min_in_week": 1.2,         // Minimum tolerance
      "tolerance_max_in_week": 2.5,         // Maximum tolerance
      "usda_zones": "3-11",                  // USDA hardiness zones
      "soil_preference": "Well-drained, fertile, pH 6.0-6.8",
      "sun_exposure": "Full Sun",
      "fruiting_period": "70-85 days from transplant",
      "planting_time": "After last frost",
      "spacing_inches": 24,
      "growth_type": "Annual"
    }
  ]
}
```

### 🎯 Active Zones Model (`/data/active_zones.json`)
```json
{
  "1": {
    "end_time": "2024-05-20T06:23:45-06:00",  // ISO datetime with timezone
    "type": "manual"                           // "manual" or "scheduled"
  },
  "3": {
    "end_time": "2024-05-20T18:15:00-06:00",
    "type": "scheduled"
  }
}
```

### 🏥 Health Alerts Model (`/data/health_alerts.json`)
```json
{
  "ignored_alerts": [
    {
      "alert_type": "orphaned_plant",
      "alert_id": "uuid-instance-id",
      "ignored_at": "2024-05-20T10:30:00Z",
      "reason": "Temporary reassignment pending"
    }
  ]
}
```

### ⚙️ GPIO Configuration Model (`/config/gpio.cfg`)
```ini
[GPIO]
# Number of watering zones (1-8 supported)
zoneCount = 8

# GPIO pin assignments for each zone (BCM numbering)
pins = 5, 6, 13, 16, 19, 20, 21, 26

# Pump zone index (1-based, 0 = no pump zone)
pumpIndex = 8

# GPIO signal polarity (true = active low for relay modules)
activeLow = True

# GPIO mode: BCM (GPIO numbering) or BOARD (physical pin numbering)
mode = BCM
```

### 🏠 Garden Settings Model (`/config/settings.cfg`)
```ini
[Garden]
# Garden identification
name = My Smart Garden
city = Regina, SK

# GPS coordinates for solar calculations
gps_lat = 50.4452
gps_lon = -104.6189

# Operating mode: "manual" or "smart"
mode = smart

# Timezone for scheduling
timezone = America/Regina

# Global watering multiplier (1.0 = normal, 2.0 = double, 0.5 = half)
timer_multiplier = 1.0

# Simulation mode for development (True/False)
simulate = True

[Well_Water]
# Future feature - well water management
max_flow_rate_gph = 0
reservoir_size_gallons = 0
recharge_time_minutes = 0
```

### 📊 Zone Status Response Model
```json
{
  "1": {
    "active": true,
    "remaining_seconds": 1425,
    "end_time": "2024-05-20T06:23:45-06:00",
    "type": "manual",
    "hardware_state": true,
    "pin": 5
  },
  "2": {
    "active": false,
    "remaining_seconds": 0,
    "end_time": null,
    "type": null,
    "hardware_state": false,
    "pin": 6
  }
}
```

## ⚙️ System Integration

### GPIO Control Flow
```
Frontend Request
    ↓
Flask API Route
    ↓
/core/scheduler.py
    ↓
/core/gpio.py
    ↓
Hardware GPIO Pins
```

### Configuration Management
```
Frontend Settings
    ↓
POST /config/settings.cfg
    ↓
/core/config.py
    ↓
config/settings.cfg file
```

## 🔒 Security Considerations

### Input Validation
- Validate all user inputs in core modules
- Sanitize file paths and names
- Check data types and ranges

### Error Handling
- Don't expose internal paths in error messages
- Log errors server-side for debugging
- Return user-friendly error messages

### File Access
- Restrict file operations to designated directories
- Validate file extensions and content
- Use atomic file operations where possible

## 🧪 Testing API Endpoints

### Manual Testing
```bash
# Test GET endpoint
curl -X GET http://localhost:5000/api/locations

# Test POST endpoint  
curl -X POST http://localhost:5000/api/locations \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Location","zones":[1,2]}'
```

### Frontend Testing
- Use browser DevTools Network tab
- Check request/response format
- Verify error handling paths