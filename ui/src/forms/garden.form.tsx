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
import { getApiBaseUrl } from '../utils';
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
  console.log('🌱 GARDEN.FORM: SmartPlacementForm initialized with props:', { 
    plant_id, 
    library_book, 
    isTopLayer,
    onCancel: !!onCancel,
    onSuccess: !!onSuccess
  });
  
  const FORM_ID = 'smart-placement-form';
  const formRef = useRef<HTMLDivElement>(null);
  const { addLayer, removeLayer, isAnyFormAbove } = useFormLayer();
  
  console.log('🌱 GARDEN.FORM: Layer system hooks initialized:', { 
    addLayer: !!addLayer, 
    removeLayer: !!removeLayer, 
    isAnyFormAbove: !!isAnyFormAbove 
  });

  // Internal state
  const [plantData, setPlantData] = useState<PlantEntry | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [zoneSelectionMode, setZoneSelectionMode] = useState<'smart' | 'manual'>('smart');
  const [systemMode, setSystemMode] = useState<'smart' | 'manual'>('smart'); // Track system mode from settings
  const [emitterSizingMode, setEmitterSizingMode] = useState<'smart' | 'manual'>('smart');
  const [smartRecommendedEmitter, setSmartRecommendedEmitter] = useState<string | null>(null);
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
    let isMounted = true;
    const abortController = new AbortController();
    
    const fetchData = async () => {
      try {
        console.log('🌱 GARDEN.FORM: Starting data fetch for plant:', plant_id, 'from book:', library_book);
        if (!isMounted) return;
        setLoading(true);
        
        // 1. Fetch plant data from library
        console.log('🌱 GARDEN.FORM: Fetching plant data from:', `/api/library/${library_book}/${plant_id}`);
        const plantResponse = await fetch(`/api/library/${library_book}/${plant_id}`, {
          signal: abortController.signal
        });
        console.log('🌱 GARDEN.FORM: Plant response status:', plantResponse.status);
        if (!plantResponse.ok) {
          const errorText = await plantResponse.text();
          console.error('🌱 GARDEN.FORM: Plant API error:', errorText);
          throw new Error(`Failed to fetch plant data: ${plantResponse.status} ${plantResponse.statusText}`);
        }
        const plant = await plantResponse.json();
        console.log('🌱 GARDEN.FORM: Plant data received:', plant);
        if (!isMounted) return;
        setPlantData(plant);

        // 2. Fetch zone recommendations from smart placement API
        console.log('🌱 GARDEN.FORM: Fetching zone analysis from:', '/api/smart/analyze-placement');
        const analysisData = {
          plant_id,
          library_book: library_book.replace('.json', ''), // Remove .json extension if present
          common_name: plant.common_name
        };
        console.log('🌱 GARDEN.FORM: Sending analysis data:', analysisData);
        const analysisResponse = await fetch('/api/smart/analyze-placement', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analysisData),
          signal: abortController.signal
        });
        console.log('🌱 GARDEN.FORM: Analysis response status:', analysisResponse.status);
        if (!analysisResponse.ok) {
          const errorText = await analysisResponse.text();
          console.error('🌱 GARDEN.FORM: Analysis API error:', errorText);
          throw new Error(`Failed to fetch zone analysis: ${analysisResponse.status} ${analysisResponse.statusText}`);
        }
        const analysis = await analysisResponse.json();
        console.log('🌱 GARDEN.FORM: Analysis data received:', analysis);
        console.log('🌱 GARDEN.FORM: Sample recommendation structure:', analysis.recommendations?.[0]);
        if (!isMounted) return;
        setRecommendations(analysis.recommendations || []);
        
        // 3. Fetch zones list from schedule API
        console.log('🌱 GARDEN.FORM: Fetching zones from:', '/api/schedule');
        const zonesResponse = await fetch('/api/schedule', {
          signal: abortController.signal
        });
        console.log('🌱 GARDEN.FORM: Zones response status:', zonesResponse.status);
        if (!zonesResponse.ok) {
          const errorText = await zonesResponse.text();
          console.error('🌱 GARDEN.FORM: Zones API error:', errorText);
          throw new Error(`Failed to fetch zones: ${zonesResponse.status} ${zonesResponse.statusText}`);
        }
        const zonesData = await zonesResponse.json();
        console.log('🌱 GARDEN.FORM: Zones data received:', zonesData);
        console.log('🌱 GARDEN.FORM: Sample zone structure:', typeof zonesData, Array.isArray(zonesData));
        console.log('🌱 GARDEN.FORM: All zones with cycles:', zonesData?.map((z: any) => ({ zone_id: z.zone_id, cycles: z.cycles, period: z.period })));
        
        // 🔍 CRITICAL DEBUG: Check duration values from API
        console.log('🔍 GARDEN.FORM DEBUG - Zone durations from API:');
        zonesData?.forEach((zone: any) => {
          if (zone.zone_id === 1) {
            console.log(`  🎯 Zone ${zone.zone_id}:`, {
              mode: zone.mode,
              duration: zone.times?.[0]?.duration,
              period: zone.period,
              cycles: zone.cycles,
              fullZoneData: zone
            });
          }
        });
        
        if (!isMounted) return;
        setZones(zonesData || []);

        // 4. Fetch locations list
        console.log('🌱 GARDEN.FORM: Fetching locations from:', '/api/locations');
        const locationsResponse = await fetch('/api/locations', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        console.log('🌱 GARDEN.FORM: Locations response status:', locationsResponse.status);
        if (!locationsResponse.ok) {
          const errorText = await locationsResponse.text();
          console.error('🌱 GARDEN.FORM: Locations API error:', errorText);
          throw new Error(`Failed to fetch locations: ${locationsResponse.status} ${locationsResponse.statusText}`);
        }
        const locationsData = await locationsResponse.json();
        console.log('🌱 GARDEN.FORM: Locations data received:', locationsData);
        console.log('🌱 GARDEN.FORM: Locations data structure:', typeof locationsData, Array.isArray(locationsData));
        console.log('🌱 GARDEN.FORM: Sample location:', locationsData.locations?.[0] || locationsData[Object.keys(locationsData)[0]]);
        
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
        
        console.log('🌱 GARDEN.FORM: Processed locations array:', locationsArray);
        setLocations(locationsArray);

        // 5. Read zone selection mode from settings
        console.log('🌱 GARDEN.FORM: Fetching settings from:', '/config/settings.cfg');
        const settingsResponse = await fetch('/config/settings.cfg', {
          signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        console.log('🌱 GARDEN.FORM: Settings response status:', settingsResponse.status);
        if (settingsResponse.ok) {
          const settingsText = await settingsResponse.text();
          console.log('🌱 GARDEN.FORM: Settings text received:', settingsText.substring(0, 200) + '...');
          // Parse INI format to find mode
          const modeMatch = settingsText.match(/mode\s*=\s*(\w+)/);
          if (modeMatch) {
            const mode = modeMatch[1] === 'smart' ? 'smart' : 'manual';
            console.log('🌱 GARDEN.FORM: Setting zone selection mode to:', mode);
            setZoneSelectionMode(mode);
            setSystemMode(mode); // Set system mode from settings
          } else {
            console.log('🌱 GARDEN.FORM: No mode found in settings, defaulting to smart');
            setZoneSelectionMode('smart');
            setSystemMode('smart');
          }
        } else {
          console.log('🌱 GARDEN.FORM: Settings fetch failed, defaulting to smart mode');
          setZoneSelectionMode('smart');
          setSystemMode('smart');
        }

        // Auto-select best match in smart mode after all data is loaded
        const recommendationsData = analysis.recommendations || [];
        console.log('🌱 GARDEN.FORM: Auto-selection check:', { 
          recommendationsLength: recommendationsData.length, 
          locationsLength: locationsArray.length,
          systemMode,
          zoneSelectionMode 
        });
        
        if (recommendationsData.length > 0 && locationsArray.length > 0) {
          const bestMatch = recommendationsData[0]; // First recommendation is best match
          console.log('🌱 GARDEN.FORM: Auto-selecting best match after data load:', bestMatch);
          
          // Set the smart recommended emitter from the analysis
          if (bestMatch.emitter_analysis?.recommended_emitter) {
            const recommendedEmitter = bestMatch.emitter_analysis.recommended_emitter.toString();
            console.log('🌱 GARDEN.FORM: Setting smart recommended emitter from analysis:', recommendedEmitter);
            setSmartRecommendedEmitter(recommendedEmitter);
          }
          
          // Find locations that have this zone
          const locationsWithZone = locationsArray.filter((loc: any) => loc.zones.includes(bestMatch.zone_id));
          console.log('🌱 GARDEN.FORM: Locations with best match zone:', locationsWithZone);
          
          if (locationsWithZone.length > 0) {
            const newModalData = {
              zoneId: bestMatch.zone_id.toString(),
              locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
            };
            console.log('🌱 GARDEN.FORM: Setting modal data with auto-selected location:', newModalData);
            setModalData(prev => ({
              ...prev,
              ...newModalData
            }));
          } else {
            const newModalData = {
              zoneId: bestMatch.zone_id.toString(),
              locationId: '' // Clear location since none support this zone
            };
            console.log('🌱 GARDEN.FORM: Setting modal data without location (no locations support zone):', newModalData);
            setModalData(prev => ({
              ...prev,
              ...newModalData
            }));
          }
          
          // Calculate emitter for the auto-selected zone (always in smart mode during auto-selection)
          console.log('Debug auto-emitter trigger:', { systemMode, zoneSelectionMode, bestMatchZone: bestMatch.zone_id });
          if (systemMode === 'smart' || zoneSelectionMode === 'smart') {
            console.log('Triggering auto-emitter calculation for zone', bestMatch.zone_id);
            const calculateEmitterForZone = async () => {
              try {
                const response = await fetch(`${getApiBaseUrl()}/api/smart/validate-compatibility`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    plant_id: plant_id,
                    library_book: library_book,
                    zone_id: bestMatch.zone_id
                  }),
                });
                
                if (response.ok) {
                  const result = await response.json();
                  console.log('Auto-emitter API response:', result);
                  if (result.status === 'success') {
                    console.log('Auto-emitter calculation for zone', bestMatch.zone_id, ':', result.data.emitter_validation);
                    
                    // Update the recommendation with the new emitter calculation
                    const updatedRecommendations = recommendationsData.map((rec: any) => {
                      if (rec.zone_id === bestMatch.zone_id) {
                        return {
                          ...rec,
                          emitter_analysis: result.data.emitter_validation.emitter_calculation
                        };
                      }
                      return rec;
                    });
                    setRecommendations(updatedRecommendations);
                    
                    // CRITICAL: Update modalData.emitterSize with the recommended emitter
                    setModalData(prev => ({
                      ...prev,
                      emitterSize: result.data.emitter_validation.emitter_calculation.recommended_emitter.toString()
                    }));
                  }
                } else {
                  console.error('Auto-emitter API failed with status:', response.status);
                  const errorText = await response.text();
                  console.error('Error response:', errorText);
                }
              } catch (error) {
                console.error('Failed to calculate emitter for auto-selected zone', bestMatch.zone_id, ':', error);
              }
            };
            
            calculateEmitterForZone();
          }
        }

        console.log('🌱 GARDEN.FORM: Data fetch completed successfully');
        if (!isMounted) return;
        setLoading(false);
      } catch (err) {
        // Don't treat AbortError as a real error - it's just cleanup
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('🌱 GARDEN.FORM: Data fetch aborted (component cleanup)');
          return; // Don't set error state for aborted requests
        }
        
        console.error('🌱 GARDEN.FORM: Data fetch failed:', err);
        if (!isMounted) return; // Don't update state if unmounted
        setError(err instanceof Error ? err.message : 'Failed to load data');
        setLoading(false);
      }
    };

    console.log('🌱 GARDEN.FORM: Starting data fetch...');
    fetchData();
    
    return () => {
      isMounted = false;
      abortController.abort();
    };
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
    console.log('🌱 GARDEN.FORM: Click-outside triggered!');
    console.log('🌱 GARDEN.FORM: Layer state check:', { 
      isTopLayer, 
      isAnyFormAbove: isAnyFormAbove(FORM_ID),
      shouldClose: isTopLayer && !isAnyFormAbove(FORM_ID)
    });
    if (onCancel) {
      console.log('🌱 GARDEN.FORM: Calling onCancel callback');
      onCancel();
    } else {
      console.log('🌱 GARDEN.FORM: No onCancel callback provided');
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
                      
                      // Calculate emitter size for the selected zone
                      const calculateEmitterForZone = async () => {
                        console.log('🌱 GARDEN.FORM: Calculating emitter for zone:', zoneId);
                        try {
                          const requestData = {
                            plant_id: plant_id,
                            library_book: library_book,
                            zone_id: zoneId
                          };
                          console.log('🌱 GARDEN.FORM: Sending emitter calculation request:', requestData);
                          
                          const response = await fetch(`${getApiBaseUrl()}/api/smart/validate-compatibility`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(requestData),
                          });
                          
                          console.log('🌱 GARDEN.FORM: Emitter calculation response status:', response.status);
                          
                          if (response.ok) {
                            const result = await response.json();
                            console.log('🌱 GARDEN.FORM: Emitter calculation result:', result);
                            
                            if (result.status === 'success') {
                              console.log('🌱 GARDEN.FORM: Emitter calculation for zone', zoneId, ':', result.data.emitter_validation);
                              
                              // Update the recommendation with the new emitter calculation
                              const updatedRecommendations = recommendations.map(rec => {
                                if (rec.zone_id === zoneId) {
                                  return {
                                    ...rec,
                                    emitter_analysis: result.data.emitter_validation.emitter_calculation
                                  };
                                }
                                return rec;
                              });
                              setRecommendations(updatedRecommendations);
                              
                              // CRITICAL: Update modalData.emitterSize with the recommended emitter
                              const recommendedEmitter = result.data.emitter_validation.emitter_calculation.recommended_emitter.toString();
                              console.log('🌱 GARDEN.FORM: Setting recommended emitter size:', recommendedEmitter);
                              setSmartRecommendedEmitter(recommendedEmitter);
                              setModalData(prev => ({
                                ...prev,
                                emitterSize: recommendedEmitter
                              }));
                            } else {
                              console.error('🌱 GARDEN.FORM: Emitter calculation failed with status:', result.status);
                            }
                          } else {
                            console.error('🌱 GARDEN.FORM: Emitter calculation API failed with status:', response.status);
                            const errorText = await response.text();
                            console.error('🌱 GARDEN.FORM: Emitter calculation error response:', errorText);
                          }
                        } catch (error) {
                          console.error('🌱 GARDEN.FORM: Failed to calculate emitter for zone', zoneId, ':', error);
                        }
                      };
                      
                      // Calculate emitter size when zone is selected
                      if (zoneSelectionMode === 'smart') {
                        calculateEmitterForZone();
                      }
                      
                      if (locationsWithZone.length > 0) {
                        const newModalData = {
                          ...modalData,
                          zoneId: zoneId.toString(),
                          locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
                        };
                        console.log('🌱 GARDEN.FORM: Setting modal data with location:', newModalData);
                        setModalData(newModalData);
                      } else {
                        // Just set the zone if no locations support it
                        const newModalData = {
                          ...modalData,
                          zoneId: zoneId.toString(),
                          locationId: '' // Clear location since none support this zone
                        };
                        console.log('🌱 GARDEN.FORM: Setting modal data without location:', newModalData);
                        setModalData(newModalData);
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
            console.log('🌱 GARDEN.FORM: Form submission started');
            console.log('🌱 GARDEN.FORM: Modal data validation:', {
              zoneId: modalData.zoneId,
              locationId: modalData.locationId,
              quantity: modalData.quantity,
              emitterSize: modalData.emitterSize,
              allRequired: !!(modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize)
            });
            
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
              
              console.log('🌱 GARDEN.FORM: Form data prepared for submission:', formData);
              
              try {
                setSaveStatus('saving');
                setSaveMessage('Placing plant...');
                console.log('🌱 GARDEN.FORM: Sending plant placement request to /api/map/save');
                
                // Send to plant manager API to update map.json
                const response = await fetch('/api/map/save', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(formData)
                });
                
                console.log('🌱 GARDEN.FORM: Plant placement response status:', response.status);
                
                if (response.ok) {
                  const result = await response.json();
                  console.log('🌱 GARDEN.FORM: Plant placement successful:', result);
                  setSaveStatus('success');
                  setSaveMessage('Plant placed successfully!');
                  
                  // Auto-hide success message and close form after 2 seconds
                  setTimeout(() => {
                    console.log('🌱 GARDEN.FORM: Auto-closing form after successful placement');
                    setSaveStatus('idle');
                    setSaveMessage('');
                    onSuccess?.(formData);
                  }, 2000);
                } else {
                  const errorData = await response.json().catch(() => ({}));
                  console.error('🌱 GARDEN.FORM: Plant placement failed:', errorData);
                  throw new Error(errorData.message || 'Failed to place plant');
                }
              } catch (err) {
                console.error('🌱 GARDEN.FORM: Error placing plant:', err);
                setSaveStatus('error');
                setSaveMessage(err instanceof Error ? err.message : 'Failed to place plant');
                
                // Auto-hide error message after 4 seconds
                setTimeout(() => {
                  console.log('🌱 GARDEN.FORM: Auto-hiding error message');
                  setSaveStatus('idle');
                  setSaveMessage('');
                }, 4000);
              }
            } else {
              console.error('🌱 GARDEN.FORM: Form submission blocked - missing required fields:', modalData);
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
                      console.log('🌱 GARDEN.FORM: Quantity selected:', num);
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
                  const isSmartRecommended = smartRecommendedEmitter === normalizedSize;
                  const isSmartMode = emitterSizingMode === 'smart';
                  const isSmartRecommendedAndSelected = isSmartRecommended && isSmartMode && isSelected;
                  
                  return (
                    <div
                      key={size}
                      onClick={() => {
                        console.log('🌱 GARDEN.FORM: Emitter size selected:', size, 'normalized:', normalizedSize);
                        setModalData({ ...modalData, emitterSize: normalizedSize });
                        setCustomEmitterSize(''); // Clear custom value when selecting predefined
                        
                        // If user manually selects something other than smart recommendation, switch to manual mode
                        if (isSmartMode && !isSmartRecommended) {
                          console.log('🌱 GARDEN.FORM: Switching to manual emitter mode due to non-smart selection');
                          setEmitterSizingMode('manual');
                        }
                      }}
                      className={`form-select-button form-emitter-button ${isSelected ? 'form-select-button--selected' : ''} ${isSmartRecommendedAndSelected ? 'form-emitter-button--smart-recommended' : ''}`}
                    >
                      {size} GPH
                      {isSmartRecommended && isSmartMode && (
                        <div className="form-emitter-button--smart-recommended-indicator" style={{
                          color: isSelected ? '#ffffff' : '#28a745',
                          fontWeight: 'bold',
                          marginLeft: '4px'
                        }}>
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
                      onClick={() => {
                        console.log('🌱 GARDEN.FORM: Location selected:', loc.location_id, loc.name);
                        setModalData({ ...modalData, locationId: loc.location_id.toString() });
                      }}
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
                  console.log('🌱 GARDEN.FORM: Cancel button clicked');
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
                  const refreshAnalysisData = {
                    plant_id,
                    library_book: library_book.replace('.json', ''), // Remove .json extension if present
                    common_name: plantData?.common_name || 'Unknown Plant'
                  };
                  const analysisResponse = await fetch('/api/smart/analyze-placement', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(refreshAnalysisData)
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