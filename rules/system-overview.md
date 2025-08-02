# WaterMe! System Overview

## 🎯 Project Mission

**WaterMe!** is a comprehensive smart garden irrigation system designed for Raspberry Pi. It combines intelligent plant placement, automated scheduling, and precise hardware control to optimize garden watering with minimal user intervention.

## 🏗️ System Architecture

### Core Philosophy
- **Single Garden Focus**: Designed for one garden setup - no multi-garden complexity
- **No Authentication**: Local system for personal use - simplified security model
- **Smart by Default**: Intelligent plant placement and zone optimization
- **Hardware Integration**: Direct GPIO control with relay modules
- **Incremental Development**: Stable foundation with progressive feature enhancement

### Version Evolution
- **Version 1.x.x**: ✅ **COMPLETED** - UI and Backend Foundation
- **Version 2.x.x**: 🚀 **IN PROGRESS** - Hardware GPIO Integration  
- **Version 3.x.x**: 🚀 **IN PROGRESS** - Smart Features & Plant Intelligence
- **Version 4.x.x**: 📋 **PLANNED** - RPi Integration & Service Setup

## 🧠 Intelligent Plant Management

### Smart Placement Engine
The **PlantManager** (`core/plant_manager.py`) provides sophisticated plant-to-zone matching:

#### **Frequency Compatibility System**
- **Primary Match**: Exact watering frequency alignment (W1 ↔ W1)
- **Secondary Match**: Compatible frequencies with tolerance ranges (W1 ↔ W2 if within tolerance)
- **Tertiary Match**: Fallback compatibility for edge cases

#### **Zone Recommendation Scoring**
```
Compatibility Score = Frequency Match + Emitter Sizing + Plant Density
- Perfect Match: 100% compatibility
- Good Match: 75-99% compatibility  
- Acceptable Match: 50-74% compatibility
- Poor Match: <50% compatibility (warnings shown)
```

#### **Smart Zone Optimization**
- **Dynamic Duration Calculation**: Based on plant water needs, emitter sizes, and soil conditions
- **Optimal Start Time Calculation**: Solar-aware timing based on plant preferences
- **Emitter Size Recommendations**: Automatic sizing based on plant root area and water requirements

### Plant Library System
**Comprehensive Plant Database** (`/library/*.json`):
- **1400+ Vegetables** with detailed watering requirements
- **Fruit Trees & Bushes** with seasonal considerations
- **Custom Plants** for user-specific varieties
- **Rich Metadata**: USDA zones, soil preferences, growth patterns, spacing requirements

## ⚙️ Advanced Scheduling System

### WateringScheduler (`core/scheduler.py`)
**Primary GPIO Controller** - The heart of the irrigation system:

#### **Real-Time Zone Management**
- **Hardware State Monitoring**: Continuous GPIO pin status validation
- **Timer Management**: Precise duration control with timezone awareness
- **Conflict Prevention**: Automatic scheduling conflict resolution
- **Emergency Controls**: Instant stop capabilities for all zones

#### **Solar Time Integration**
```
Supported Time Codes:
- SUNRISE, SUNSET, ZENITH (solar noon)
- Offset Support: SUNRISE+30, SUNSET-60 (±minutes)
- Fixed Times: 06:00, 18:30 (HH:mm format)
- Dynamic Resolution: Daily recalculation based on GPS coordinates
```

#### **Smart vs Manual Modes**
- **Smart Mode**: AI-driven duration and timing optimization
- **Manual Mode**: User-defined schedules with full control
- **Disabled Mode**: Zone temporarily deactivated
- **Hybrid Support**: Per-zone mode selection

## 🔧 Hardware Integration

### GPIO Control System (`core/gpio.py`)
**Flexible Hardware Abstraction**:
- **Simulation Mode**: Development without hardware (MockGPIO)
- **Real Hardware**: Direct Raspberry Pi GPIO control
- **Relay Support**: Active-low/high relay module compatibility
- **Pin Mapping**: Configurable BCM/BOARD pin numbering
- **Pump Control**: Dedicated pump zone with automatic activation

### Configuration Management
**Dual Configuration System**:
- **JSON Runtime Config** (`/config/waterme.json`): System runtime parameters
- **INI Persistent Config** (`/config/*.cfg`): Hardware and garden settings
- **Hot Reloading**: Live configuration updates without restart

## 🌐 Comprehensive API System

