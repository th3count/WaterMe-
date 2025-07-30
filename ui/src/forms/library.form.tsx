import React, { useState, useEffect, useRef } from 'react';
import { getFormLayerStyle, getFormOverlayClassName } from './utils';
import { useFormLayer } from './FormLayerManager';
import { getApiBaseUrl } from '../utils';
import './forms.css';

interface Plant {
  plant_id: number;
  common_name: string;
  alternative_name?: string;
  latin_name?: string;
  description?: string;
  watering_frequency?: string[];
  preferred_time?: string[];
  compatible_watering_times?: string[];
  water_optimal_in_week?: number;
  tolerance_min_in_week?: number;
  tolerance_max_in_week?: number;
  usda_zones?: string;
  root_area_sqft?: number;
  library_book?: string;
  soil_preference?: string;
  sun_exposure?: string;
  fruiting_period?: string;
  planting_time?: string;
  spacing_inches?: number;
  growth_type?: string;
}

interface LibraryFormProps {
  plant_id: number;
  library_book: string;
  onClose: () => void;
}

const LibraryForm: React.FC<LibraryFormProps> = ({
  plant_id,
  library_book,
  onClose
}) => {
  const { isAnyFormAbove, registerForm, unregisterForm, isTopLayer } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);
  const formId = `library-form-${plant_id}-${library_book}`;

  // State for plant data
  const [plant, setPlant] = useState<Plant | null>(null);
  const [editablePlant, setEditablePlant] = useState<Plant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for editing mode
  const [isEditing, setIsEditing] = useState(false);

  // Load plant data
  const loadPlantData = async () => {
    try {
      setLoading(true);
      setError(null);

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
    loadPlantData();
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
      
      // Switch to edit mode
      const newPlant = { ...plantDataToClone, plant_id: result.plant_id, library_book: 'custom' };
      setPlant(newPlant);
      setEditablePlant(newPlant);
      setIsEditing(true);
    } catch (error) {
      console.error('Error cloning plant:', error);
      alert('Failed to clone plant to custom library');
    }
  };

  const handleInputChange = (field: keyof Plant, value: any) => {
    setEditablePlant(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const handleSave = async () => {
    if (!editablePlant) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/library/custom/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editablePlant),
      });

      if (!response.ok) {
        throw new Error('Failed to save plant');
      }

      setIsEditing(false);
      setPlant(editablePlant);
      alert('Plant saved successfully!');
    } catch (error) {
      console.error('Error saving plant:', error);
      alert('Failed to save plant');
    }
  };

  const handleCancelEdit = () => {
    setEditablePlant(plant);
    setIsEditing(false);
  };

  // Render plant details
  const renderPlantDetails = () => {
    const editing = isEditing && editablePlant;
    const displayPlant = editing ? editablePlant : plant;
    
    if (!displayPlant) return null;
    
    return (
      <div className="form-cards-container form-cards-container--3wide">
        {/* Basic Plant Information Card */}
        <div className="form-card">
          <div className="form-card-title">Plant Information</div>
          <div className="form-card-grid">
            <div className="form-data-field">
              <label className="form-data-label">Plant ID</label>
              <div className="form-data-value">{plant_id}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Library Book</label>
              <div className="form-data-value">{library_book.replace('.json', '')}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Common Name</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.common_name}
                  onChange={(e) => handleInputChange('common_name', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.common_name}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Alternative Name</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.alternative_name || ''}
                  onChange={(e) => handleInputChange('alternative_name', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.alternative_name || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Latin Name</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.latin_name || ''}
                  onChange={(e) => handleInputChange('latin_name', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value" style={{ fontStyle: 'italic' }}>{displayPlant.latin_name || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Watering Requirements Card */}
        <div className="form-card">
          <div className="form-card-title">Watering Requirements</div>
          <div className="form-card-grid">
            <div className="form-data-field">
              <label className="form-data-label">Frequency</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.watering_frequency?.join(', ') || ''}
                  onChange={(e) => handleInputChange('watering_frequency', e.target.value.split(',').map(s => s.trim()))}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.watering_frequency?.join(', ') || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Optimal/Week</label>
              {editing ? (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={displayPlant.water_optimal_in_week || ''}
                  onChange={(e) => handleInputChange('water_optimal_in_week', parseFloat(e.target.value) || 0)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.water_optimal_in_week}" /week</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Root Area</label>
              {editing ? (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={displayPlant.root_area_sqft || ''}
                  onChange={(e) => handleInputChange('root_area_sqft', parseFloat(e.target.value) || 0)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.root_area_sqft} ft²</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Preferred Times</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.preferred_time?.join(', ') || ''}
                  onChange={(e) => handleInputChange('preferred_time', e.target.value.split(',').map(s => s.trim()))}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.preferred_time?.join(', ') || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Tolerance Min</label>
              {editing ? (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={displayPlant.tolerance_min_in_week || ''}
                  onChange={(e) => handleInputChange('tolerance_min_in_week', parseFloat(e.target.value) || 0)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.tolerance_min_in_week}" /week</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Tolerance Max</label>
              {editing ? (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={displayPlant.tolerance_max_in_week || ''}
                  onChange={(e) => handleInputChange('tolerance_max_in_week', parseFloat(e.target.value) || 0)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.tolerance_max_in_week}" /week</div>
              )}
            </div>

            <div className="form-data-field form-span-2">
              <label className="form-data-label">Compatible Watering Times</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.compatible_watering_times?.join(', ') || ''}
                  onChange={(e) => handleInputChange('compatible_watering_times', e.target.value.split(',').map(s => s.trim()))}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.compatible_watering_times?.join(', ') || '—'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Growing Conditions Card */}
        <div className="form-card">
          <div className="form-card-title">Growing Conditions</div>
          <div className="form-card-grid">
            <div className="form-data-field">
              <label className="form-data-label">Soil Preference</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.soil_preference || ''}
                  onChange={(e) => handleInputChange('soil_preference', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.soil_preference || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Planting Time</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.planting_time || ''}
                  onChange={(e) => handleInputChange('planting_time', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.planting_time || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Fruiting Period</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.fruiting_period || ''}
                  onChange={(e) => handleInputChange('fruiting_period', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.fruiting_period || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Sun Exposure</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.sun_exposure || ''}
                  onChange={(e) => handleInputChange('sun_exposure', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.sun_exposure || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Growth Type</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.growth_type || ''}
                  onChange={(e) => handleInputChange('growth_type', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.growth_type || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">USDA Zones</label>
              {editing ? (
                <input
                  type="text"
                  value={displayPlant.usda_zones || ''}
                  onChange={(e) => handleInputChange('usda_zones', e.target.value)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.usda_zones || '—'}</div>
              )}
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Spacing (inches)</label>
              {editing ? (
                <input
                  type="number"
                  min="0"
                  value={displayPlant.spacing_inches || ''}
                  onChange={(e) => handleInputChange('spacing_inches', parseInt(e.target.value) || 0)}
                  className="form-data-input"
                />
              ) : (
                <div className="form-data-value">{displayPlant.spacing_inches || '—'}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

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

  if (!plant) {
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
        {/* Content */}
        <div className="form-content form-content--scrollable">
          {renderPlantDetails()}
        </div>

        {/* Footer */}
        <div className="form-footer">
          <div className="form-actions">
            {isEditing ? (
              <>
                <button onClick={handleCancelEdit} className="form-btn form-btn--secondary form-btn--flex">
                  Cancel
                </button>
                <button onClick={handleSave} className="form-btn form-btn--primary form-btn--flex">
                  Save
                </button>
              </>
            ) : (
              <>
                <button onClick={onClose} className="form-btn form-btn--secondary form-btn--flex">
                  Close
                </button>
                <button onClick={handleEdit} className="form-btn form-btn--primary form-btn--flex">
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibraryForm; 