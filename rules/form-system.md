# Form System Documentation

## 🎯 Overview

The WaterMe! form system provides **reusable, self-contained form components** that integrate seamlessly with the universal layer system.

## 📁 Form Structure

```
/ui/src/forms/
├── detailedplant.form.tsx    # Plant instance details
├── durationpicker.item.tsx   # Time duration selector
├── garden.form.tsx           # Smart plant placement
├── library.form.tsx          # Plant library editor
├── locations.addlocation.tsx # Location creation
├── zones.form.tsx           # Zone configuration
├── timepicker.item.tsx      # Time selection
├── forms.css               # Form styling
├── types.ts                # Form type definitions
└── utils.ts                # Form utilities
```

## 🏗️ Form Component Pattern

### Interface Definition
```typescript
interface FormProps {
  onSave: (data: any) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
  isTopLayer?: boolean;
}

interface MyFormProps extends FormProps {
  // Form-specific props
  initialData?: MyDataType;
  customProp?: string;
}
```

### Component Structure
```typescript
const MyForm: React.FC<MyFormProps> = ({
  initialData,
  onSave,
  onCancel,
  loading = false,
  error = ''
}) => {
  // Internal state
  const [formData, setFormData] = useState(initialData || {});
  
  // Form handlers
  const handleSubmit = async () => {
    try {
      // Validation and processing
      await onSave(formData);
    } catch (err) {
      // Error handling
    }
  };

  return (
    <div className="unified-modal-container">
      {/* Form content */}
      <div className="form-flex form-gap-8">
        <button onClick={onCancel} className="btn-cancel">
          Cancel
        </button>
        <button onClick={handleSubmit} className="btn-done">
          Done
        </button>
      </div>
    </div>
  );
};
```

## 🔧 Layer System Integration

### From UI Pages
```typescript
import { useFormLayer } from '../../core/useFormLayer';
import MyForm from './forms/myform.form';

const { addLayer, removeLayer } = useFormLayer();

// Show form
const showForm = () => {
  addLayer('my-form', 'form', MyForm, {
    initialData: currentData,
    onSave: async (data) => {
      // Handle save
      await saveData(data);
      removeLayer('my-form');
      // Refresh UI
    },
    onCancel: () => removeLayer('my-form')
  });
};
```

### Form Component Rules
- **✅ DO**: Focus on form logic and validation
- **✅ DO**: Use callback props for actions (onSave, onCancel)
- **✅ DO**: Apply unified CSS classes
- **❌ DON'T**: Handle positioning or z-index
- **❌ DON'T**: Manage layer lifecycle directly

## 🎨 Styling Guidelines

### Container Styling
```css
.unified-modal-container {
  background: var(--form-bg-tertiary);
  border: 1px solid var(--form-border-primary);
  border-radius: 12px;
  padding: 16px;
  min-width: 320px;
}
```

### Form Layout
```css
.form-flex { display: flex; }
.form-gap-8 { gap: 8px; }
.form-justify-center { justify-content: center; }
```

### Input Styling
```css
.form-input {
  background: var(--form-bg-secondary);
  border: 1px solid #444;
  color: var(--text-primary);
  padding: 8px 12px;
  border-radius: 4px;
}

.form-select {
  background: var(--form-bg-secondary);
  border: 1px solid #444;
  color: var(--text-primary);
  padding: 4px 8px;
  border-radius: 4px;
}
```

## 🔄 Form Types

### Data Entry Forms (.form.tsx)
- **Purpose**: Create/edit data records
- **Examples**: zones.form.tsx, library.form.tsx
- **Pattern**: Complex validation, API integration

### Picker Components (.item.tsx)
- **Purpose**: Select values from options
- **Examples**: durationpicker.item.tsx, timepicker.item.tsx
- **Pattern**: Simple selection, immediate callback

## ✅ Validation Patterns

### Client-Side Validation
```typescript
const validateForm = (data: FormData): string[] => {
  const errors: string[] = [];
  
  if (!data.name?.trim()) {
    errors.push('Name is required');
  }
  
  if (data.value < 0) {
    errors.push('Value must be positive');
  }
  
  return errors;
};
```

### Error Display
```typescript
{error && (
  <div className="form-error">
    {error}
  </div>
)}
```

## 🧪 Testing Forms

### Form Testing Checklist
- [ ] Form opens via layer system
- [ ] All inputs are functional
- [ ] Validation works correctly
- [ ] Save/Cancel callbacks work
- [ ] Form closes after actions
- [ ] Loading states display properly
- [ ] Error handling works

### Common Issues
- **Form doesn't open**: Check addLayer call and imports
- **Form doesn't close**: Ensure removeLayer is called in callbacks
- **Styling issues**: Check CSS class names and variables
- **Layer conflicts**: Verify only one form opens at a time