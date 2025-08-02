# WaterMe! System Documentation

This `/rules/` directory contains comprehensive documentation for the WaterMe! irrigation system. **All AI assistants working on this project must reference these documents** to understand the system architecture, API patterns, and development guidelines.

## 📚 Complete Documentation Index

### 🎯 System Understanding
- **[system-overview.md](./system-overview.md)** - **START HERE** - Complete WaterMe! system architecture and mission
- **[project-structure.md](./project-structure.md)** - Comprehensive file organization and data flow patterns
- **[api-patterns.md](./api-patterns.md)** - Complete API reference (80+ endpoints) and data models

### 🎨 UI Development
- **[layer-system.md](./layer-system.md)** - Universal UI layer management with React Portals
- **[form-system.md](./form-system.md)** - Form component patterns and layer integration
- **[css-conventions.md](./css-conventions.md)** - Unified CSS naming and styling system

### 💻 Development Standards
- **[coding-standards.md](./coding-standards.md)** - Code style, patterns, and best practices

### 🔧 System Components
- **Core Modules**: `scheduler.py` (GPIO controller), `plant_manager.py` (smart placement), `gpio.py` (hardware abstraction)
- **UI System**: React Portal-based layer management, self-contained forms, unified styling
- **Data Layer**: JSON persistence, structured logging, configuration management
- **API Layer**: 80+ REST endpoints, real-time status, comprehensive plant library

## 🎯 Quick Start for AI Assistants

1. **Always read** [project-structure.md](./project-structure.md) first
2. **Reference** [layer-system.md](./layer-system.md) for UI work
3. **Check** [api-patterns.md](./api-patterns.md) for backend integration
4. **Follow** [coding-standards.md](./coding-standards.md) for all changes

## 🔄 Keep Documentation Updated

When making system changes:
- Update relevant documentation files
- Add new patterns to appropriate guides
- Maintain consistency across all docs