/**
 * garden.form.tsx - Smart plant placement wizard with zone recommendations
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
import ZoneForm from './zones.form';
import LocationItem from './location.item';
import { getFormLayerStyle, getFormOverlayClassName, useClickOutside } from './utils';
import { useFormLayer } from '../../../core/useFormLayer';
import './forms.css';

interface PlantEntry {
  plant_id: number;
  common_name: string;
  watering_frequency?: string[];
  preferred_time?: string[];
  alternative_name?: string;
  latin_name?: string;
  compatible_watering_frequencies?: string[];
  compatible_watering_times?: string[];
  root_area_sqft?: number;
  water_optimal_in_week?: number;
  tolerance_min_in_week?: number;
  tolerance_max_in_week?: number;
  usda_zones?: string;
  soil_preference?: string;
  sun_exposure?: string;
  fruiting_period?: string;
  planting_time?: string;
  spacing_inches?: number;
  growth_type?: string;
}

interface SmartPlacementFormProps {
  plant_id: number;
  library_book: string;
  onCancel?: () => void;
  onSuccess?: (data: any) => void;
  isTopLayer?: boolean;
  onLayerChange?: (formId: string, isTop: boolean) => void;
}

export default function SmartPlacementForm({
  plant_id,
  library_book,
  onCancel,
  onSuccess,
  isTopLayer = true
  // onLayerChange removed as unused
}: SmartPlacementFormProps) {
  const FORM_ID = 'smart-placement-form';
  const formRef = useRef<HTMLDivElement>(null);
  const { addLayer, removeLayer, isAnyFormAbove } = useFormLayer();

  // Internal state
  const [plantData, setPlantData] = useState<PlantEntry | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [zoneSelectionMode, setZoneSelectionMode] = useState<'smart' | 'manual'>('smart');
  const [systemMode, setSystemMode] = useState<'smart' | 'manual'>('smart'); // Track system mode from settings
  const [emitterSizingMode, setEmitterSizingMode] = useState<'smart' | 'manual'>('smart');
  const [modalData, setModalData] = useState({
    quantity: '1',
    emitterSize: '4', // Set smart recommendation by default (normalized format)
    zoneId: '',
    locationId: '',
    comments: ''
  });
  const [customQuantity, setCustomQuantity] = useState('');
  const [customEmitterSize, setCustomEmitterSize] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneFormData, setZoneFormData] = useState<any>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [showLocationForm, setShowLocationForm] = useState(false);

  // Custom scrollbar functionality
  useEffect(() => {
    const container = formRef.current;
    const scrollableContent = container?.querySelector('.form-scrollable-content') as HTMLElement;
    if (!container || !scrollableContent) return;

    const updateScrollbar = () => {
      const scrollTop = scrollableContent.scrollTop;
      const scrollHeight = scrollableContent.scrollHeight;
      const clientHeight = scrollableContent.clientHeight;
      
      console.log('Scrollbar update:', { scrollTop, scrollHeight, clientHeight });
      
      // Only show scrollbar if content is scrollable
      if (scrollHeight <= clientHeight) {
        container.style.setProperty('--scrollbar-opacity', '0');
        console.log('Content fits, hiding scrollbar');
        return;
      }

      // Show scrollbar
      container.style.setProperty('--scrollbar-opacity', '0.6');
      
      // Calculate thumb position and size
      const trackHeight = clientHeight - 60; // Account for top/bottom offsets (30px top + 30px bottom)
      const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * trackHeight);
      
      // Calculate scroll percentage and thumb position
      const maxScrollTop = scrollHeight - clientHeight;
      const scrollPercentage = maxScrollTop > 0 ? scrollTop / maxScrollTop : 0;
      const maxThumbTop = trackHeight - thumbHeight;
      const thumbTop = 30 + scrollPercentage * maxThumbTop;
      
      console.log('Scrollbar calculations:', { 
        trackHeight, 
        thumbHeight, 
        scrollPercentage, 
        thumbTop 
      });
      
      container.style.setProperty('--scrollbar-thumb-height', `${thumbHeight}px`);
      container.style.setProperty('--scrollbar-thumb-top', `${thumbTop}px`);
    };

    // Add event listeners to the scrollable content
    scrollableContent.addEventListener('scroll', updateScrollbar, { passive: true });
    
    // Use ResizeObserver to update when content changes
    const resizeObserver = new ResizeObserver(updateScrollbar);
    resizeObserver.observe(scrollableContent);
    
    // Initial update
    updateScrollbar();

    return () => {
      scrollableContent.removeEventListener('scroll', updateScrollbar);
      resizeObserver.disconnect();
    };
  }, [loading, plantData, recommendations, zones, locations]);

  // Function to resolve zone period codes
  const resolveZonePeriod = (period: string, cycles?: number): string => {
    if (!period) return 'Unknown';
    
    const periodMap: { [key: string]: string } = {
      'D': 'Daily',
      'W': 'Weekly', 
      'M': 'Monthly'
    };
    
    const resolved = periodMap[period] || period;
    
    if (cycles && cycles > 0) {
      return `${resolved}: ${cycles}`;
    }
    
    return resolved;
  };

  // Function to get cycles from schedule data for a specific zone
  const getZoneCycles = (zoneId: number): number | undefined => {
    // Find the zone in the zones array (which comes from schedule data)
    const zone = zones.find(z => z.zone_id === zoneId);
    return zone?.cycles;
  };

  // Disable mouse wheel scrolling on number inputs
  useEffect(() => {
    const disableWheel = (e: Event) => {
      e.preventDefault();
    };

    const numberInputs = document.querySelectorAll('input[type="number"]');
    numberInputs.forEach(input => {
      input.addEventListener('wheel', disableWheel, { passive: false });
    });

    return () => {
      numberInputs.forEach(input => {
        input.removeEventListener('wheel', disableWheel);
      });
    };
  }, []);

  // Auto-select smart emitter recommendation when in smart mode
  useEffect(() => {
    if (emitterSizingMode === 'smart') {
      setModalData(prev => ({ ...prev, emitterSize: '4' }));
      setCustomEmitterSize(''); // Clear any custom value
    }
  }, [emitterSizingMode]);

  // Fetch all required data on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // 1. Fetch plant data from library
        console.log('Fetching plant data from:', `/api/library/${library_book}/${plant_id}`);
        const plantResponse = await fetch(`/api/library/${library_book}/${plant_id}`, {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        console.log('Plant response status:', plantResponse.status);
        if (!plantResponse.ok) {
          const errorText = await plantResponse.text();
          console.error('Plant API error:', errorText);
          throw new Error(`Failed to fetch plant data: ${plantResponse.status} ${plantResponse.statusText}`);
        }
        const plant = await plantResponse.json();
        console.log('Plant data received:', plant);
        setPlantData(plant);

        // 2. Fetch zone recommendations from smart placement API
        console.log('Fetching zone analysis from:', '/api/smart/analyze-placement');
        const analysisResponse = await fetch('/api/smart/analyze-placement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plant_id, library_book }),
          signal: AbortSignal.timeout(10000) // 10 second timeout for analysis
        });
        console.log('Analysis response status:', analysisResponse.status);
        if (!analysisResponse.ok) {
          const errorText = await analysisResponse.text();
          console.error('Analysis API error:', errorText);
          throw new Error(`Failed to fetch zone analysis: ${analysisResponse.status} ${analysisResponse.statusText}`);
        }
        const analysis = await analysisResponse.json();
        console.log('Analysis data received:', analysis);
        console.log('Sample recommendation structure:', analysis.recommendations?.[0]);
        setRecommendations(analysis.recommendations || []);
        
        // 3. Fetch zones list from schedule API
        console.log('Fetching zones from:', '/api/schedule');
        const zonesResponse = await fetch('/api/schedule', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        console.log('Zones response status:', zonesResponse.status);
        if (!zonesResponse.ok) {
          const errorText = await zonesResponse.text();
          console.error('Zones API error:', errorText);
          throw new Error(`Failed to fetch zones: ${zonesResponse.status} ${zonesResponse.statusText}`);
        }
        const zonesData = await zonesResponse.json();
        console.log('Zones data received:', zonesData);
        console.log('Sample zone structure:', typeof zonesData, Array.isArray(zonesData));
        console.log('All zones with cycles:', zonesData?.map((z: any) => ({ zone_id: z.zone_id, cycles: z.cycles, period: z.period })));
        setZones(zonesData || []);

        // 4. Fetch locations list
        console.log('Fetching locations from:', '/api/locations');
        const locationsResponse = await fetch('/api/locations', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        console.log('Locations response status:', locationsResponse.status);
        if (!locationsResponse.ok) {
          const errorText = await locationsResponse.text();
          console.error('Locations API error:', errorText);
          throw new Error(`Failed to fetch locations: ${locationsResponse.status} ${locationsResponse.statusText}`);
        }
        const locationsData = await locationsResponse.json();
        console.log('Locations data received:', locationsData);
        console.log('Locations data structure:', typeof locationsData, Array.isArray(locationsData));
        console.log('Sample location:', locationsData.locations?.[0] || locationsData[Object.keys(locationsData)[0]]);
        
        // Convert object structure to array if needed
        let locationsArray = [];
        if (Array.isArray(locationsData)) {
          locationsArray = locationsData;
        } else if (locationsData.locations && Array.isArray(locationsData.locations)) {
          locationsArray = locationsData.locations;
        } else if (typeof locationsData === 'object' && locationsData !== null) {
          // Convert object with location_id keys to array
          locationsArray = Object.entries(locationsData).map(([location_id, location]: [string, any]) => ({
            location_id: parseInt(location_id),
            name: location.name,
            description: location.description,
            zones: location.zones || []
          }));
        }
        
        console.log('Processed locations array:', locationsArray);
        setLocations(locationsArray);

        // 5. Read zone selection mode from settings
        console.log('Fetching settings from:', '/config/settings.cfg');
        const settingsResponse = await fetch('/config/settings.cfg', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        console.log('Settings response status:', settingsResponse.status);
        if (settingsResponse.ok) {
          const settingsText = await settingsResponse.text();
          console.log('Settings text received:', settingsText.substring(0, 200) + '...');
          // Parse INI format to find mode
          const modeMatch = settingsText.match(/mode\s*=\s*(\w+)/);
          if (modeMatch) {
            setZoneSelectionMode(modeMatch[1] === 'smart' ? 'smart' : 'manual');
            setSystemMode(modeMatch[1] === 'smart' ? 'smart' : 'manual'); // Set system mode from settings
          }
        }

        // Auto-select best match in smart mode after all data is loaded
        const recommendationsData = analysis.recommendations || [];
        if (recommendationsData.length > 0 && locationsArray.length > 0) {
          const bestMatch = recommendationsData[0]; // First recommendation is best match
          console.log('Auto-selecting best match after data load:', bestMatch);
          // Find locations that have this zone
          const locationsWithZone = locationsArray.filter((loc: any) => loc.zones.includes(bestMatch.zone_id));
          if (locationsWithZone.length > 0) {
            setModalData(prev => ({
              ...prev,
              zoneId: bestMatch.zone_id.toString(),
              locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
            }));
          } else {
            setModalData(prev => ({
              ...prev,
              zoneId: bestMatch.zone_id.toString(),
              locationId: '' // Clear location since none support this zone
            }));
          }
        }

        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    };

    fetchData();
  }, [plant_id, library_book]);

  // Form is now managed by the layer system - no manual registration needed

  // Function to refresh locations data
  const refreshLocations = async () => {
    try {
      console.log('Refreshing locations data...');
      const locationsResponse = await fetch('/api/locations', {
        signal: AbortSignal.timeout(5000)
      });
      
      if (!locationsResponse.ok) {
        throw new Error(`Failed to fetch locations: ${locationsResponse.status}`);
      }
      
      const locationsData = await locationsResponse.json();
      console.log('Refreshed locations data:', locationsData);
      
      // Convert object structure to array if needed
      let locationsArray = [];
      if (Array.isArray(locationsData)) {
        locationsArray = locationsData;
      } else if (locationsData.locations && Array.isArray(locationsData.locations)) {
        locationsArray = locationsData.locations;
      } else if (typeof locationsData === 'object' && locationsData !== null) {
        locationsArray = Object.entries(locationsData).map(([location_id, location]: [string, any]) => ({
          location_id: parseInt(location_id),
          name: location.name,
          description: location.description,
          zones: location.zones || []
        }));
      }
      
      setLocations(locationsArray);
      console.log('Locations refreshed successfully');
    } catch (error) {
      console.error('Error refreshing locations:', error);
    }
  };



  // Handle click outside to close
  useClickOutside(formRef, () => {
    console.log('🔴 Garden form click-outside triggered!');
    console.log('🔴 isTopLayer:', isTopLayer, 'isAnyFormAbove:', isAnyFormAbove(FORM_ID));
    if (onCancel) {
      console.log('🔴 Calling garden form onCancel!');
      onCancel();
    }
  }, isTopLayer && !isAnyFormAbove(FORM_ID)); // Disable when any form is above this one

  if (loading) {
    return (
      <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
        <div className="form-container form-container--small">
          <div className="form-loading">Loading Smart Placement Form...</div>
        </div>
      </div>
    );
  }

  if (error || !plantData) {
    return (
      <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
        <div className="form-container form-container--small">
          <div className="form-alert form-alert--error">
            <span>⚠️</span>
            <span>Error Loading Form</span>
          </div>
          <div className="form-mb-16">{error || 'Plant data not found'}</div>
          <button
            onClick={onCancel}
            className="form-btn form-btn--primary"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={getFormOverlayClassName(isTopLayer)} style={getFormLayerStyle(isTopLayer)}>
      <div 
        ref={formRef}
        data-modal="true"
        className="form-container"
      >
        <div className="form-scrollable-content">
          <h3 className="form-header form-header--h3">
            Smart Placement: {plantData.common_name}
            {!isTopLayer && (
              <span className="form-text-muted form-ml-8">
                (Hidden - Not Top Layer)
              </span>
            )}
          </h3>
          
          {recommendations.length === 0 && (
            <div className="form-alert form-alert--error">
              <span>⚠️</span>
              <span>
                No compatible zones found for this plant. Check deactivated zones below for auto-creation options.
              </span>
            </div>
          )}

          <div className="form-section">
            <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-12">
              <p className="form-section-title">
                🎯 {recommendations.length > 0 ? 'Compatible zones found! Select your preferred zone:' : 'Available zones:'}
              </p>
              <div className="form-flex form-gap-8 form-items-center">
                <span className={`form-toggle-label ${zoneSelectionMode === 'smart' ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                  Smart
                </span>
                <div 
                  className={`form-toggle ${systemMode === 'manual' ? 'form-toggle--locked' : ''}`}
                  onClick={() => {
                    if (systemMode === 'smart') {
                      setZoneSelectionMode(zoneSelectionMode === 'smart' ? 'manual' : 'smart');
                    }
                  }}
                >
                  <div className={`form-toggle-handle ${zoneSelectionMode === 'smart' ? 'form-toggle-handle--active' : 'form-toggle-handle--inactive'}`} />
                </div>
                <span className={`form-toggle-label ${zoneSelectionMode === 'manual' ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                  Manual
                </span>
                {systemMode === 'manual' && (
                  <span className="form-toggle-label form-toggle-label--locked">
                    (Locked)
                  </span>
                )}
              </div>
            </div>
            <div className="form-flex form-flex-column form-gap-8">
              {(zoneSelectionMode === 'smart' ? recommendations.slice(0, 3) : zones).map((rec: any, index: number) => {
                const isSmartMode = zoneSelectionMode === 'smart';
                const zoneId = isSmartMode ? rec.zone_id : rec.zone_id;
                const isSelected = modalData.zoneId === zoneId.toString();
                const isDisabled = !isSmartMode && rec.mode === 'disabled';
                const isSmartRecommended = isSmartMode && index === 0; // First recommendation is best match
                
                return (
                  <div key={zoneId} 
                    className={`form-zone-button ${isSelected ? 'form-zone-button--selected' : isDisabled ? 'form-zone-button--disabled' : 'form-zone-button--active'} ${isSmartRecommended ? 'form-zone-button--smart-recommended' : ''}`}
                    onClick={() => {
                      if (isDisabled) {
                        // Handle disabled zone selection - show zone configuration form
                        console.log('Disabled zone selected for configuration:', zoneId);
                        
                        // Set up zone form data and show it
                        setZoneFormData({
                          zone_id: zoneId,
                          mode: 'active', // Default to active/enabled mode since user wants to bring zone online
                          period: rec.period || 'W', // Use zone's period or default
                          cycles: getZoneCycles(zoneId) || 1, // Use zone's cycles or default
                          comment: rec.comment || ''
                        });
                        setShowZoneForm(true);
                        return;
                      }
                      
                      // Find locations that have this zone
                      const locationsWithZone = locations.filter(loc => loc.zones.includes(zoneId));
                      console.log('Zone selection debug:', {
                        zoneId,
                        zoneIdType: typeof zoneId,
                        locations,
                        locationsWithZone,
                        locationsWithZoneLength: locationsWithZone.length
                      });
                      if (locationsWithZone.length > 0) {
                        setModalData({
                          ...modalData,
                          zoneId: zoneId.toString(),
                          locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
                        });
                      } else {
                        // Just set the zone if no locations support it
                        setModalData({
                          ...modalData,
                          zoneId: zoneId.toString(),
                          locationId: '' // Clear location since none support this zone
                        });
                      }
                    }}
                  >
                    <div className="form-flex form-justify-between form-items-center">
                      <div>
                        <strong>Zone {zoneId}</strong>
                        <div className="form-text-muted form-text-muted--small">
                          {isSmartMode ? rec.comment : (isDisabled ? 'Disabled Zone' : rec.comment)}
                          {/* Debug cycles data */}
                          {console.log('Zone cycles data:', { 
                            zoneId, 
                            isSmartMode, 
                            cycles: getZoneCycles(zoneId), 
                            zonesLength: zones.length,
                            zoneFound: zones.find(z => z.zone_id === zoneId),
                            fullRec: rec 
                          })}
                          {!isDisabled && getZoneCycles(zoneId) && (
                            <span className="form-zone-details">
                              • {getZoneCycles(zoneId)} cycle{getZoneCycles(zoneId) !== 1 ? 's' : ''} - {resolveZonePeriod(isSmartMode ? rec.period : rec.period, getZoneCycles(zoneId))}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSmartMode && (
                        <div className={`form-btn form-btn--small form-zone-match-badge ${isSelected ? 'form-zone-match-badge--selected' : ''}`}>
                          {Math.round(rec.score * 100)}% match
                        </div>
                      )}
                      {!isSmartMode && (
                        <div className={`form-btn form-btn--small form-zone-match-badge ${isSelected ? 'form-zone-match-badge--selected' : ''} ${isDisabled ? 'form-zone-match-badge--disabled' : 'form-zone-match-badge--manual'}`}>
                          {isDisabled ? 'Disabled' : 'Manual'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        
          {/* Deactivated Zones Section - Only show in smart mode when no compatible zones found */}
          {zoneSelectionMode === 'smart' && recommendations.length === 0 && zones.filter(z => z.mode === 'disabled').length > 0 && (
            <div className="form-section">
              <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-12">
                <p className="form-section-title">
                  🎯 Available zones:
                </p>
              </div>
              <div className="form-flex form-flex-column form-gap-8">
                {zones.filter(z => z.mode === 'disabled').map((zone: any) => (
                  <div key={zone.zone_id} className="form-zone-button form-zone-button--disabled">
                    <div className="form-flex form-justify-between form-items-center">
                      <div>
                        <strong>Zone {zone.zone_id}</strong>
                        <div className="form-text-muted form-text-muted--small">
                          Disabled Zone
                        </div>
                      </div>
                      <div className="form-zone-button-action">
                        <button
                          type="button"
                          onClick={() => {
                            console.log('Auto-create clicked for zone:', zone.zone_id);
                            console.log('Plant data from modal:', plantData);
                            console.log('Book file:', library_book);
                            
                            // Set up zone form data and show it
                            setZoneFormData({
                              zone_id: zone.zone_id,
                              mode: 'active', // Default to active/enabled mode for auto-creation
                              period: zone.period || 'W', // Use zone's period or default to Weekly
                              cycles: getZoneCycles(zone.zone_id) || 1, // Use zone's cycles or default
                              comment: zone.comment || ''
                            });
                            setShowZoneForm(true);
                          }}
                          className="form-btn form-btn--primary form-btn--small"
                        >
                          Auto-Create
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form className="form-flex form-flex-column form-gap-16" onSubmit={async (e) => { 
            e.preventDefault(); 
            if (modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize) {
              // Handle form submission
              const formData = {
                plant_id,
                library_book: library_book.replace('.json', ''), // Remove .json extension
                zone_id: parseInt(modalData.zoneId),
                location_id: parseInt(modalData.locationId),
                quantity: parseInt(modalData.quantity),
                emitter_size: parseFloat(modalData.emitterSize),
                comments: modalData.comments,
                smart_overrides: {
                  zone_selection: zoneSelectionMode, // Use the actual slider state
                  emitter_sizing: emitterSizingMode  // Use the actual slider state
                }
              };
              
              try {
                setSaveStatus('saving');
                setSaveMessage('Placing plant...');
                
                // Send to plant manager API to update map.json
                const response = await fetch('/api/map/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(formData)
                });
                
                if (response.ok) {
                  const result = await response.json();
                  setSaveStatus('success');
                  setSaveMessage('Plant placed successfully!');
                  
                  // Auto-hide success message and close form after 2 seconds
                  setTimeout(() => {
                    setSaveStatus('idle');
                    setSaveMessage('');
                    onSuccess?.(formData);
                  }, 2000);
                } else {
                  const errorData = await response.json().catch(() => ({}));
                  throw new Error(errorData.message || 'Failed to place plant');
                }
              } catch (err) {
                console.error('Error placing plant:', err);
                setSaveStatus('error');
                setSaveMessage(err instanceof Error ? err.message : 'Failed to place plant');
                
                // Auto-hide error message after 4 seconds
                setTimeout(() => {
                  setSaveStatus('idle');
                  setSaveMessage('');
                }, 4000);
              }
            }
          }}>
            <div className="form-section">
              <p className="form-section-title">
                📊 Select quantity:
              </p>
              <div className="form-button-grid">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30].map(num => (
                  <div
                    key={num}
                    onClick={() => {
                      setModalData({ ...modalData, quantity: num.toString() });
                      setCustomQuantity(''); // Clear custom value when selecting predefined
                    }}
                    className={`form-select-button form-quantity-button ${modalData.quantity === num.toString() ? 'form-select-button--selected' : ''}`}
                  >
                    {num}
                  </div>
                ))}
              </div>
              <div className="form-flex form-gap-8 form-items-center">
                <span className="form-label">Custom:</span>
                <input
                  type="number"
                  min="1"
                  max="99"
                  placeholder="Enter quantity"
                  value={customQuantity}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 99)) {
                      setCustomQuantity(value);
                      if (value) {
                        setModalData({ ...modalData, quantity: value });
                      }
                    }
                  }}
                  onFocus={() => {
                    setModalData({ ...modalData, quantity: '' }); // Clear selected value when focusing on custom
                  }}
                  className="form-input form-input--custom"
                />
              </div>
            </div>
            <div className="form-section">
              <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-12">
                <p className="form-section-title">
                  💧 Emitter Size (GPH):
                  {/* Smart emitter analysis would be fetched here */}
                  <span className="form-text-success form-text-success--inline">
                    (Smart: 4.0 GPH)
                  </span>
                </p>
                <div className="form-flex form-gap-8 form-items-center">
                  <span className={`form-toggle-label ${emitterSizingMode === 'smart' ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                    Smart
                  </span>
                  <div 
                    className="form-toggle"
                    onClick={() => {
                      const newMode = emitterSizingMode === 'smart' ? 'manual' : 'smart';
                      setEmitterSizingMode(newMode);
                      
                      // If switching to smart mode, auto-select the smart recommendation
                      if (newMode === 'smart') {
                        const smartRecommendation = '4'; // Use normalized format (no decimal for whole numbers)
                        setModalData(prev => ({ ...prev, emitterSize: smartRecommendation }));
                        setCustomEmitterSize(''); // Clear any custom value
                      }
                    }}
                  >
                    <div className={`form-toggle-handle ${emitterSizingMode === 'smart' ? 'form-toggle-handle--active' : 'form-toggle-handle--inactive'}`} />
                  </div>
                  <span className={`form-toggle-label ${emitterSizingMode === 'manual' ? 'form-toggle-label--active' : 'form-toggle-label--inactive'}`}>
                    Manual
                  </span>
                </div>
              </div>
              <div className="form-button-grid">
                {[0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0].map(size => {
                  // Normalize the size to match the format used in modalData
                  const normalizedSize = size % 1 === 0 ? size.toString() : size.toFixed(1);
                  const isSelected = modalData.emitterSize === normalizedSize;
                  const isSmartRecommended = size === 4.0; // Placeholder for smart analysis
                  const isSmartMode = emitterSizingMode === 'smart';
                  const isSmartRecommendedAndSelected = isSmartRecommended && isSmartMode && isSelected;
                  
                  return (
                    <div
                      key={size}
                      onClick={() => {
                        setModalData({ ...modalData, emitterSize: normalizedSize });
                        setCustomEmitterSize(''); // Clear custom value when selecting predefined
                        
                        // If user manually selects something other than smart recommendation, switch to manual mode
                        if (isSmartMode && !isSmartRecommended) {
                          setEmitterSizingMode('manual');
                        }
                      }}
                      className={`form-select-button form-emitter-button ${isSelected ? 'form-select-button--selected' : ''} ${isSmartRecommendedAndSelected ? 'form-emitter-button--smart-recommended' : ''}`}
                    >
                      {size} GPH
                      {isSmartRecommendedAndSelected && (
                        <div className="form-emitter-button--smart-recommended-indicator">
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="form-flex form-gap-8 form-items-center">
                <span className="form-label">Custom:</span>
                <input
                  type="number"
                  min="0.1"
                  max="50"
                  step="0.1"
                  placeholder="Enter GPH"
                  value={customEmitterSize}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || (parseFloat(value) >= 0.1 && parseFloat(value) <= 50)) {
                      setCustomEmitterSize(value);
                      if (value) {
                        setModalData({ ...modalData, emitterSize: value });
                      }
                    }
                  }}
                  onFocus={() => {
                    setModalData({ ...modalData, emitterSize: '' }); // Clear selected value when focusing on custom
                  }}
                  className="form-input form-input--custom"
                />
              </div>
            </div>

            <div className="form-section">
              <p className="form-section-title">
                📍 Select location:
              </p>
              <div className="form-flex form-flex-column form-gap-8">
                {(() => {
                  console.log('Location selection debug:', {
                    modalDataZoneId: modalData.zoneId,
                    modalDataZoneIdType: typeof modalData.zoneId,
                    locations: locations,
                    filteredLocations: locations.filter(loc => loc.zones.includes(parseInt(modalData.zoneId)))
                  });
                  return null;
                })()}
                {locations
                  .filter(loc => loc.zones.includes(parseInt(modalData.zoneId)))
                  .map(loc => (
                    <div
                      key={loc.location_id}
                      onClick={() => setModalData({ ...modalData, locationId: loc.location_id.toString() })}
                      className={`form-zone-button ${modalData.locationId === loc.location_id.toString() ? 'form-zone-button--selected' : 'form-zone-button--active'}`}
                    >
                      <div className="form-flex form-justify-between form-items-center">
                        <div>
                          <strong>{loc.name}</strong>
                          <div className="form-text-muted form-text-muted--small">
                            {loc.description || 'No description'}
                            {loc.zones && loc.zones.length > 0 && (
                              <span className="form-zone-details">
                                • Zones: {loc.zones.join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={`form-btn form-btn--small form-zone-match-badge ${modalData.locationId === loc.location_id.toString() ? 'form-zone-match-badge--selected' : 'form-zone-match-badge--manual'}`}>
                          Location
                        </div>
                      </div>
                    </div>
                  ))}
                {locations.filter(loc => loc.zones.includes(parseInt(modalData.zoneId))).length === 0 && (
                  <div className="form-text-muted form-text-muted--italic">
                    No locations support this zone
                  </div>
                )}
              </div>
              <div className="form-flex form-justify-start form-mt-8">
                <button
                  type="button"
                  onClick={() => {
                    setShowLocationForm(true);
                  }}
                  className="form-btn form-btn--outline"
                >
                  + Add New Location
                </button>
              </div>
            </div>
            <div className="form-flex form-flex-column form-gap-8">
              <label className="form-label">Comments (optional):</label>
              <input
                type="text"
                name="comments"
                value={modalData.comments}
                onChange={(e) => setModalData({ ...modalData, comments: e.target.value })}
                className="form-input form-input--full-width"
                placeholder="Any additional notes..."
              />
            </div>
            {/* Success/Error Message Display */}
            {saveStatus !== 'idle' && (
              <div className={`form-alert ${saveStatus === 'success' ? 'form-alert--success' : 'form-alert--error'}`}>
                {saveMessage}
              </div>
            )}
            
            <div className="form-actions form-actions--end">
              <button
                type="button"
                onClick={() => { 
                  onCancel?.();
                  setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
                }}
                className="form-btn form-btn--secondary form-btn--flex"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!modalData.zoneId || !modalData.locationId || !modalData.quantity || !modalData.emitterSize || saveStatus === 'saving'}
                className="form-btn form-btn--primary form-btn--flex"
              >
                {saveStatus === 'saving' ? 'Placing...' : 'Place Plant'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      {/* Zone Form Overlay */}
      {showZoneForm && zoneFormData && (
        <div
          data-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1001,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <ZoneForm 
            plant_id={plant_id}
            library_book={library_book}
            zone_id={zoneFormData.zone_id}
            initialData={zoneFormData}
            isAutoCreate={true}
            onSave={async (zoneData) => {
              try {
                // Ensure zone_id exists
                if (!zoneData.zone_id) {
                  console.error('Zone ID is required for saving');
                  return;
                }
                
                let response;
                
                // Check if zone is being set to disabled FIRST (before any conversions)
                if (zoneData.mode === 'disabled') {
                  // For disabled zones, send only minimal configuration
                  const disabledZoneData = { mode: 'disabled' };
                  response = await fetch(`/api/schedule/${zoneData.zone_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(disabledZoneData)
                  });
                } else {
                  // For active zones, convert UI mode system back to backend mode system
                  let zoneToSave = { ...zoneData } as any;
                  
                  // Convert active + scheduleMode to backend mode
                  if (zoneData.mode === 'active') {
                    zoneToSave.mode = zoneData.scheduleMode || 'manual';
                    // Remove scheduleMode since backend doesn't use it
                    delete zoneToSave.scheduleMode;
                  }
                  
                  // Ensure mode is valid for backend
                  if (!['manual', 'smart', 'disabled'].includes(zoneToSave.mode)) {
                    zoneToSave.mode = 'manual';
                  }
                  
                  // Remove UI-specific fields that shouldn't be saved
                  delete zoneToSave.showDurationPicker;
                  delete zoneToSave.showTimePicker;
                  delete zoneToSave.originalIndex;
                  
                  // Save the zone data
                  response = await fetch(`/api/schedule/${zoneData.zone_id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(zoneToSave)
                  });
                }
                
                if (response.ok) {
                  // Zone was saved successfully, close the zone config form
                  setShowZoneForm(false);
                  setZoneFormData(null);
                  
                  // Refresh zones data to reflect the changes
                  const zonesResponse = await fetch('/api/schedule');
                  if (zonesResponse.ok) {
                    const zonesData = await zonesResponse.json();
                    setZones(zonesData || []);
                  }
                  
                  // Refresh smart placement analysis to detect the new compatible zone
                  console.log('Refreshing smart placement analysis after zone creation...');
                  const analysisResponse = await fetch('/api/smart/analyze-placement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ plant_id, library_book })
                  });
                  if (analysisResponse.ok) {
                    const analysis = await analysisResponse.json();
                    console.log('Updated analysis data:', analysis);
                    setRecommendations(analysis.recommendations || []);
                  }
                  
                  // Show success message (optional)
                  console.log('Zone configuration saved successfully!');
                } else {
                  // Handle save error
                  const errorData = await response.json();
                  console.error('Failed to save zone:', errorData);
                  // You could show an error message here
                }
              } catch (error) {
                console.error('Error saving zone:', error);
                // You could show an error message here
              }
            }}
            onCancel={() => {
              setShowZoneForm(false);
              setZoneFormData(null);
            }}
          />
        </div>
      )}

      {/* Location Form Overlay */}
      {showLocationForm && (
        <div
          data-modal="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1001,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <LocationItem
            onSave={async (locationData) => {
              try {
                console.log('Location saved successfully:', locationData);
                // Close the location form
                setShowLocationForm(false);
                // Refresh locations to show the new location
                await refreshLocations();
                console.log('Locations refreshed after save');
              } catch (error) {
                console.error('Error handling location save:', error);
              }
            }}
            onCancel={() => {
              setShowLocationForm(false);
            }}
          />
        </div>
      )}
    </div>
  );
} 