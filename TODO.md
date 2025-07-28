# WaterMe! Project Roadmap & TODO

## 📝 Project Context & Notes
- **Single Garden Focus:** This system is designed for a single garden setup - no multi-garden support needed
- **No Authentication:** This is a local system for personal use - no user login/authentication required
- **Simplified UX:** No accessibility features or user preferences/customization needed - keep it simple
- **Mobile Support:** Mobile-friendly improvements are planned for post 3.x.x (Version 4.x.x) when connectivity features are added
- **Hardware Integration:** Version 2.x.x focuses strictly on physical GPIO integration and direct hardware control. All other hardware, sensors, analytics, and smart features are deferred to later versions.
- **Smart Features:** Version 3.x.x is strictly for smart features (weather, AI, analytics, scheduling, etc.).
- **Incremental Development:** Each version builds upon the previous, ensuring stable foundation before adding complexity

## 📋 Version Build Structure

### 🎯 Version 1.x.x - UI and Backend Foundation
**Status: ✅ COMPLETED - Ready for Version 2.0.0**
- [x] Garden creation UI (name, location, mode)
- [x] Geocoding with OpenCage
- [x] Timezone selection and current time display
- [x] Backend integration for garden config (INI file-based)
- [x] Garden dashboard/overview page
- [x] Plant/zone management
- [x] Watering schedule setup (INI file-based)
- [x] Manual zone control and timers
- [x] Solar time resolution (sunrise, sunset, zenith)
- [x] Timer multiplier for global watering adjustments
- [x] GPIO configuration and control
- [x] Plant library management
- [x] Location management
- [x] Health monitoring and orphaned plant detection
- [x] Incremental JSON operations for data integrity
- [x] Settings validation and error handling
- [x] Unified logging system with real-time log viewer
- [x] Plant reassignment workflow with targeted API updates
- [x] JSON data format standardization (object containers)
- [x] Health alert management with persistent ignore/unignore
- [x] Zone sorting and display improvements
- [x] Orphaned plant common name display
- [x] UI/UX improvements (conditional button visibility, collapsible alerts)
- [x] Primary `/waterme.py` entrypoint
- [x] Configuration backup/restore functionality
- [x] Settings import/export
- [x] Color-coded zone status indicators (green/orange/red/gray system)
- [x] Real-time zone status monitoring with GPIO state validation
- [x] Improved scheduled event detection and catch-up logic
- [x] Enhanced manual timer controls with immediate visual feedback

### 🔌 Version 2.x.x - Hardware GPIO Integration
**Status: 🚀 IN PROGRESS - Strictly GPIO hardware integration**
**Focus: Physical GPIO system integration and direct hardware control only**
- [x] GPIO hardware integration with real Raspberry Pi
- [x] Real-time zone status monitoring with actual GPIO state validation
- [x] Manual timer controls with immediate visual feedback
- [x] Color-coded status indicators (green/orange/gray/red) for real hardware states
- [x] Unified logging system for hardware events
- [x] Scheduler integration with real GPIO control
- [x] Manual timer cancellation with proper state management
- [x] Unified structured logging for all hardware events
- [x] Scheduler deadlock prevention and live configuration reloading
- [x] GPIO pin control
- [x] Relay module support (active low/high)
- [x] Zone activation/deactivation

> **Note:** All other hardware features (sensors, flow meters, water level, well management, analytics, etc.) are deferred to later versions.

### 🧠 Version 3.x.x - Smart Features
**Status: 🚀 IN PROGRESS - Smart placement and zone optimization**
**Focus: Smart placement, zone recommendations, and frequency compatibility**
- [x] Create PlantManager module (`core/plant_manager.py`)
- [x] Move plant management logic from API to PlantManager
- [x] Implement frequency compatibility logic (Primary, Secondary, Tertiary)
- [x] Add smart placement analysis functions
- [x] Add zone recommendation system
- [x] Add smart placement API endpoints
- [x] Update UI to integrate smart placement features
- [x] Update Settings and forms for smart mode support
- [x] Smart mode enabled by default in plant placement UI
- [x] Deactivated zones display in smart placement modal
- [ ] Auto-creation functionality for deactivated zones
- [ ] Health check: Bad zones detection and reporting
- [ ] Health check: Zone compatibility validation
- [ ] Health check: Emitter size configuration and validation
- [ ] Health check: Zone scheduling conflicts detection
- [ ] Dynamic zone start times
- [ ] Dynamic zone run times (duration)
- [ ] Refactor map.json to move common_name into comments field (cleanup human-readable data)

