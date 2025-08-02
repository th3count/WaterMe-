# Universal Layer System Documentation

## 🎯 Overview

The WaterMe! UI uses a **universal layer management system** built with React Portals to handle all modals, forms, and overlays consistently across the application.

## 📁 Core Files

- **`/core/FormLayerManager.tsx`** - Main context provider and portal renderer
- **`/core/useFormLayer.tsx`** - Hook for interacting with the layer system

## 🏗️ Architecture

### Layer Hierarchy
```
Layer 0: Base UI Pages (.ui.tsx files)
├── garden.ui.tsx
├── library.ui.tsx  
├── zones.ui.tsx
├── locations.ui.tsx
├── health.ui.tsx
└── logs.ui.tsx

Layer 1+: Forms & Items (.form.tsx, .item.tsx files)
├── zones.form.tsx
├── library.form.tsx
├── durationpicker.item.tsx
└── locations.addlocation.tsx
```

### React Portal Implementation
```typescript
// All higher layers render into document.body via Portal
{layers.length > 0 && createPortal(
  <div style={{ /* overlay styles */ }}>
    <Component {...props} />
  </div>,
  document.body
)}
```

## 🔧 Usage Patterns

### Adding a Layer (UI Pages)
```typescript
import { useFormLayer } from '../../core/useFormLayer';

const { addLayer, removeLayer } = useFormLayer();

// Show a form
addLayer('unique-id', 'form', ComponentName, {
  prop1: value1,
  onSave: (data) => {
    // Handle save
    removeLayer('unique-id');
  },
  onCancel: () => removeLayer('unique-id')
});
```

### Form Components
```typescript
// Forms receive props and handle their own logic
interface FormProps {
  onSave: (data: any) => void;
  onCancel: () => void;
  // ... other props
}

const MyForm: React.FC<FormProps> = ({ onSave, onCancel }) => {
  // Form logic here
  return <div>Form content</div>;
};
```

## ✅ Key Features

### Automatic Behavior
- **Base Layer Fading**: Layer 0 fades to 30% opacity when higher layers exist
- **Click-Outside-to-Close**: Clicking overlay background closes top layer
- **Z-Index Management**: Portal ensures proper stacking (z-index: 9999)
- **Event Isolation**: Portal prevents event conflicts with base layer

### Universal API
- `addLayer(id, type, Component, props)` - Show any component as a layer
- `removeLayer(id)` - Close specific layer
- `layers` - Current layer stack
- Backward compatibility functions for legacy forms

## 🎨 Styling Guidelines

### Layer Components Should:
- **NOT** apply position styling (portal handles this)
- **NOT** manage z-index (portal handles this)  
- **NOT** handle click-outside logic (portal handles this)
- **FOCUS** on content and internal interactions

### Example Component Styling
```typescript
return (
  <div style={{
    background: 'var(--form-bg-tertiary)',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid var(--form-border-primary)',
    minWidth: '320px'
  }}>
    {/* Component content */}
  </div>
);
```

## 🚨 Common Pitfalls

### ❌ Don't Do This
```typescript
// Don't manage position/z-index in components
<div style={{
  position: 'fixed',
  top: 0,
  left: 0,
  zIndex: 1000,  // Portal handles this
  background: 'rgba(0,0,0,0.8)' // Portal handles this
}}>
```

### ✅ Do This Instead
```typescript
// Let the portal handle positioning and overlays
<div style={{
  background: 'var(--form-bg-tertiary)',
  padding: '20px',
  borderRadius: '8px'
}}>
```

## 🔄 Migration Notes

When converting old modal/form patterns:
1. Remove manual overlay divs
2. Remove position/z-index styling
3. Use `addLayer` instead of state flags
4. Remove click-outside event handlers
5. Update imports to use `/core/useFormLayer`

## 🧪 Testing

Test layer system by:
- Opening multiple layers (should stack properly)
- Clicking outside to close (should close top layer only)
- Checking base layer fading (should fade when layers active)
- Verifying no event conflicts (base layer should be non-interactive)