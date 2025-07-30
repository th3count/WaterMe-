import React, { useState, useEffect, useRef } from 'react';
import { getFormLayerStyle, getFormOverlayClassName, useClickOutside } from './utils';
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
  const [currentCard, setCurrentCard] = useState(0); // 0: Plant Info, 1: Watering, 2: Growing Conditions
  
  // State for timepicker functionality
  const [showTimePicker, setShowTimePicker] = useState<{ field: string; index: number } | null>(null);
  const [solarMode, setSolarMode] = useState(false);
  const [selectedSolarTime, setSelectedSolarTime] = useState<string | null>(null);
  
  // State for save/delete status messages
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'deleting' | 'success' | 'error'>('idle');
  const [deleteMessage, setDeleteMessage] = useState<string>('');
  
  // Refs for click outside detection
  const timePickerRef = useRef<HTMLDivElement>(null);

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
      // Don't set editablePlant here - it should only be set when entering edit mode
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

  // Debug state changes
  useEffect(() => {
    console.log('🔵 State changed - isEditing:', isEditing, 'editablePlant:', editablePlant);
  }, [isEditing, editablePlant]);

  // Handle click outside to close form (only when it's the top layer)
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      // Don't close the form if the timepicker modal is showing and the click is inside it
      if (showTimePicker && timePickerRef.current && timePickerRef.current.contains(event.target as Node)) {
        return;
      }
      
      if (isTopLayer && formRef.current && !formRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isTopLayer, onClose, showTimePicker]);

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

  // Click outside handler for timepicker - DISABLED (using modal overlay click instead)
  // useClickOutside(timePickerRef, () => {
  //   if (showTimePicker !== null) {
  //     setShowTimePicker(null);
  //     setSolarMode(false);
  //     setSelectedSolarTime(null);
  //   }
  // }, showTimePicker !== null);

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
    
    console.log('🔵 Edit button clicked, plant:', plant);
    // Simply copy the current plant data for editing
    const editableData = { 
      ...plant,
      // Initialize time arrays with at least one empty slot if they don't exist
      preferred_time: plant.preferred_time && plant.preferred_time.length > 0 ? plant.preferred_time : ['SUNRISE+30'],
      compatible_watering_times: plant.compatible_watering_times && plant.compatible_watering_times.length > 0 ? plant.compatible_watering_times : ['SUNSET-60']
    };
    setEditablePlant(editableData);
    setIsEditing(true);
    setCurrentCard(0); // Start with first card
    console.log('🔵 Set isEditing to true, editablePlant set to:', editableData);
  };

  const handleInputChange = (field: keyof Plant, value: any) => {
    setEditablePlant(prev => prev ? ({ ...prev, [field]: value }) : null);
  };

  // Helper function to reorder plant data to match fruitbushes.json structure
  const reorderPlantData = (plantData: Plant): Plant => {
    return {
      plant_id: plantData.plant_id,
      common_name: plantData.common_name,
      alternative_name: plantData.alternative_name || "",
      latin_name: plantData.latin_name || "",
      watering_frequency: plantData.watering_frequency || [],
      compatible_watering_frequencies: plantData.compatible_watering_frequencies || [],
      preferred_time: plantData.preferred_time || [],
      compatible_watering_times: plantData.compatible_watering_times || [],
      root_area_sqft: plantData.root_area_sqft,
      water_optimal_in_week: plantData.water_optimal_in_week,
      tolerance_min_in_week: plantData.tolerance_min_in_week,
      tolerance_max_in_week: plantData.tolerance_max_in_week,
      usda_zones: plantData.usda_zones || "",
      soil_preference: plantData.soil_preference || "",
      sun_exposure: plantData.sun_exposure || "",
      fruiting_period: plantData.fruiting_period || "",
      planting_time: plantData.planting_time || "",
      spacing_inches: plantData.spacing_inches,
      growth_type: plantData.growth_type || ""
    };
  };

  const handleSave = async () => {
    if (!editablePlant) return;
    
    try {
      setSaveStatus('saving');
      setSaveMessage('Saving plant...');
      
      let response;
      let newPlantId: number | undefined;
      
      if (library_book === 'custom.json') {
        // Update existing plant in custom.json
        const reorderedPlant = reorderPlantData(editablePlant);
        response = await fetch(`${getApiBaseUrl()}/api/library/custom/update/${plant_id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reorderedPlant)
        });
      } else {
        // Add new plant to custom.json with next available plant_id
        const reorderedPlant = reorderPlantData(editablePlant);
        response = await fetch(`${getApiBaseUrl()}/api/library/custom/add`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(reorderedPlant)
        });
        
        if (response.ok) {
          const result = await response.json();
          newPlantId = result.plant_id;
        }
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save plant');
      }
      
      // Update local state
      if (newPlantId) {
        // If we added a new plant, update the plant_id and library_book
        const updatedPlant = reorderPlantData({ ...editablePlant, plant_id: newPlantId, library_book: 'custom.json' });
        setPlant(updatedPlant);
      } else {
        // If we updated an existing plant, just update the local state
        const updatedPlant = reorderPlantData(editablePlant);
        setPlant(updatedPlant);
      }
      
      setSaveStatus('success');
      setSaveMessage(library_book === 'custom.json' ? 'Plant updated successfully!' : 'Plant added to custom library successfully!');
      
      // Auto-hide success message and close form after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
        setIsEditing(false);
        setEditablePlant(null);
        setCurrentCard(0);
        
        // Close the form after the success message is shown
        if (newPlantId) {
          onClose();
        }
      }, 2000);
      
    } catch (error) {
      console.error('Error saving plant:', error);
      setSaveStatus('error');
      setSaveMessage(error instanceof Error ? error.message : 'Failed to save plant');
      
      // Auto-hide error message after 4 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 4000);
    }
  };

  const handleCancelEdit = () => {
    setEditablePlant(plant);
    setIsEditing(false);
    setCurrentCard(0); // Reset to first card
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
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete plant');
      }
      
      setDeleteStatus('success');
      setDeleteMessage('Plant deleted successfully!');
      
      // Auto-hide success message and close form after 2 seconds
      setTimeout(() => {
        setDeleteStatus('idle');
        setDeleteMessage('');
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error('Error deleting plant:', error);
      setDeleteStatus('error');
      setDeleteMessage(error instanceof Error ? error.message : 'Failed to delete plant');
      
      // Auto-hide error message after 4 seconds
      setTimeout(() => {
        setDeleteStatus('idle');
        setDeleteMessage('');
      }, 4000);
    }
  };

  const handleNextCard = () => {
    setCurrentCard(prev => Math.min(prev + 1, 2));
  };

  const handlePrevCard = () => {
    setCurrentCard(prev => Math.max(prev - 1, 0));
  };

  // Render plant details
  const renderPlantDetails = () => {
    const editing = isEditing && !!editablePlant;
    const displayPlant = editing ? editablePlant : plant;
    
    console.log('🔵 renderPlantDetails - isEditing:', isEditing, 'editablePlant:', editablePlant, 'editing:', editing, 'displayPlant:', displayPlant);
    
    if (!displayPlant) return null;

    // If not editing, show all cards side by side
    if (!editing) {
      return (
        <div className="form-cards-container form-cards-container--3wide" style={{ display: 'flex', flexDirection: 'row', gap: '20px', width: '100%', justifyContent: 'space-between' }}>
          {/* Basic Plant Information Card */}
          <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
            <div className="form-section-title">Plant Information</div>
            <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div className="form-data-field">
                <label className="form-data-label">Plant ID</label>
                <div className="form-data-value">{plant_id}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Library Book</label>
                <div className="form-data-value">{library_book.replace('.json', '')}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label form-data-label--required">Common Name *</label>
                <div className="form-data-value">{displayPlant.common_name}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Alternative Name</label>
                <div className="form-data-value">{displayPlant.alternative_name || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Latin Name</label>
                <div className="form-data-value" style={{ fontStyle: 'italic' }}>{displayPlant.latin_name || '—'}</div>
              </div>
            </div>
          </div>

          {/* Watering Requirements Card */}
          <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
            <div className="form-section-title">Watering Requirements</div>
            <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div className="form-data-field">
                <label className="form-data-label form-data-label--required">Frequency *</label>
                <div className="form-data-value">{displayPlant.watering_frequency?.join(', ') || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label form-data-label--required">Optimal/Week *</label>
                <div className="form-data-value">{displayPlant.water_optimal_in_week}" /week</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label form-data-label--required">Preferred Times *</label>
                <div className="form-data-value">{displayPlant.preferred_time?.join(', ') || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Tolerance Min</label>
                <div className="form-data-value">{displayPlant.tolerance_min_in_week || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Tolerance Max</label>
                <div className="form-data-value">{displayPlant.tolerance_max_in_week || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Compatible Watering Times</label>
                <div className="form-data-value">{displayPlant.compatible_watering_times?.join(', ') || '—'}</div>
              </div>
            </div>
          </div>

          {/* Growing Conditions Card */}
          <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
            <div className="form-section-title">Growing Conditions</div>
            <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
              <div className="form-data-field">
                <label className="form-data-label">Soil Preference</label>
                <div className="form-data-value">{displayPlant.soil_preference || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Planting Time</label>
                <div className="form-data-value">{displayPlant.planting_time || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Sun Exposure</label>
                <div className="form-data-value">{displayPlant.sun_exposure || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Growth Type</label>
                <div className="form-data-value">{displayPlant.growth_type || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label form-data-label--required">Root Area (sqft) *</label>
                <div className="form-data-value">{displayPlant.root_area_sqft || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">USDA Zones</label>
                <div className="form-data-value">{displayPlant.usda_zones || '—'}</div>
              </div>

              <div className="form-data-field">
                <label className="form-data-label">Spacing (inches)</label>
                <div className="form-data-value">{displayPlant.spacing_inches || '—'}</div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // If editing, show one card at a time with navigation
    const cardTitles = ['Plant Information', 'Watering Requirements', 'Growing Conditions'];
    const currentTitle = cardTitles[currentCard];

            return (
              <div style={{ 
          display: 'flex', 
          justifyContent: 'center',
          width: '100%',
          marginTop: isEditing ? '0' : '0',
          position: 'relative',
          zIndex: 1
        }}>
          <div className="form-card" style={{ 
            width: '100%', 
            maxWidth: '600px',
            borderTop: isEditing ? '1px solid var(--form-border-secondary)' : 'none',
            borderTopLeftRadius: '8px',
            borderTopRightRadius: '8px',
            borderBottomLeftRadius: '8px',
            borderBottomRightRadius: '8px',
            borderRadius: '8px',
            marginTop: '0'
          }}>
          <div className="form-section-title">
            {currentTitle}
          </div>
          <div className="form-card-grid" style={{ 
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            padding: '16px 0',
            maxWidth: '500px',
            margin: '0 auto',
            minHeight: '300px'
          }}>
            {currentCard === 0 && (
              <>
                <div className="form-data-field">
                  <label className="form-data-label">Plant ID</label>
                  <div className="form-data-value">{plant_id}</div>
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Library Book</label>
                  <div className="form-data-value">{library_book.replace('.json', '')}</div>
                </div>

                <div className="form-data-field">
                  <label className="form-data-label form-data-label--required">Common Name *</label>
                  <input
                    type="text"
                    value={displayPlant.common_name}
                    onChange={(e) => handleInputChange('common_name', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Alternative Name</label>
                  <input
                    type="text"
                    value={displayPlant.alternative_name || ''}
                    onChange={(e) => handleInputChange('alternative_name', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Latin Name</label>
                  <input
                    type="text"
                    value={displayPlant.latin_name || ''}
                    onChange={(e) => handleInputChange('latin_name', e.target.value)}
                    className="form-data-input"
                  />
                </div>
              </>
            )}

            {currentCard === 1 && (
              <>
                {/* Left Column - Frequency and Time Fields */}
                <div className="form-data-field">
                  <label className="form-data-label form-data-label--required">Frequency *</label>
                  <input
                    type="text"
                    value={displayPlant.watering_frequency?.join(', ') || ''}
                    onChange={(e) => handleInputChange('watering_frequency', e.target.value.split(',').map(s => s.trim()))}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label form-data-label--required">Preferred Times *</label>
                  <div className="form-flex form-flex-column form-gap-4">
                    {(displayPlant.preferred_time || []).map((time, index) => (
                      <div key={index} className="form-relative">
                        <input
                          type="text"
                          placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                          value={time || ''}
                          onFocus={() => setShowTimePicker({ field: 'preferred_time', index })}
                          readOnly
                          className="form-input form-input--full-width form-font-mono form-cursor-pointer"
                        />
                      </div>
                    ))}
                    <div className="form-flex form-gap-8 form-justify-start">
                      <button
                        onClick={() => addTimeToField('preferred_time')}
                        className="form-btn form-btn--outline form-btn--small"
                        type="button"
                      >
                        + Add Time
                      </button>
                      {(displayPlant.preferred_time?.length || 0) > 0 && (
                        <button
                          onClick={() => removeTimeFromField('preferred_time', (displayPlant.preferred_time?.length || 1) - 1)}
                          className="form-btn form-btn--outline form-btn--small"
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Compatible Watering Frequencies</label>
                  <input
                    type="text"
                    value={displayPlant.compatible_watering_frequencies?.join(', ') || ''}
                    onChange={(e) => handleInputChange('compatible_watering_frequencies', e.target.value.split(',').map(s => s.trim()))}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Compatible Watering Times</label>
                  <div className="form-flex form-flex-column form-gap-4">
                    {(displayPlant.compatible_watering_times || []).map((time, index) => (
                      <div key={index} className="form-relative">
                        <input
                          type="text"
                          placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                          value={time || ''}
                          onFocus={() => setShowTimePicker({ field: 'compatible_watering_times', index })}
                          readOnly
                          className="form-input form-input--full-width form-font-mono form-cursor-pointer"
                        />
                      </div>
                    ))}
                    <div className="form-flex form-gap-8 form-justify-start">
                      <button
                        onClick={() => addTimeToField('compatible_watering_times')}
                        className="form-btn form-btn--outline form-btn--small"
                        type="button"
                      >
                        + Add Time
                      </button>
                      {(displayPlant.compatible_watering_times?.length || 0) > 0 && (
                        <button
                          onClick={() => removeTimeFromField('compatible_watering_times', (displayPlant.compatible_watering_times?.length || 1) - 1)}
                          className="form-btn form-btn--outline form-btn--small"
                          type="button"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="form-data-field">
                  <label className="form-data-label form-data-label--required">Optimal (inches/week) *</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={displayPlant.water_optimal_in_week ? String(displayPlant.water_optimal_in_week) : ''}
                    onChange={(e) => handleInputChange('water_optimal_in_week', parseFloat(e.target.value) || 0)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Tolerance Min (inches/week)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={displayPlant.tolerance_min_in_week ? String(displayPlant.tolerance_min_in_week) : ''}
                    onChange={(e) => handleInputChange('tolerance_min_in_week', parseFloat(e.target.value) || 0)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Tolerance Max (inches/week)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={displayPlant.tolerance_max_in_week ? String(displayPlant.tolerance_max_in_week) : ''}
                    onChange={(e) => handleInputChange('tolerance_max_in_week', parseFloat(e.target.value) || 0)}
                    className="form-data-input"
                  />
                </div>
              </>
            )}

            {/* Time picker moved to proper modal overlay at end of component */}

            {currentCard === 2 && (
              <>
                <div className="form-data-field">
                  <label className="form-data-label">Soil Preference</label>
                  <input
                    type="text"
                    value={displayPlant.soil_preference || ''}
                    onChange={(e) => handleInputChange('soil_preference', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Planting Time</label>
                  <input
                    type="text"
                    value={displayPlant.planting_time || ''}
                    onChange={(e) => handleInputChange('planting_time', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Sun Exposure</label>
                  <input
                    type="text"
                    value={displayPlant.sun_exposure || ''}
                    onChange={(e) => handleInputChange('sun_exposure', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Growth Type</label>
                  <input
                    type="text"
                    value={displayPlant.growth_type || ''}
                    onChange={(e) => handleInputChange('growth_type', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">USDA Zones</label>
                  <input
                    type="text"
                    value={displayPlant.usda_zones || ''}
                    onChange={(e) => handleInputChange('usda_zones', e.target.value)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label form-data-label--required">Root Area (sqft) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={displayPlant.root_area_sqft ? String(displayPlant.root_area_sqft) : ''}
                    onChange={(e) => handleInputChange('root_area_sqft', parseFloat(e.target.value) || 0)}
                    className="form-data-input"
                  />
                </div>

                <div className="form-data-field">
                  <label className="form-data-label">Spacing (inches)</label>
                  <input
                    type="number"
                    min="0"
                    value={displayPlant.spacing_inches ? String(displayPlant.spacing_inches) : ''}
                    onChange={(e) => handleInputChange('spacing_inches', parseInt(e.target.value) || 0)}
                    className="form-data-input"
                  />
                </div>
              </>
            )}
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
        className="form-container"
        style={{
          ...getFormLayerStyle(!isAnyFormAbove(formId)),
          minWidth: '900px',
          maxWidth: '1200px'
        }}
      >
        {/* Tab Navigation - Only show in edit mode */}
        {isEditing && (
          <div className="form-flex form-justify-center form-items-center" style={{ 
            marginBottom: '0',
            padding: '0 24px',
            position: 'relative',
            zIndex: 2
          }}>
            <div className="form-flex form-justify-center form-items-center" style={{ 
              maxWidth: '600px',
              width: '100%'
            }}>
              {['Plant Information', 'Watering Requirements', 'Growing Conditions'].map((title, index) => (
                <React.Fragment key={index}>
                  <button
                    onClick={() => setCurrentCard(index)}
                    className={`form-btn form-btn--small ${
                      currentCard === index 
                        ? 'form-btn--primary' 
                        : 'form-btn--outline'
                    }`}
                    style={{ 
                      minWidth: '140px',
                      height: '32px',
                      borderBottom: '1px solid var(--form-border-primary)',
                      marginBottom: '0',
                      marginRight: index < 2 ? '8px' : '0',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {title}
                  </button>

                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="form-content form-content--scrollable" style={{ 
          paddingTop: isEditing ? '8px' : '0'
        }}>
          {renderPlantDetails()}
        </div>

        {/* Status Messages */}
        {(saveStatus !== 'idle' || deleteStatus !== 'idle') && (
          <>
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
          </>
        )}

        {/* Footer */}
        <div className="form-footer">
          <div className="form-actions">
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
                  {saveStatus === 'saving' ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <>
                {library_book === 'custom.json' && (
                  <button 
                    onClick={handleDelete} 
                    disabled={deleteStatus === 'deleting'}
                    className="form-btn form-btn--danger form-btn--flex"
                    style={{ marginRight: 'auto' }}
                  >
                    {deleteStatus === 'deleting' ? 'Deleting...' : 'Delete'}
                  </button>
                )}
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

      {/* Time Picker Modal - Proper overlay */}
      {showTimePicker && (
        <div 
          className="form-overlay form-overlay--background"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={(e) => {
            // Close modal if clicking on the background overlay
            if (e.target === e.currentTarget) {
              setShowTimePicker(null);
              setSolarMode(false);
              setSelectedSolarTime(null);
            }
          }}
        >
          <div 
            ref={timePickerRef} 
            className="form-container form-container--compact"
            style={{
              maxWidth: '500px',
              width: '90%',
              position: 'relative',
              zIndex: 10000
            }}
            onClick={(e) => {
              // Prevent clicks inside the modal from bubbling up to the background
              e.stopPropagation();
            }}
          >
            <div className="form-header">
              <div className="form-title">Select Time</div>
            </div>
            
            <div className="form-content">
              {/* Solar Time Selection */}
              <div className="form-text-accent form-text-center form-font-600 form-mb-8 form-text-14">
                Select Solar Time
              </div>
              
              <div className="form-flex form-gap-4 form-justify-center form-mb-12">
                {['SUNRISE', 'SUNSET', 'ZENITH'].map((solarTime) => (
                  <button
                    key={solarTime}
                    onClick={() => {
                      const isCurrentlySelected = selectedSolarTime === solarTime && solarMode;
                      if (isCurrentlySelected) {
                        setSelectedSolarTime(null);
                        setSolarMode(false);
                      } else {
                        setSelectedSolarTime(solarTime);
                        setSolarMode(true);
                      }
                    }}
                    className={`form-select-button form-select-button--solar ${selectedSolarTime === solarTime && solarMode ? 'form-select-button--selected' : ''}`}
                  >
                    <span>{solarTime === 'SUNRISE' ? '🌅' : 
                     solarTime === 'SUNSET' ? '🌇' : '☀️'}</span>
                    <span>{solarTime}</span>
                  </button>
                ))}
              </div>
              
              {/* Offset Options - Only show when solar time is selected */}
              {solarMode && selectedSolarTime && (
                <div className="form-flex form-flex-column form-gap-6">
                  <div className="form-text-accent form-text-center form-font-600 form-text-12">
                    Offset Options
                  </div>
                  
                  {/* Exact Time Button */}
                  <button
                    onClick={() => {
                      updateTimeInField(showTimePicker.field as 'preferred_time' | 'compatible_watering_times', showTimePicker.index, selectedSolarTime || '');
                      setShowTimePicker(null);
                      setSelectedSolarTime(null);
                      setSolarMode(false);
                    }}
                    className="form-select-button form-select-button--offset"
                  >
                    Exact {selectedSolarTime}
                  </button>
                  
                  {/* Offset Presets */}
                  <div className="form-button-grid">
                    {[-60, -30, -15, -5, 5, 15, 30, 60].map(offset => (
                      <button
                        key={offset}
                        onClick={() => {
                          const sign = offset > 0 ? '+' : '';
                          updateTimeInField(showTimePicker.field as 'preferred_time' | 'compatible_watering_times', showTimePicker.index, `${selectedSolarTime}${sign}${offset}`);
                          setShowTimePicker(null);
                          setSelectedSolarTime(null);
                          setSolarMode(false);
                        }}
                        className="form-select-button form-select-button--offset form-select-button--small"
                      >
                        {offset > 0 ? '+' : ''}{offset}m
                      </button>
                    ))}
                  </div>
                  
                  {/* Custom Offset Input */}
                  <div className="form-flex form-gap-4 form-items-center form-justify-center">
                    <input
                      type="number"
                      placeholder="Custom ±min"
                      min="-120"
                      max="120"
                      className="form-input form-input--custom"
                      style={{ width: '120px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const offset = e.currentTarget.value;
                          if (offset && offset !== '0') {
                            const sign = parseInt(offset) > 0 ? '+' : '';
                            updateTimeInField(showTimePicker.field as 'preferred_time' | 'compatible_watering_times', showTimePicker.index, `${selectedSolarTime}${sign}${offset}`);
                            setShowTimePicker(null);
                            setSelectedSolarTime(null);
                            setSolarMode(false);
                          }
                        }
                      }}
                    />
                    <button
                      onClick={(e) => {
                        const offsetInput = e.currentTarget.previousElementSibling as HTMLInputElement;
                        const offset = offsetInput.value;
                        if (offset && offset !== '0') {
                          const sign = parseInt(offset) > 0 ? '+' : '';
                          updateTimeInField(showTimePicker.field as 'preferred_time' | 'compatible_watering_times', showTimePicker.index, `${selectedSolarTime}${sign}${offset}`);
                          setShowTimePicker(null);
                          setSelectedSolarTime(null);
                          setSolarMode(false);
                        }
                      }}
                      className="form-btn form-btn--outline form-btn--small"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
              
              {/* Clock Time Selection - Only show when no solar time is selected */}
              {!solarMode && (
                <div className="form-flex form-flex-column form-gap-6">
                  <div className="form-text-accent form-text-center form-font-600 form-text-12">
                    Clock Time
                  </div>
                  
                  <div className="form-flex form-gap-4 form-justify-center">
                    {/* Hours */}
                    <div className="form-flex form-flex-column form-items-center form-gap-2">
                      <div className="form-text-muted form-font-600 form-text-12">
                        Hour
                      </div>
                      <select
                        value={(() => {
                          const timeArray = showTimePicker.field === 'preferred_time' 
                            ? editablePlant?.preferred_time 
                            : editablePlant?.compatible_watering_times;
                          const currentTime = timeArray?.[showTimePicker.index];
                          // Only parse if it's in HH:MM format, default to 6 for solar times
                          if (currentTime && currentTime.includes(':') && !currentTime.includes('SUNRISE') && !currentTime.includes('SUNSET') && !currentTime.includes('ZENITH')) {
                            return parseInt(currentTime.split(':')[0]);
                          }
                          return 6;
                        })()}
                        onChange={(e) => {
                          const hours = e.target.value.padStart(2, '0');
                          const timeArray = showTimePicker.field === 'preferred_time' 
                            ? editablePlant?.preferred_time 
                            : editablePlant?.compatible_watering_times;
                          const currentTime = timeArray?.[showTimePicker.index] || '06:00';
                          const minutes = currentTime.split(':')[1] || '00';
                          const newTime = `${hours}:${minutes}`;
                          updateTimeInField(showTimePicker.field as 'preferred_time' | 'compatible_watering_times', showTimePicker.index, newTime);
                        }}
                        className="form-select"
                        style={{ width: '80px' }}
                      >
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
                    
                    {/* Minutes */}
                    <div className="form-flex form-flex-column form-items-center form-gap-2">
                      <div className="form-text-muted form-font-600 form-text-12">
                        Minute
                      </div>
                      <select
                        value={(() => {
                          const timeArray = showTimePicker.field === 'preferred_time' 
                            ? editablePlant?.preferred_time 
                            : editablePlant?.compatible_watering_times;
                          const currentTime = timeArray?.[showTimePicker.index];
                          // Only parse if it's in HH:MM format, default to 0 for solar times
                          if (currentTime && currentTime.includes(':') && !currentTime.includes('SUNRISE') && !currentTime.includes('SUNSET') && !currentTime.includes('ZENITH')) {
                            return parseInt(currentTime.split(':')[1]);
                          }
                          return 0;
                        })()}
                        onChange={(e) => {
                          const timeArray = showTimePicker.field === 'preferred_time' 
                            ? editablePlant?.preferred_time 
                            : editablePlant?.compatible_watering_times;
                          const currentTime = timeArray?.[showTimePicker.index] || '06:00';
                          const hours = currentTime.split(':')[0] || '06';
                          const minutes = e.target.value.padStart(2, '0');
                          const newTime = `${hours}:${minutes}`;
                          updateTimeInField(showTimePicker.field as 'preferred_time' | 'compatible_watering_times', showTimePicker.index, newTime);
                        }}
                        className="form-select"
                        style={{ width: '80px' }}
                      >
                        {Array.from({ length: 60 }, (_, i) => (
                          <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="form-footer">
              <div className="form-actions">
                <button
                  onClick={() => setShowTimePicker(null)}
                  className="form-btn form-btn--outline"
                >
                  Cancel
                </button>
                {!solarMode && (
                  <button
                    onClick={() => setShowTimePicker(null)}
                    className="form-btn form-btn--primary"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibraryForm; 