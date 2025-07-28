import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getApiBaseUrl } from './utils';

// Helper to format HHMMSS as human readable
function formatDuration(d: string): string {
  if (!d) return 'N/A';
  
  // Handle new HH:mm:ss format
  if (d.includes(':') && d.length === 8) {
    const parts = d.split(':');
    if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseInt(parts[2], 10);
      let out = '';
      if (h) out += `${h}h `;
      if (m) out += `${m}m `;
      if (s) out += `${s}s`;
      return out.trim() || '0s';
    }
  }
  
  // Handle legacy HHmmss format (6 digits)
  if (d.length === 6 && !d.includes(':')) {
    const h = parseInt(d.slice(0, 2), 10);
    const m = parseInt(d.slice(2, 4), 10);
    const s = parseInt(d.slice(4, 6), 10);
    let out = '';
    if (h) out += `${h}h `;
    if (m) out += `${m}m `;
    if (s) out += `${s}s`;
    return out.trim() || '0s';
  }
  
  return 'N/A';
}

/**
 * CRITICAL DATA RELATIONSHIPS & ID SYSTEM
 * =======================================
 * 
 * This application uses three distinct ID systems that must be understood to prevent data corruption:
 * 
 * 1. LOCATION_ID (location_id)
 *    - Used in: locations.json, map.json (plant instances)
 *    - Purpose: Identifies physical garden locations (e.g., "orchard", "perimeter")
 *    - Behavior: When a location is deleted, plant instances with that location_id become orphaned
 *    - This is ACCEPTABLE - orphaned instances can still function with their zone_id
 * 
 * 2. ZONE_ID (zone_id) 
 *    - Used in: gpio.cfg, schedule.json, map.json (plant instances)
 *    - Purpose: Identifies irrigation zones and corresponds to relay channels (1+)
 *    - Behavior: Zone deletion would break plant instances, so zones should not be deleted
 *    - Critical: zone_id = relay channel number (1-based)
 * 
 * 3. INSTANCE_ID (instance_id)
 *    - Used in: map.json (plant instances)
 *    - Purpose: Unique identifier for each individual plant instance in the field
 *    - Behavior: This is the PRIMARY key for plant operations (add, remove, edit)
 *    - Format: Generated as combination of location_id + plant_id + zone_id + quantity + emitter_size + timestamp
 *    - Critical: Always use instance_id for plant operations, never plant_id
 * 
 * PLANT_ID vs INSTANCE_ID:
 * - plant_id: References the plant type in the library (e.g., "Strawberry, Red")
 * - instance_id: References the specific plant instance in the field (e.g., "10 strawberry plants in zone 2")
 * 
 * DATA INTEGRITY RULES:
 * - When working with plants: Use instance_id (not plant_id)
 * - When working with locations: Use location_id
 * - When working with zones: Use zone_id
 * - Location deletion creates orphaned instances (acceptable)
 * - Zone deletion would break instances (prevent this)
 * - Instance deletion is safe (removes specific plant group)
 */

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

interface PlantBook {
  bookName: string;
  plants: PlantEntry[];
}

interface AssignedPlant {
  plant: PlantEntry;
  quantity: number;
  emitterSize: number;
  zoneId: number;
  location_id: number;
  instanceId: string;
  comments?: string;
}

interface Location {
  location_id: number;
  name: string;
  description: string;
  zones: number[];
  assignedPlants?: AssignedPlant[];
}

interface Zone {
  zone_id: number;
  comment: string;
  period: string;
  cycles: number;
  mode?: string;
  times?: { start_time: string; duration: string }[];
  time?: { start_time: string; duration: string };
}

// Helper functions for next scheduled time calculation
function getNextScheduledDate(zone: any, zoneResolvedTimes?: Record<number, Record<string, string>>): Date | null {
  if (!zone || !zone.period || !zone.cycles) return null;
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  switch (zone.period) {
    case 'D': // Daily
      // Check if any times haven't passed today, otherwise tomorrow
      if (Array.isArray(zone.times)) {
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
        
        // Check if any scheduled times are still coming today
        const hasTimeToday = zone.times.some((t: any) => {
          const timeValue = t.start_time;
          
          // Handle HH:MM format directly
          if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
            const [h, m] = timeValue.split(':').map(Number);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
              return (h * 60 + m) > currentTime;
            }
          }
          
          // Handle resolved times (solar times, legacy HHMM)
          if (zoneResolvedTimes && zoneResolvedTimes[zone.zone_id]?.[timeValue]) {
            const resolved = zoneResolvedTimes[zone.zone_id][timeValue];
            if (resolved && resolved !== 'N/A' && resolved !== '...') {
              const [h, m] = resolved.split(':').map(Number);
              if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                return (h * 60 + m) > currentTime;
              }
            }
          }
          return false; // Fallback if no resolved time available
        });
        
        if (hasTimeToday) {
          return today; // Next run is today
        } else {
          // Next run is tomorrow
          return new Date(today.getTime() + 24 * 60 * 60 * 1000);
        }
      }
      
      // Fallback to today if no times array
      return today;
      
    case 'W': // Weekly
      const daysSinceStart = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
      const weeksSinceStart = Math.floor(daysSinceStart / 7);
      const nextWeekStart = new Date(today.getTime() + (weeksSinceStart + 1) * 7 * 24 * 60 * 60 * 1000);
      return nextWeekStart;
      
    case 'M': // Monthly
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return nextMonth;
      
    default:
      return null;
  }
}

function getNextDailyTime(zone: any, zoneResolvedTimes: Record<number, Record<string, string>>): string {
  if (zone.period !== 'D') return '...';
  
  const now = new Date();
  const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
  
  // Get all times for this zone
  let allTimes: Array<{ time: string; minutes: number; original: any }> = [];
  
  if (Array.isArray(zone.times)) {
    // All times in array
    allTimes = zone.times.map((t: any) => {
      const timeValue = t.start_time;
      
      // Handle HH:MM format directly (no resolution needed)
      if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
        const [h, m] = timeValue.split(':').map(Number);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
          return { time: timeValue, minutes: h * 60 + m, original: timeValue };
        }
      }
      
      // Handle solar times and legacy HHMM format through resolution
      const resolved = zoneResolvedTimes[zone.zone_id]?.[timeValue];
      if (resolved && resolved !== 'N/A' && resolved !== '...') {
        // Convert HH:MM to minutes for comparison
        const [h, m] = resolved.split(':').map(Number);
        return { time: resolved, minutes: h * 60 + m, original: timeValue };
      }
      
      return null;
    }).filter(Boolean) as Array<{ time: string; minutes: number; original: any }>;
  }
  
  if (allTimes.length === 0) return '...';
  
  // Find the next time (first time that's after current time)
  const nextTime = allTimes
    .filter(t => t.minutes > currentTime)
    .sort((a, b) => a.minutes - b.minutes)[0];
  
  if (nextTime) {
    return nextTime.time;
  }
  
  // If no times today, return the first time for tomorrow
  return allTimes.sort((a, b) => a.minutes - b.minutes)[0].time;
}

  // Helper: format seconds as MM:SS (like Overview page)
  function formatCountdown(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function parseManualTimeInput(input: string): { hours: number; minutes: number; seconds: number; isValid: boolean; error: string } {
    if (!input) {
      return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Enter a duration' };
    }
    
    // Handle HH:mm:ss format
    if (input.includes(':')) {
      const parts = input.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const seconds = parseInt(parts[2], 10) || 0;
        
        // Validate ranges
        if (hours > 23) {
          return { hours, minutes, seconds, isValid: false, error: 'Hours cannot exceed 23' };
        }
        if (minutes > 59) {
          return { hours, minutes, seconds, isValid: false, error: 'Minutes cannot exceed 59' };
        }
        if (seconds > 59) {
          return { hours, minutes, seconds, isValid: false, error: 'Seconds cannot exceed 59' };
        }
        
        return { hours, minutes, seconds, isValid: true, error: '' };
      }
    }
    
    // Handle legacy numeric input (backward compatibility)
    const cleanInput = input.replace(/[^0-9]/g, '');
    if (cleanInput) {
      // Pad with leading zeros to 6 digits (HHmmss format)
      const paddedInput = cleanInput.padStart(6, '0');
      
      // Extract hours, minutes, and seconds
      const hours = parseInt(paddedInput.slice(0, 2), 10);
      const minutes = parseInt(paddedInput.slice(2, 4), 10);
      const seconds = parseInt(paddedInput.slice(4, 6), 10);
      
      // Validate ranges
      if (hours > 23) {
        return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Hours must be 0-23' };
      }
      if (minutes > 59) {
        return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Minutes must be 0-59' };
      }
      if (seconds > 59) {
        return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Seconds must be 0-59' };
      }
      if (hours === 0 && minutes === 0 && seconds === 0) {
        return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Enter a positive duration' };
      }
      
      return { hours, minutes, seconds, isValid: true, error: '' };
    }
    
    return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Invalid format. Use HH:mm:ss' };
  }



  function formatNextScheduledTime(zone: any, zoneResolvedTimes: Record<number, Record<string, string>>, dateSpecificResolvedTimes: Record<string, Record<string, string>>): string {
    // Calculate the next scheduled date for all periods
    const nextDate = getNextScheduledDate(zone, zoneResolvedTimes);
    if (!nextDate) return '...';
    
    // Return just the date portion for all schedules
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const nextDateOnly = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    
    // Compare dates only (ignore time components)
    if (nextDateOnly.getTime() === today.getTime()) {
      return 'Today';
    } else if (nextDateOnly.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
          } else {
      return nextDate.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit' 
              });
            }
          }

