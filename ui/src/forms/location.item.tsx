/**
 * location.item.tsx - Location creation and editing item
 * 
 * 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
 * 📖 System Overview: ~/rules/system-overview.md
 * 🏗️ Project Structure: ~/rules/project-structure.md
 * 🎨 Layer System: ~/rules/layer-system.md
 * 🌐 API Patterns: ~/rules/api-patterns.md
 * 🎨 Form System: ~/rules/form-system.md
 * 🎨 CSS Conventions: ~/rules/css-conventions.md
 * 💻 Coding Standards: ~/rules/coding-standards.md
 * 
 * COMPONENT PURPOSE
 * =================
 * Simple picker/selector component for creating and editing locations.
 * Receives location_id to edit existing location, or creates new if not provided.
 * Follows library.form edit mode styling patterns.
 */

import React, { useState, useEffect, useRef } from 'react';
import { getApiBaseUrl } from '../utils';
import './forms.css';

interface Location {
  location_id: number;
  name: string;
  description?: string;
  zones: number[];
}

interface LocationItemProps {
  location_id?: number;
  onSave: (locationData: Location) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}

const LocationItem: React.FC<LocationItemProps> = ({
  location_id,
  onSave,
  onCancel,
  loading = false,
  error = ''
}) => {
  // Internal state
  const [locationData, setLocationData] = useState<Partial<Location>>({
    name: '',
    description: '',
    zones: []
  });
  const [availableZones, setAvailableZones] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  const formRef = useRef<HTMLDivElement>(null);

  // Load location data if editing
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Load available zones from schedule (filter out disabled zones)
        const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
        if (zonesResponse.ok) {
          const zonesData = await zonesResponse.json();
          const activeZones = zonesData
            .filter((zone: any) => {
              const isActive = zone && zone.mode !== 'disabled';
              console.log(`Zone ${zone.zone_id}:`, { zone, isActive });
              return isActive;
            })
            .map((zone: any) => zone.zone_id)
            .sort((a: number, b: number) => a - b);
          console.log('Available zones:', activeZones);
          setAvailableZones(activeZones);
        }

        // If editing, load existing location data
        if (location_id) {
          const locationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
          if (locationsResponse.ok) {
            const locationsData = await locationsResponse.json();
            
            // Find the location by ID
            let targetLocation = null;
            if (Array.isArray(locationsData)) {
              targetLocation = locationsData.find((loc: any) => loc.location_id === location_id);
            } else if (typeof locationsData === 'object') {
              targetLocation = locationsData[location_id.toString()];
              if (targetLocation) {
                targetLocation.location_id = location_id;
              }
            }

            if (targetLocation) {
              setLocationData({
                location_id: targetLocation.location_id,
                name: targetLocation.name || '',
                description: targetLocation.description || '',
                zones: targetLocation.zones || []
              });
            }
          }
        }

        setIsLoading(false);
      } catch (err) {
        console.error('Error loading location data:', err);
        setIsLoading(false);
      }
    };

    loadData();
  }, [location_id]);

  // Validation
  const validateField = (fieldName: string, value: any): string | null => {
    switch (fieldName) {
      case 'name':
        if (!value || !value.trim()) {
          return 'Location name is required';
        }
        return null;
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
      : [...currentZones, zoneId].sort((a, b) => a - b);
    
    handleFieldChange('zones', newZones);
  };

  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      setSaveMessage(location_id ? 'Updating location...' : 'Creating location...');

      // Validate all fields
      const errors: {[key: string]: string} = {};
      ['name', 'zones'].forEach(key => {
        const error = validateField(key, locationData[key as keyof Location]);
        if (error) {
          errors[key] = error;
        }
      });

      setValidationErrors(errors);

      if (Object.values(errors).some(error => error)) {
        setSaveStatus('error');
        setSaveMessage('Please fix validation errors');
        setTimeout(() => {
          setSaveStatus('idle');
          setSaveMessage('');
        }, 3000);
        return;
      }

      // Prepare data for API
      const saveData = {
        name: locationData.name?.trim(),
        description: locationData.description?.trim() || '',
        zones: locationData.zones || []
      };

      let response;
      if (location_id) {
        // Update existing location - use bulk save approach
        console.log('Sending to /api/locations (bulk update):', saveData);
        
        // Get existing locations and update the specific one
        const existingLocationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
        if (existingLocationsResponse.ok) {
          const existingLocations = await existingLocationsResponse.json();
          const updatedLocations = existingLocations.map((loc: any) => 
            loc.location_id === location_id 
              ? { ...loc, ...saveData }
              : loc
          );
          
          response = await fetch(`${getApiBaseUrl()}/api/locations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedLocations)
          });
        } else {
          throw new Error('Failed to get existing locations');
        }
      } else {
        // Create new location - need to generate location_id first
        const locationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
        if (locationsResponse.ok) {
          const existingLocations = await locationsResponse.json();
          const newLocationId = Math.max(...existingLocations.map((loc: any) => loc.location_id || 0), 0) + 1;
          
          // Get existing locations and add the new one
          const requestData = {
            ...saveData,
            location_id: newLocationId
          };
          console.log('Sending to /api/locations (bulk save):', requestData);
          
          // Get existing locations and add the new one
          const existingLocationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
          if (existingLocationsResponse.ok) {
            const existingLocations = await existingLocationsResponse.json();
            const updatedLocations = [...existingLocations, requestData];
            
            response = await fetch(`${getApiBaseUrl()}/api/locations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updatedLocations)
            });
          } else {
            throw new Error('Failed to get existing locations');
          }
        } else {
          throw new Error('Failed to get existing locations for ID generation');
        }
      }

      if (response.ok) {
        const result = await response.json();
        setSaveStatus('success');
        setSaveMessage(location_id ? 'Location updated successfully!' : 'Location created successfully!');
        
        // Auto-close after success
        setTimeout(() => {
          setSaveStatus('idle');
          setSaveMessage('');
          onSave(result.data || { ...saveData, location_id: result.location_id || location_id });
        }, 1500);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save location');
      }
    } catch (err) {
      console.error('Error saving location:', err);
      setSaveStatus('error');
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save location');
      
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 4000);
    }
  };

  if (isLoading) {
    return (
      <div className="unified-modal-container">
        <div className="form-loading">
          Loading location data...
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={formRef}
      className="form-container form-container--small"
    >
      {/* Header */}
      <div className="form-flex form-justify-between form-items-center form-mb-20">
        <h2 className="form-header form-header--h2">
          {location_id ? 'Edit Location' : 'Create Location'}
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
            justifyContent: 'center',
            color: 'var(--text-muted)'
          }}
        >
          ×
        </button>
      </div>

      {error && (
        <div className="form-alert form-alert--error form-mb-16">
          <span>⚠️</span>
          {error}
        </div>
      )}

      <div className="form-flex form-flex-column form-gap-16">
        {/* Location Name */}
        <div className="form-section">
          <div className="form-data-field">
            <div className="form-data-label">Location Name *</div>
            <input
              type="text"
              value={locationData.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="form-input form-input--compact"
              placeholder="Enter location name"
            />
            {validationErrors.name && (
              <div className="form-text-error">
                {validationErrors.name}
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="form-section">
          <div className="form-data-field">
            <div className="form-data-label">Description</div>
            <textarea
              value={locationData.description || ''}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className="form-input form-input--compact"
              placeholder="Optional description"
              rows={3}
              style={{ resize: 'vertical', minHeight: '60px' }}
            />
          </div>
        </div>

        {/* Zone Selection */}
        <div className="form-section">
          <div className="form-section-title">
            <span>🎯</span>
            Zones *
          </div>
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

        {/* Status Messages */}
        {saveStatus !== 'idle' && (
          <div className={`form-alert ${
            saveStatus === 'success' ? 'form-alert--success' : 
            saveStatus === 'error' ? 'form-alert--error' : 
            'form-alert--warning'
          }`}>
            <span>
              {saveStatus === 'success' ? '✅' : 
               saveStatus === 'error' ? '❌' : '⏳'}
            </span>
            {saveMessage}
          </div>
        )}

        {/* Action Buttons */}
        <div className="form-actions form-actions--end">
          <button
            onClick={onCancel}
            disabled={saveStatus === 'saving'}
            className="form-btn form-btn--secondary form-btn--flex"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            className="form-btn form-btn--primary form-btn--flex"
          >
            {saveStatus === 'saving' ? 'Saving...' : (location_id ? 'Update Location' : 'Create Location')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LocationItem; 