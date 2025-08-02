# Project Structure Documentation

## 🏗️ Complete Directory Layout

```
WaterMe!/backend/
├── /core/                    # 🧠 Core system components
│   ├── FormLayerManager.tsx  # Universal UI layer system (React Portal-based)
│   ├── useFormLayer.tsx      # Layer management hook
│   ├── scheduler.py         # 🎯 PRIMARY GPIO CONTROLLER - Irrigation scheduling engine
│   ├── gpio.py              # Hardware GPIO abstraction (simulator/real hardware)
│   ├── plant_manager.py     # 🌱 Smart placement & zone optimization engine
│   ├── library.py           # Plant library CRUD operations
│   ├── logging.py           # Unified structured logging system
│   ├── config.py            # Configuration file parsers
│   ├── locations.py         # Location data handlers (stub)
│   ├── plants.py            # Plant data models (stub)
│   └── zones.py             # Zone data handlers (stub)
│
├── /ui/src/                 # 🎨 Frontend React application
│   ├── /forms/              # Form components (.form.tsx, .item.tsx)
│   │   ├── detailedplant.form.tsx    # Plant instance details editor
│   │   ├── durationpicker.item.tsx   # Time duration selector for irrigation
│   │   ├── garden.form.tsx           # Smart plant placement wizard
│   │   ├── library.form.tsx          # Plant library editor
│   │   ├── locations.addlocation.tsx # Location creation form
│   │   ├── zones.form.tsx            # Zone configuration editor
│   │   ├── timepicker.item.tsx       # Time selection component
│   │   ├── forms.css                 # Form-specific styles with unified naming
│   │   ├── unified.forms.css         # Unified form system styles
│   │   ├── types.ts                  # TypeScript interfaces
│   │   └── utils.ts                  # Form utilities & validation
│   │
│   ├── App.tsx              # Main application router & garden creation
│   ├── Sidebar.tsx          # Navigation with health status & system time
│   ├── *.ui.tsx             # 📱 Page components (Layer 0 of UI system)
│   │   ├── garden.ui.tsx    # Main plant management interface
│   │   ├── library.ui.tsx   # Plant library browser
│   │   ├── zones.ui.tsx     # Zone schedule configuration
│   │   ├── locations.ui.tsx # Location management
│   │   ├── health.ui.tsx    # System health monitoring & orphaned plants
│   │   ├── logs.ui.tsx      # Real-time log viewer with filtering
│   │   ├── settings.ui.tsx  # System settings & GPIO configuration
│   │   └── forms.ui.tsx     # Form component previewer
│   │
│   ├── index.css            # Global CSS variables & styling
│   ├── utils.ts             # API base URL utility
│   └── main.tsx             # React application entry point
│
├── /data/                   # 📊 JSON data persistence
│   ├── locations.json       # Location definitions with zone assignments
│   ├── map.json            # Plant instance mapping (UUID -> plant data)
│   ├── schedule.json       # Zone irrigation schedules (manual/smart modes)
│   ├── active_zones.json   # Currently running zone timers
│   ├── health_alerts.json  # Health monitoring alerts & ignored status
│   └── logs.json           # Application event logs
│
├── /library/                # 🌿 Plant knowledge database
│   ├── custom.json         # User-defined custom plants
│   ├── vegetables.json     # Vegetable plant library (1400+ plants)
│   ├── fruittrees.json     # Fruit tree library
│   └── fruitbushes.json    # Berry/bush plant library
│
├── /config/                 # ⚙️ System configuration
│   ├── gpio.cfg            # GPIO pin assignments & hardware settings
│   ├── settings.cfg        # Garden settings (location, timezone, mode)
│   └── waterme.json        # System runtime configuration
│
├── /logs/                   # 📝 Structured logging output
│   ├── system.log          # System events & status
│   ├── watering.log        # Irrigation events
│   ├── gpio.log            # Hardware GPIO operations
│   ├── plants.log          # Plant management operations
│   ├── user.log            # User interactions
│   ├── error.log           # Error events
│   ├── health.log          # Health monitoring
│   └── locations.log       # Location operations
│
├── /rules/                  # 📚 COMPREHENSIVE SYSTEM DOCUMENTATION
│   ├── README.md           # Documentation index & AI assistant guide
│   ├── layer-system.md     # Universal UI layer management
│   ├── project-structure.md # Complete project architecture (this file)
│   ├── api-patterns.md     # Backend API endpoints & data flow
│   ├── css-conventions.md  # Styling system & naming conventions
│   ├── form-system.md      # Form component patterns
│   └── coding-standards.md # Code style & best practices
│
├── /tools/                  # 🔧 Development utilities
│   ├── zone_test.py        # GPIO zone testing utility
│   └── json_to_sql.py      # Data migration utility
│
├── api.py                   # 🌐 Flask REST API server (80+ endpoints)
├── waterme.py              # 🚀 Main system entry point & process manager
├── install_waterme.py      # 📦 System installer for Raspberry Pi
└── README.md               # Project overview
```

## 📁 File Naming Conventions

### Frontend Components
- **`.ui.tsx`** - Page components (Layer 0 of UI system)
- **`.form.tsx`** - Form components (Layer 1+ of UI system)  
- **`.item.tsx`** - Picker/selector components (Layer 1+ of UI system)