export default function GardenOverview() {
  console.log('=== GARDEN OVERVIEW COMPONENT STARTING ===');
  const [libraryFiles, setLibraryFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plantBooks, setPlantBooks] = useState<Record<string, PlantBook>>({});
  const [selectedPlants, setSelectedPlants] = useState<Record<string, number | ''>>({});
  const [heldPlant, setHeldPlant] = useState<{ plant: PlantEntry; bookFile: string } | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneResolvedTimes, setZoneResolvedTimes] = useState<Record<number, Record<string, string>>>({});
  const [resolvedTimes, setResolvedTimes] = useState<Record<number, string[] | null>>({});
  // Store resolved times for specific dates (for weekly/monthly schedules)
  const [dateSpecificResolvedTimes, setDateSpecificResolvedTimes] = useState<Record<string, Record<string, string>>>({});
  const [modal, setModal] = useState<null | { locationIdx: number }>(null);
  const [modalData, setModalData] = useState<{ quantity: string; emitterSize: string; zoneId: string; locationId: string; comments: string; noCompatibleZones?: boolean }>({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'location' | 'zone'>('zone');
  const [smartRecommendations, setSmartRecommendations] = useState<{ plantName: string; recommendations: any[]; hasCompatibleZones: boolean } | null>(null);
  const [globalSmartMode, setGlobalSmartMode] = useState(false);
  const [smartPlacementModal, setSmartPlacementModal] = useState<{ 
    plant: PlantEntry; 
    bookFile: string; 
    recommendations: any[];
    optimal_emitter_analysis?: any;
    emitterSizingMode: 'smart' | 'manual';
    zoneSelectionMode: 'smart' | 'manual';
  } | null>(null);

  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [selectedLocationZones, setSelectedLocationZones] = useState<number[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);
  const [zoneSelectionMode, setZoneSelectionMode] = useState<'smart' | 'manual'>('smart');
  const [reassignMessage, setReassignMessage] = useState<string>('');
  const [reassignInstanceId, setReassignInstanceId] = useState<string>('');
  const [pumpStatus, setPumpStatus] = useState<{ active: boolean; remaining?: number } | null>(null);
  const [zoneStates, setZoneStates] = useState<Record<number, { active: boolean; remaining?: number }>>({});
  
  // Zone state validation system
  const [expectedZoneStates, setExpectedZoneStates] = useState<Record<number, boolean>>({});
  const [zoneTransitionTimestamps, setZoneTransitionTimestamps] = useState<Record<number, number>>({});
  const [zoneValidationStates, setZoneValidationStates] = useState<Record<number, 'green' | 'gray' | 'orange' | 'red'>>({});
  
  // Manual timer state
  const [showManualControl, setShowManualControl] = useState<number | null>(null);
  const [manualInput, setManualInput] = useState<Record<number, string>>({});
  const [manualInputError, setManualInputError] = useState<Record<number, string>>({});
  const [manualTimerModal, setManualTimerModal] = useState<{ zoneId: number; zoneName: string } | null>(null);

  // Zone configuration modal state (for auto-creation)
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'manual' | 'smart'>('manual');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  function startManualTimer(zone_id: number, seconds: number) {
    // Set expected state to ON and start transition timer
    setExpectedZoneStates(prev => ({ ...prev, [zone_id]: true }));
    setZoneTransitionTimestamps(prev => ({ ...prev, [zone_id]: Date.now() }));
    setZoneValidationStates(prev => ({ ...prev, [zone_id]: 'orange' }));
    
    fetch(`${getApiBaseUrl()}/api/manual-timer/${zone_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: seconds })
    })
    .then(response => {
      if (response.ok) {
        // Clear input and hide control only on success
        setManualInput(inp => ({ ...inp, [zone_id]: '' }));
        setManualInputError(errs => ({ ...errs, [zone_id]: '' }));
        setShowManualControl(null);
      } else {
        console.error(`Failed to start manual timer for zone ${zone_id}:`, response.status);
        alert('Failed to start manual timer. Please try again.');
        // Reset expected state on failure
        setExpectedZoneStates(prev => ({ ...prev, [zone_id]: false }));
        setZoneValidationStates(prev => ({ ...prev, [zone_id]: 'gray' }));
      }
    })
    .catch(error => {
      console.error('Error starting manual timer:', error);
      alert('Error starting manual timer. Please try again.');
      // Reset expected state on failure
      setExpectedZoneStates(prev => ({ ...prev, [zone_id]: false }));
      setZoneValidationStates(prev => ({ ...prev, [zone_id]: 'gray' }));
    });
  }

  function stopManualTimer(zone_id: number) {
    // Set expected state to OFF and start transition timer
    setExpectedZoneStates(prev => ({ ...prev, [zone_id]: false }));
    setZoneTransitionTimestamps(prev => ({ ...prev, [zone_id]: Date.now() }));
    setZoneValidationStates(prev => ({ ...prev, [zone_id]: 'orange' }));
    
    fetch(`${getApiBaseUrl()}/api/manual-timer/${zone_id}`, {
      method: 'DELETE'
    })
    .then(response => {
      if (response.ok) {
        setShowManualControl(null);
        } else {
        console.error(`Failed to stop manual timer for zone ${zone_id}:`, response.status);
        alert('Failed to stop manual timer. Please try again.');
        // Reset expected state on failure
        setExpectedZoneStates(prev => ({ ...prev, [zone_id]: true }));
        setZoneValidationStates(prev => ({ ...prev, [zone_id]: 'green' }));
      }
    })
    .catch(error => {
      console.error('Error stopping manual timer:', error);
      alert('Error stopping manual timer. Please try again.');
      // Reset expected state on failure
      setExpectedZoneStates(prev => ({ ...prev, [zone_id]: true }));
      setZoneValidationStates(prev => ({ ...prev, [zone_id]: 'green' }));
    });
  }

  // Handle reassignment from health alerts
  useEffect(() => {
    const reassignId = searchParams.get('reassign');
    if (reassignId) {
      // Clear the URL parameter
      navigate('/', { replace: true });
      
      // Set reassignment data
      setReassignInstanceId(reassignId);
      setReassignMessage(`Select a location to reassign the orphaned plant (Instance ${reassignId})`);
      
      // Clear message after 10 seconds
      setTimeout(() => setReassignMessage(''), 10000);
    }
  }, [searchParams, navigate]);

  // Handle clicking outside of valid drop targets to cancel placement
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!heldPlant) return;
      
      const target = event.target as HTMLElement;
      
      // Check if click is on a valid drop target
      const isValidDropTarget = target.closest('[data-drop-target="true"]') || 
                               target.closest('[data-modal="true"]') ||
                               target.closest('[data-plant-library="true"]');
      
      // If click is not on a valid drop target, cancel the held plant
      if (!isValidDropTarget) {
        setHeldPlant(null);
        setModal(null);
        setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
        setError(''); // Clear error when canceling plant selection
      }
    };

    if (heldPlant) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [heldPlant]);

  // Load global smart mode setting and status data
  useEffect(() => {
    const loadSettingsAndStatus = async () => {
      try {
        // Load smart mode setting and GPIO config in parallel
        const [settingsRes, gpioRes] = await Promise.all([
          fetch(`${getApiBaseUrl()}/config/settings.cfg`),
          fetch(`${getApiBaseUrl()}/config/gpio.cfg`)
        ]);
        
        const [settings, gpioConfig] = await Promise.all([
          settingsRes.json(),
          gpioRes.json()
        ]);
        
        setGlobalSmartMode(settings.mode === 'smart');
        const pumpZoneId = gpioConfig.pumpIndex || 0;

        // Load live zone status and timers in parallel
        let zoneStatusData = {};
        let timersData = { timers: {} };
        
        try {
          const [zoneStatusRes, timersRes] = await Promise.all([
            fetch(`${getApiBaseUrl()}/api/zones/status`),
            fetch(`${getApiBaseUrl()}/api/scheduler/timers`)
          ]);
          
          if (zoneStatusRes.ok) {
            zoneStatusData = await zoneStatusRes.json();
          }
          
          if (timersRes.ok) {
            timersData = await timersRes.json();
          }
        } catch (err) {
          // Silently handle errors for status updates
        }
        
        // Convert zone status to our format
        const newZoneStates: Record<number, { active: boolean; remaining?: number }> = {};
        
        // Process zone status (hardware state)
        Object.entries(zoneStatusData).forEach(([zoneId, status]: [string, any]) => {
          const zoneIdNum = parseInt(zoneId);
          newZoneStates[zoneIdNum] = {
            active: status.active || false,
            remaining: status.remaining || 0
          };
        });
        
        // Override with manual timer data (from active_zones.json) for active timers
        if (timersData.timers) {
          Object.entries(timersData.timers).forEach(([zoneId, timer]: [string, any]) => {
            const zoneIdNum = parseInt(zoneId);
            if (timer.active) {
              newZoneStates[zoneIdNum] = {
                active: true,
                remaining: timer.remaining_seconds || 0
              };
            }
          });
        }
        
        setZoneStates(newZoneStates);
        
        // Validate zone states against expected states
        const newValidationStates: Record<number, 'green' | 'gray' | 'orange' | 'red'> = {};
        const now = Date.now();
        const TIMEOUT_MS = 30000; // 30 seconds
        
        Object.entries(newZoneStates).forEach(([zoneId, status]) => {
          const zoneIdNum = parseInt(zoneId);
          const expectedState = expectedZoneStates[zoneIdNum];
          const transitionTimestamp = zoneTransitionTimestamps[zoneIdNum];
          const actualState = status.active;
          
          // If no expected state is set, initialize based on current state
          if (expectedState === undefined) {
            setExpectedZoneStates(prev => ({ ...prev, [zoneIdNum]: actualState }));
            newValidationStates[zoneIdNum] = actualState ? 'green' : 'gray';
            return;
          }
          
          // Check if we're in a transition period
          if (transitionTimestamp && (now - transitionTimestamp) < TIMEOUT_MS) {
            // Still in transition period - check if states match
            if (expectedState === actualState) {
              // States match - transition complete
              newValidationStates[zoneIdNum] = expectedState ? 'green' : 'gray';
              setZoneTransitionTimestamps(prev => {
                const newTimestamps = { ...prev };
                delete newTimestamps[zoneIdNum];
                return newTimestamps;
              });
            } else {
              // States don't match - still orange (pending)
              newValidationStates[zoneIdNum] = 'orange';
            }
          } else if (transitionTimestamp && (now - transitionTimestamp) >= TIMEOUT_MS) {
            // Timeout reached - states should match by now
            if (expectedState === actualState) {
              // States match - transition complete
              newValidationStates[zoneIdNum] = expectedState ? 'green' : 'gray';
              setZoneTransitionTimestamps(prev => {
                const newTimestamps = { ...prev };
                delete newTimestamps[zoneIdNum];
                return newTimestamps;
              });
            } else {
              // States don't match - timeout error
              newValidationStates[zoneIdNum] = 'red';
              console.error(`CRITICAL: Zone ${zoneIdNum} state mismatch after timeout. Expected: ${expectedState}, Actual: ${actualState}`);
              // Log critical alert
              fetch(`${getApiBaseUrl()}/api/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  level: 'CRITICAL',
                  message: `Zone ${zoneIdNum} state mismatch after timeout. Expected: ${expectedState}, Actual: ${actualState}`,
                  timestamp: new Date().toISOString()
                })
              }).catch(err => console.error('Failed to log critical alert:', err));
            }
          } else {
            // No transition in progress - states should match
            if (expectedState === actualState) {
              newValidationStates[zoneIdNum] = expectedState ? 'green' : 'gray';
            } else {
              // Unexpected mismatch - set to red
              newValidationStates[zoneIdNum] = 'red';
              console.error(`CRITICAL: Zone ${zoneIdNum} unexpected state mismatch. Expected: ${expectedState}, Actual: ${actualState}`);
            }
          }
        });
        
        setZoneValidationStates(newValidationStates);
        


        // Set pump status based on any active zone (like Overview page)
        const anyZoneRunning = Object.values(newZoneStates).some(status => status.active);
        if (anyZoneRunning) {
          // Find the zone with the longest remaining time for pump display
          let maxRemaining = 0;
          Object.values(newZoneStates).forEach(status => {
            if (status.active && status.remaining && status.remaining > maxRemaining) {
              maxRemaining = status.remaining;
            }
          });
          
          setPumpStatus({
            active: true,
            remaining: maxRemaining
          });
        } else {
          setPumpStatus({
            active: false,
            remaining: 0
          });
        }
      } catch (err) {
        console.log('Failed to load settings or status:', err);
        setGlobalSmartMode(false);
      }
    };

    loadSettingsAndStatus();
    
    // Refresh status every 5 seconds for real-time updates (less aggressive)
    const statusInterval = setInterval(loadSettingsAndStatus, 5000);
    return () => clearInterval(statusInterval);
  }, []);

  // Load locations and zones from backend
  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/library-files`)
      .then(res => res.json())
      .then(async files => {
        // Extract filenames from the response objects
        const filenames = files.map((fileObj: any) => fileObj.filename);
        
        // Sort files by priority
        const sortedFiles = filenames.sort((a: string, b: string) => {
          // custom.json always has highest priority (00)
          if (a === 'custom.json') return -1;
          if (b === 'custom.json') return 1;
          
          // Extract priority numbers from filenames
          const getPriority = (filename: string) => {
            const match = filename.match(/^(\d+)_/);
            return match ? parseInt(match[1], 10) : 99;
          };
          
          const priorityA = getPriority(a);
          const priorityB = getPriority(b);
          
          return priorityA - priorityB;
        });
        
        setLibraryFiles(sortedFiles);
        setLoading(false);
        const books: Record<string, PlantBook> = {};
        await Promise.all(sortedFiles.map(async (file: string) => {
          try {
            const resp = await fetch(`${getApiBaseUrl()}/library/${file}`);
            if (!resp.ok) return;
            const data = await resp.json();
            let bookName = file.replace('.json', '');
            let plants: PlantEntry[] = [];
            if (data && typeof data === 'object' && data['Book Name'] && Array.isArray(data['plants'])) {
              bookName = data['Book Name'];
              plants = data['plants'].map((plant: any) => ({
                plant_id: plant.plant_id,
                common_name: plant.common_name || 'Unknown',
                watering_frequency: plant.watering_frequency,
                preferred_time: plant.preferred_time,
                alternative_name: plant.alternative_name,
                latin_name: plant.latin_name,
                compatible_watering_frequencies: plant.compatible_watering_frequencies,
                compatible_watering_times: plant.compatible_watering_times,
                root_area_sqft: plant.root_area_sqft,
                water_optimal_in_week: plant.water_optimal_in_week,
                tolerance_min_in_week: plant.tolerance_min_in_week,
                tolerance_max_in_week: plant.tolerance_max_in_week,
                usda_zones: plant.usda_zones,
                soil_preference: plant.soil_preference,
                sun_exposure: plant.sun_exposure,
                fruiting_period: plant.fruiting_period,
                planting_time: plant.planting_time,
                spacing_inches: plant.spacing_inches,
                growth_type: plant.growth_type
              }));
            } else if (Array.isArray(data)) {
              plants = data.map((plant: any) => ({
                plant_id: plant.plant_id,
                common_name: plant.common_name || 'Unknown',
                watering_frequency: plant.watering_frequency,
                preferred_time: plant.preferred_time,
                alternative_name: plant.alternative_name,
                latin_name: plant.latin_name,
                compatible_watering_frequencies: plant.compatible_watering_frequencies,
                compatible_watering_times: plant.compatible_watering_times,
                root_area_sqft: plant.root_area_sqft,
                water_optimal_in_week: plant.water_optimal_in_week,
                tolerance_min_in_week: plant.tolerance_min_in_week,
                tolerance_max_in_week: plant.tolerance_max_in_week,
                usda_zones: plant.usda_zones,
                soil_preference: plant.soil_preference,
                sun_exposure: plant.sun_exposure,
                fruiting_period: plant.fruiting_period,
                planting_time: plant.planting_time,
                spacing_inches: plant.spacing_inches,
                growth_type: plant.growth_type
              }));
            }
            books[file] = { bookName, plants };
          } catch {
            books[file] = { bookName: file.replace('.json', ''), plants: [] };
          }
        }));
        setPlantBooks(books);
      })
      .catch(() => {
        setError('Failed to load library files.');
        setLoading(false);
      });

  // Load locations and map data together to ensure proper order
  Promise.all([
    fetch(`${getApiBaseUrl()}/api/locations`).then(res => res.json()),
    fetch(`${getApiBaseUrl()}/api/map`).then(res => res.json())
  ]).then(async ([locationsData, mapData]) => {
      // Load plant library data to get plant names
      const plantLibraryData: Record<string, Record<number, string>> = {};
      try {
        const libraryFiles = await fetch(`${getApiBaseUrl()}/api/library-files`).then(res => res.json());
        const filenames = libraryFiles.map((fileObj: any) => fileObj.filename);
        await Promise.all(filenames.map(async (file: string) => {
          try {
            const resp = await fetch(`${getApiBaseUrl()}/library/${file}`);
            if (!resp.ok) return;
            const data = await resp.json();
            let book: Record<number, string> = {};
            if (data && typeof data === 'object' && data['Book Name'] && Array.isArray(data['plants'])) {
              data['plants'].forEach((plant: any) => {
                book[plant.plant_id] = plant.common_name || 'Unknown';
              });
            } else if (Array.isArray(data)) {
              data.forEach((plant: any) => {
                book[plant.plant_id] = plant.common_name || 'Unknown';
              });
            }
            plantLibraryData[file.replace('.json', '')] = book;
          } catch (err) {
            console.log('Failed to load plant library file:', file);
          }
        }));
      } catch (err) {
        console.log('Failed to load plant library files');
      }

      // Convert map data to assigned plants
      const locationAssignments: Record<number, AssignedPlant[]> = {};
      
      Object.entries(mapData).forEach(([instanceId, instance]: [string, any]) => {
        if (instance && typeof instance === 'object' && instance.location_id) {
            const locationId = instance.location_id;
            if (!locationAssignments[locationId]) {
              locationAssignments[locationId] = [];
            }
            
          // Use common_name from map data if available, otherwise look it up
            const libraryBook = instance.library_book;
          const plantName = instance.common_name || plantLibraryData[libraryBook]?.[instance.plant_id] || `Plant ${instance.plant_id}`;
            
            locationAssignments[locationId].push({
              plant: {
                plant_id: instance.plant_id,
                common_name: plantName
              },
              quantity: instance.quantity,
              emitterSize: instance.emitter_size,
              zoneId: instance.zone_id,
              location_id: instance.location_id,
            instanceId: instanceId,
              comments: instance.comments || ''
          });
        }
      });
      
      // Set locations with assigned plants
      const updatedLocations = locationsData.map((loc: any) => {
        const assignedPlants = locationAssignments[loc.location_id] || [];
        return {
          ...loc,
          assignedPlants
        };
      });
      
      setLocations(updatedLocations);
    }).catch(err => {
      console.log('Failed to load locations or plant assignments:', err);
    });
    // Load zones with complete data and resolve times
    fetch(`${getApiBaseUrl()}/api/schedule`)
      .then(res => res.json())
      .then(async (data) => {
        setZones(data);
        
        // Resolve times for zones in batches to improve performance
        const resolveZoneTimes = async () => {
    try {
      const settingsResp = await fetch(`${getApiBaseUrl()}/config/settings.cfg`);
      const settings = await settingsResp.json();
            
      let lat, lon;
      if (settings.gps_lat !== undefined && settings.gps_lon !== undefined) {
        lat = settings.gps_lat;
        lon = settings.gps_lon;
      } else {
        const coords = settings.coords || [0, 0];
        lat = coords[1];
        lon = coords[0];
      }
            
            const date = new Date().toISOString().slice(0, 10);
            
            // Collect all codes from all zones
            const allCodes: string[] = [];
            const zoneCodeMap: Record<number, string[]> = {};
            
            data.forEach((zone: any) => {
              if (zone.mode === 'disabled') return;
              
              let codes: string[] = [];
              if (Array.isArray(zone.times)) {
                codes = zone.times.map((t: any) => t.start_time || t.value).filter(Boolean);
              } else if (zone.time && (zone.time.start_time || zone.time.value)) {
                codes = [zone.time.start_time || zone.time.value];
              }
              
              // Filter out HH:MM format times (they don't need resolution)
              codes = codes.filter(code => {
                // Skip HH:MM format times
                if (code && code.includes(':') && code.length === 5) {
                  const [h, m] = code.split(':').map(Number);
                  if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                    return false; // Don't resolve HH:MM format
                  }
                }
                return true; // Resolve everything else (solar times, legacy HHMM, etc.)
              });
              
              if (codes.length) {
                zoneCodeMap[zone.zone_id] = codes;
                allCodes.push(...codes);
              }
            });
            
            // Resolve all codes in one request
            if (allCodes.length > 0) {
              const query = { codes: allCodes, date, lat, lon };
      const resp = await fetch(`${getApiBaseUrl()}/api/resolve_times`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
        const resolvedArr = await resp.json();
              
              // Map resolved times back to zones
              let codeIndex = 0;
              const newZoneResolvedTimes: Record<number, Record<string, string>> = {};
              
              Object.entries(zoneCodeMap).forEach(([zoneId, codes]) => {
                const codeToTime: Record<string, string> = {};
                
                // Add resolved times for solar codes and legacy HHMM
                codes.forEach((code) => {
                  codeToTime[code] = resolvedArr[codeIndex] || 'N/A';
                  codeIndex++;
                });
                
                // Add HH:MM format times directly (no resolution needed)
                const zone = data.find((z: any) => z.zone_id === parseInt(zoneId));
                if (zone) {
                  if (Array.isArray(zone.times)) {
                    zone.times.forEach((t: any) => {
                      const timeValue = t.start_time || t.value;
                      if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
                        const [h, m] = timeValue.split(':').map(Number);
                        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                          codeToTime[timeValue] = timeValue; // Use HH:MM directly
                        }
                      }
                    });
                  } else if (zone.time) {
                    const timeValue = zone.time.start_time || zone.time.value;
                    if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
                      const [h, m] = timeValue.split(':').map(Number);
                      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                        codeToTime[timeValue] = timeValue; // Use HH:MM directly
                      }
                    }
                  }
                }
                
                newZoneResolvedTimes[parseInt(zoneId)] = codeToTime;
              });
              
              setZoneResolvedTimes(newZoneResolvedTimes);
            }
          } catch (error) {
            // Silently handle time resolution errors
          }
        };
        
        // Resolve times with a slight delay to avoid blocking initial render
        setTimeout(resolveZoneTimes, 100);
      });
  }, []);

  // When a plant is selected from a dropdown
  const handlePlantSelect = async (file: string, plantId: number | '') => {
    setSelectedPlants(prev => ({ ...prev, [file]: plantId }));
    const plant = plantBooks[file]?.plants.find(p => p.plant_id === plantId) || null;
    setHeldPlant(plantId && plant ? { plant, bookFile: file } : null);
    
    // Clear error when selecting a new plant
    setError('');
    
    // Clear smart recommendations if no plant is selected
    if (!plantId) {
      setSmartRecommendations(null);
      return;
    }

    // If a plant is selected and smart mode is enabled, show smart recommendations
    if (plantId && typeof plantId === 'number' && plant && globalSmartMode) {
      try {
        // Refresh zones data before analysis to ensure we have the latest state
        const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
        if (zonesResponse.ok) {
          const zonesData = await zonesResponse.json();
          setZones(zonesData);
          console.log('Refreshed zones data before smart analysis:', zonesData);
        }

        const plantData = {
          library_book: file.replace('.json', ''),
          plant_id: plantId,
          common_name: plant.common_name,
          quantity: 1, // Default for analysis
          emitter_size: 1.0, // Default for analysis
          zone_id: 1, // Default for analysis
          location_id: 1, // Default for analysis
          comments: '',
          planted_date: new Date().toISOString().split('T')[0]
        };

        const analysisResponse = await fetch(`${getApiBaseUrl()}/api/smart/analyze-placement`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(plantData)
        });

        if (analysisResponse.ok) {
          const analysis = await analysisResponse.json();
          
          // Store recommendations in state for UI display
          setSmartRecommendations({
            plantName: analysis.plant_data.common_name,
            recommendations: analysis.recommendations || [],
            hasCompatibleZones: analysis.has_compatible_zones
          });
          
          if (analysis.has_compatible_zones && analysis.recommendations.length > 0) {
            const topRecommendations = analysis.recommendations.slice(0, 3);
            const recommendationText = topRecommendations.map((rec: any, index: number) => 
              `${index + 1}. Zone ${rec.zone_id} (${rec.period}): ${Math.round(rec.score * 100)}% compatibility - ${rec.comment}`
            ).join('\n');
            
            // Show smart placement modal with recommendations
            setSmartPlacementModal({
              plant: plant,
              bookFile: file,
              recommendations: analysis.recommendations || [],
              optimal_emitter_analysis: analysis.optimal_emitter_analysis,
              emitterSizingMode: 'smart',
              zoneSelectionMode: 'smart'
            });
            
            // Auto-select the best match zone (first recommendation)
            if (analysis.recommendations && analysis.recommendations.length > 0) {
              const bestZone = analysis.recommendations[0];
              const smartEmitterSize = analysis.optimal_emitter_analysis?.recommended_emitter?.toString() || '4';
              setModalData(prev => ({
                ...prev,
                quantity: '1',
                emitterSize: smartEmitterSize,
                zoneId: bestZone.zone_id.toString()
              }));
            } else {
              // Set default values for smart placement (no zone auto-selection)
              const smartEmitterSize = analysis.optimal_emitter_analysis?.recommended_emitter?.toString() || '4';
              setModalData(prev => ({
                ...prev,
                quantity: '1',
                emitterSize: smartEmitterSize
              }));
            }
          } else if (!analysis.has_compatible_zones) {
            console.log(`No compatible zones found for ${analysis.plant_data.common_name}. Consider creating a new zone or adjusting watering requirements.`);
            // Show smart placement modal with deactivated zones even when no compatible zones found
            setSmartPlacementModal({
              plant: plant,
              bookFile: file,
              recommendations: [], // Empty recommendations since no compatible zones
              optimal_emitter_analysis: undefined,
              emitterSizingMode: 'smart',
              zoneSelectionMode: 'smart'
            });
            
            // Set default values for smart placement
            setModalData(prev => ({
              ...prev,
              quantity: '1',
              emitterSize: '4',
              zoneId: '',
              locationId: '',
              comments: ''
            }));
          }
        }
      } catch (error) {
        console.error('Error getting smart recommendations:', error);
      }
    }
  };

  // When a location is clicked
  const handleLocationClick = (idx: number) => {
    if (heldPlant) {
      setModal({ locationIdx: idx });
      setModalData({ 
        quantity: '', 
        emitterSize: '', 
        zoneId: '', 
        locationId: locations[idx].location_id.toString(), 
        comments: '' 
      });
    }
  };



  // Handle modal input changes
  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newData = { ...modalData, [e.target.name]: e.target.value };
    
    // If zone changes, clear the location selection if it's not available for the new zone
    if (e.target.name === 'zoneId' && e.target.value) {
      const selectedZone = Number(e.target.value);
      if (newData.locationId) {
        const selectedLocation = locations.find(loc => loc.location_id === Number(newData.locationId));
        if (selectedLocation && !selectedLocation.zones.includes(selectedZone)) {
          newData.locationId = '';
        }
      }
    }
    
    // If location changes, clear the zone selection if it's not available in the new location
    if (e.target.name === 'locationId' && e.target.value) {
      const selectedLocation = locations.find(loc => loc.location_id === Number(e.target.value));
      if (selectedLocation && newData.zoneId && !selectedLocation.zones.includes(Number(newData.zoneId))) {
        newData.zoneId = '';
      }
    }
    
    setModalData(newData);
  };

  const handleRemovePlant = async (locationIdx: number, instanceId: string) => {
    if (!confirm('Are you sure you want to remove this plant? This action cannot be undone.')) {
      return;
    }

    try {
      // Remove from backend
      const response = await fetch(`${getApiBaseUrl()}/api/map/${instanceId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove plant');
      }

      // Update local state
      setLocations(prev => prev.map((loc, idx) => {
        if (idx === locationIdx) {
      return { 
            ...loc,
            assignedPlants: loc.assignedPlants?.filter(ap => ap.instanceId !== instanceId) || []
          };
        }
        return loc;
      }));

      // Refresh zones data to get updated durations
      try {
        const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
        if (zonesResponse.ok) {
          const zonesData = await zonesResponse.json();
          setZones(zonesData);
        }
      } catch (zonesError) {
        console.error('Error refreshing zones data:', zonesError);
      }

      alert('Plant removed successfully!');
    } catch (error) {
      console.error('Error removing plant:', error);
      alert('Failed to remove plant. Please try again.');
    }
  };

  const handleZoneCheck = (zoneId: number) => {
    setSelectedLocationZones(zs => zs.includes(zoneId) ? zs.filter(z => z !== zoneId) : [...zs, zoneId]);
  };

  const handleSaveLocation = async () => {
    if (!locationName.trim()) {
      alert('Please enter a location name');
      return;
    }

    setSavingLocation(true);
    try {
      // Get next location ID
      const nextLocationId = locations.length > 0 ? Math.max(...locations.map(loc => loc.location_id)) + 1 : 1;

      const newLocation = {
        location_id: nextLocationId,
        name: locationName.trim(),
        description: locationDescription.trim(),
        zones: selectedLocationZones.sort((a, b) => a - b)
      };

      // Create updated locations array with the new location
      const updatedLocations = [...locations, newLocation];

      // Save all locations to backend
      const response = await fetch(`${getApiBaseUrl()}/api/locations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedLocations)
      });

      if (!response.ok) {
        throw new Error('Failed to save location');
      }

      // Update local state
      setLocations(updatedLocations);
      
      // Auto-select the newly created location in the smart placement form
      if (smartPlacementModal && modalData.zoneId) {
        const newLocation = updatedLocations.find(loc => loc.location_id === nextLocationId);
        if (newLocation && newLocation.zones.includes(parseInt(modalData.zoneId))) {
          setModalData(prev => ({
            ...prev,
            locationId: newLocation.location_id.toString()
          }));
        }
      }
      
      setLocationName('');
      setLocationDescription('');
      setSelectedLocationZones([]);
      setShowLocationForm(false);
      
      alert('Location saved successfully!');
    } catch (error) {
      console.error('Error saving location:', error);
      alert('Failed to save location. Please try again.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleReassignPlant = async (locationId: number) => {
    if (!reassignInstanceId) return;

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/map/${reassignInstanceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          location_id: locationId
        }),
      });

      if (response.ok) {
        // Reload data
        const [locationsRes, mapRes, zonesRes] = await Promise.all([
          fetch(`${getApiBaseUrl()}/api/locations`),
          fetch(`${getApiBaseUrl()}/api/map`),
          fetch(`${getApiBaseUrl()}/api/schedule`)
        ]);
        const [newLocations, newMap, newZones] = await Promise.all([
          locationsRes.json(),
          mapRes.json(),
          zonesRes.json()
        ]);
        setLocations(newLocations);
        setZones(newZones);
        
        // Clear reassignment state
        setReassignMessage('');
        setReassignInstanceId('');
        
        alert('Plant reassigned successfully!');
      } else {
        const errorData = await response.json();
        alert(`Failed to reassign plant: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error reassigning plant:', error);
      alert('Failed to reassign plant. Please try again.');
    }
  };

  const handleDeleteLocation = async (locationId: number, locationName: string) => {
    // Show confirmation prompt
    const confirmed = window.confirm(
      `Are you sure you want to delete the location "${locationName}"?\n\n` +
      `This will remove the location but keep any plants assigned to it. ` +
      `Plants will become orphaned and can be reassigned later.`
    );

    if (!confirmed) return;

    try {
      // Get current locations
      const currentLocations = locations.filter(loc => loc.location_id !== locationId);
      
      // Save updated locations to backend
      const response = await fetch(`${getApiBaseUrl()}/api/locations`, {
      method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(currentLocations)
      });

      if (response.ok) {
        // Update local state
        setLocations(currentLocations);
        alert(`Location "${locationName}" deleted successfully!`);
      } else {
        const errorData = await response.json();
        alert(`Failed to delete location: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting location:', error);
      alert('Failed to delete location. Please try again.');
    }
  };

  // Parse watering frequency code to get period and cycles
  const parseWateringFrequency = (frequencyCode: string) => {
    const period = frequencyCode.charAt(0);
    const cycles = parseInt(frequencyCode.slice(1));
    
    let periodCode = 'D';
    if (period === 'W') periodCode = 'W';
    else if (period === 'M') periodCode = 'M';
    
    return { period: periodCode, cycles };
  };

  // Get plant data from library
  const getPlantDataFromLibrary = (plantId: number, bookFile: string) => {
    const plantBook = plantBooks[bookFile];
    if (!plantBook) {
      console.error(`Plant book not found: ${bookFile}`);
      return null;
    }
    
    const plant = plantBook.plants.find(p => p.plant_id === plantId);
    if (!plant) {
      console.error(`Plant with ID ${plantId} not found in book ${bookFile}`);
      return null;
    }
    
    return plant;
  };

  const handleAutoCreateZone = (zoneId: number, plant: PlantEntry, bookFile: string) => {
    console.log('=== AUTO CREATE ZONE DEBUG ===');
    console.log('Zone ID:', zoneId);
    console.log('Plant:', plant);
    console.log('Book file:', bookFile);
    
    // Get detailed plant data from library
    const plantData = getPlantDataFromLibrary(plant.plant_id, bookFile);
    if (!plantData) {
      console.error('Plant data not found in library');
      return;
    }

    console.log('Plant data from library:', plantData);
    console.log('Watering frequency array:', plantData.watering_frequency);
    console.log('Preferred time array:', plantData.preferred_time);

    // Parse watering frequency
    const wateringFreq = plantData.watering_frequency?.[0] || 'D1';
    const { period, cycles } = parseWateringFrequency(wateringFreq);
    
    console.log('Parsed watering frequency:', { wateringFreq, period, cycles });
    
    // Get preferred time
    const preferredTime = plantData.preferred_time?.[0] || 'SUNRISE';
    
    console.log('Preferred time:', preferredTime);
    
    // Create zone configuration with same structure as original zones
    const zoneConfig = {
      zone_id: zoneId,
      mode: 'manual', // Use 'manual' for consistency with original zones
      period: period,
      cycles: cycles,
      comment: '', // Leave blank for user to add zone comments
      startDay: new Date().toISOString().split('T')[0],
      times: [{
        value: preferredTime,
        start_time: preferredTime,
        duration: '010000' // Default 1 hour duration
      }]
    };

    console.log('Created zone config:', zoneConfig);
    console.log('=== END AUTO CREATE ZONE DEBUG ===');

    // Set the zone configuration and open the modal
    setSelectedZone(zoneConfig);
    setScheduleMode('manual'); // Default to manual mode for auto-created zones
    setShowZoneModal(true);
    
    // Don't close the smart placement modal - keep it open for when we return
  };

  const handleSmartPlacementConfirm = async (selectedZoneId: number, selectedLocationId: number) => {
    if (!smartPlacementModal) return;

    try {
      const plantData = {
        library_book: smartPlacementModal.bookFile.replace('.json', ''),
        plant_id: smartPlacementModal.plant.plant_id,
        common_name: smartPlacementModal.plant.common_name,
        quantity: parseInt(modalData.quantity),
        emitter_size: parseFloat(modalData.emitterSize),
        zone_id: selectedZoneId,
        location_id: selectedLocationId,
        comments: modalData.comments || '',
        planted_date: new Date().toISOString().split('T')[0],
        smart_overrides: {
          zone_selection: smartPlacementModal.zoneSelectionMode,
          emitter_sizing: smartPlacementModal.emitterSizingMode
        }
      };

      // Save to backend
      const response = await fetch(`${getApiBaseUrl()}/api/map/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(plantData)
      });

      if (!response.ok) {
        throw new Error('Failed to assign plant');
      }

      const result = await response.json();
      
      // Update local state
      const newAssignedPlant: AssignedPlant = {
        plant: smartPlacementModal.plant,
        quantity: plantData.quantity,
        emitterSize: plantData.emitter_size,
        zoneId: plantData.zone_id,
        location_id: plantData.location_id,
        instanceId: result.instance_id || `${plantData.location_id}-${plantData.plant_id}-${plantData.zone_id}-${plantData.quantity}-${plantData.emitter_size}-${Date.now()}`,
        comments: plantData.comments
      };

      setLocations(prev => prev.map((loc) => {
        if (loc.location_id === plantData.location_id) {
          return {
            ...loc,
            assignedPlants: [...(loc.assignedPlants || []), newAssignedPlant]
          };
        }
        return loc;
      }));

      // Refresh zones data to get updated durations
      try {
        const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
        if (zonesResponse.ok) {
          const zonesData = await zonesResponse.json();
          setZones(zonesData);
        }
      } catch (zonesError) {
        console.error('Error refreshing zones data:', zonesError);
      }

      // Reset modals and state
      setSmartPlacementModal(null);
      setModal(null);
      setHeldPlant(null);
      setSelectedPlants({});
      setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });

      alert('Plant assigned successfully!');
    } catch (error) {
      console.error('Error assigning plant:', error);
      alert('Failed to assign plant. Please try again.');
    }
  };

  const handleModalConfirm = async () => {
    if (!modalData.quantity || !modalData.emitterSize || !modalData.zoneId) {
      alert('Please fill in all required fields.');
      return;
    }

    if (!heldPlant || !modal) return;

    try {
      const plantData = {
        library_book: heldPlant.bookFile.replace('.json', ''),
        plant_id: heldPlant.plant.plant_id,
        common_name: heldPlant.plant.common_name,
        quantity: parseInt(modalData.quantity),
        emitter_size: parseFloat(modalData.emitterSize),
        zone_id: parseInt(modalData.zoneId),
        location_id: parseInt(modalData.locationId) || locations[modal.locationIdx].location_id,
        comments: modalData.comments || '',
        planted_date: new Date().toISOString().split('T')[0]
      };

      // First, analyze plant placement for smart recommendations (only if smart mode is enabled)
      if (globalSmartMode) {
        const analysisResponse = await fetch(`${getApiBaseUrl()}/api/smart/analyze-placement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(plantData)
      });

      if (analysisResponse.ok) {
        const analysis = await analysisResponse.json();
        
        // Check if the selected zone is optimal
        const selectedZoneId = parseInt(modalData.zoneId);
        const optimalZoneId = analysis.optimal_zone;
        
        if (optimalZoneId && selectedZoneId !== optimalZoneId) {
          // Show smart recommendation
          const optimalZone = zones.find(z => z.zone_id === optimalZoneId);
          const selectedZone = zones.find(z => z.zone_id === selectedZoneId);
          
          const recommendationMessage = `Smart Recommendation: This plant would be better suited for Zone ${optimalZoneId} (${optimalZone?.comment || 'Unknown'}) with ${Math.round(analysis.optimal_score * 100)}% compatibility.\n\nCurrent selection: Zone ${selectedZoneId} (${selectedZone?.comment || 'Unknown'})\n\nWould you like to use the recommended zone instead?`;
          
          const useOptimal = confirm(recommendationMessage);
          if (useOptimal) {
            plantData.zone_id = optimalZoneId;
            setModalData(prev => ({ ...prev, zoneId: optimalZoneId.toString() }));
          }
        }
        
        // If no compatible zones found, show options
        if (!analysis.has_compatible_zones) {
          const noCompatibleResponse = await fetch(`${getApiBaseUrl()}/api/smart/no-compatible-zone`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(plantData)
          });
          
          if (noCompatibleResponse.ok) {
            const noCompatibleData = await noCompatibleResponse.json();
            const message = `No compatible zones found for this plant.\n\nAvailable zones:\n${noCompatibleData.available_zones.map((z: any) => `- Zone ${z.zone_id}: ${z.period} (${z.comment})`).join('\n')}\n\nSuggestions:\n${noCompatibleData.suggestions.join('\n')}\n\nDo you want to force assign to the selected zone anyway?`;
            
            const forceAssign = confirm(message);
            if (!forceAssign) {
              return; // User cancelled
            }
          }
        }
      }
      }

      // Save to backend
      const response = await fetch(`${getApiBaseUrl()}/api/map/save`, {
        method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        },
        body: JSON.stringify(plantData)
      });

      if (!response.ok) {
        throw new Error('Failed to assign plant');
      }

      const result = await response.json();
      
      // Update local state
      const newAssignedPlant: AssignedPlant = {
        plant: heldPlant.plant,
        quantity: plantData.quantity,
        emitterSize: plantData.emitter_size,
        zoneId: plantData.zone_id,
        location_id: plantData.location_id,
        instanceId: result.instance_id || `${plantData.location_id}-${plantData.plant_id}-${plantData.zone_id}-${plantData.quantity}-${plantData.emitter_size}-${Date.now()}`,
        comments: plantData.comments
      };

      setLocations(prev => prev.map((loc, idx) => {
        if (idx === modal.locationIdx) {
          return {
            ...loc,
            assignedPlants: [...(loc.assignedPlants || []), newAssignedPlant]
          };
        }
        return loc;
      }));

      // Refresh zones data to get updated durations
      try {
        const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
        if (zonesResponse.ok) {
          const zonesData = await zonesResponse.json();
          setZones(zonesData);
        }
      } catch (zonesError) {
        console.error('Error refreshing zones data:', zonesError);
      }

      // Reset modal and held plant
      setModal(null);
      setHeldPlant(null);
      setSelectedPlants({});
      setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });

      alert('Plant assigned successfully!');
    } catch (error) {
      console.error('Error assigning plant:', error);
      alert('Failed to assign plant. Please try again.');
    }
  };

  // Get zone details for a location
  const getZonesForLocation = (loc: Location) => {
    return (loc.zones || []).map(zid => zones.find(z => z.zone_id === zid)).filter(Boolean) as Zone[];
  };

  // Get plants grouped by zone for zone view
  const getPlantsByZone = () => {
    const zonePlants: Record<number, { zone: Zone; plants: AssignedPlant[] }> = {};
    
    // Only create zone entries for zones that have plants assigned
    locations.forEach(loc => {
      loc.assignedPlants?.forEach(ap => {
        if (!zonePlants[ap.zoneId]) {
          const zone = zones.find(z => z.zone_id === ap.zoneId);
          if (zone) {
            zonePlants[ap.zoneId] = { zone, plants: [] };
          }
        }
        if (zonePlants[ap.zoneId]) {
          zonePlants[ap.zoneId].plants.push(ap);
        }
      });
    });
    
    return Object.values(zonePlants);
  };

  // Rain Bird emitter sizes (GPH)
  const EMITTER_SIZES = [0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0];

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#181f2a',
      padding: '0 0 0 20px',
      marginLeft: '150px',
      boxSizing: 'border-box',
      overflowX: 'hidden',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '1200px',
        marginLeft: 0,
        marginRight: 0,
        padding: '20px 20px 20px 0',
        overflow: 'visible'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '20px',
          alignItems: 'center',
          gap: '12px',
          height: '30px'
        }}>
          {/* Invisible spacer to match Plants page layout */}
        </div>
        
        {/* Reassignment Message */}
        {reassignMessage && (
        <div style={{
            background: '#FF9800',
            color: '#181f2a',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontWeight: 600,
            fontSize: '14px',
            textAlign: 'center',
          display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{reassignMessage}</span>
            <button
              onClick={() => {
                setReassignMessage('');
                setReassignInstanceId('');
              }}
              style={{
                background: 'transparent',
                color: '#181f2a',
                border: '1px solid #181f2a',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
          </div>
        )}
        
            <div style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'flex-start',
          width: '100%'
        }}>
          {/* Plant Library Card */}
          <div 
            data-plant-library="true"
            style={{
              background: '#232b3b',
              color: '#f4f4f4',
              borderRadius: '16px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              padding: '24px',
              width: '300px',
              flexShrink: 0
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ color: '#00bcd4', fontWeight: 700, margin: 0, textAlign: 'left' }}>Library</h3>
        {/* View Mode Toggle */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
        }}>
                <span style={{ color: '#00bcd4', fontSize: '12px', fontWeight: 600 }}>Location</span>
          <div
            onClick={() => setViewMode(prev => prev === 'location' ? 'zone' : 'location')}
            style={{
                    width: '40px',
                    height: '20px',
                    background: (viewMode as string) === 'zone' ? '#00bcd4' : '#444',
                    borderRadius: '10px',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.3s ease',
                  display: 'flex',
                  alignItems: 'center',
                    padding: '0 2px'
            }}
          >
            <div style={{
                    width: '16px',
                    height: '16px',
              background: '#fff',
              borderRadius: '50%',
                    transform: (viewMode as string) === 'zone' ? 'translateX(20px)' : 'translateX(0)',
              transition: 'transform 0.3s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
                <span style={{ color: '#00bcd4', fontSize: '12px', fontWeight: 600 }}>Zone</span>
        </div>
            </div>
            <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
            {heldPlant && (
              <div style={{ marginBottom: '16px', color: '#00bcd4', fontWeight: 600, fontSize: '16px', textAlign: 'left' }}>
                Holding: {heldPlant.plant.common_name}
              </div>
            )}
            {loading ? (
              <div style={{ color: '#bdbdbd' }}>Loading...</div>
            ) : error ? (
              <div style={{ color: '#ff512f' }}>{error}</div>
            ) : (
              <>
                {libraryFiles.map((file) => (
                  <div key={file} style={{ marginBottom: '18px', textAlign: 'left' }}>
                    <div style={{ color: '#00bcd4', fontWeight: 600, marginBottom: '6px' }}>{plantBooks[file]?.bookName || file.replace('.json', '')}</div>
                    <select
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '8px',
                        background: '#232b3b',
                        color: '#fff',
                        border: '1px solid #00bcd4',
                        outline: 'none'
                      }}
                      value={selectedPlants[file] || ''}
                      onChange={e => handlePlantSelect(file, e.target.value ? Number(e.target.value) : '')}
                    >
                      <option value="">Select a plant...</option>
                      {(plantBooks[file]?.plants || []).map((plant) => (
                        <option key={plant.plant_id} value={plant.plant_id}>{plant.common_name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </>
            )}
          </div>
          

          
          {/* Main Content Area */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            minWidth: 0,
            flex: 1,
            maxWidth: '500px'
          }}>
            {/* Locations/Zone Cards */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}>
              {viewMode === 'location' ? (
                // Location View
                locations.map((loc, idx) => (
                <div
                  key={loc.location_id}
                  data-drop-target="true"
                  onClick={() => !reassignInstanceId && handleLocationClick(idx)}
                  style={{
                    background: heldPlant ? '#00bcd4' : '#232b3b',
                    color: heldPlant ? '#181f2a' : '#f4f4f4',
                    borderRadius: '16px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    padding: '24px',
                    minWidth: '320px',
                    maxWidth: '500px',
                    transition: 'background 0.2s',
                    border: '2px solid #232b3b',
                    cursor: (heldPlant && !reassignInstanceId) ? 'pointer' : 'default',
                    position: 'relative'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '8px'
                  }}>
                  <h2 style={{
                    color: heldPlant ? '#181f2a' : '#00bcd4',
                    fontWeight: 700,
                      margin: 0,
                    textAlign: 'left'
                  }}>{loc.name}</h2>
                    
                    {/* Delete Button */}
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteLocation(loc.location_id, loc.name);
                      }}
                      style={{
                        color: '#dc3545',
                        cursor: 'pointer',
                        fontSize: '16px',
                        fontWeight: 'bold',
                        padding: '2px',
                        marginLeft: '8px'
                      }}
                      title={`Delete location "${loc.name}"`}
                    >
                      ×
                </span>
                  </div>
                <div style={{
                    color: heldPlant ? '#181f2a' : '#bdbdbd',
                    marginBottom: '8px',
                    textAlign: 'left'
                  }}>{loc.description}</div>
                  <div style={{
                    color: heldPlant ? '#181f2a' : '#bdbdbd',
                    fontSize: '14px',
                    marginBottom: '12px',
                    textAlign: 'left'
                  }}>
                    Zones: {getZonesForLocation(loc).map(z => z.zone_id).sort((a: number, b: number) => a - b).join(', ')}
                </div>
                  <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                  
                  {/* Reassignment Button */}
                  {reassignInstanceId && (
                    <div style={{ marginBottom: '16px' }}>
                <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReassignPlant(loc.location_id);
                        }}
                  style={{
                          background: '#FF9800',
                          color: '#181f2a',
                          border: 'none',
                    borderRadius: '8px',
                          padding: '8px 16px',
                    fontSize: '14px',
                          fontWeight: 600,
                    cursor: 'pointer',
                          width: '100%'
                        }}
                      >
                        Reassign Plant Here
                </button>
            </div>
          )}

                  {loc.assignedPlants && loc.assignedPlants.length > 0 && (
                    <ul style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                      textAlign: 'left'
                    }}>
                      {loc.assignedPlants.map((ap, i) => (
                        <li
                          key={ap.instanceId}
                          style={{
                            background: '#1a1f2a',
                          color: '#00bcd4',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          marginBottom: '4px',
                            fontSize: '14px',
                display: 'flex',
                            justifyContent: 'space-between',
                alignItems: 'center',
                            position: 'relative'
                          }}
                        >
                          <span style={{ fontWeight: 'bold' }}>
                            {ap.plant.common_name}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: '#bdbdbd' }}>x{ap.quantity}</span>
                            <span
                              onClick={(e) => {
                              e.stopPropagation(); 
                              handleRemovePlant(idx, ap.instanceId); 
                            }}
                            style={{
                                color: '#dc3545',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: 'bold',
                                padding: '2px'
                              }}
                              title={`Delete ${ap.plant.common_name} (x${ap.quantity})`}
                            >
                              ×
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
              ) : (
                // Zone View
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px'
                }}>
                  {getPlantsByZone().map((zoneData) => (
                  <div
                    key={zoneData.zone.zone_id}
                    data-drop-target="true"
                    style={{
                      background: '#232b3b',
                      color: '#f4f4f4',
                      borderRadius: '16px',
                      boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                      padding: '24px',
                      minWidth: '320px',
                      maxWidth: '500px',
                      border: '2px solid #232b3b'
                    }}
                  >
                    <h2 style={{
                  color: '#00bcd4',
                  fontWeight: 700,
                      margin: '0 0 8px 0',
                      textAlign: 'left'
                    }}>
                      Zone {zoneData.zone.zone_id}
                    </h2>
                    <div style={{
                      color: '#bdbdbd',
                      marginBottom: '8px',
                      textAlign: 'left'
                    }}>
                      {(() => {
                        const periodMap: Record<string, string> = {
                          'D': 'Daily',
                          'W': 'Weekly',
                          'M': 'Monthly',
                          'Y': 'Yearly'
                        };
                        const resolvedPeriod = periodMap[zoneData.zone.period] || zoneData.zone.period;
                        return `${resolvedPeriod} - ${zoneData.zone.cycles} cycles`;
                      })()}
              </div>
              <div style={{
                      color: '#bdbdbd',
                fontSize: '14px',
                      marginBottom: '8px',
                      textAlign: 'left'
                    }}>
                      {zoneData.zone.comment}
                    </div>
                    <div style={{
                      color: '#00bcd4',
                      fontWeight: 600,
                      fontSize: '14px',
                      marginBottom: '12px',
                      textAlign: 'left'
                    }}>
                      Next: {formatNextScheduledTime(zoneData.zone, zoneResolvedTimes, dateSpecificResolvedTimes)}
                    </div>
                    <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                    {zoneData.plants.length > 0 ? (
                      <ul style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        textAlign: 'left'
                      }}>
                        {zoneData.plants.map((ap, i) => (
                          <li
                            key={`${ap.plant.plant_id}-${i}`}
                            style={{
                              background: '#1a1f2a',
                            color: '#00bcd4',
                            borderRadius: '8px',
                              padding: '8px 12px',
                              marginBottom: '4px',
                              fontSize: '14px',
                            display: 'flex',
                              justifyContent: 'space-between',
                            alignItems: 'center',
                              position: 'relative'
                            }}
                          >
                            <span style={{ fontWeight: 'bold' }}>
                              {ap.plant.common_name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ color: '#bdbdbd' }}>x{ap.quantity}</span>
                              <span
                                onClick={(e) => {
                                e.stopPropagation(); 
                                // Find the location index for this plant
                                  const locationIdx = locations.findIndex(loc => 
                                    loc.assignedPlants?.some(plant => plant.instanceId === ap.instanceId)
                                  );
                                  if (locationIdx !== -1) {
                                handleRemovePlant(locationIdx, ap.instanceId); 
                                  }
                              }}
                              style={{
                                  color: '#dc3545',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  fontWeight: 'bold',
                                  padding: '2px'
                                }}
                                title={`Delete ${ap.plant.common_name} (x${ap.quantity})`}
                              >
                                ×
                              </span>
              </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: '#888', fontStyle: 'italic' }}>
                        No plants assigned to this zone
            </div>
          )}
                  </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Zone Legend - Always present but only visible in Zone View */}
          <div style={{
                    background: '#232b3b',
                    color: '#f4f4f4',
                    borderRadius: '16px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            padding: '24px',
            width: '300px',
            flexShrink: 0,
            height: 'fit-content',
            position: 'sticky',
            top: '20px',
            visibility: 'visible',
            alignSelf: 'flex-start'
          }}>
            <h3 style={{ color: '#00bcd4', fontWeight: 700, margin: '0 0 16px 0', textAlign: 'left' }}>Zones</h3>
            <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
            
            {/* Pump Status */}
            <div style={{
              background: '#1a1f2a',
              color: '#f4f4f4',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '12px',
              fontSize: '14px',
              border: pumpStatus?.active ? '2px solid #4CAF50' : '1px solid #333'
          }}>
            <div style={{
                    display: 'flex',
                alignItems: 'center', 
                gap: '8px',
                marginBottom: '4px'
              }}>
                <span style={{ 
                  color: pumpStatus?.active ? '#4CAF50' : '#666',
                  fontWeight: 700 
                }}>
                  💧 Pump
                </span>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: pumpStatus?.active ? '#4CAF50' : '#666',
                  animation: pumpStatus?.active ? 'pulse 2s infinite' : 'none'
                }}></span>
              </div>
                              <div style={{ fontSize: '12px', color: '#bdbdbd' }}>
                  {pumpStatus?.active ? 'Active' : 'Inactive'}
                </div>
            </div>
            {zones.filter(z => z.mode !== 'disabled').map((zone, idx) => {
              const zoneCode = (zone.period || '-') + (zone.cycles || '');
              let durationDisplay = 'N/A';
              let startTimeDisplay = 'N/A';
              let nextRunDisplay = 'N/A';
              
              // Get duration - check both times array and single time
              if (Array.isArray(zone.times)) {
                const durations = zone.times.map((t: any) => t.duration).filter(Boolean);
                if (durations.length) durationDisplay = durations.map(formatDuration).join(', ');
              } else if (zone.time && zone.time.duration) {
                durationDisplay = formatDuration(zone.time.duration);
              }
              
              // Get start times - check both times array and single time
              if (Array.isArray(zone.times)) {
                const times = zone.times.map((t: any) => t.start_time || t.value).filter(Boolean);
                if (times.length) {
                  // Try to get resolved times
                  const resolvedTimes = zoneResolvedTimes[zone.zone_id] || {};
                  const resolvedTimeStrings = times.map(timeCode => {
                    const resolved = resolvedTimes[timeCode];
                    return resolved && resolved !== 'N/A' && resolved !== '...' ? resolved : timeCode;
                  });
                  startTimeDisplay = resolvedTimeStrings.join(', ');
                }
              } else if (zone.time && zone.time.start_time) {
                const timeCode = zone.time.start_time;
                const resolvedTimes = zoneResolvedTimes[zone.zone_id] || {};
                const resolved = resolvedTimes[timeCode];
                startTimeDisplay = resolved && resolved !== 'N/A' && resolved !== '...' ? resolved : timeCode;
              }
              
              // Get next run using the formatNextScheduledTime function
              nextRunDisplay = formatNextScheduledTime(zone, zoneResolvedTimes, dateSpecificResolvedTimes);
              
              const zoneState = zoneStates[zone.zone_id] || { active: false };
              const validationState = zoneValidationStates[zone.zone_id] || 'gray';
              
              // Get color based on validation state
              const getIndicatorColor = (state: 'green' | 'gray' | 'orange' | 'red') => {
                switch (state) {
                  case 'green': return '#4CAF50';
                  case 'gray': return '#666';
                  case 'orange': return '#FF9800';
                  case 'red': return '#F44336';
                  default: return '#666';
                }
              };
              
              const indicatorColor = getIndicatorColor(validationState);
              const isActive = zoneState.active;
              
              return (
                <div 
                  key={idx} 
                  style={{
                    background: '#1a1f2a',
                    color: '#f4f4f4',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '8px',
                    fontSize: '14px',
                    border: `2px solid ${indicatorColor}`,
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={e => { e.stopPropagation(); setManualTimerModal({ zoneId: zone.zone_id, zoneName: `Zone ${zone.zone_id}` }); }}
                  title="Click to start/stop manual timer"
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '4px'
                  }}>
                    <div style={{ color: '#00bcd4', fontWeight: 700 }}>Zone {zone.zone_id || idx + 1}</div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {isActive && zoneState.remaining && (
                        <span style={{
                          fontSize: '11px',
                          color: indicatorColor,
                          fontWeight: 600
                        }}>
                          {formatCountdown(Math.ceil(zoneState.remaining))}
                        </span>
                      )}
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: indicatorColor,
                          display: 'inline-block',
                          border: '2px solid #222',
                          transition: 'all 0.3s ease',
                          animation: (validationState === 'orange' || validationState === 'red') ? 'pulse 2s infinite' : 'none'
                        }}
                      ></span>
                    </div>
                  </div>
                  <div style={{ marginBottom: '2px' }}>Code: <b>{zoneCode}</b></div>
                  <div style={{ marginBottom: '2px' }}>Duration: <b>{durationDisplay}</b></div>
                  <div style={{ marginBottom: '2px' }}>Start Time: <b>{startTimeDisplay}</b></div>
                  <div style={{ marginBottom: '2px' }}>Next Run: <b>{nextRunDisplay}</b></div>
                  <div style={{ color: '#bdbdbd', fontSize: '12px' }}>{zone.comment || <span style={{ color: '#555' }}>No description</span>}</div>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Manual Timer Modal */}
        {manualTimerModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div 
              data-modal="true"
              style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '32px',
                minWidth: '500px',
                maxWidth: '700px',
                maxHeight: '95vh',
                color: '#f4f4f4',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'auto'
              }}
            >
              <h3 style={{
                        color: '#00bcd4',
                        fontWeight: 700,
                margin: '0 0 16px 0',
                textAlign: 'left',
                flexShrink: 0
              }}>
                Manual Timer: {manualTimerModal.zoneName}
              </h3>
              
              {zoneStates[manualTimerModal.zoneId]?.active ? (
                // Show stop timer controls when zone is active
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                      ⏱️ Manual timer is currently running
                    </p>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '12px',
                    marginTop: '16px'
                  }}>
                    <button
                    onClick={() => {
                        stopManualTimer(manualTimerModal.zoneId);
                        setManualTimerModal(null);
                      }}
                      style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#ff512f',
                        color: '#fff',
                            fontWeight: 700,
                            fontSize: '16px',
                        cursor: 'pointer'
                      }}
                    >
                      Stop Timer
                    </button>
                    <button
                      onClick={() => setManualTimerModal(null)}
                      style={{
                        padding: '12px 24px',
                        borderRadius: '8px',
                        border: '2px solid #666',
                        background: 'transparent',
                        color: '#666',
                        fontWeight: 700,
                        fontSize: '16px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    </div>
                </div>
              ) : (
                // Show start timer controls when zone is inactive
                      <div style={{
                  background: '#1a1f2a',
                        borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                            <div style={{
                              display: 'flex',
                    justifyContent: 'space-between',
                              alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                      ⏱️ Start manual timer
                    </p>
                  </div>
                  <div style={{ 
                    marginBottom: '16px',
                    fontSize: '14px',
                    color: '#bdbdbd'
                  }}>
                                            Enter time in HH:mm:ss format (e.g., 02:30:00 for 2 hours 30 minutes)
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                            }}>
                              <input
                                type="text"
                      value={manualInput[manualTimerModal.zoneId] || ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                        setManualInput(inp => ({ ...inp, [manualTimerModal.zoneId]: val }));
                        setManualInputError(errs => ({ ...errs, [manualTimerModal.zoneId]: '' }));
                                }}
                                                    placeholder="HH:mm:ss"
                                style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                                  border: '1px solid #00bcd4',
                        background: '#1a1f2a',
                                  color: '#fff',
                        fontSize: '16px',
                                  textAlign: 'center'
                                }}
                      maxLength={6}
                      autoFocus
                    />
                    {manualInputError[manualTimerModal.zoneId] && (
                      <div style={{
                        color: '#ff512f',
                        fontSize: '14px',
                        textAlign: 'center'
                      }}>{manualInputError[manualTimerModal.zoneId]}</div>
                    )}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '12px'
                    }}>
                              <button
                        onClick={() => {
                          const val = manualInput[manualTimerModal.zoneId] || '';
                  const parsed = parseManualTimeInput(val);
                  
                  if (!parsed.isValid) {
                            setManualInputError(errs => ({ ...errs, [manualTimerModal.zoneId]: parsed.error }));
                    return;
                  }
                  
                          const totalSeconds = parsed.hours * 3600 + parsed.minutes * 60 + parsed.seconds;
                          startManualTimer(manualTimerModal.zoneId, totalSeconds);
                          setManualTimerModal(null);
                }}
                                style={{
                          padding: '12px 24px',
                          borderRadius: '8px',
                                  border: 'none',
                                  background: '#00bcd4',
                                  color: '#181f2a',
                                  fontWeight: 700,
                          fontSize: '16px',
                                  cursor: 'pointer'
                                }}
                        disabled={!manualInput[manualTimerModal.zoneId]}
                              >
                        Start Timer
                              </button>
                              <button
                        onClick={() => {
                          setManualTimerModal(null);
                          setManualInput(inp => ({ ...inp, [manualTimerModal.zoneId]: '' }));
                          setManualInputError(errs => ({ ...errs, [manualTimerModal.zoneId]: '' }));
                                }}
                                style={{
                          padding: '12px 24px',
                          borderRadius: '8px',
                                  border: '2px solid #ff512f',
                                  background: 'transparent',
                                  color: '#ff512f',
                                  fontWeight: 700,
                          fontSize: '16px',
                                  cursor: 'pointer'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
            </div>
          </div>
              )}
        </div>
          </div>
        )}
        
        {/* Manual Placement Modal */}
        {modal && heldPlant && (
                              <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div 
              data-modal="true"
              style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '32px',
                minWidth: '500px',
                maxWidth: '700px',
                maxHeight: '95vh',
                color: '#f4f4f4',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'auto'
              }}
            >
              <h3 style={{
                color: '#00bcd4',
                fontWeight: 700,
                margin: '0 0 16px 0',
                textAlign: 'left',
                flexShrink: 0
              }}>
                Manual Placement: {heldPlant.plant.common_name}
              </h3>
              
              {modalData.noCompatibleZones && (
                <div style={{
                  background: '#2d1b1b',
                  border: '1px solid #ff512f',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ color: '#ff512f', fontSize: '16px' }}>⚠️</span>
                  <span style={{ color: '#ff512f', fontWeight: 600, fontSize: '14px' }}>
                    No compatible zones found for this plant. You can still manually place it by selecting a zone below.
                  </span>
                </div>
              )}
              
              <div style={{
                background: '#1a1f2a',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                border: '1px solid #00bcd4'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                    🎯 Select zone for manual placement:
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      color: '#666',
                      fontSize: '12px',
                      fontWeight: 500
                    }}>Smart</span>
                    <div 
                      style={{
                        width: '40px',
                        height: '20px',
                        background: '#2a3441',
                        borderRadius: '10px',
                        border: '1px solid #444',
                        position: 'relative',
                        cursor: 'not-allowed',
                        opacity: 0.6
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        background: '#666',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '1px',
                        right: '1px',
                        transition: 'all 0.2s'
                      }} />
                            </div>
                    <span style={{
                      color: '#00bcd4',
                      fontSize: '12px',
                      fontWeight: 600
                    }}>Manual</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {zones.filter(z => z.mode !== 'disabled').map((zone: any, index: number) => {
                    const zoneId = zone.zone_id;
                    const isSelected = modalData.zoneId === zoneId.toString();
                    
                    return (
                      <div key={zoneId} style={{
                        background: isSelected ? '#00bcd4' : '#2a3441',
                        borderRadius: '6px',
                        padding: '12px',
                        border: isSelected ? '2px solid #00bcd4' : '1px solid #444',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }} onClick={() => {
                        // Find locations that have this zone
                        const locationsWithZone = locations.filter(loc => loc.zones.includes(zoneId));
                        if (locationsWithZone.length > 0) {
                          setModalData(prev => ({
                            ...prev,
                            zoneId: zoneId.toString(),
                            locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
                          }));
                        } else {
                          // Just set the zone if no locations support it
                          setModalData(prev => ({
                            ...prev,
                            zoneId: zoneId.toString(),
                            locationId: '' // Clear location since none support this zone
                          }));
                        }
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>Zone {zoneId}</strong> ({zone.period})
                            <div style={{ fontSize: '12px', opacity: 0.8 }}>
                              {zone.comment}
                            </div>
                          </div>
                          <div style={{ 
                            background: isSelected ? '#fff' : '#666', 
                            color: isSelected ? '#00bcd4' : '#fff',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            Manual
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }} onSubmit={e => { 
                e.preventDefault(); 
                handleModalConfirm();
              }}>
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <p style={{ margin: '0 0 12px 0', color: '#00bcd4', fontWeight: 600 }}>
                    📊 Select quantity:
                  </p>
                <div style={{
                  display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30].map(num => (
                      <div
                        key={num}
                        onClick={() => setModalData(prev => ({ ...prev, quantity: num.toString() }))}
                        style={{
                          background: modalData.quantity === num.toString() ? '#00bcd4' : '#2a3441',
                          color: modalData.quantity === num.toString() ? '#181f2a' : '#fff',
                          borderRadius: '6px',
                          padding: '12px',
                          cursor: 'pointer',
                          border: modalData.quantity === num.toString() ? '2px solid #00bcd4' : '1px solid #444',
                          transition: 'all 0.2s',
                          fontSize: '14px',
                          fontWeight: modalData.quantity === num.toString() ? 'bold' : 'normal',
                          width: '65px',
                          height: '50px',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                  gap: '8px'
                }}>
                    <span style={{
                    color: '#fff',
                      fontSize: '14px',
                      fontWeight: 500
                    }}>Custom:</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      placeholder="Enter quantity"
                    value={modalData.quantity}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 99)) {
                          setModalData(prev => ({ ...prev, quantity: value }));
                        }
                              }}
                              style={{
                        background: '#2a3441',
                        border: '1px solid #444',
                                borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        width: '80px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
                <div style={{
                      background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                      💧 Emitter Size (GPH):
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        color: '#666',
                        fontSize: '12px',
                        fontWeight: 500
                      }}>Smart</span>
                      <div style={{
                        width: '40px',
                        height: '20px',
                        background: '#2a3441',
                        borderRadius: '10px',
                        border: '1px solid #444',
                        position: 'relative',
                        cursor: 'not-allowed',
                        opacity: 0.6
                      }}>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          background: '#666',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '1px',
                          right: '1px',
                          transition: 'all 0.2s'
                        }} />
                      </div>
                      <span style={{
                        color: '#00bcd4',
                        fontSize: '12px',
                        fontWeight: 600
                      }}>Manual</span>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {[0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0].map(size => (
                      <div
                        key={size}
                        onClick={() => setModalData(prev => ({ ...prev, emitterSize: size.toString() }))}
                        style={{
                          background: modalData.emitterSize === size.toString() ? '#00bcd4' : '#2a3441',
                          color: modalData.emitterSize === size.toString() ? '#181f2a' : '#fff',
                          borderRadius: '6px',
                          padding: '12px',
                          cursor: 'pointer',
                          border: modalData.emitterSize === size.toString() ? '2px solid #00bcd4' : '2px solid #444',
                          transition: 'all 0.2s',
                          fontSize: '14px',
                          fontWeight: modalData.emitterSize === size.toString() ? 'bold' : 'normal',
                          width: '90px',
                          height: '50px',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {size} GPH
                      </div>
                    ))}
                  </div>
                              <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                                color: '#fff',
                      fontSize: '14px',
                      fontWeight: 500
                    }}>Custom:</span>
                    <input
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.1"
                      placeholder="Enter GPH"
                      value={modalData.emitterSize}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseFloat(value) >= 0.1 && parseFloat(value) <= 50)) {
                          setModalData(prev => ({ ...prev, emitterSize: value }));
                        }
                      }}
                      style={{
                        background: '#2a3441',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        width: '80px',
                      outline: 'none'
                    }}
                    />
                  </div>
                </div>

                <div style={{
                  background: '#1a1f2a',
                                borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                              }}>
                  <p style={{ margin: '0 0 12px 0', color: '#00bcd4', fontWeight: 600 }}>
                    📍 Select location:
                  </p>
                                <div style={{
                                  display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {locations
                      .filter(loc => loc.zones.includes(parseInt(modalData.zoneId)))
                      .map(loc => (
                        <div
                          key={loc.location_id}
                          onClick={() => setModalData(prev => ({ ...prev, locationId: loc.location_id.toString() }))}
                          style={{
                            background: modalData.locationId === loc.location_id.toString() ? '#00bcd4' : '#2a3441',
                            color: modalData.locationId === loc.location_id.toString() ? '#181f2a' : '#fff',
                            borderRadius: '6px',
                            padding: '12px',
                            cursor: 'pointer',
                            border: modalData.locationId === loc.location_id.toString() ? '2px solid #00bcd4' : '1px solid #444',
                            transition: 'all 0.2s',
                            fontSize: '14px',
                            fontWeight: modalData.locationId === loc.location_id.toString() ? 'bold' : 'normal',
                            minWidth: '100px',
                            height: '50px',
                            textAlign: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {loc.name}
                        </div>
                      ))}
                    {locations.filter(loc => loc.zones.includes(parseInt(modalData.zoneId))).length === 0 && (
                      <div style={{
                        color: '#666',
                        fontSize: '14px',
                        fontStyle: 'italic'
                      }}>
                        No locations support this zone
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    marginTop: '8px'
                                }}>
                                  <button
                      type="button"
                      onClick={() => {
                        setShowLocationForm(true);
                                    }}
                                    style={{
                                      background: 'transparent',
                        border: '1px solid #00bcd4',
                        color: '#00bcd4',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      + Add New Location
                                  </button>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                    textAlign: 'left'
                  }}>Comments (optional):</label>
                  <input
                    type="text"
                    name="comments"
                    value={modalData.comments}
                    onChange={handleModalChange}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                    placeholder="Any additional notes..."
                  />
                </div>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '16px'
                }}>
                                  <button
                    type="button"
                    onClick={() => { 
                      setModal(null);
                      setHeldPlant(null);
                      setSelectedPlants({});
                      setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
                                    }}
                                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                                      border: '2px solid #ff512f',
                                      background: 'transparent',
                                      color: '#ff512f',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >Cancel</button>
                  <button
                    type="submit"
                    disabled={!modalData.zoneId || !modalData.locationId || !modalData.quantity || !modalData.emitterSize}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize ? '#00bcd4' : '#666',
                      color: modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize ? '#181f2a' : '#999',
                                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >
                    Assign Plant
                                  </button>
                                </div>
              </form>
                              </div>
                      </div>
                    )}

        {/* Smart Placement Modal */}
        {smartPlacementModal && (
                    <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div 
              data-modal="true"
              style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '32px',
                minWidth: '500px',
                maxWidth: '700px',
                maxHeight: '95vh',
                color: '#f4f4f4',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'auto'
              }}
            >
              <h3 style={{
                      color: '#00bcd4',
                fontWeight: 700,
                margin: '0 0 16px 0',
                textAlign: 'left',
                flexShrink: 0
              }}>
                Smart Placement: {smartPlacementModal.plant.common_name}
              </h3>
              
              {smartPlacementModal.recommendations.length === 0 && (
                <div style={{
                  background: '#2d1b1b',
                  border: '1px solid #ff512f',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ color: '#ff512f', fontSize: '16px' }}>⚠️</span>
                  <span style={{ color: '#ff512f', fontWeight: 600, fontSize: '14px' }}>
                    No compatible zones found for this plant. Check deactivated zones below for auto-creation options.
                  </span>
                    </div>
              )}

                      <div style={{
                background: '#1a1f2a',
                        borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                border: '1px solid #00bcd4'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                    🎯 {smartPlacementModal.recommendations.length > 0 ? 'Compatible zones found! Select your preferred zone:' : 'Available zones:'}
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      color: zoneSelectionMode === 'smart' ? '#00bcd4' : '#666',
                      fontSize: '12px',
                      fontWeight: zoneSelectionMode === 'smart' ? 600 : 500
                    }}>Smart</span>
                    <div 
                      style={{
                        width: '40px',
                        height: '20px',
                        background: '#2a3441',
                        borderRadius: '10px',
                        border: '1px solid #444',
                        position: 'relative',
                        cursor: 'pointer'
                      }}
                      onClick={() => setZoneSelectionMode(prev => prev === 'smart' ? 'manual' : 'smart')}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        background: zoneSelectionMode === 'smart' ? '#00bcd4' : '#666',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '1px',
                        left: zoneSelectionMode === 'smart' ? '1px' : '23px',
                        transition: 'all 0.2s'
                      }} />
                    </div>
                    <span style={{
                      color: zoneSelectionMode === 'manual' ? '#00bcd4' : '#666',
                      fontSize: '12px',
                      fontWeight: zoneSelectionMode === 'manual' ? 600 : 500
                    }}>Manual</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(zoneSelectionMode === 'smart' ? smartPlacementModal.recommendations.slice(0, 3) : zones.filter(z => z.mode !== 'disabled')).map((rec: any, index: number) => {
                    const isSmartMode = zoneSelectionMode === 'smart';
                    const zoneId = isSmartMode ? rec.zone_id : rec.zone_id;
                    const isSelected = modalData.zoneId === zoneId.toString();
                    
                    return (
                      <div key={zoneId} style={{
                        background: isSelected ? '#00bcd4' : '#2a3441',
                        borderRadius: '6px',
                        padding: '12px',
                        border: isSelected ? '2px solid #00bcd4' : '1px solid #444',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }} onClick={() => {
                        // Find locations that have this zone
                        const locationsWithZone = locations.filter(loc => loc.zones.includes(zoneId));
                        if (locationsWithZone.length > 0) {
                          setModalData(prev => ({
                            ...prev,
                            zoneId: zoneId.toString(),
                            locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
                          }));
                        } else {
                          // Just set the zone if no locations support it
                          setModalData(prev => ({
                            ...prev,
                            zoneId: zoneId.toString(),
                            locationId: '' // Clear location since none support this zone
                          }));
                        }
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>Zone {zoneId}</strong> ({isSmartMode ? rec.period : rec.period})
                            <div style={{ fontSize: '12px', opacity: 0.8 }}>
                              {isSmartMode ? rec.comment : rec.comment}
                        </div>
                        </div>
                          {isSmartMode && (
                            <div style={{ 
                              background: isSelected ? '#fff' : '#00bcd4', 
                              color: isSelected ? '#00bcd4' : '#fff',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              {Math.round(rec.score * 100)}% match
                      </div>
                    )}
                          {!isSmartMode && (
                            <div style={{ 
                              background: isSelected ? '#fff' : '#666', 
                              color: isSelected ? '#00bcd4' : '#fff',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              Manual
                            </div>
                          )}
                        </div>
                  </div>
                );
              })}
                </div>
          </div>
          
              {/* Deactivated Zones Section - Only show when no compatible zones found */}
              {smartPlacementModal.recommendations.length === 0 && zones.filter(z => z.mode === 'disabled').length > 0 && (
            <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #666'
                }}>
                  <p style={{ margin: '0 0 12px 0', color: '#666', fontWeight: 600 }}>
                    🔧 Deactivated Zones (Available for Auto-Creation):
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {zones.filter(z => z.mode === 'disabled').map((zone: any) => (
                      <div key={zone.zone_id} style={{
                        background: '#2a3441',
                        borderRadius: '6px',
                        padding: '12px',
                        border: '1px solid #444',
                        opacity: 0.7
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong style={{ color: '#666' }}>Zone {zone.zone_id}</strong>
                            <div style={{ fontSize: '12px', opacity: 0.8, color: '#666' }}>
                              {zone.comment || 'No description'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              console.log('Auto-create clicked for zone:', zone.zone_id);
                              console.log('Plant data from modal:', smartPlacementModal.plant);
                              console.log('Book file:', smartPlacementModal.bookFile);
                              handleAutoCreateZone(zone.zone_id, smartPlacementModal.plant, smartPlacementModal.bookFile);
                            }}
                            style={{
                              background: '#00bcd4',
                              color: '#181f2a',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '6px 12px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            Auto-Create
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }} onSubmit={e => { 
                e.preventDefault(); 
                if (modalData.zoneId && modalData.locationId) {
                  handleSmartPlacementConfirm(parseInt(modalData.zoneId), parseInt(modalData.locationId));
                }
              }}>
            <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <p style={{ margin: '0 0 12px 0', color: '#00bcd4', fontWeight: 600 }}>
                    📊 Select quantity:
                  </p>
            <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 18, 20, 25, 30].map(num => (
                      <div
                        key={num}
                        onClick={() => setModalData(prev => ({ ...prev, quantity: num.toString() }))}
                        style={{
                          background: modalData.quantity === num.toString() ? '#00bcd4' : '#2a3441',
                          color: modalData.quantity === num.toString() ? '#181f2a' : '#fff',
                          borderRadius: '6px',
                          padding: '12px',
                          cursor: 'pointer',
                          border: modalData.quantity === num.toString() ? '2px solid #00bcd4' : '1px solid #444',
                          transition: 'all 0.2s',
                          fontSize: '14px',
                          fontWeight: modalData.quantity === num.toString() ? 'bold' : 'normal',
                          width: '65px',
                          height: '50px',
                          textAlign: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {num}
                      </div>
                    ))}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 500
                    }}>Custom:</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      placeholder="Enter quantity"
                      value={modalData.quantity}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseInt(value) >= 1 && parseInt(value) <= 99)) {
                          setModalData(prev => ({ ...prev, quantity: value }));
                        }
                      }}
                      style={{
                        background: '#2a3441',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        width: '80px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                      💧 Emitter Size (GPH):
                      {smartPlacementModal.optimal_emitter_analysis && (
                        <span style={{
                          color: '#00ff88',
                          fontSize: '14px',
                          fontWeight: 500,
                          marginLeft: '8px'
                        }}>
                          (Smart: {smartPlacementModal.optimal_emitter_analysis.recommended_emitter} GPH)
                        </span>
                      )}
                    </p>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        color: smartPlacementModal.emitterSizingMode === 'smart' ? '#00bcd4' : '#666',
                        fontSize: '12px',
                        fontWeight: smartPlacementModal.emitterSizingMode === 'smart' ? 600 : 500
                      }}>Smart</span>
                      <div 
                        style={{
                          width: '40px',
                          height: '20px',
                          background: '#2a3441',
                          borderRadius: '10px',
                          border: '1px solid #444',
                          position: 'relative',
                          cursor: 'pointer'
                        }}
                        onClick={() => setSmartPlacementModal(prev => prev ? {
                          ...prev,
                          emitterSizingMode: prev.emitterSizingMode === 'smart' ? 'manual' : 'smart'
                        } : null)}
                      >
                        <div style={{
                          width: '16px',
                          height: '16px',
                          background: smartPlacementModal.emitterSizingMode === 'smart' ? '#00bcd4' : '#666',
                          borderRadius: '50%',
                          position: 'absolute',
                          top: '1px',
                          left: smartPlacementModal.emitterSizingMode === 'smart' ? '1px' : '23px',
                          transition: 'all 0.2s'
                        }} />
                      </div>
                      <span style={{
                        color: smartPlacementModal.emitterSizingMode === 'manual' ? '#00bcd4' : '#666',
                        fontSize: '12px',
                        fontWeight: smartPlacementModal.emitterSizingMode === 'manual' ? 600 : 500
                      }}>Manual</span>
                    </div>
                  </div>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {[0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0].map(size => {
                      const isSelected = modalData.emitterSize === size.toString();
                      const isSmartRecommended = smartPlacementModal.optimal_emitter_analysis && 
                        smartPlacementModal.optimal_emitter_analysis.recommended_emitter === size;
                      const isSmartMode = smartPlacementModal.emitterSizingMode === 'smart';
                      
                      return (
                        <div
                          key={size}
                          onClick={() => setModalData(prev => ({ ...prev, emitterSize: size.toString() }))}
                          style={{
                            background: isSelected ? '#00bcd4' : (isSmartRecommended && isSmartMode ? '#00ff88' : '#2a3441'),
                            color: isSelected ? '#181f2a' : (isSmartRecommended && isSmartMode ? '#181f2a' : '#fff'),
                            borderRadius: '6px',
                            padding: '12px',
                            cursor: 'pointer',
                            border: isSelected ? '2px solid #00bcd4' : (isSmartRecommended && isSmartMode ? '2px solid #00ff88' : '1px solid #444'),
                            transition: 'all 0.2s',
                            fontSize: '14px',
                            fontWeight: (isSelected || (isSmartRecommended && isSmartMode)) ? 'bold' : 'normal',
                            width: '90px',
                            height: '50px',
                            textAlign: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            position: 'relative'
                          }}
                        >
                          {size} GPH
                          {isSmartRecommended && isSmartMode && !isSelected && (
                            <div style={{
                              position: 'absolute',
                              top: '-4px',
                              right: '-4px',
                              background: '#00ff88',
                              color: '#181f2a',
                              borderRadius: '50%',
                              width: '16px',
                              height: '16px',
                              fontSize: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 'bold'
                            }}>
                              ✓
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: 500
                    }}>Custom:</span>
                    <input
                      type="number"
                      min="0.1"
                      max="50"
                      step="0.1"
                      placeholder="Enter GPH"
                      value={modalData.emitterSize}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value === '' || (parseFloat(value) >= 0.1 && parseFloat(value) <= 50)) {
                          setModalData(prev => ({ ...prev, emitterSize: value }));
                        }
                      }}
                      style={{
                        background: '#2a3441',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        color: '#fff',
                        fontSize: '14px',
                        width: '80px',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <p style={{ margin: '0 0 12px 0', color: '#00bcd4', fontWeight: 600 }}>
                    📍 Select location:
                  </p>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {locations
                      .filter(loc => loc.zones.includes(parseInt(modalData.zoneId)))
                      .map(loc => (
                        <div
                          key={loc.location_id}
                          onClick={() => setModalData(prev => ({ ...prev, locationId: loc.location_id.toString() }))}
                                                        style={{
                                background: modalData.locationId === loc.location_id.toString() ? '#00bcd4' : '#2a3441',
                                color: modalData.locationId === loc.location_id.toString() ? '#181f2a' : '#fff',
                                borderRadius: '6px',
                                padding: '12px',
                                cursor: 'pointer',
                                border: modalData.locationId === loc.location_id.toString() ? '2px solid #00bcd4' : '1px solid #444',
                                transition: 'all 0.2s',
                                fontSize: '14px',
                                fontWeight: modalData.locationId === loc.location_id.toString() ? 'bold' : 'normal',
                                minWidth: '100px',
                                height: '50px',
                                textAlign: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}
                        >
                          {loc.name}
                        </div>
                      ))}
                    {locations.filter(loc => loc.zones.includes(parseInt(modalData.zoneId))).length === 0 && (
                      <div style={{
                        color: '#666',
                        fontSize: '14px',
                        fontStyle: 'italic'
                      }}>
                        No locations support this zone
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    marginTop: '8px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowLocationForm(true);
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #00bcd4',
                        color: '#00bcd4',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      + Add New Location
                    </button>
                  </div>
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                    textAlign: 'left'
                  }}>Comments (optional):</label>
                  <input
                    type="text"
                    name="comments"
                    value={modalData.comments}
                    onChange={handleModalChange}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                    placeholder="Any additional notes..."
                  />
                </div>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '16px'
                }}>
                  <button
                    type="button"
                    onClick={() => { 
                      setSmartPlacementModal(null);
                      setHeldPlant(null);
                      setSelectedPlants({});
                      setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: '2px solid #ff512f',
                      background: 'transparent',
                      color: '#ff512f',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >Cancel</button>
                  <button
                    type="submit"
                    disabled={!modalData.zoneId || !modalData.locationId || !modalData.quantity || !modalData.emitterSize}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize ? '#00bcd4' : '#666',
                      color: modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize ? '#181f2a' : '#999',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: modalData.zoneId && modalData.locationId && modalData.quantity && modalData.emitterSize ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >
                    Place Plant
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Location Creation Modal */}
        {showLocationForm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div 
              data-modal="true"
              style={{
                  background: '#232b3b',
                  borderRadius: '16px',
                padding: '32px',
                minWidth: '400px',
                maxWidth: '600px',
                  color: '#f4f4f4',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}
            >
              <h3 style={{
                      color: '#00bcd4',
                      fontWeight: 700,
                margin: '0 0 16px 0',
                      textAlign: 'left'
              }}>
                Add New Location
              </h3>
              
              <form style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }} onSubmit={e => { 
                e.preventDefault(); 
                handleSaveLocation();
              }}>
                    <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <label style={{
                      color: '#fff',
                      fontWeight: 600,
                      textAlign: 'left'
                  }}>Location Name:</label>
                  <input
                    type="text"
                    placeholder="Enter location name"
                    value={locationName}
                    onChange={(e) => setLocationName(e.target.value)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #00bcd4',
                        background: '#1a1f2a',
                        color: '#fff',
                        outline: 'none'
                      }}
                      required
                  />
                  </div>
                
                      <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                        textAlign: 'left'
                  }}>Description (optional):</label>
                  <input
                    type="text"
                    placeholder="Enter description"
                    value={locationDescription}
                    onChange={(e) => setLocationDescription(e.target.value)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                  />
                </div>
                
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                        textAlign: 'left'
                  }}>Select Zones:</label>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    {zones.filter(z => z.mode !== 'disabled').map(zone => (
                      <div
                        key={zone.zone_id}
                        onClick={() => handleZoneCheck(zone.zone_id)}
                            style={{
                          background: selectedLocationZones.includes(zone.zone_id) ? '#00bcd4' : '#2a3441',
                          color: selectedLocationZones.includes(zone.zone_id) ? '#181f2a' : '#fff',
                          borderRadius: '6px',
                              padding: '8px 12px',
                          cursor: 'pointer',
                          border: selectedLocationZones.includes(zone.zone_id) ? '2px solid #00bcd4' : '1px solid #444',
                          transition: 'all 0.2s',
                          fontSize: '14px',
                          fontWeight: selectedLocationZones.includes(zone.zone_id) ? 'bold' : 'normal'
                        }}
                      >
                        Zone {zone.zone_id}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '16px'
                }}>
                  <button
                    type="button"
                    onClick={() => { 
                      setShowLocationForm(false);
                      setLocationName('');
                      setLocationDescription('');
                      setSelectedLocationZones([]);
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: '2px solid #ff512f',
                      background: 'transparent',
                      color: '#ff512f',
                      fontWeight: 600,
                              fontSize: '14px',
                              cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >Cancel</button>
                  <button
                    type="submit"
                    disabled={savingLocation}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#00bcd4',
                      color: '#181f2a',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >
                    {savingLocation ? 'Saving...' : 'Add Location'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        
        {/* Zone Configuration Modal */}
        {showZoneModal && selectedZone && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.8)',
                              display: 'flex',
                              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}
            onClick={() => {
              setShowZoneModal(false);
              setSelectedZone(null);
              // Keep smart placement modal open to return to it
            }}
          >
            <div 
              style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '24px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '90vh',
                overflowY: 'auto',
                border: '1px solid #1a1f2a',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h2 style={{
                  color: selectedZone.mode === 'disabled' ? '#666' : '#00bcd4',
                  margin: 0,
                  fontWeight: 600
                }}>
                  Configure Zone {selectedZone.zone_id}
                  {selectedZone.mode === 'disabled' && (
                    <span style={{
                      color: '#666',
                      fontSize: '14px',
                      fontWeight: 400,
                      marginLeft: '8px'
                    }}>
                      (Disabled)
                            </span>
                  )}
                </h2>
                <button
                  onClick={() => {
                    setShowZoneModal(false);
                    setSelectedZone(null);
                    // Keep smart placement modal open to return to it
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    fontSize: '24px',
                    cursor: 'pointer',
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

                              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px'
              }}>
                {/* Zone Status Card */}
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #00bcd4'
                }}>
                  <div style={{
                    color: '#f4f4f4',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>🌱</span>
                    Zone Status:
                  </div>
                  <div style={{
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }}>
                    {['active', 'disabled'].map(status => (
                      <label
                        key={status}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          background: selectedZone.mode === status ? '#00bcd4' : '#232b3b',
                          color: selectedZone.mode === status ? '#000' : '#f4f4f4',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: selectedZone.mode === status ? 600 : 400,
                          border: '1px solid #1a1f2a'
                        }}
                      >
                        <input
                          type="radio"
                          name="status"
                          value={status}
                          checked={selectedZone.mode === status}
                          onChange={() => setSelectedZone({ ...selectedZone, mode: status })}
                          style={{ display: 'none' }}
                        />
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Period Selection Card */}
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #00bcd4',
                  opacity: selectedZone.mode === 'disabled' ? 0.5 : 1
                }}>
                  <div style={{
                    color: selectedZone.mode === 'disabled' ? '#666' : '#f4f4f4',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>📅</span>
                    Period:
                  </div>
                  <select
                    value={selectedZone.period}
                    onChange={(e) => setSelectedZone({ ...selectedZone, period: e.target.value })}
                    disabled={selectedZone.mode === 'disabled'}
                    style={{
                                background: '#232b3b',
                      color: selectedZone.mode === 'disabled' ? '#666' : '#f4f4f4',
                      border: '1px solid #00bcd4',
                      borderRadius: '6px',
                                padding: '8px 12px',
                      fontSize: '14px',
                      width: '100%',
                      boxSizing: 'border-box',
                      cursor: selectedZone.mode === 'disabled' ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <option value="D">Daily</option>
                    <option value="W">Weekly</option>
                    <option value="M">Monthly</option>
                  </select>
                </div>

                {/* Cycles Card */}
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #00bcd4',
                  opacity: selectedZone.mode === 'disabled' ? 0.5 : 1
                }}>
                  <div style={{
                    color: selectedZone.mode === 'disabled' ? '#666' : '#f4f4f4',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>🔄</span>
                    Cycles: {selectedZone.cycles}
                              </div>
                  <input
                    type="range"
                    min="1"
                    max={selectedZone.period === 'D' ? 10 : selectedZone.period === 'W' ? 6 : 3}
                    value={selectedZone.cycles}
                    onChange={(e) => setSelectedZone({ ...selectedZone, cycles: parseInt(e.target.value) })}
                    disabled={selectedZone.mode === 'disabled'}
                    style={{
                      width: '100%',
                      accentColor: selectedZone.mode === 'disabled' ? '#666' : '#00bcd4',
                      cursor: selectedZone.mode === 'disabled' ? 'not-allowed' : 'pointer'
                    }}
                  />
                  </div>

                {/* Time Configuration Card */}
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #00bcd4',
                  opacity: selectedZone.mode === 'disabled' ? 0.5 : 1
                }}>
                  <div style={{
                    color: selectedZone.mode === 'disabled' ? '#666' : '#f4f4f4',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>⏰</span>
                    Schedule Time:
                </div>
                  <input
                    type="text"
                    placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                    value={selectedZone.times?.[0]?.value || ''}
                    onChange={(e) => {
                      const newTimes = [...(selectedZone.times || [])];
                      newTimes[0] = { 
                        ...newTimes[0], 
                        value: e.target.value, 
                        start_time: e.target.value 
                      };
                      setSelectedZone({ ...selectedZone, times: newTimes });
                    }}
                    disabled={selectedZone.mode === 'disabled'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #1a1f2a',
                      background: '#232b3b',
                      color: selectedZone.mode === 'disabled' ? '#666' : '#f4f4f4',
                      fontSize: '14px',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                  />
            </div>

                {/* Comment Card */}
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '12px',
                  padding: '16px',
                  border: '1px solid #00bcd4'
                }}>
                  <div style={{
                    color: '#f4f4f4',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span>💬</span>
                    Comment:
        </div>
                  <input
                    type="text"
                    value={selectedZone.comment || ''}
                    onChange={(e) => setSelectedZone({ ...selectedZone, comment: e.target.value })}
                    placeholder="Optional description"
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #1a1f2a',
                      background: '#232b3b',
                      color: '#f4f4f4',
                      fontSize: '14px',
                      width: '100%',
                      boxSizing: 'border-box'
                    }}
                  />
      </div>

                {/* Action Buttons */}
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'flex-end',
                  marginTop: '20px'
                }}>
                  <button
                    onClick={() => {
                      setShowZoneModal(false);
                      setSelectedZone(null);
                      // Keep smart placement modal open to return to it
                    }}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid #666',
                      background: 'transparent',
                      color: '#666',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        console.log('Saving zone configuration:', selectedZone);
                        
                        // Prepare zone data based on mode
                        let zoneData;
                        if (selectedZone.mode === 'disabled') {
                          // For disabled zones, only send the mode
                          zoneData = { mode: 'disabled' };
                          console.log('Zone is disabled, sending only mode:', zoneData);
                        } else {
                          // For active zones, send all configuration data
                          zoneData = {
                            mode: selectedZone.mode,
                            period: selectedZone.period,
                            cycles: selectedZone.cycles,
                            comment: selectedZone.comment,
                            startDay: selectedZone.startDay,
                            times: selectedZone.times
                          };
                          console.log('Zone is active, sending full config:', zoneData);
                        }

                        console.log('Final zone data being sent:', zoneData);

                        // Save zone configuration to backend
                        const response = await fetch(`${getApiBaseUrl()}/api/schedule/${selectedZone.zone_id}`, {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify(zoneData)
                        });

                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('Server response:', response.status, errorText);
                          throw new Error(`Failed to save zone configuration: ${response.status} - ${errorText}`);
                        }

                        // Update local zones state
                        setZones(prev => prev.map(zone => {
                          if (zone.zone_id === selectedZone.zone_id) {
                            if (selectedZone.mode === 'disabled') {
                              // For disabled zones, only keep the mode
                              return { zone_id: selectedZone.zone_id, mode: 'disabled' };
                            } else {
                              // For active zones, keep all configuration
                              return { ...zone, ...selectedZone };
                            }
                          }
                          return zone;
                        }));

                        // Close the modal
                        setShowZoneModal(false);
                        setSelectedZone(null);

                        // Wait a moment for backend to fully process the zone save
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        
                        // Reload zones data to ensure we have the latest state
                        try {
                          const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
                          if (zonesResponse.ok) {
                            const zonesData = await zonesResponse.json();
                            setZones(zonesData);
                            console.log('Reloaded zones data:', zonesData);
                          }
                        } catch (error) {
                          console.error('Failed to reload zones:', error);
                        }
                        
                        // Force a complete refresh by re-triggering the smart placement process
                        if (smartPlacementModal) {
                          console.log('Forcing complete smart placement refresh...');
                          
                          // Re-trigger the original smart placement logic
                          const plantData = {
                            library_book: smartPlacementModal.bookFile.replace('.json', ''),
                            plant_id: smartPlacementModal.plant.plant_id,
                            common_name: smartPlacementModal.plant.common_name,
                            quantity: parseInt(modalData.quantity) || 1,
                            emitter_size: parseFloat(modalData.emitterSize) || 1.0,
                            zone_id: 1, // Default for analysis
                            location_id: 1, // Default for analysis
                            comments: modalData.comments || '',
                            planted_date: new Date().toISOString().split('T')[0]
                          };

                          console.log('Re-analyzing with plant data:', plantData);
                          console.log('Current zones state before analysis:', zones);
                          
                          // Log the specific zone we just created
                          const createdZone = zones.find(z => z.zone_id === selectedZone.zone_id);
                          console.log('Created zone details:', createdZone);

                          const analysisResponse = await fetch(`${getApiBaseUrl()}/api/smart/analyze-placement`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(plantData)
                          });

                          if (analysisResponse.ok) {
                            const analysis = await analysisResponse.json();
                            
                            console.log('Analysis after zone creation:', analysis);
                            console.log('Has compatible zones:', analysis.has_compatible_zones);
                            console.log('Recommendations:', analysis.recommendations);
                            
                            // Update smart recommendations with new analysis
                            setSmartRecommendations({
                              plantName: analysis.plant_data.common_name,
                              recommendations: analysis.recommendations || [],
                              hasCompatibleZones: analysis.has_compatible_zones
                            });

                            // Update the smart placement modal with new recommendations
                            if (smartPlacementModal) {
                              const updatedModal = {
                                ...smartPlacementModal,
                                recommendations: analysis.recommendations || []
                              };
                              console.log('Updating smart placement modal:', updatedModal);
                              setSmartPlacementModal(updatedModal);
                              
                              // If we now have compatible zones, auto-select the best one
                              if (analysis.recommendations && analysis.recommendations.length > 0) {
                                const bestZone = analysis.recommendations[0];
                                console.log('Auto-selecting best zone:', bestZone);
                                setModalData(prev => ({
                                  ...prev,
                                  zoneId: bestZone.zone_id.toString()
                                }));
                              }
                            }
                          } else {
                            console.error('Failed to re-analyze:', analysisResponse.status);
                            const errorText = await analysisResponse.text();
                            console.error('Error response:', errorText);
                          }
                        }

                        alert('Zone configuration saved successfully!');
                      } catch (error) {
                        console.error('Error saving zone configuration:', error);
                        alert('Failed to save zone configuration. Please try again.');
                      }
                    }}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#00bcd4',
                      color: '#000',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Save & Continue
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}  