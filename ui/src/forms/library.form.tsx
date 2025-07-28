import React, { useState, useEffect, useRef } from 'react';
import { getFormLayerStyle, getFormOverlayClassName } from './utils';
import { useFormLayer } from './FormLayerManager';
import { getApiBaseUrl } from '../utils';
import TimePicker from './timepicker.item';
import './forms.css';

interface Plant {
  plant_id: number;
  common_name: string;
  alternative_name?: string;
  latin_name?: string;
  description?: string;
  plant_type?: string;
  watering_frequency?: string;
  preferred_time?: string[];
  compatible_watering_times?: string[];
  optimal_water_per_week?: number;
  tolerance_min?: number;
  tolerance_max?: number;
  usda_zones?: string;
  root_area?: number;
  library_book?: string;
}

// LibraryFile interface removed as it was unused

interface LibraryFormProps {
  plant_id?: number;
  library_book: string;
  onClose: () => void;
  onLayerChange?: (hasForm: boolean) => void;
}

const LibraryForm: React.FC<LibraryFormProps> = ({
  plant_id,
  library_book,
  onClose
  // onLayerChange removed as unused
}) => {
  const { isAnyFormAbove, registerForm, unregisterForm, isTopLayer } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);
  const formId = `library-form-${plant_id}-${library_book}`;

  const [plant, setPlant] = useState<Plant | null>(null);
  const [editablePlant, setEditablePlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for editing mode
  const [isEditing, setIsEditing] = useState(false);

  // State for time picker
  const [showTimePicker, setShowTimePicker] = useState<string | null>(null);

  // Create blank plant data for custom entries
  const createBlankPlant = (): Plant => ({
    plant_id: 0, // Will be assigned when saved
    common_name: '',
    alternative_name: '',
    latin_name: '',
    description: '',
    plant_type: '',
    watering_frequency: '',
    preferred_time: [],
    compatible_watering_times: [],
    optimal_water_per_week: 0,
    tolerance_min: 0,
    tolerance_max: 0,
    usda_zones: '',
    root_area: 0,
    library_book: 'custom'
  });

  // Initialize plant data
  const initializePlantData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if this is a new custom entry
      if (!plant_id && library_book === 'custom') {
        const blankPlant = createBlankPlant();
        setPlant(blankPlant);
        setEditablePlant(blankPlant);
        setIsEditing(true);
        setLoading(false);
        return;
      }

      if (!plant_id) {
        throw new Error('Plant ID is required for non-custom entries');
      }

      const response = await fetch(`${getApiBaseUrl()}/api/library/${library_book}/${plant_id}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plant data: ${response.status}`);
      }

      const plantData = await response.json();
      setPlant(plantData);
      setEditablePlant(plantData);
    } catch (err) {
      console.error('Error loading plant data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plant data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initializePlantData();
  }, [plant_id, library_book]);

  useEffect(() => {
    registerForm(formId);
    return () => unregisterForm(formId);
  }, [registerForm, unregisterForm, formId]);

  // Handle click outside to close form (only when it's the top layer)
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (isTopLayer && formRef.current && !formRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isTopLayer, onClose]);

  

  // Prevent background scrolling when form is open, but allow scrolling inside form
  useEffect(() => {
    const disableWheel = (e: Event) => {
      const target = e.target as Element;
      // Allow scrolling if the target is inside our form container
      if (formRef.current && formRef.current.contains(target)) {
        return; // Allow the scroll
      }
      e.preventDefault();
    };

    if (isTopLayer) {
      document.addEventListener('wheel', disableWheel, { passive: false });
      return () => document.removeEventListener('wheel', disableWheel);
    }
  }, [isTopLayer]);

  const handleInputChange = (field: keyof Plant, value: any) => {
    setEditablePlant(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const handleArrayInputChange = (field: keyof Plant, value: string) => {
    const arrayValue = value.split(',').map(item => item.trim()).filter(item => item);
    setEditablePlant(prev => prev ? ({ ...prev, [field]: arrayValue }) : null);
  };

  const handleEdit = async () => {
    if (!plant) return;

    try {
      // Clone the plant to custom.json with a new plant_id
      const { plant_id, ...plantDataToClone } = plant;
      
      const response = await fetch(`${getApiBaseUrl()}/api/library/custom/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(plantDataToClone),
      });

      if (!response.ok) {
        throw new Error('Failed to clone plant to custom library');
      }

      const result = await response.json();
      console.log('Plant cloned successfully:', result);
      
      // Update the current form to show the new custom plant
      const newPlant = { ...plantDataToClone, plant_id: result.plant_id, library_book: 'custom' };
      setPlant(newPlant);
      setEditablePlant(newPlant);
      setIsEditing(true);
    } catch (error) {
      console.error('Error cloning plant:', error);
      alert('Failed to clone plant to custom library');
    }
  };

  const handleSave = () => {
    if (!editablePlant) return;
    
    const errors = getValidationErrors();
    if (errors.length > 0) {
      alert(`Please fix the following errors:\n\n${errors.join('\n')}`);
      return;
    }
    
    // TODO: Implement actual save functionality
    alert('Save functionality will be implemented here');
  };

  const handleCancelEdit = () => {
    if (!plant_id && library_book === 'custom') {
      // For new custom entries, close the form
      onClose();
    } else {
      // For existing plants, reset to original data
      setEditablePlant(plant);
      setIsEditing(false);
    }
  };

  // Validation functions
  const validateWateringFrequency = (frequency: string): boolean => {
    const pattern = /^[DWM]\d+$/;
    if (!pattern.test(frequency)) return false;
    
    const type = frequency[0];
    const cycles = parseInt(frequency.substring(1));
    
    if (type === 'D' && (cycles < 1 || cycles > 99)) return false;
    if (type === 'W' && (cycles < 1 || cycles > 6)) return false;
    if (type === 'M' && (cycles < 1 || cycles > 3)) return false;
    
    return true;
  };

  const getWateringFrequencyError = (frequency: string): string => {
    if (!frequency) return 'Watering frequency is required';
    if (!validateWateringFrequency(frequency)) {
      return 'Format: D1-D99 (Daily), W1-W6 (Weekly), M1-M3 (Monthly)';
    }
    return '';
  };

  const validateUSDAZones = (zones: string): boolean => {
    if (!zones) return false;
    const pattern = /^(\d{1,2})(-(\d{1,2}))?$/;
    const match = zones.match(pattern);
    if (!match) return false;
    
    const zone1 = parseInt(match[1]);
    const zone2 = match[3] ? parseInt(match[3]) : null;
    
    if (zone1 < 1 || zone1 > 13) return false;
    if (zone2 && (zone2 < 1 || zone2 > 13 || zone2 <= zone1)) return false;
    
    return true;
  };

  const getUSDAZonesError = (zones: string): string => {
    if (!zones) return 'USDA zones are required';
    if (!validateUSDAZones(zones)) {
      return 'Format: 1-13 or 1-13-1-13 (e.g., "5" or "5-9")';
    }
    return '';
  };

  const validateOptimalWater = (water: number): boolean => {
    return water > 0 && Number.isFinite(water);
  };

  const getOptimalWaterError = (water: number): string => {
    if (!water || water <= 0) return 'Must be greater than 0';
    if (!Number.isFinite(water)) return 'Must be a valid number';
    return '';
  };

  const validateRequiredField = (value: any, fieldName: string): boolean => {
    if (Array.isArray(value)) {
      return value.length === 0;
    }
    return !value || (typeof value === 'string' && value.trim() === '');
  };

  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    
    if (!editablePlant) return errors;

    // Required field validations
    if (validateRequiredField(editablePlant.common_name, 'Common name')) {
      errors.push('Common name is required');
    }
    if (validateRequiredField(editablePlant.preferred_time, 'Preferred time')) {
      errors.push('Preferred time is required');
    }

    // Validate preferred time count based on watering frequency
    if (editablePlant.watering_frequency && editablePlant.preferred_time) {
      const frequency = editablePlant.watering_frequency;
      const preferredTimes = editablePlant.preferred_time.length;
      
      if (frequency.startsWith('D')) {
        // Daily codes require same number of preferred times as the D# value
        const dailyCycles = parseInt(frequency.substring(1));
        if (preferredTimes !== dailyCycles) {
          errors.push(`Daily frequency ${frequency} requires exactly ${dailyCycles} preferred time(s), but ${preferredTimes} provided`);
        }
      } else if (frequency.startsWith('W') || frequency.startsWith('M')) {
        // W and M codes always require exactly 1 preferred time
        if (preferredTimes !== 1) {
          errors.push(`${frequency.startsWith('W') ? 'Weekly' : 'Monthly'} frequency requires exactly 1 preferred time, but ${preferredTimes} provided`);
        }
      }
    }

    if (validateRequiredField(editablePlant.watering_frequency, 'Watering frequency')) {
      errors.push('Watering frequency is required');
    } else {
      const freqError = getWateringFrequencyError(editablePlant.watering_frequency || '');
      if (freqError && freqError !== 'Watering frequency is required') {
        errors.push(freqError);
      }
    }

    if (validateRequiredField(editablePlant.optimal_water_per_week, 'Optimal water per week')) {
      errors.push('Optimal water per week is required');
    } else {
      const waterError = getOptimalWaterError(editablePlant.optimal_water_per_week || 0);
      if (waterError) {
        errors.push(`Optimal water per week: ${waterError}`);
      }
    }

    if (validateRequiredField(editablePlant.root_area, 'Root area')) {
      errors.push('Root area is required');
    }

    // USDA zones validation
    if (editablePlant.usda_zones) {
      const zonesError = getUSDAZonesError(editablePlant.usda_zones || '');
      if (zonesError && zonesError !== 'USDA zones are required') {
        errors.push(zonesError);
      }
    }

    return errors;
  };

  const handleTimeSelection = (field: keyof Plant, timeValue: string) => {
    setEditablePlant(prev => prev ? ({
      ...prev,
      [field]: [...(prev[field] as string[] || []), timeValue]
    }) : null);
    setShowTimePicker(null);
  };

  const removeTimeFromArray = (field: keyof Plant, timeToRemove: string) => {
    setEditablePlant(prev => prev ? ({
      ...prev,
      [field]: (prev[field] as string[] || []).filter(time => time !== timeToRemove)
    }) : null);
  };

  // Helper function to get preferred time limit based on watering frequency
  const getPreferredTimeLimit = (): number => {
    if (!editablePlant || !editablePlant.watering_frequency || editablePlant.watering_frequency.length === 0) {
      return 1; // Default limit
    }
    
    const frequency = editablePlant.watering_frequency;
    if (frequency?.startsWith('D')) {
      return parseInt(frequency.substring(1));
    } else if (frequency?.startsWith('W') || frequency?.startsWith('M')) {
      return 1;
    }
    
    return 1; // Default limit
  };

  // Helper function to check if preferred time limit is reached
  const isPreferredTimeLimitReached = (): boolean => {
    if (!editablePlant || !editablePlant.preferred_time) return false;
    return editablePlant.preferred_time.length >= getPreferredTimeLimit();
  };

  // Helper functions for form display and validation

  if (loading) {
    return (
      <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
        <div
          ref={formRef}
          className="form-container form-container--compact"
          style={getFormLayerStyle(!isAnyFormAbove(formId))}
        >
          <div className="form-flex form-justify-center form-items-center" style={{ minHeight: '200px' }}>
            <div className="form-text-muted">Loading plant data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
        <div
          ref={formRef}
          className="form-container form-container--compact"
          style={getFormLayerStyle(!isAnyFormAbove(formId))}
        >
          <div className="form-flex form-justify-center form-items-center" style={{ minHeight: '200px' }}>
            <div className="form-text-error">Error: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!editablePlant) {
    return (
      <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
        <div
          ref={formRef}
          className="form-container form-container--compact"
          style={getFormLayerStyle(!isAnyFormAbove(formId))}
        >
          <div className="form-flex form-justify-center form-items-center" style={{ minHeight: '200px' }}>
            <div className="form-text-muted">No plant data available</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
      <div
        ref={formRef}
        className="form-container form-container--compact"
        style={getFormLayerStyle(!isAnyFormAbove(formId))}
      >
        {/* Header */}
        <div className="form-header">
          <div className="form-header-content">
            <h2 className="form-title">Plant Details</h2>
            <div className="form-subtitle">
              Library: {library_book} | Plant ID: {plant_id || 'New Entry'}
            </div>
          </div>
          {!isEditing && (
            <button onClick={handleEdit} className="form-btn form-btn--outline form-btn--small">
              Edit
            </button>
          )}
        </div>

        {/* Content */}
        <div className="form-content form-content--scrollable">
          
          {/* Basic Plant Info Section */}
          <div className="form-section">
            <div className="form-section-title">Plant Information</div>
            
            {/* First Row: Name, Alt Name, Scientific Name */}
            <div className="form-field-row">
              <div className="form-field form-field--third">
                <label className="form-label-compact">
                  Name {isEditing && <span className="form-required">*</span>}
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editablePlant.common_name}
                    onChange={(e) => handleInputChange('common_name', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Bartlett Pear"
                  />
                ) : (
                  <div className="form-value">{editablePlant.common_name}</div>
                )}
              </div>
              
              <div className="form-field form-field--third">
                <label className="form-label-compact">
                  Alt. Name
                  <span className="form-help" title="Other common names">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editablePlant.alternative_name || ''}
                    onChange={(e) => handleInputChange('alternative_name', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Williams"
                  />
                ) : (
                  <div className="form-value">{editablePlant.alternative_name || '—'}</div>
                )}
              </div>
              
              <div className="form-field form-field--third">
                <label className="form-label-compact">
                  Scientific
                  <span className="form-help" title="Latin botanical name">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editablePlant.latin_name || ''}
                    onChange={(e) => handleInputChange('latin_name', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Pyrus communis"
                  />
                ) : (
                  <div className="form-value form-value--italic">{editablePlant.latin_name || '—'}</div>
                )}
              </div>
            </div>

            {/* Second Row: Type, USDA Zones */}
            <div className="form-field-row">
              <div className="form-field form-field--half">
                <label className="form-label-compact">
                  Type
                  <span className="form-help" title="Plant category">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editablePlant.plant_type || ''}
                    onChange={(e) => handleInputChange('plant_type', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Fruit Tree"
                  />
                ) : (
                  <div className="form-value">{editablePlant.plant_type || '—'}</div>
                )}
              </div>
              
              <div className="form-field form-field--half">
                <label className="form-label-compact">
                  USDA Zones
                  <span className="form-help" title="Hardiness zones">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editablePlant.usda_zones || ''}
                    onChange={(e) => handleInputChange('usda_zones', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="5-8"
                  />
                ) : (
                  <div className="form-value">{editablePlant.usda_zones || '—'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Watering Requirements Section */}
          <div className="form-section">
            <div className="form-section-title">Watering Requirements</div>
            
            {/* First Row: Frequency, Water/Week, Root Area */}
            <div className="form-field-row">
              <div className="form-field form-field--third">
                <label className="form-label-compact">
                  Frequency {isEditing && <span className="form-required">*</span>}
                  <span className="form-help" title="D1-99, W1-6, M1-3">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editablePlant.watering_frequency || ''}
                    onChange={(e) => handleInputChange('watering_frequency', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="W1"
                  />
                ) : (
                  <div className="form-value">{editablePlant.watering_frequency || '—'}</div>
                )}
              </div>
              
              <div className="form-field form-field--third">
                <label className="form-label-compact">
                  Water/Week {isEditing && <span className="form-required">*</span>}
                  <span className="form-help" title="Inches per week">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={editablePlant.optimal_water_per_week || ''}
                    onChange={(e) => handleInputChange('optimal_water_per_week', parseFloat(e.target.value) || 0)}
                    className="form-input form-input--compact"
                    placeholder="1.5"
                  />
                ) : (
                  <div className="form-value">{editablePlant.optimal_water_per_week}"</div>
                )}
              </div>
              
              <div className="form-field form-field--third">
                <label className="form-label-compact">
                  Root Area {isEditing && <span className="form-required">*</span>}
                  <span className="form-help" title="Square feet">?</span>
                </label>
                {isEditing ? (
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={editablePlant.root_area || ''}
                    onChange={(e) => handleInputChange('root_area', parseFloat(e.target.value) || 0)}
                    className="form-input form-input--compact"
                    placeholder="25"
                  />
                ) : (
                  <div className="form-value">{editablePlant.root_area} ft²</div>
                )}
              </div>
            </div>

            {/* Second Row: Tolerance Range */}
            <div className="form-field-row">
              <div className="form-field">
                <label className="form-label-compact">
                  Tolerance Range (inches/week)
                  <span className="form-help" title="Min/max water tolerance">?</span>
                </label>
                {isEditing ? (
                  <div className="form-flex form-gap-4">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editablePlant.tolerance_min || ''}
                      onChange={(e) => handleInputChange('tolerance_min', parseFloat(e.target.value) || 0)}
                      className="form-input form-input--compact"
                      placeholder="Min"
                      style={{ width: '80px' }}
                    />
                    <span className="form-range-separator">to</span>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editablePlant.tolerance_max || ''}
                      onChange={(e) => handleInputChange('tolerance_max', parseFloat(e.target.value) || 0)}
                      className="form-input form-input--compact"
                      placeholder="Max"
                      style={{ width: '80px' }}
                    />
                    <span className="form-unit">"/week</span>
                  </div>
                ) : (
                  <div className="form-value">{editablePlant.tolerance_min}" - {editablePlant.tolerance_max}" /week</div>
                )}
              </div>
            </div>
          </div>

          {/* Timing Section */}
          <div className="form-section">
            <div className="form-section-title">Watering Times</div>
            
            {/* Preferred Time */}
            <div className="form-field-row">
              <div className="form-field">
                <label className="form-label-compact">
                  Preferred Times {isEditing && <span className="form-required">*</span>}
                  <span className="form-help" title="Best times of day to water this plant">?</span>
                </label>
                {isEditing ? (
                  <div className="form-relative">
                    <input
                      type="text"
                      value={editablePlant.preferred_time?.join(', ') || ''}
                      onClick={() => !isPreferredTimeLimitReached() && setShowTimePicker('preferred_time')}
                      readOnly
                      className="form-input form-input--compact form-cursor-pointer"
                      placeholder="Click to set times"
                    />
                    <TimePicker
                      isVisible={showTimePicker === 'preferred_time'}
                      onTimeSelect={(time) => handleTimeSelection('preferred_time', time)}
                      onCancel={() => setShowTimePicker(null)}
                      initialSolarMode={true}
                    />
                  </div>
                ) : (
                  <div className="form-value">{editablePlant.preferred_time?.join(', ') || '—'}</div>
                )}
              </div>
            </div>

            {/* Compatible Times */}
            <div className="form-field-row">
              <div className="form-field">
                <label className="form-label-compact">
                  Compatible Times
                  <span className="form-help" title="Alternative acceptable watering times">?</span>
                </label>
                {isEditing ? (
                  <div className="form-relative">
                    <input
                      type="text"
                      value={editablePlant.compatible_watering_times?.join(', ') || ''}
                      onClick={() => setShowTimePicker('compatible_watering_times')}
                      readOnly
                      className="form-input form-input--compact form-cursor-pointer"
                      placeholder="Click to set times"
                    />
                    <TimePicker
                      isVisible={showTimePicker === 'compatible_watering_times'}
                      onTimeSelect={(time) => handleTimeSelection('compatible_watering_times', time)}
                      onCancel={() => setShowTimePicker(null)}
                      initialSolarMode={true}
                    />
                  </div>
                ) : (
                  <div className="form-value">{editablePlant.compatible_watering_times?.join(', ') || '—'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Additional Info */}
          {editablePlant.description && (
            <div className="form-section">
              <div className="form-section-title">Description</div>
              <div className="form-field-row">
                <div className="form-field">
                  {isEditing ? (
                    <textarea
                      value={editablePlant.description || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="form-textarea form-textarea--compact"
                      rows={2}
                      placeholder="Plant description and care notes..."
                    />
                  ) : (
                    <div className="form-value">{editablePlant.description}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {isEditing && (
          <div className="form-footer">
            <div className="form-actions">
              <button onClick={handleCancelEdit} className="form-btn form-btn--cancel">
                Cancel
              </button>
              <button onClick={handleSave} className="form-btn form-btn--primary">
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryForm; 