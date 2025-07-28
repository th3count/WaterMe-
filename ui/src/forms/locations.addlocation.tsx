import { useState, useEffect, useRef } from 'react';
import type { Location, FormProps } from './types';
import { validateRequired, hasValidationErrors, getFormLayerStyle, getFormOverlayClassName, useClickOutside } from './utils';
import './forms.css';

interface LocationFormProps extends FormProps {
  initialData?: Partial<Location>;
  availableZones?: number[];
  onSave: (locationData: Partial<Location>) => Promise<void>;
}

export default function LocationForm({ 
  initialData, 
  availableZones = [],
  onSave, 
  onCancel, 
  loading = false, 
  error = '',
  isTopLayer = true,
  onLayerChange
}: LocationFormProps) {
  const FORM_ID = 'location-form';
  const formRef = useRef<HTMLDivElement>(null);
  const [locationData, setLocationData] = useState<Partial<Location>>({
    name: '',
    description: '',
    zones: [],
    ...initialData
  });

  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});

  const validateField = (fieldName: string, value: any): string | null => {
    switch (fieldName) {
      case 'name':
        return validateRequired(value, 'Location Name');
      case 'zones':
        if (!value || value.length === 0) {
          return 'At least one zone must be selected';
        }
        return null;
      default:
        return null;
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setLocationData(prev => ({ ...prev, [fieldName]: value }));
    
    // Clear validation error for this field
    const error = validateField(fieldName, value);
    setValidationErrors(prev => ({ ...prev, [fieldName]: error || '' }));
  };

  const handleZoneToggle = (zoneId: number) => {
    const currentZones = locationData.zones || [];
    const newZones = currentZones.includes(zoneId)
      ? currentZones.filter(id => id !== zoneId)
      : [...currentZones, zoneId];
    
    handleFieldChange('zones', newZones);
  };

  const handleSave = async () => {
    // Validate all fields
    const errors: {[key: string]: string} = {};
    
    ['name', 'zones'].forEach(key => {
      const error = validateField(key, locationData[key as keyof Location]);
      if (error) {
        errors[key] = error;
      }
    });

    setValidationErrors(errors);

    if (hasValidationErrors(errors)) {
      return;
    }

    try {
      await onSave(locationData);
    } catch (err) {
      console.error('Error saving location:', err);
    }
  };

  // Handle layer changes
  useEffect(() => {
    if (onLayerChange) {
      onLayerChange(FORM_ID, isTopLayer);
    }
  }, [isTopLayer, onLayerChange]);

  // Handle click outside to close
  useClickOutside(formRef, () => {
    if (onCancel) {
      onCancel();
    }
  }, isTopLayer); // Only enable when form is top layer

  return (
    <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
      <div 
        ref={formRef}
        data-modal="true"
        className="form-container form-container--small"
      >
        {/* Forms Folder Indicator */}
        <div style={{
          background: '#1a1f2a',
          border: '1px solid #00bcd4',
          borderRadius: '6px',
          padding: '6px 12px',
          marginBottom: '16px',
          fontSize: '12px',
          color: '#00bcd4',
          fontWeight: 600,
          textAlign: 'center'
        }}>
          📁 Loaded from /ui/src/forms/locations.addlocation.tsx
        </div>

        <div className="form-flex form-justify-between form-items-center form-mb-20">
          <h2 className="form-header form-header--h2">
            {initialData ? 'Edit Location' : 'Add New Location'}
          </h2>
          <button
            onClick={onCancel}
            className="form-btn form-btn--cancel"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              padding: '0',
              width: '30px',
              height: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="form-alert form-alert--error">
            {error}
          </div>
        )}

        <div className="form-flex form-flex-column form-gap-16">
          {/* Location Name */}
          <div className="form-section">
            <label className="form-label">
              Location Name *
            </label>
            <input
              type="text"
              value={locationData.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="form-input form-input--full-width"
              placeholder="Enter location name"
            />
            {validationErrors.name && (
              <div className="form-text-error">
                {validationErrors.name}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="form-section">
            <label className="form-label">
              Description
            </label>
            <textarea
              value={locationData.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className="form-textarea form-textarea--full-width"
              placeholder="Optional description"
              rows={3}
            />
          </div>

          {/* Zone Selection */}
          <div className="form-section">
            <label className="form-label">
              Zones *
            </label>
            <div className="form-text-muted form-mb-12">
              Select which zones this location supports:
            </div>
            <div className="form-button-grid">
              {availableZones.map(zoneId => (
                <div
                  key={zoneId}
                  onClick={() => handleZoneToggle(zoneId)}
                  className={`form-select-button ${(locationData.zones || []).includes(zoneId) ? 'form-select-button--selected' : ''}`}
                >
                  Zone {zoneId}
                </div>
              ))}
            </div>
            {validationErrors.zones && (
              <div className="form-text-error">
                {validationErrors.zones}
              </div>
            )}
                          {availableZones.length === 0 && (
                <div className="form-text-muted form-text-italic">
                  No zones available. Please create zones first.
                </div>
              )}
          </div>

          {/* Action Buttons */}
          <div className="form-actions form-actions--end">
            <button
              onClick={onCancel}
              className="form-btn form-btn--cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="form-btn form-btn--primary"
            >
              {loading ? 'Saving...' : (initialData ? 'Update Location' : 'Create Location')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 