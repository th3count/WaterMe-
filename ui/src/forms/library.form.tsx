/**
 * library.form.tsx - Universal plant viewer/editor for library and garden plants
 * 
 * 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
 * 📖 System Overview: ~/rules/system-overview.md
 * 🏗️ Project Structure: ~/rules/project-structure.md
 * 🎨 Layer System: ~/rules/layer-system.md
 * 🌐 API Patterns: ~/rules/api-patterns.md
 * 🎨 Form System: ~/rules/form-system.md
 * 🎨 CSS Conventions: ~/rules/css-conventions.md
 * 💻 Coding Standards: ~/rules/coding-standards.md
 */

import React, { useState, useEffect, useRef } from 'react';
import { getFormLayerStyle, getFormOverlayClassName, useClickOutside } from './utils';
import { useFormLayer } from '../../../core/useFormLayer';
import { getApiBaseUrl } from '../utils';
import TimePicker from './timepicker.item';
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
  compatible_watering_frequencies?: string[];
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

interface PlantInstance {
  instance_id: string;
  plant_id: number;
  library_book: string;
  common_name: string;
  quantity: number;
  emitter_size: number;
  zone_id: number;
  location_id: number;
  comments: string;
  planted_date: string;
  smart_overrides: {
    zone_selection: string;
    emitter_sizing: string;
  };
}

interface Location {
  location_id: number;
  name: string;
  description?: string;
}

interface LibraryFormProps {
  mode: 'library' | 'garden' | 'edit';
  // For library mode
  plant_id?: number;
  library_book?: string;
  // For garden mode
  instance_id?: string;
  onClose: () => void;
}