### 80+ REST Endpoints
**Complete System Control** (`api.py`):
- **Plant Management**: Library, instances, smart placement
- **Zone Control**: Scheduling, manual timers, hardware status
- **System Management**: Configuration, logging, backup/restore
- **Health Monitoring**: Orphaned plant detection, system alerts
- **Debug Tools**: Comprehensive system introspection

### Real-Time Data Synchronization
- **JSON Data Persistence**: Atomic file operations for data integrity
- **Live Status Updates**: Real-time hardware state monitoring
- **Event Logging**: Comprehensive structured logging system
- **Health Monitoring**: Continuous system health validation

## 🎨 Modern React UI

### Universal Layer System
**Portal-Based Modal Management** (`core/FormLayerManager.tsx`):
- **Layer 0**: Base UI pages (`.ui.tsx` files)
- **Layer 1+**: Forms and pickers (`.form.tsx`, `.item.tsx` files)
- **React Portals**: Clean DOM isolation for modals
- **Automatic Management**: Click-outside-to-close, z-index handling

### Component Architecture
- **Page Components**: Main application interfaces
- **Form Components**: Self-contained, reusable forms
- **Picker Components**: Specialized selectors (time, duration)
- **Unified Styling**: Consistent CSS naming conventions

### Key User Interfaces
- **Garden Overview**: Central plant and zone management
- **Smart Placement**: Intelligent plant-to-zone recommendations
- **Zone Configuration**: Schedule and timing management
- **Health Dashboard**: System status and orphaned plant detection
- **Real-Time Logs**: Live system event monitoring

## 📊 Data Management

### JSON-Based Persistence
**Structured Data Storage**:
- **Plant Instances** (`map.json`): UUID-based plant tracking
- **Zone Schedules** (`schedule.json`): Irrigation timing and duration
- **Location Management** (`locations.json`): Garden area organization
- **Active Timers** (`active_zones.json`): Real-time irrigation status

### Structured Logging System
**Comprehensive Event Tracking** (`core/logging.py`):
- **Categorized Logs**: System, watering, GPIO, plants, user, error
- **Structured Format**: JSON-based log entries with metadata
- **Real-Time Viewing**: Live log streaming in UI
- **Log Management**: Automatic cleanup and file rotation

## 🔄 System Lifecycle

### Startup Process
```
1. waterme.py (System Entry Point)
   ↓ configuration loading
2. Flask API Server Launch (api.py)
   ↓ scheduler initialization  
3. WateringScheduler Start (scheduler.py)
   ↓ GPIO setup
4. Hardware Initialization (gpio.py)
   ↓ UI serving
5. React UI Available (ui/src/App.tsx)
```

### Operation Flow
```
User Interaction (UI) → API Request → Core Logic → Data Persistence → Hardware Control
```

### Shutdown Process
- **Graceful Zone Shutdown**: All active irrigation stopped
- **GPIO Cleanup**: Hardware pins reset to safe state
- **Data Persistence**: Final state saved to files
- **Process Termination**: Clean system shutdown

## 🚀 Getting Started

### Installation
1. **System Setup**: Run `install_waterme.py` on Raspberry Pi
2. **Configuration**: Set garden location, timezone, GPIO pins
3. **Plant Library**: Load or customize plant databases
4. **Zone Setup**: Configure irrigation zones and hardware
5. **Smart Mode**: Enable intelligent plant placement

### Basic Operation
1. **Create Locations**: Define garden areas
2. **Add Plants**: Use smart placement recommendations
3. **Configure Zones**: Set schedules or use smart mode
4. **Monitor System**: Watch real-time status and logs
5. **Maintain Garden**: Adjust based on plant growth and seasons

## 🎯 Key Benefits

### For Users
- **Intelligent Automation**: Minimal manual intervention required
- **Water Efficiency**: Precise timing and duration optimization
- **Plant Health**: Science-based watering recommendations
- **System Reliability**: Robust hardware control and monitoring
- **Ease of Use**: Intuitive UI with smart defaults

### For Developers
- **Modular Architecture**: Clean separation of concerns
- **Comprehensive API**: Full system control and monitoring
- **Extensive Documentation**: Complete system understanding
- **Flexible Configuration**: Adaptable to different setups
- **Debug Tools**: Rich introspection and troubleshooting capabilities

---

**WaterMe!** represents a complete, intelligent irrigation solution that combines modern software engineering with practical gardening needs, delivering both powerful automation and precise manual control in a single, cohesive system.