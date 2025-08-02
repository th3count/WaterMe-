# Coding Standards Documentation

## 🎯 Overview

These coding standards ensure consistency, maintainability, and clarity across the WaterMe! codebase.

## 📁 File Organization

### File Naming
- **`.ui.tsx`** - Page components (Layer 0)
- **`.form.tsx`** - Form components (Layer 1+)
- **`.item.tsx`** - Picker/selector components (Layer 1+)
- **`.py`** - Python backend modules
- **`.json`** - Data files
- **`.cfg`** - Configuration files

### Directory Structure
```
/core/           # System-wide components
/ui/src/         # Frontend application
  /forms/        # Form components
/data/           # JSON data storage
/library/        # Plant library data
/config/         # System configuration
/rules/          # 📚 Documentation
```

## 🔧 TypeScript/React Standards

### Import Organization
```typescript
// 1. React and external libraries
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 2. Internal utilities and hooks
import { getApiBaseUrl } from './utils';
import { useFormLayer } from '../../core/useFormLayer';

// 3. Components
import MyForm from './forms/myform.form';

// 4. Styles (last)
import './styles.css';
```

### Component Structure
```typescript
/**
 * File header with documentation references
 */

// Interfaces first
interface ComponentProps {
  prop1: string;
  prop2?: number;
}

// Component definition
const MyComponent: React.FC<ComponentProps> = ({
  prop1,
  prop2 = 0
}) => {
  // Hooks
  const [state, setState] = useState();
  const { addLayer } = useFormLayer();
  
  // Event handlers
  const handleClick = () => {
    // Handler logic
  };
  
  // Effects
  useEffect(() => {
    // Effect logic
  }, []);
  
  // Render
  return (
    <div>
      {/* JSX content */}
    </div>
  );
};

export default MyComponent;
```

### State Management
```typescript
// ✅ Descriptive state names
const [isLoading, setIsLoading] = useState(false);
const [userData, setUserData] = useState<User | null>(null);

// ✅ Functional updates for complex state
setItems(prevItems => prevItems.filter(item => item.id !== id));

// ✅ useCallback for event handlers
const handleSave = useCallback(async (data: FormData) => {
  // Handler logic
}, [dependency]);
```

### Error Handling
```typescript
// API calls
try {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const data = await response.json();
  // Handle success
} catch (error) {
  console.error('Operation failed:', error);
  setError(error.message || 'Operation failed');
} finally {
  setLoading(false);
}
```

## 🐍 Python Standards

### Module Structure
```python
"""
Module docstring with purpose and usage
"""

# Standard library imports
import json
import os
from datetime import datetime

# Local imports
from core.config import get_config

# Constants
DEFAULT_TIMEOUT = 30

# Functions
def process_data(data: dict) -> dict:
    """
    Process data with proper typing and docstring
    
    Args:
        data: Input data dictionary
        
    Returns:
        Processed data dictionary
        
    Raises:
        ValueError: If data is invalid
    """
    # Function implementation
    pass
```

### Error Handling
```python
# File operations
try:
    with open(filepath, 'r') as f:
        data = json.load(f)
except FileNotFoundError:
    logger.warning(f"File not found: {filepath}")
    return []
except json.JSONDecodeError as e:
    logger.error(f"Invalid JSON in {filepath}: {e}")
    raise
```

## 🎨 CSS Standards

### Class Naming
```css
/* ✅ Unified prefix for reusable components */
.unified-modal-container { }
.unified-btn-primary { }

/* ✅ Component-specific classes */
.form-input { }
.form-select { }

/* ✅ Utility classes */
.form-flex { }
.form-gap-8 { }
```

### CSS Variables
```css
/* Use CSS variables for consistency */
.my-component {
  background: var(--form-bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--form-border-primary);
}
```

## 📝 Documentation Standards

### File Headers
```typescript
/**
 * 🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
 * 📖 Primary Reference: /rules/relevant-guide.md
 * 🏗️ Architecture: /rules/project-structure.md
 * 
 * COMPONENT PURPOSE
 * =================
 * Brief description of component purpose and usage.
 */
```

### Function Documentation
```typescript
/**
 * Process user data and update state
 * @param userData - User data object
 * @param options - Processing options
 * @returns Promise resolving to processed data
 */
const processUserData = async (userData: User, options: ProcessOptions): Promise<ProcessedUser> => {
  // Implementation
};
```

### Inline Comments
```typescript
// ✅ Explain WHY, not WHAT
const timeout = 5000; // Longer timeout needed for slow network conditions

// ✅ Document complex logic
// Calculate irrigation duration based on plant water needs and soil moisture
const duration = calculateDuration(plantNeeds, soilMoisture, weatherData);
```

## 🔄 API Standards

### Endpoint Naming
```python
# RESTful patterns
GET    /api/locations     # Get all locations
POST   /api/locations     # Create location
PUT    /api/locations/1   # Update location
DELETE /api/locations/1   # Delete location
```

### Response Format
```python
# Success response
{
  "status": "success",
  "data": { ... },
  "message": "Operation completed"
}

# Error response
{
  "status": "error", 
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

## 🚫 Anti-Patterns

### ❌ Avoid These Patterns

```typescript
// Don't use any type
const data: any = fetchData();

// Don't ignore errors
fetchData().catch(() => {}); 

// Don't use inline styles for positioning (layer system handles this)
<div style={{ position: 'fixed', zIndex: 1000 }}>

// Don't use non-descriptive names
const d = new Date();
const u = users.filter(x => x.a);

// Don't mix concerns
const MyComponent = () => {
  // Don't do API calls, validation, and rendering all in one component
};
```

### ✅ Preferred Patterns

```typescript
// Use proper typing
const data: UserData = await fetchUserData();

// Handle errors appropriately
try {
  await fetchData();
} catch (error) {
  handleError(error);
}

// Use CSS classes for styling
<div className="unified-modal-container">

// Use descriptive names
const currentDate = new Date();
const activeUsers = users.filter(user => user.isActive);

// Separate concerns
const MyComponent = () => {
  const data = useUserData();  // Custom hook for data
  const validation = useValidation();  // Custom hook for validation
  
  return <div>{/* Focused on rendering */}</div>;
};
```

## 🧪 Testing Standards

### Component Testing
- Test user interactions
- Test error states
- Test loading states
- Test form validation
- Test layer system integration

### API Testing
- Test success responses
- Test error responses  
- Test edge cases
- Test data validation

## 📋 Code Review Checklist

- [ ] File has proper header documentation
- [ ] Imports are organized correctly
- [ ] Component follows naming conventions
- [ ] Error handling is implemented
- [ ] CSS uses proper class names
- [ ] No console.log statements in production code
- [ ] TypeScript types are properly defined
- [ ] Functions have clear purposes
- [ ] Layer system is used correctly for modals/forms