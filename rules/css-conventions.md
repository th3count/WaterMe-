# CSS Conventions Documentation

## 🎨 Styling System Overview

The WaterMe! UI uses a **unified CSS system** with consistent naming conventions, color schemes, and component patterns.

## 📁 CSS File Structure

```
/ui/src/
├── index.css           # Global styles and CSS variables
├── App.css            # App-level component styles
└── /forms/
    ├── forms.css      # Form-specific styles
    └── unified.forms.css # Unified form system styles
```

## 🎯 Naming Conventions

### Unified Prefix System
**All unified styles MUST be prefixed with `unified-`**

```css
/* ✅ Correct - Unified components */
.unified-btn-red
.unified-button-blue  
.unified-toggle-slider
.unified-section-title
.unified-modal-container

/* ❌ Incorrect - Missing unified prefix */
.btn-red
.button-blue
.toggle-slider
```

### Component-Specific Classes
```css
/* Form components */
.form-input
.form-select
.form-text-accent
.form-flex
.form-gap-8

/* Button variants */
.btn-done
.btn-cancel
.btn-stop
.btn-primary
```

### Layout Utilities
```css
/* Flexbox patterns */
.form-flex
.form-flex-column
.form-justify-center
.form-items-center
.form-gap-4
.form-gap-8
.form-gap-12

/* Text utilities */
.form-text-center
.form-text-accent
.form-text-muted
.form-font-600
.form-text-12
.form-text-14
```

## 🎨 Color System

### CSS Variables (index.css)
```css
:root {
  /* Primary Colors */
  --form-bg-primary: #181f2a;
  --form-bg-secondary: #1a1f2a;
  --form-bg-tertiary: #232b3b;
  
  /* Accent Colors */
  --form-text-accent: #00bcd4;
  --form-border-primary: #00bcd4;
  
  /* Status Colors */
  --success-color: #4caf50;
  --warning-color: #ff9800;
  --error-color: #ff512f;
  
  /* Text Colors */
  --text-primary: #f4f4f4;
  --text-secondary: #bdbdbd;
  --text-muted: #888;
}
```

### Design Palette Rules
- **❌ NO PURPLE** - Purple is not part of the design palette
- **✅ Primary**: Cyan (#00bcd4) for accents and highlights
- **✅ Backgrounds**: Dark blues (#181f2a, #232b3b)
- **✅ Status**: Green (success), Orange (warning), Red (error)

## 🧩 Component Patterns

### Modal/Form Containers
```css
.unified-modal-container {
  background: var(--form-bg-tertiary);
  border: 1px solid var(--form-border-primary);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  padding: 16px;
  min-width: 320px;
}
```

### Button System
```css
/* Primary action button */
.btn-done {
  background: var(--form-text-accent);
  color: #181f2a;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 12px;
  cursor: pointer;
}

/* Destructive action button */
.btn-cancel {
  background: var(--error-color);
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 12px;
  cursor: pointer;
}

/* Warning action button */
.btn-stop {
  background: var(--warning-color);
  color: #181f2a;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 12px;
  cursor: pointer;
}
```

### Form Input System
```css
.form-input {
  background: var(--form-bg-secondary);
  border: 1px solid #444;
  border-radius: 4px;
  color: var(--text-primary);
  padding: 8px 12px;
  font-size: 14px;
}

.form-select {
  background: var(--form-bg-secondary);
  border: 1px solid #444;
  border-radius: 4px;
  color: var(--text-primary);
  padding: 4px 8px;
}
```

## 🔧 Utility Classes

### Flexbox Utilities
```css
.form-flex { display: flex; }
.form-flex-column { flex-direction: column; }
.form-justify-center { justify-content: center; }
.form-items-center { align-items: center; }
.form-gap-4 { gap: 4px; }
.form-gap-8 { gap: 8px; }
.form-gap-12 { gap: 12px; }
```

### Spacing Utilities
```css
.form-mb-8 { margin-bottom: 8px; }
.form-mb-12 { margin-bottom: 12px; }
.form-mb-16 { margin-bottom: 16px; }
```

### Typography Utilities
```css
.form-text-center { text-align: center; }
.form-text-accent { color: var(--form-text-accent); }
.form-text-muted { color: var(--text-muted); }
.form-font-600 { font-weight: 600; }
.form-text-12 { font-size: 12px; }
.form-text-14 { font-size: 14px; }
```

## 📐 Layout Guidelines

### Preferred Patterns

#### ✅ Separate Utility Classes
```css
/* Good - Separate concerns */
.unified-flexbox-container { /* flexbox patterns */ }
.unified-interactive-element { /* interactive behaviors */ }
.unified-content-box { /* content styling */ }
```

#### ✅ Self-Contained Forms
```css
/* Good - Form encapsulates all styling */
.form-container {
  /* All form styles contained within */
  padding: 16px;
  background: var(--form-bg-tertiary);
  border-radius: 8px;
}
```

### Spacing Standards
- **Small gaps**: 4px, 8px
- **Medium gaps**: 12px, 16px  
- **Large gaps**: 20px, 24px
- **Container padding**: 16px, 20px
- **Border radius**: 4px (small), 8px (medium), 12px (large)

## 🚫 Anti-Patterns

### ❌ Avoid These Patterns
```css
/* Don't mix positioning with content styling */
.bad-component {
  position: fixed;  /* Layer system handles this */
  z-index: 1000;   /* Layer system handles this */
  top: 50%;        /* Layer system handles this */
  background: purple; /* Not in design palette */
}

/* Don't use non-unified naming */
.button { /* Should be .unified-button */ }
.modal { /* Should be .unified-modal */ }
```

### ❌ Inline Styles to Avoid
```typescript
// Don't handle layer positioning in components
<div style={{
  position: 'fixed',
  zIndex: 1000,
  top: 0,
  left: 0
}}>
```

## 🎯 Best Practices

### Component Styling
1. **Use CSS variables** for colors and spacing
2. **Apply unified- prefix** to reusable components
3. **Keep positioning separate** from content styling
4. **Use utility classes** for common patterns

### Form Styling
1. **Import forms.css** in form components
2. **Use existing form classes** before creating new ones
3. **Define button padding** in CSS, not inline
4. **Follow consistent spacing** patterns

### Responsive Considerations
- Use `min-width` for modal minimums
- Use `max-width` for content constraints
- Use flexbox for layout adaptation
- Test on different screen sizes

## 🧪 Testing Styles

### Visual Testing Checklist
- [ ] Colors match design palette
- [ ] Spacing follows standard increments
- [ ] Text is readable on all backgrounds
- [ ] Interactive elements have hover states
- [ ] Forms render consistently across pages
- [ ] Layer system positioning works correctly