const LibraryForm: React.FC<LibraryFormProps> = ({
  mode,
  plant_id,
  library_book,
  instance_id,
  onClose
}) => {
  const { addLayer, removeLayer, isAnyFormAbove, isTopLayer } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);
  const formId = `library-form-${mode}-${instance_id || `${plant_id}-${library_book}`}`;

  // State for plant data
  const [plant, setPlant] = useState<Plant | null>(null);
  const [plantInstance, setPlantInstance] = useState<PlantInstance | null>(null);
  const [instanceLocation, setInstanceLocation] = useState<Location | null>(null);
  const [editablePlant, setEditablePlant] = useState<Plant | null>(null);
  const [editableInstance, setEditableInstance] = useState<PlantInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // State for editing mode
  const [isEditing, setIsEditing] = useState(mode === 'edit');
  const [showTimePicker, setShowTimePicker] = useState<{ field: string; index: number } | null>(null);
  
  // State for save/delete status
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle');
  const [deleteMessage, setDeleteMessage] = useState<string>('');

  // Load data based on mode
  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (mode === 'garden') {
        if (!instance_id) {
          throw new Error('Instance ID is required for garden mode');
        }

        // Load all plant instances and find the specific one
        const allInstancesResponse = await fetch(`${getApiBaseUrl()}/api/map`);
        if (!allInstancesResponse.ok) {
          throw new Error(`Failed to fetch plant instances: ${allInstancesResponse.status}`);
        }
        const allInstances = await allInstancesResponse.json();
        
        // Find the specific instance
        const instanceData = allInstances[instance_id];
        if (!instanceData) {
          throw new Error(`Plant instance ${instance_id} not found`);
        }
        
        // Add the instance_id to the data since it's not stored in the object itself
        instanceData.instance_id = instance_id;
        setPlantInstance(instanceData);

        // Load plant library data using the instance's library info
        const libraryBook = instanceData.library_book.includes('.json') ? instanceData.library_book : `${instanceData.library_book}.json`;
        const plantResponse = await fetch(`${getApiBaseUrl()}/api/library/${libraryBook}/${instanceData.plant_id}`);
        if (!plantResponse.ok) {
          throw new Error(`Failed to fetch plant data: ${plantResponse.status}`);
        }
        const plantData = await plantResponse.json();
        setPlant(plantData);

        // Load location data
        const locationResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
        if (locationResponse.ok) {
          const locationsArray = await locationResponse.json();
          // Find the specific location by location_id
          const locationData = locationsArray.find((loc: any) => loc.location_id === instanceData.location_id);
          if (locationData) {
            setInstanceLocation(locationData);
          }
        }
      } else {
        // Library or edit mode with library data
        if (!plant_id || !library_book) {
          throw new Error('Plant ID and library book are required for library mode');
        }

        const plantResponse = await fetch(`${getApiBaseUrl()}/api/library/${library_book}/${plant_id}`);
        if (!plantResponse.ok) {
          throw new Error(`Failed to fetch plant data: ${plantResponse.status}`);
        }
        const plantData = await plantResponse.json();
        setPlant(plantData);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode, plant_id, library_book, instance_id]);

  // Handle click outside to close form
  useClickOutside(formRef, () => {
    if (isTopLayer && !isAnyFormAbove(formId)) {
      onClose();
    }
  }, isTopLayer && !isAnyFormAbove(formId));

  // Helper functions for managing time arrays
  const addTimeToField = (field: 'preferred_time' | 'compatible_watering_times') => {
    setEditablePlant(prev => {
      if (!prev) return null;
      const currentTimes = prev[field] || [];
      return {
        ...prev,
        [field]: [...currentTimes, 'SUNRISE+30']
      };
    });
  };

  const removeTimeFromField = (field: 'preferred_time' | 'compatible_watering_times', index: number) => {
    setEditablePlant(prev => {
      if (!prev) return null;
      const currentTimes = prev[field] || [];
      return {
        ...prev,
        [field]: currentTimes.filter((_, i) => i !== index)
      };
    });
  };

  const updateTimeInField = (field: 'preferred_time' | 'compatible_watering_times', index: number, newTime: string) => {
    setEditablePlant(prev => {
      if (!prev) return null;
      const currentTimes = [...(prev[field] || [])];
      currentTimes[index] = newTime;
      return {
        ...prev,
        [field]: currentTimes
      };
    });
  };

  const handleEdit = () => {
    if (!plant) return;
    
    const editableData = { 
      ...plant,
      preferred_time: plant.preferred_time && plant.preferred_time.length > 0 ? plant.preferred_time : ['SUNRISE+30'],
      compatible_watering_times: plant.compatible_watering_times && plant.compatible_watering_times.length > 0 ? plant.compatible_watering_times : ['SUNSET-60']
    };
    setEditablePlant(editableData);
    
    if (plantInstance) {
      setEditableInstance({...plantInstance});
    }
    
    setIsEditing(true);
  };

  const handlePlantInputChange = (field: keyof Plant, value: any) => {
    setEditablePlant(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const handleInstanceInputChange = (field: keyof PlantInstance, value: any) => {
    setEditableInstance(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  const reorderPlantData = (plantData: Plant): Plant => {
    const {
      plant_id,
      common_name,
      alternative_name,
      latin_name,
      description,
      watering_frequency,
      preferred_time,
      compatible_watering_times,
      compatible_watering_frequencies,
      water_optimal_in_week,
      tolerance_min_in_week,
      tolerance_max_in_week,
      usda_zones,
      root_area_sqft,
      soil_preference,
      sun_exposure,
      fruiting_period,
      planting_time,
      spacing_inches,
      growth_type,
      ...rest
    } = plantData;

    return {
      plant_id,
      common_name,
      alternative_name,
      latin_name,
      description,
      watering_frequency,
      preferred_time,
      compatible_watering_times,
      compatible_watering_frequencies,
      water_optimal_in_week,
      tolerance_min_in_week,
      tolerance_max_in_week,
      usda_zones,
      root_area_sqft,
      soil_preference,
      sun_exposure,
      fruiting_period,
      planting_time,
      spacing_inches,
      growth_type,
      ...rest
    };
  };

  const handleSave = async () => {
    if (!editablePlant && !editableInstance) return;
    
    try {
      setSaveStatus('saving');
      setSaveMessage('Saving changes...');
      
      if (editableInstance && instance_id) {
        // Save instance changes using the new update endpoint
        const updateData = {
          quantity: editableInstance.quantity,
          emitter_size: editableInstance.emitter_size,
          zone_id: editableInstance.zone_id,
          location_id: editableInstance.location_id,
          comments: editableInstance.comments
        };
        
        const response = await fetch(`${getApiBaseUrl()}/api/map/${instance_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save instance changes');
        }
        
        setSaveStatus('success');
        setSaveMessage('Instance updated successfully!');
        
        // Update the current instance data
        setPlantInstance(editableInstance);
      } else if (editablePlant) {
        // Save plant changes to library
        let response;
        let newPlantId: number | undefined;
        
        if (library_book === 'custom.json') {
          // Update existing plant in custom.json
          const reorderedPlant = reorderPlantData(editablePlant);
          response = await fetch(`${getApiBaseUrl()}/api/library/custom/update/${plant_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reorderedPlant)
          });
        } else {
          // Add new plant to custom.json
          const reorderedPlant = reorderPlantData(editablePlant);
          response = await fetch(`${getApiBaseUrl()}/api/library/custom/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reorderedPlant)
          });
        }
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to save plant data');
        }
        
        const result = await response.json();
        newPlantId = result.plant_id;
        
        setSaveStatus('success');
        setSaveMessage(library_book === 'custom.json' ? 'Plant updated successfully!' : 'Plant added to custom library!');
        
        // Update the current plant data
        setPlant(editablePlant);
      }
      
      // Auto-hide success message and exit edit mode after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
        setIsEditing(false);
        setEditablePlant(null);
        setEditableInstance(null);
      }, 2000);
      
    } catch (err) {
      console.error('Error saving:', err);
      setSaveStatus('error');
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save changes');
      
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 4000);
    }
  };

  const handleCancelEdit = () => {
    setEditablePlant(null);
    setEditableInstance(null);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!plant || library_book !== 'custom.json') return;
    
    if (!confirm(`Are you sure you want to delete "${plant.common_name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      setDeleteStatus('deleting');
      setDeleteMessage('Deleting plant...');
      
      const response = await fetch(`${getApiBaseUrl()}/api/library/custom/delete/${plant_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete plant');
      }
      
      setDeleteStatus('success');
      setDeleteMessage('Plant deleted successfully!');
      
      setTimeout(() => {
        onClose();
      }, 2000);
      
    } catch (err) {
      console.error('Error deleting plant:', err);
      setDeleteStatus('error');
      setDeleteMessage(err instanceof Error ? err.message : 'Failed to delete plant');
      
      setTimeout(() => {
        setDeleteStatus('idle');
        setDeleteMessage('');
      }, 4000);
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
        <div className="form-container form-container--small">
          <div className="form-loading">Loading plant information...</div>
        </div>
      </div>
    );
  }

  // Render error state
  if (error || !plant) {
    return (
      <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
        <div className="form-container form-container--small">
          <div className="form-alert form-alert--error">
            <span>⚠️</span>
            <span>Error Loading Plant Data</span>
          </div>
          <div className="form-mb-16">{error || 'Plant data not found'}</div>
          <button onClick={onClose} className="form-btn form-btn--primary">
            Close
          </button>
        </div>
      </div>
    );
  }

  const displayPlant = isEditing && editablePlant ? editablePlant : plant;
  const displayInstance = isEditing && editableInstance ? editableInstance : plantInstance;

  return (
    <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
      <div 
        ref={formRef}
        className="form-container form-container--large"
        data-modal="true"
        style={{
          minWidth: '800px',
          maxWidth: '900px',
          minHeight: '600px',
          maxHeight: '80vh'
        }}
      >
        <div className="form-scrollable-content">
          {/* Header */}
          <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-20">
            <h2 className="form-header form-header--h2">
              {mode === 'garden' ? `Garden Plant: ${displayPlant.common_name}` : 
               mode === 'edit' ? `Edit: ${displayPlant.common_name}` :
               `Library: ${displayPlant.common_name}`}
            </h2>
            <div className="form-flex form-gap-8 form-items-center">
              {/* Edit/View Toggle - Show for all modes */}
              <div className="form-flex form-gap-8 form-items-center">
                <span className={`form-toggle-label ${!isEditing ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                  View
                </span>
                <div 
                  className="form-toggle"
                  onClick={() => {
                    if (isEditing) {
                      handleCancelEdit();
                    } else {
                      handleEdit();
                    }
                  }}
                >
                  <div className={`form-toggle-handle ${isEditing ? 'form-toggle-handle--active' : 'form-toggle-handle--inactive'}`} />
                </div>
                <span className={`form-toggle-label ${isEditing ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                  Edit
                </span>
              </div>
              <button
                onClick={onClose}
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
          </div>

          {/* Garden Instance Information - Only for garden mode */}
          {mode === 'garden' && displayInstance && (
            <div className="form-section">
              <div className="form-section-title">
                <span>🏡</span>
                Garden Instance Information:
              </div>
              <div className="form-card-grid form-card-grid--2col">
                <div className="form-data-field">
                  <div className="form-data-label">Instance ID:</div>
                  <div className="form-data-value">{displayInstance.instance_id}</div>
                </div>
                <div className="form-data-field">
                  <div className="form-data-label">Location:</div>
                  <div className="form-data-value">{instanceLocation?.name || 'Unknown'}</div>
                </div>
                <div className="form-data-field">
                  <div className="form-data-label">Zone:</div>
                  <div className="form-data-value">Zone {displayInstance.zone_id}</div>
                </div>
                <div className="form-data-field">
                  <div className="form-data-label">Quantity:</div>
                  {isEditing ? (
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={displayInstance.quantity}
                      onChange={(e) => handleInstanceInputChange('quantity', parseInt(e.target.value))}
                      className="form-input form-input--compact"
                    />
                  ) : (
                    <div className="form-data-value">{displayInstance.quantity}</div>
                  )}
                </div>
                <div className="form-data-field">
                  <div className="form-data-label">Emitter Size:</div>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.1"
                      value={displayInstance.emitter_size}
                      onChange={(e) => handleInstanceInputChange('emitter_size', parseFloat(e.target.value))}
                      className="form-input form-input--compact"
                    />
                  ) : (
                    <div className="form-data-value">{displayInstance.emitter_size} GPH</div>
                  )}
                </div>
                <div className="form-data-field form-span-2">
                  <div className="form-data-label">Comments:</div>
                  {isEditing ? (
                    <input
                      type="text"
                      value={displayInstance.comments || ''}
                      onChange={(e) => handleInstanceInputChange('comments', e.target.value)}
                      className="form-input form-input--compact"
                      placeholder="Optional comments..."
                    />
                  ) : (
                    <div className="form-data-value">{displayInstance.comments || '—'}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Plant Information */}
          <div className="form-section">
            <div className="form-section-title">
              <span>🌱</span>
              Plant Information:
            </div>
            <div className="form-card-grid form-card-grid--2col">
              <div className="form-data-field">
                <div className="form-data-label">Common Name:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.common_name}
                    onChange={(e) => handlePlantInputChange('common_name', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Common name"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.common_name}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Alternative Name:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.alternative_name || ''}
                    onChange={(e) => handlePlantInputChange('alternative_name', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Alternative name"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.alternative_name || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Latin Name:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.latin_name || ''}
                    onChange={(e) => handlePlantInputChange('latin_name', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Latin name"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.latin_name || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Library:</div>
                <div className="form-data-value">{library_book?.replace('.json', '') || displayInstance?.library_book?.replace('.json', '') || '—'}</div>
              </div>
              <div className="form-data-field form-span-2">
                <div className="form-data-label">Description:</div>
                {isEditing ? (
                  <textarea
                    value={displayPlant.description || ''}
                    onChange={(e) => handlePlantInputChange('description', e.target.value)}
                    className="form-textarea form-textarea--compact"
                    placeholder="Plant description"
                    rows={2}
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.description || '—'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Watering Requirements */}
          <div className="form-section">
            <div className="form-section-title">
              <span>💧</span>
              Watering Requirements:
            </div>
            <div className="form-card-grid form-card-grid--2col">
              <div className="form-data-field">
                <div className="form-data-label">Frequency:</div>
                <div className="form-data-value">
                  {displayPlant.watering_frequency?.join(', ') || '—'}
                </div>
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Compatible Frequencies:</div>
                <div className="form-data-value">
                  {displayPlant.compatible_watering_frequencies?.join(', ') || '—'}
                </div>
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Preferred Times:</div>
                <div className="form-flex form-flex-column form-gap-4">
                  {isEditing ? (
                    <>
                      {(displayPlant.preferred_time || []).map((time, index) => (
                        <div key={index} className="form-flex form-gap-8 form-items-center">
                          <input
                            type="text"
                            value={time}
                            onChange={(e) => updateTimeInField('preferred_time', index, e.target.value)}
                            className="form-input form-input--compact"
                            placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                          />
                          <button
                            type="button"
                            onClick={() => removeTimeFromField('preferred_time', index)}
                            className="form-btn form-btn--danger form-btn--small"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTimeToField('preferred_time')}
                        className="form-btn form-btn--outline form-btn--small"
                      >
                        + Add Time
                      </button>
                    </>
                  ) : (
                    <div className="form-data-value">
                      {displayPlant.preferred_time?.join(', ') || '—'}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Compatible Times:</div>
                <div className="form-flex form-flex-column form-gap-4">
                  {isEditing ? (
                    <>
                      {(displayPlant.compatible_watering_times || []).map((time, index) => (
                        <div key={index} className="form-flex form-gap-8 form-items-center">
                          <input
                            type="text"
                            value={time}
                            onChange={(e) => updateTimeInField('compatible_watering_times', index, e.target.value)}
                            className="form-input form-input--compact"
                            placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                          />
                          <button
                            type="button"
                            onClick={() => removeTimeFromField('compatible_watering_times', index)}
                            className="form-btn form-btn--danger form-btn--small"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTimeToField('compatible_watering_times')}
                        className="form-btn form-btn--outline form-btn--small"
                      >
                        + Add Time
                      </button>
                    </>
                  ) : (
                    <div className="form-data-value">
                      {displayPlant.compatible_watering_times?.join(', ') || '—'}
                    </div>
                  )}
                </div>
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Optimal (min/week):</div>
                {isEditing ? (
                  <input
                    type="number"
                    min="0"
                    max="1440"
                    value={displayPlant.water_optimal_in_week || ''}
                    onChange={(e) => handlePlantInputChange('water_optimal_in_week', parseInt(e.target.value))}
                    className="form-input form-input--compact"
                    placeholder="Minutes per week"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.water_optimal_in_week || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Tolerance Range:</div>
                {isEditing ? (
                  <div className="form-flex form-gap-8 form-items-center">
                    <input
                      type="number"
                      min="0"
                      max="1440"
                      value={displayPlant.tolerance_min_in_week || ''}
                      onChange={(e) => handlePlantInputChange('tolerance_min_in_week', parseInt(e.target.value))}
                      className="form-input form-input--compact"
                      placeholder="Min"
                    />
                    <span className="form-range-separator">—</span>
                    <input
                      type="number"
                      min="0"
                      max="1440"
                      value={displayPlant.tolerance_max_in_week || ''}
                      onChange={(e) => handlePlantInputChange('tolerance_max_in_week', parseInt(e.target.value))}
                      className="form-input form-input--compact"
                      placeholder="Max"
                    />
                  </div>
                ) : (
                  <div className="form-data-value">
                    {displayPlant.tolerance_min_in_week && displayPlant.tolerance_max_in_week
                      ? `${displayPlant.tolerance_min_in_week} - ${displayPlant.tolerance_max_in_week}`
                      : '—'}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Growing Conditions */}
          <div className="form-section">
            <div className="form-section-title">
              <span>🌿</span>
              Growing Conditions:
            </div>
            <div className="form-card-grid form-card-grid--2col">
              <div className="form-data-field">
                <div className="form-data-label">USDA Zones:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.usda_zones || ''}
                    onChange={(e) => handlePlantInputChange('usda_zones', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="e.g., 5-9"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.usda_zones || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Soil Preference:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.soil_preference || ''}
                    onChange={(e) => handlePlantInputChange('soil_preference', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Soil type"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.soil_preference || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Sun Exposure:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.sun_exposure || ''}
                    onChange={(e) => handlePlantInputChange('sun_exposure', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Sun requirements"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.sun_exposure || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Root Area (sq ft):</div>
                {isEditing ? (
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={displayPlant.root_area_sqft || ''}
                    onChange={(e) => handlePlantInputChange('root_area_sqft', parseFloat(e.target.value))}
                    className="form-input form-input--compact"
                    placeholder="Square feet"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.root_area_sqft || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Spacing (inches):</div>
                {isEditing ? (
                  <input
                    type="number"
                    min="0"
                    value={displayPlant.spacing_inches || ''}
                    onChange={(e) => handlePlantInputChange('spacing_inches', parseInt(e.target.value))}
                    className="form-input form-input--compact"
                    placeholder="Inches"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.spacing_inches || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Growth Type:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.growth_type || ''}
                    onChange={(e) => handlePlantInputChange('growth_type', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Growth habit"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.growth_type || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Fruiting Period:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.fruiting_period || ''}
                    onChange={(e) => handlePlantInputChange('fruiting_period', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Fruiting season"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.fruiting_period || '—'}</div>
                )}
              </div>
              <div className="form-data-field">
                <div className="form-data-label">Planting Time:</div>
                {isEditing ? (
                  <input
                    type="text"
                    value={displayPlant.planting_time || ''}
                    onChange={(e) => handlePlantInputChange('planting_time', e.target.value)}
                    className="form-input form-input--compact"
                    placeholder="Best planting time"
                  />
                ) : (
                  <div className="form-data-value">{displayPlant.planting_time || '—'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Status Messages */}
          {saveStatus === 'saving' && (
            <div className="form-alert form-alert--warning">
              <span>⏳</span>
              {saveMessage}
            </div>
          )}
          
          {saveStatus === 'success' && (
            <div className="form-alert form-alert--success">
              <span>✅</span>
              {saveMessage}
            </div>
          )}
          
          {saveStatus === 'error' && (
            <div className="form-alert form-alert--error">
              <span>❌</span>
              {saveMessage}
            </div>
          )}

          {deleteStatus === 'deleting' && (
            <div className="form-alert form-alert--warning">
              <span>⏳</span>
              {deleteMessage}
            </div>
          )}
          
          {deleteStatus === 'success' && (
            <div className="form-alert form-alert--success">
              <span>✅</span>
              {deleteMessage}
            </div>
          )}
          
          {deleteStatus === 'error' && (
            <div className="form-alert form-alert--error">
              <span>❌</span>
              {deleteMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="form-actions form-actions--end">
            {isEditing ? (
              <>
                <button
                  onClick={handleCancelEdit}
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
                  {saveStatus === 'saving' ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                {library_book === 'custom.json' && mode !== 'garden' && (
                  <button
                    onClick={handleDelete}
                    disabled={deleteStatus === 'deleting'}
                    className="form-btn form-btn--danger form-btn--flex"
                  >
                    {deleteStatus === 'deleting' ? 'Deleting...' : 'Delete Plant'}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="form-btn form-btn--primary form-btn--flex"
                >
                  Close
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