### Backend Modules
- **`*.py`** - Core system modules in `/core/`
- **`api.py`** - Main Flask API server

### Configuration Files
- **`*.json`** - Data files in `/data/` and `/library/`
- **`*.cfg`** - Configuration files in `/config/`

## 🔄 Complete Data Flow Architecture

### 🌊 Primary System Flow
```
WaterMe System Entry Point (waterme.py)
    ↓ launches
Flask API Server (api.py) + WateringScheduler (scheduler.py)
    ↓ serves
React UI (ui/src/App.tsx) + FormLayerProvider
    ↓ user interactions
UI Pages (.ui.tsx) → Forms (.form.tsx) → API Endpoints
    ↓ business logic
Core Modules (plant_manager.py, library.py, etc.)
    ↓ persistence
JSON Data Files (/data/*.json) + Config Files (/config/*.cfg)
    ↓ hardware control
GPIO Controller (scheduler.py → gpio.py)
    ↓ physical output
Raspberry Pi GPIO Pins → Relay Modules → Irrigation Valves
```

### 🎯 Irrigation Control Flow
```
Manual Timer Request (garden.ui.tsx)
    ↓ POST /api/manual-timer/{zone_id}
API Route (api.py)
    ↓ scheduler.add_manual_timer()
WateringScheduler (scheduler.py)
    ↓ activate_zone_direct()
GPIO Controller (gpio.py)
    ↓ hardware activation
Physical GPIO Pin → Relay → Irrigation Valve
    ↓ timer expiration
Scheduler Loop → deactivate_zone_direct()
    ↓ hardware deactivation
GPIO Pin OFF → Relay OFF → Valve Closed
```

### 🌱 Smart Plant Placement Flow
```
Plant Selection (garden.ui.tsx)
    ↓ Smart Placement Form (garden.form.tsx)
POST /api/smart/analyze-placement
    ↓ PlantManager.analyze_plant_placement()
Smart Zone Compatibility Analysis
    ↓ frequency matching + emitter sizing
Zone Recommendations with Scores
    ↓ user selection
POST /api/map/save
    ↓ PlantManager.add_plant_instance()
Plant Instance Created in map.json
    ↓ if smart mode
Scheduler Smart Duration Refresh
    ↓ optimal watering calculation
Updated Zone Schedule in schedule.json
```

### 🎨 UI Layer System Flow
```
Page Component (.ui.tsx) [Layer 0]
    ↓ user clicks button
addLayer('form-id', 'form', FormComponent, props)
    ↓ FormLayerManager context
React Portal Renders Form into document.body [Layer 1+]
    ↓ form interaction
Form Component (.form.tsx) handles logic
    ↓ onSave/onCancel callback
removeLayer('form-id')
    ↓ portal cleanup
Form Unmounted, Layer 0 Restored
```

### 📊 Data Persistence Patterns
```
User Action (UI)
    ↓ API Request
Flask Route Handler (api.py)
    ↓ validation
Core Module Function (core/*.py)
    ↓ JSON operations
Atomic File Write (/data/*.json)
    ↓ success response
UI State Update
    ↓ real-time sync
Scheduler Reload (if schedule changed)
    ↓ hardware sync
GPIO State Validation
```

## 🎯 Component Responsibilities

### Page Components (.ui.tsx)
- **Purpose**: Main application pages (Layer 0)
- **Responsibilities**:
  - Data fetching and state management
  - Layout and navigation
  - Triggering forms via layer system
  - Handling form callbacks
- **Should NOT**: Handle modal positioning, z-index, overlays

### Form Components (.form.tsx, .item.tsx)  
- **Purpose**: Reusable forms and pickers (Layer 1+)
- **Responsibilities**:
  - Form logic and validation
  - Internal state management
  - Calling onSave/onCancel callbacks
- **Should NOT**: Handle positioning, overlays, or layer management

### Core Modules (/core/*.py)
- **Purpose**: Business logic and data management
- **Responsibilities**:
  - Data validation and processing
  - File I/O operations
  - Hardware control (GPIO)
  - Scheduling algorithms

## 📦 Import Patterns

### Layer System Imports
```typescript
// From any UI component
import { useFormLayer } from '../../core/useFormLayer';

// In App.tsx
import { FormLayerProvider } from '../core/FormLayerManager';
```

### Form Imports
```typescript
// From page components
import ComponentName from './forms/component.form';

// From forms directory
import { FormProps } from './types';
import './forms.css';
```

### API Imports
```typescript
// Utility for API calls
import { getApiBaseUrl } from './utils';
```

## 🔧 Development Guidelines

### Adding New Pages
1. Create `newpage.ui.tsx` in `/ui/src/`
2. Add route in `App.tsx`
3. Add navigation in `Sidebar.tsx`
4. Use layer system for forms: `addLayer()`

### Adding New Forms
1. Create `newform.form.tsx` in `/ui/src/forms/`
2. Define props interface extending `FormProps`
3. Handle `onSave` and `onCancel` callbacks
4. Use existing CSS classes from `forms.css`

### Adding New API Endpoints
1. Add route in `api.py`
2. Create/update core module in `/core/`
3. Update data models if needed
4. Document in `api-patterns.md`