> **Note:** All other smart features (analytics, notifications, plant health, etc.) are deferred to later versions.

### 🌐 Version 4.x.x - RPi Integration & Service Setup
**Focus: Raspberry Pi hardware integration and WaterMe service setup only**
- [ ] Raspberry Pi hardware integration
- [ ] Create waterme.sh entrypoint script
- [ ] waterme.sh: Automated dependency resolution
- [ ] waterme.sh: Virtual environment (venv) setup
- [ ] waterme.sh: Initial configuration and environment setup
- [ ] Run WaterMe as a system service
- [ ] End-to-end: Take current system, deploy to fresh machine, and have ./waterme.sh handle all setup

> **Note:** All other connectivity, remote access, and mobile features are deferred to later versions.

### 📊 Version 5.x.x - Advanced RPi Integration & Installer
**Focus: Advanced Raspberry Pi hardware integration and installer for pre-prep image only**
- [ ] Create installer for pre-prep image
- [ ] User setup and permissions management
- [ ] Grounds setup and configuration
- [ ] UI: Change system time functionality
- [ ] UI: WiFi setup and configuration
- [ ] Advanced Raspberry Pi hardware integration
- [ ] System admin panel for device/network management
- [ ] Set system clock from UI
- [ ] Connect to Wi-Fi from UI
- [ ] Setup Wi-Fi/ad-hoc hotspot for remote admin

> **Note:** All other analytics, optimization, and advanced features are deferred to later versions.

### 🌍 Version 6.x.x - Community & Ecosystem
**Focus: Community features and extensibility**
- [ ] Community/shared garden templates
- [ ] Marketplace for plant/zone configs
- [ ] Open API for third-party integrations
- [ ] Plugin system
- [ ] Community forums and support

### 🏗️ Version 7.x.x - Garden Creation Advanced Refactor
**Focus: Advanced garden creation and optimization**
- [ ] Plant-to-plant compatibility logic for garden creation
- [ ] Advanced zone grouping algorithms
- [ ] Multi-plant zone optimization
- [ ] Garden-wide efficiency scoring
- [ ] Intelligent garden layout recommendations

---

## ✅ Completed Features
- [x] Garden creation UI (name, location, mode)
- [x] Geocoding with OpenCage
- [x] Timezone selection and current time display
- [x] Backend integration for garden config (INI file-based)
- [x] Garden dashboard/overview page
- [x] Plant/zone management
- [x] Watering schedule setup (INI file-based)
- [x] Manual zone control and timers
- [x] Solar time resolution (sunrise, sunset, zenith)
- [x] Timer multiplier for global watering adjustments
- [x] GPIO configuration and control
- [x] Plant library management
- [x] Location management
- [x] Health monitoring and orphaned plant detection
- [x] Unified logging system with real-time log viewer
- [x] Plant reassignment workflow with targeted API updates
- [x] JSON data format standardization (object containers)
- [x] Health alert management with persistent ignore/unignore
- [x] Zone sorting and display improvements
- [x] Orphaned plant common name display
- [x] UI/UX improvements (conditional button visibility, collapsible alerts)
- [x] Incremental JSON operations for data integrity
- [x] Color-coded zone status indicators (green/orange/red/gray system)
- [x] Real-time zone status monitoring with GPIO state validation
- [x] Improved scheduled event detection and catch-up logic
- [x] Enhanced manual timer controls with immediate visual feedback
- [x] **Version 2.x.x: Real hardware integration with Raspberry Pi GPIO**
- [x] Manual timer cancellation with proper state management
- [x] Unified structured logging for all hardware events
- [x] Scheduler deadlock prevention and live configuration reloading

---

## 🐛 Known Bugs & Issues
- [ ] Smart schedules not generating after zone changed to smart mode

---
*Update this file as features are added, planned, or completed!* 