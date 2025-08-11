/**
 * zones.form.tsx - Zone configuration editor with smart/manual modes
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
import type { Zone, FormProps } from './types';
import { formatDuration, defaultTime, getTomorrow, useClickOutside } from './utils';
import { getApiBaseUrl } from '../utils';
import { useFormLayer } from '../../../core/useFormLayer';
import TimePicker from './timepicker.item';
import DurationPicker from './durationpicker.item';
import './forms.css';

interface ZoneFormProps extends FormProps {
  initialData?: Partial<Zone>;
  zone_id?: number; // Add zone_id prop
  pumpIndex?: number | null;
  plant_id?: number; // Add plant_id for watering frequency lookup
  library_book?: string; // Add library_book for watering frequency lookup
  onSave: (zoneData: Partial<Zone>) => Promise<void>;
  isAutoCreate?: boolean; // Indicates if called from garden form for auto-creation
}

const PERIODS = [
  { code: 'D', label: 'Daily', maxCycles: 10, disabled: false },
  { code: 'W', label: 'Weekly', maxCycles: 6, disabled: false },
  { code: 'M', label: 'Monthly', maxCycles: 3, disabled: false }
];

// Module-level flag to persist across component remounts
let globalHasAppliedGardenSettings = false;

// Module-level variable to persist user's mode selection across remounts
let globalUserModeSelection: string | null = null;

// Module-level variable to persist user's time selections across remounts
let globalUserTimeSelections: { [key: number]: { start_time?: string; duration?: string } } = {};

export default function ZoneForm({ 
  initialData, 
  zone_id, // Add zone_id parameter
  pumpIndex = null,
  plant_id, // Add plant_id parameter
  library_book, // Add library_book parameter
  onSave, 
  onCancel, 
  // loading = false, // removed as unused
  error = '',
  isTopLayer = true
  // onLayerChange removed as unused
  // isAutoCreate = false // removed as unused
}: ZoneFormProps) {
  console.log('🔵 ZoneForm component props:', { initialData, zone_id, isTopLayer });
  const FORM_ID = 'zone-form';
  const formRef = useRef<HTMLDivElement>(null);
  const { addLayer, removeLayer } = useFormLayer();
  
  // Function to parse watering frequency from plant data
  const parseWateringFrequency = (frequency: string): { period: string; cycles: number } => {
    // Handle formats like "D1", "W2", "M1", etc.
    const match = frequency.match(/^([DWM])(\d+)$/);
    if (match) {
      return {
        period: match[1],
        cycles: parseInt(match[2])
      };
    }
    // Default fallback
    return { period: 'W', cycles: 1 };
  };

  // Function to fetch plant watering frequency
  const fetchPlantWateringFrequency = async () => {
    if (!plant_id || !library_book) return null;
    
    try {
      const response = await fetch(`/api/library/${library_book}/${plant_id}`);
      if (response.ok) {
        const plantData = await response.json();
        if (plantData.watering_frequency && plantData.watering_frequency.length > 0) {
          return parseWateringFrequency(plantData.watering_frequency[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching plant watering frequency:', error);
    }
    return null;
  };

  // Function to fetch garden settings and determine default schedule mode
  const fetchGardenSettings = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/config/settings.cfg`);
      if (response.ok) {
        const settings = await response.json();
        const gardenMode = settings.mode || 'manual';
        // Map garden mode to schedule mode: 'smart' -> 'smart', 'manual' -> 'manual'
        return gardenMode === 'smart' ? 'smart' : 'manual';
      }
    } catch (error) {
      console.error('Error fetching garden settings:', error);
    }
    return 'manual'; // Default fallback
  };

  const [zoneData, setZoneData] = useState<Partial<Zone>>(() => {
    console.log('🔵 zoneData useState initialization. initialData:', initialData);
    
    // Initialize with proper priority: schedule.json mode >> settings.cfg mode
    const baseData = {
      zone_id: zone_id || 1,
      mode: 'manual', // Will be set by garden settings effect if no existing mode
      period: 'D',
      cycles: 1,
      times: [defaultTime()],
      startDay: getTomorrow(),
      comment: '',
      ...initialData
    };
    
    // Apply user's persisted time selections if they exist
    if (Object.keys(globalUserTimeSelections).length > 0) {
      baseData.times = baseData.times.map((time, index) => ({
        ...time,
        ...globalUserTimeSelections[index]
      }));
      console.log('🔵 Applied globalUserTimeSelections:', globalUserTimeSelections);
    }
    
    // Check for user's manual selection first (highest priority)
    if (globalUserModeSelection && ['smart', 'manual', 'disabled'].includes(globalUserModeSelection)) {
      baseData.mode = globalUserModeSelection;
      console.log('🔵 Using globalUserModeSelection:', globalUserModeSelection);
    }
    // Then check for scheduleMode (from zones.ui.tsx transformation)
    else if (initialData?.scheduleMode && ['smart', 'manual', 'disabled'].includes(initialData.scheduleMode)) {
      baseData.mode = initialData.scheduleMode;
      console.log('🔵 Using initialData.scheduleMode:', initialData.scheduleMode);
    }
    // Then check for direct mode (fallback)
    else if (initialData?.mode && ['smart', 'manual', 'disabled'].includes(initialData.mode)) {
      baseData.mode = initialData.mode;
      console.log('🔵 Using initialData.mode:', initialData.mode);
    } else {
      console.log('🔵 No valid initialData mode, using default:', baseData.mode);
    }
    
    console.log('🔵 Final zoneData initialization:', baseData);
    return baseData;
  });

  // Track zone status separately from schedule mode
  // Zone status is about whether the zone is enabled/disabled
  // Schedule mode is about smart/manual when enabled
  const [zoneStatus, setZoneStatus] = useState<'active' | 'disabled'>(() => {
    // If the zone mode is 'disabled', then zone status is disabled
    // If the zone mode is 'smart' or 'manual', then zone status is active
    // If no mode exists (new zone), default to active
    if (initialData?.mode === 'disabled') {
      return 'disabled';
    }
    return 'active';
  });

  // Layer system state for pickers
  const [activeTimePicker, setActiveTimePicker] = useState<number | null>(null);
  const [activeDurationPicker, setActiveDurationPicker] = useState<number | null>(null);
  // const [solarOffset, setSolarOffset] = useState(0); // removed as unused
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Form is now managed by the layer system - no manual registration needed

  // Fetch and apply plant watering frequency when component mounts
  useEffect(() => {
    const applyPlantWateringFrequency = async () => {
      if (plant_id && library_book) {
        const frequency = await fetchPlantWateringFrequency();
        if (frequency) {
          console.log('Applying plant watering frequency:', frequency);
          setZoneData(prev => ({
            ...prev,
            period: frequency.period,
            cycles: frequency.cycles
          }));
        }
      }
    };

    applyPlantWateringFrequency();
  }, [plant_id, library_book]);

  // Fetch garden settings and set default mode for new zones only
  useEffect(() => {
    const applyGardenSettings = async () => {
      console.log('🟢 Garden settings effect running:', {
        hasAppliedGardenSettings: globalHasAppliedGardenSettings,
        initialDataMode: initialData?.mode,
        currentZoneDataMode: zoneData.mode
      });
      
      // Only apply garden settings once, and only for NEW zones (no existing valid mode from schedule.json)
      const hasValidExistingMode = (initialData?.scheduleMode && ['smart', 'manual', 'disabled'].includes(initialData.scheduleMode)) ||
                                   (initialData?.mode && ['smart', 'manual', 'disabled'].includes(initialData.mode));
      
      if (!globalHasAppliedGardenSettings && !hasValidExistingMode) {
        const defaultMode = await fetchGardenSettings();
        console.log('🟢 Setting default mode from garden settings for NEW zone:', defaultMode);
        setZoneData(prev => {
          console.log('🟢 setZoneData called by garden settings. Previous mode:', prev.mode, 'New mode:', defaultMode);
          return {
            ...prev,
            mode: defaultMode
          };
        });
        globalHasAppliedGardenSettings = true;
        console.log('🟢 Global flag set to true, should not run again');
      } else if (hasValidExistingMode) {
        const existingMode = initialData?.scheduleMode || initialData?.mode;
        console.log('🟢 Zone has existing mode from schedule.json, keeping:', existingMode);
        globalHasAppliedGardenSettings = true; // Mark as applied to prevent future runs
      } else {
        console.log('🟢 Zone already processed, skipping. Global flag:', globalHasAppliedGardenSettings);
      }
    };

    applyGardenSettings();
  }, []); // Empty dependency array - only run once on mount

  // Debug effect to track zoneData changes
  useEffect(() => {
    console.log('🔵 zones.form re-rendered. Current state:', {
      zoneDataMode: zoneData.mode,
      zoneDataTimes: zoneData.times,
      zoneStatus: zoneStatus
    });
  }); // No dependency array to log on every re-render for debugging

  // Handle click outside to close
  useClickOutside(formRef, () => {
    globalUserModeSelection = null; // Clear user mode selection
    globalUserTimeSelections = {}; // Clear user time selections
    if (onCancel) {
      onCancel();
    }
  }, true); // Always enable for form-level click outside

  const calculateSmartDuration = async (zoneId: number) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/zones/${zoneId}/smart-duration`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        return result;
      } else {
        console.error('Failed to calculate smart duration');
        return null;
      }
    } catch (error) {
      console.error('Error calculating smart duration:', error);
      return null;
    }
  };

  const handleSave = async () => {
    try {
      setSaveStatus('saving');
      setSaveMessage('Saving zone configuration...');
      
      // Prepare zone data for backend - ensure mode is valid
      let zoneToSave = { ...zoneData } as any;
      if (!['manual', 'smart', 'disabled'].includes(zoneToSave.mode)) {
        zoneToSave.mode = 'manual';
      }
      
      // Remove UI-specific fields that shouldn't be saved
      delete zoneToSave.originalIndex;
      
      console.log('Zone form sending directly to scheduler:', zoneToSave);
      
      // Send directly to scheduler API
      const response = await fetch(`${getApiBaseUrl()}/api/schedule/${zoneData.zone_id || zone_id || 1}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zoneToSave)
      });
      
      if (response.ok) {
        setSaveStatus('success');
        setSaveMessage('Zone configuration saved successfully!');
        
        // Auto-hide success message and close form after 2 seconds
        setTimeout(async () => {
          setSaveStatus('idle');
          setSaveMessage('');
          
          // Call the parent's onSave handler to trigger refresh
          if (onSave) {
            try {
              await onSave(zoneData);
            } catch (error) {
              console.error('Error in parent save handler:', error);
            }
          }
          
                                // Clear user selections and close the form
            globalUserModeSelection = null;
            globalUserTimeSelections = {};
            if (onCancel) {
              onCancel();
            }
        }, 2000);
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save zone configuration');
      }
      
    } catch (err) {
      console.error('Error saving zone:', err);
      setSaveStatus('error');
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save zone configuration');
      
      // Auto-hide error message after 4 seconds
      setTimeout(() => {
        setSaveStatus('idle');
        setSaveMessage('');
      }, 4000);
    }
  };

  const handlePeriodChange = (newPeriod: string) => {
    const newPeriodObj = PERIODS.find(p => p.code === newPeriod);
    
    // Ensure times array matches the new period requirements
    const currentTimes = zoneData.times || [defaultTime()];
    let newTimes = [...currentTimes];
    let newCycles = zoneData.cycles || 1;
    
    if (newPeriod === 'D') {
      // Daily: times array should match cycles count
      if (newTimes.length !== newCycles) {
        if (newCycles > newTimes.length) {
          // Add more time slots
          for (let j = newTimes.length; j < newCycles; j++) {
            newTimes.push(defaultTime());
          }
        } else {
          // Remove excess time slots
          newTimes = newTimes.slice(0, newCycles);
        }
      }
    } else {
      // Weekly/Monthly: enforce cycle limits and use 1 time slot
      if (newPeriodObj && newCycles > newPeriodObj.maxCycles) {
        newCycles = newPeriodObj.maxCycles;
      }
      newTimes = [currentTimes[0] || defaultTime()];
    }
    
    setZoneData(prev => ({ 
      ...prev, 
      period: newPeriod, 
      cycles: newCycles,
      times: newTimes 
    }));
  };

  const handleCyclesChange = (newCycles: number) => {
    // Ensure times array matches the new cycle count
    const currentTimes = zoneData.times || [defaultTime()];
    let newTimes = [...currentTimes];
    
    if (newCycles > currentTimes.length) {
      // Add more time slots
      const additionalSlots = newCycles - currentTimes.length;
      for (let j = 0; j < additionalSlots; j++) {
        newTimes.push(defaultTime());
      }
    } else if (newCycles < currentTimes.length) {
      // Remove excess time slots
      newTimes = currentTimes.slice(0, newCycles);
    }
    
    setZoneData(prev => ({ 
      ...prev, 
      cycles: newCycles, 
      times: newTimes 
    }));
  };

  const updateTimeAtIndex = (timeIdx: number, field: string, value: string) => {
    console.log('🔵 updateTimeAtIndex called:', { timeIdx, field, value, currentMode: zoneData.mode });
    
    // Persist user's time selection across remounts
    if (!globalUserTimeSelections[timeIdx]) {
      globalUserTimeSelections[timeIdx] = {};
    }
    globalUserTimeSelections[timeIdx][field] = value;
    console.log('🔵 Saved to globalUserTimeSelections:', globalUserTimeSelections);
    
    const newTimes = [...(zoneData.times || [])];
    newTimes[timeIdx] = { 
      ...newTimes[timeIdx], 
      [field]: value
    };
    setZoneData(prev => {
      console.log('🔵 setZoneData in updateTimeAtIndex. Previous mode:', prev.mode, 'New times:', newTimes);
      return { ...prev, times: newTimes };
    });
  };

  // Layer system functions for opening pickers
  const openTimePicker = (timeIdx: number) => {
    console.log('🔵 openTimePicker called for timeIdx:', timeIdx);
    setActiveTimePicker(timeIdx);
    const layerId = `time-picker-${timeIdx}`;
    console.log('🔵 Adding TimePicker layer:', layerId);
    addLayer(layerId, 'picker', TimePicker, {
      isVisible: true,
      initialSolarMode: true,
      onTimeSelect: (time: string) => {
        console.log('🔵 TimePicker onTimeSelect:', time);
        updateTimeAtIndex(timeIdx, 'start_time', time);
        removeLayer(layerId);
        setActiveTimePicker(null);
      },
      onCancel: () => {
        console.log('🔵 TimePicker onCancel');
        removeLayer(layerId);
        setActiveTimePicker(null);
      }
    });
  };

  const openDurationPicker = (timeIdx: number) => {
    console.log('🟡 openDurationPicker called for timeIdx:', timeIdx);
    setActiveDurationPicker(timeIdx);
    const layerId = `duration-picker-${timeIdx}`;
    console.log('🟡 Adding DurationPicker layer:', layerId);
    addLayer(layerId, 'picker', DurationPicker, {
      value: zoneData.times[timeIdx]?.duration || '00:20:00',
      isVisible: true,
      zone_id: zone_id || 1,
      onChange: (duration: string) => {
        console.log('🟡 DurationPicker onChange:', duration);
        updateTimeAtIndex(timeIdx, 'duration', duration);
        removeLayer(layerId);
        setActiveDurationPicker(null);
      },
      onClose: () => {
        console.log('🟡 DurationPicker onClose');
        removeLayer(layerId);
        setActiveDurationPicker(null);
      },
      onStop: () => {
        console.log('🟡 DurationPicker onStop');
        removeLayer(layerId);
        setActiveDurationPicker(null);
      }
    });
  };

  const isPumpZone = pumpIndex === (zoneData.zone_id || 1) - 1;

  return (
    <div 
      ref={formRef}
      className="form-container form-container--small"
    >
        {zoneData && (
          <>
            <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-20">
              <h2 className="form-header form-header--h2">
                Configure Zone {zoneData.zone_id}
                {zoneData.mode === 'disabled' && (
                  <span className="form-text-muted form-ml-8">
                    (Disabled)
                  </span>
                )}
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



            {isPumpZone ? (
              <div className="form-section">
                <div className="form-text-muted form-text-center">
                  This zone is configured as the pump and does not require scheduling.
                </div>
              </div>
            ) : (
              <div className="form-flex form-flex-column form-gap-16">
                {/* Zone Status Section */}
                <div className="form-section">
                  <div className="form-section-title">
                    <span>🌱</span>
                    Zone Status:
                  </div>
                  <div className="form-radio-group">
                    {[
                      { value: 'active', label: 'Enabled' },
                      { value: 'disabled', label: 'Disabled' }
                    ].map(({ value, label }) => (
                      <label
                        key={value}
                        className={`form-radio-option ${zoneStatus === value ? 'form-radio-option--selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={value}
                          checked={zoneStatus === value}
                          onChange={() => {
                            setZoneStatus(value as 'active' | 'disabled');
                            if (value === 'disabled') {
                              setZoneData(prev => ({ ...prev, mode: 'disabled' }));
                            } else {
                              // When enabling, set to garden default mode
                              fetchGardenSettings().then(defaultMode => {
                                setZoneData(prev => ({ ...prev, mode: defaultMode }));
                              });
                            }
                          }}
                          style={{ display: 'none' }}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Period Selection Section */}
                <div className={`form-section ${zoneStatus === 'disabled' ? 'form-section--disabled' : ''}`}>
                  <div className={`form-section-title ${zoneStatus === 'disabled' ? 'form-text-disabled' : ''}`}>
                    <span>📅</span>
                    Period:
                  </div>
                  <select
                    value={zoneData.period}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                    disabled={zoneStatus === 'disabled'}
                    className="form-select"
                  >
                    {PERIODS.map(period => (
                      <option
                        key={period.code}
                        value={period.code}
                        disabled={period.disabled}
                      >
                        {period.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cycles Section */}
                <div className={`form-section ${zoneStatus === 'disabled' ? 'form-section--disabled' : ''}`}>
                  <div className={`form-section-title ${zoneStatus === 'disabled' ? 'form-text-disabled' : ''}`}>
                    <span>🔄</span>
                    Cycles: {zoneData.cycles}
                  </div>
                  <input
                    type="range"
                    min="1"
                    max={PERIODS.find(p => p.code === zoneData.period)?.maxCycles || 10}
                    value={zoneData.cycles}
                    onChange={(e) => handleCyclesChange(parseInt(e.target.value))}
                    disabled={zoneStatus === 'disabled'}
                    className="form-range"
                  />
                </div>

                {/* Time Configuration Section */}
                <div className={`form-section ${zoneStatus === 'disabled' ? 'form-section--disabled' : ''}`}>
                  <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-12">
                    <div className="form-section-title">
                      <span>⏰</span>
                      Schedule and Times:
                    </div>
                    
                    {/* Schedule Mode Toggle */}
                    {zoneStatus !== 'disabled' && (
                      <div className="form-flex form-gap-8 form-items-center">
                        <span className={`form-toggle-label ${zoneData.mode === 'smart' ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                          Smart
                        </span>
                        <div 
                          className="form-toggle"
                                                     onClick={() => {
                             const newMode = zoneData.mode === 'manual' ? 'smart' : 'manual';
                             console.log('🔴 User clicked toggle. Changing mode from', zoneData.mode, 'to', newMode);
                             globalUserModeSelection = newMode; // Persist user's selection
                             setZoneData(prev => ({ ...prev, mode: newMode }));
                           }}
                        >
                          <div className={`form-toggle-handle ${zoneData.mode === 'smart' ? 'form-toggle-handle--active' : 'form-toggle-handle--inactive'}`} />
                        </div>
                        <span className={`form-toggle-label ${zoneData.mode === 'manual' ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                          Manual
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Schedule Content Container - Fixed dimensions for consistent form size */}
                  <div className="form-schedule-content" style={{ minHeight: '120px', width: '400px' }}>
                    {/* Schedule Times - Only show for manual mode */}
                    {zoneData.mode === 'manual' && (
                      <div className="form-flex form-flex-column form-gap-8">
                        {(zoneData.times || [])
                          .filter((_, timeIdx) => {
                            // For Daily periods, show all time slots
                            if (zoneData.period === 'D') {
                              return timeIdx < (zoneData.cycles || 1);
                            }
                            // For Weekly/Monthly periods, only show the first time slot
                            return timeIdx === 0;
                          })
                          .map((time, timeIdx) => (
                          <div key={timeIdx} className="form-flex form-gap-8 form-items-center">
                            <div className="form-text-muted form-min-w-60">
                              {zoneData.period === 'D' ? `Time ${timeIdx + 1}:` : 'Time:'}
                            </div>
                            
                            <div className="form-relative">
                              <input
                                type="text"
                                placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                                value={time.start_time || ''}
                                onChange={(e) => updateTimeAtIndex(timeIdx, 'start_time', e.target.value)}
                                onFocus={() => openTimePicker(timeIdx)}
                                className="form-input form-input--full-width form-font-mono form-cursor-pointer"
                                readOnly
                              />
                            </div>
                            
                            <div className="form-relative">
                              <input
                                type="text"
                                placeholder="Duration"
                                value={formatDuration(time.duration || '00:20:00')}
                                onClick={() => openDurationPicker(timeIdx)}
                                readOnly
                                className="form-input form-font-mono form-w-120 form-cursor-pointer"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Smart Mode Message */}
                    {zoneData.mode === 'smart' && (
                      <div className="form-text-muted form-text-italic form-mt-8 form-text-center">
                        🌱 Smart Duration Enabled - Start times and durations are calculated dynamically based on plant requirements and environmental conditions.
                      </div>
                    )}
                  </div>
                </div>

                {/* Comment Section */}
                <div className="form-section">
                  <div className="form-section-title">
                    <span>💬</span>
                    Comment:
                  </div>
                  <input
                    type="text"
                    value={zoneData.comment || ''}
                    onChange={(e) => setZoneData(prev => ({ ...prev, comment: e.target.value }))}
                    placeholder="Optional description"
                    className="form-input form-input--full-width"
                  />
                </div>

                {/* Save Status Messages */}
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
                    {saveStatus === 'saving' ? 'Saving...' : 'Save & Continue'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  );
} 