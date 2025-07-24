import React, { useEffect, useState } from 'react';
import { getApiBaseUrl } from './utils';

interface PlantInstance {
  instance_id: number;
  library_book: string;
  plant_id: number;
  quantity: number;
  mode: string;
  comments: string;
  location_id: number;
  zone_id: number;
  emitter_size: number;
  planted_date: string;
  time_to_maturity: any;
}

interface Location {
  location_id: number;
  name: string;
  description: string;
  zones?: number[]; // Added for zones
}

export default function GardenOverview() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [map, setMap] = useState<Record<string, PlantInstance[]>>({});
  const [plantNames, setPlantNames] = useState<Record<string, Record<number, string>>>({});
  const [plantLatinNames, setPlantLatinNames] = useState<Record<string, Record<number, string>>>({});
  const [expandedPlant, setExpandedPlant] = useState<{ [locationId: number]: number | null }>({});
  const [zones, setZones] = useState<any[]>([]);
  const [zoneResolvedTimes, setZoneResolvedTimes] = useState<Record<number, Record<string, string>>>({});
  // Store resolved times for specific dates (for weekly/monthly schedules)
  const [dateSpecificResolvedTimes, setDateSpecificResolvedTimes] = useState<Record<string, Record<string, string>>>({});
  // Only one expanded zone at a time
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  // Instead of tracking a single expandedZone, track a boolean: areAnyZonesExpanded
  const [areAnyZonesExpanded, setAreAnyZonesExpanded] = useState(false);
  // Track which row is expanded (0 = first row, 1 = second row, etc.)
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [timerMultiplier, setTimerMultiplier] = useState(1.0);
  const [pumpInfo, setPumpInfo] = useState<{ pumpIndex: number | null; pumpStatus: string }>({ pumpIndex: null, pumpStatus: 'UNKNOWN' });
  const [gpioPins, setGpioPins] = useState<number[]>([]);
  const [healthStatus, setHealthStatus] = useState<'good' | 'warning' | 'error'>('good');
  const [orphanedPlants, setOrphanedPlants] = useState<any[]>([]);
  const [ignoredAlerts, setIgnoredAlerts] = useState<Set<string>>(new Set());

  // New state for real zone statuses
  const [zoneStatuses, setZoneStatuses] = useState<Record<number, { active: boolean, remaining: number, type?: string }>>({});

  // New state for expected zone states and pending actions
  const [expectedZoneStates, setExpectedZoneStates] = useState<Record<number, { active: boolean, startTime: Date | null, endTime: Date | null, type: string }>>({});
  const [pendingActions, setPendingActions] = useState<Set<number>>(new Set());
  
  // New state for error tracking and limits
  const [errorStartTimes, setErrorStartTimes] = useState<Record<number, Date>>({});
  const [errorDurations, setErrorDurations] = useState<Record<number, number>>({});
  
  // Configuration for error detection limits
  const ERROR_DETECTION_LIMITS = {
    PENDING_TIMEOUT: 30, // seconds - how long to wait for GPIO confirmation
    MANUAL_ACTION_GRACE_PERIOD: 5, // seconds - grace period for manual actions to take effect
    SCHEDULED_EVENT_GRACE_PERIOD: 60 // seconds - grace period for scheduled events to start
  };

  useEffect(() => {
    // Add timeout to all initial API calls
    const fetchWithTimeout = (url: string, timeout = 10000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      return fetch(url, { signal: controller.signal })
        .finally(() => clearTimeout(timeoutId));
    };

    fetchWithTimeout(`${getApiBaseUrl()}/api/locations`)
      .then(res => res.json())
      .then(data => setLocations(data))
      .catch(err => console.warn('Failed to load locations:', err));
    fetchWithTimeout(`${getApiBaseUrl()}/api/map`)
      .then(res => res.json())
      .then(data => setMap(data))
      .catch(err => console.warn('Failed to load map:', err));
    fetchWithTimeout(`${getApiBaseUrl()}/api/schedule`)
      .then(res => res.json())
      .then(data => {
        setZones(data);
        // For each zone, resolve next scheduled time(s)
        data.forEach(async (zone: any) => {
          if (zone.mode === 'disabled') return;
          let codes: string[] = [];
          let date = new Date().toISOString().slice(0, 10);
          if (Array.isArray(zone.times)) {
            codes = zone.times.map((t: any) => t.value).filter(Boolean);
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
          }
          if (codes.length) {
            try {
              const settingsResp = await fetchWithTimeout(`${getApiBaseUrl()}/config/settings.cfg`);
              const settings = await settingsResp.json();
              // Check for new format first (gps_lat, gps_lon)
              let lat, lon;
              if (settings.gps_lat !== undefined && settings.gps_lon !== undefined) {
                lat = settings.gps_lat;
                lon = settings.gps_lon;
              } else {
                // Fallback to old format (coords array)
                const coords = settings.coords || [0, 0];
                lat = coords[1];
                lon = coords[0];
              }
              const query = { codes, date, lat, lon };
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 10000);
              const resp = await fetch(`${getApiBaseUrl()}/api/resolve_times`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query),
                signal: controller.signal
              });
              clearTimeout(timeoutId);
              const resolvedArr = await resp.json();
              // Map each code to its resolved time
              const codeToTime: Record<string, string> = {};
              
              // Add resolved times for solar codes and legacy HHMM
              codes.forEach((code, idx) => {
                codeToTime[code] = resolvedArr[idx] || 'N/A';
              });
              
              // Add HH:MM format times directly (no resolution needed)
              if (Array.isArray(zone.times)) {
                zone.times.forEach((t: any) => {
                  const timeValue = t.value;
                  if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
                    const [h, m] = timeValue.split(':').map(Number);
                    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                      codeToTime[timeValue] = timeValue; // Use HH:MM directly
                    }
                  }
                });
              }
              
              setZoneResolvedTimes(prev => ({ ...prev, [zone.zone_id]: codeToTime }));
            } catch {
              setZoneResolvedTimes(prev => ({ ...prev, [zone.zone_id]: {} }));
            }
          }
        });
      });
    // Fetch plant library files and build lookup
    fetchWithTimeout(`${getApiBaseUrl()}/api/library-files`)
      .then(res => res.json())
      .then(async (files: any[]) => {
        const lookup: Record<string, Record<number, string>> = {};
        const latinLookup: Record<string, Record<number, string>> = {};
        await Promise.all(files.map(async (fileObj: any) => {
          const filename = fileObj.filename;
          const resp = await fetchWithTimeout(`${getApiBaseUrl()}/library/${filename}`);
          if (!resp.ok) return;
          const data = await resp.json();
          let book: Record<number, string> = {};
          let latinBook: Record<number, string> = {};
          if (data && typeof data === 'object' && data['Book Name'] && Array.isArray(data['plants'])) {
            data['plants'].forEach((plant: any) => {
              book[plant.plant_id] = plant.common_name || 'Unknown';
              latinBook[plant.plant_id] = plant.latin_name || '';
            });
          } else if (Array.isArray(data)) {
            data.forEach((plant: any) => {
              book[plant.plant_id] = plant.common_name || 'Unknown';
              latinBook[plant.plant_id] = plant.latin_name || '';
            });
          }
          lookup[filename.replace('.json', '')] = book;
          latinLookup[filename.replace('.json', '')] = latinBook;
        }));
        setPlantNames(lookup);
        setPlantLatinNames(latinLookup);
      });
    
    // Load timer multiplier from settings
    fetchWithTimeout(`${getApiBaseUrl()}/config/settings.cfg`)
      .then(res => res.json())
      .then(data => setTimerMultiplier(data.timer_multiplier || 1.0))
      .catch(() => setTimerMultiplier(1.0));
    
    // Load pump information from GPIO config
    fetchWithTimeout(`${getApiBaseUrl()}/config/gpio.cfg`)
      .then(res => res.json())
      .then(data => {
        const pumpIndex = data.pumpIndex && data.pumpIndex > 0 ? data.pumpIndex : null;
        setPumpInfo(prev => ({ ...prev, pumpIndex }));
        setGpioPins(data.pins || []);
      })
      .catch(() => setPumpInfo(prev => ({ ...prev, pumpIndex: null })));

    // Load health alerts
    fetchWithTimeout(`${getApiBaseUrl()}/api/health/alerts`)
      .then(res => res.json())
      .then(data => {
        const ignoredAlertsSet = new Set<string>(
          data.ignored_alerts?.map((alert: any) => `${alert.alert_type}-${alert.alert_id}`) || []
        );
        setIgnoredAlerts(ignoredAlertsSet);
        
        // Check for orphaned plants
        const orphaned = Object.entries(map).filter(([instanceId, plant]: [string, any]) => {
          if (!plant || !plant.location_id) return false;
          return !locations.some((loc: any) => loc.location_id === plant.location_id);
        }).map(([instanceId, plant]: [string, any]) => ({ 
          instanceId, 
          plant_id: plant.plant_id, 
          location_id: plant.location_id, 
          zone_id: plant.zone_id, 
          quantity: plant.quantity 
        }));

        const activeOrphanedPlants = orphaned.filter(plant => 
          !ignoredAlertsSet.has(`orphaned_plant-${plant.instanceId}`)
        );

        setOrphanedPlants(orphaned);
        
        if (activeOrphanedPlants.length > 0) {
          setHealthStatus('warning');
        } else {
          setHealthStatus('good');
        }
      })
      .catch(() => {
        setHealthStatus('good');
        setOrphanedPlants([]);
      });
  }, []);

  // Fetch real zone statuses every second
  useEffect(() => {
    const fetchZoneStatuses = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);  // 5s timeout (longer for Pi)

        const resp = await fetch(`${getApiBaseUrl()}/api/zones/status`, { 
          signal: controller.signal,
          headers: {
            'Connection': 'close'  // Force connection close to prevent CLOSE_WAIT
          }
        });
        clearTimeout(timeout);

        if (!resp.ok) {
          console.error('Failed to fetch zone statuses:', resp.status);
          // Don't spam console with errors
          return;
        }

        const data = await resp.json();
        const statuses: Record<number, { active: boolean, remaining: number, type?: string }> = {};
        
        // data is already in the format { "1": { active: true, remaining: 30, type: "manual" }, ... }
        console.log('Current pending actions:', Array.from(pendingActions));
        console.log('Zone statuses from backend:', data);
        Object.entries(data).forEach(([zoneIdStr, value]: [string, any]) => {
          const zoneId = parseInt(zoneIdStr);
          statuses[zoneId] = {
            active: value.active || false,
            remaining: value.remaining || 0,
            type: value.type
          };
          
          const now = new Date();
          const expectedState = expectedZoneStates[zoneId];
          
          // Removed excessive debug logging
          
          // Clear pending state when GPIO confirms the action
          // This happens when:
          // 1. Zone becomes active (timer start confirmed)
          // 2. Zone becomes inactive and we were expecting it to be active (timer completion confirmed)
          // 3. Zone becomes inactive and we were expecting it to be inactive (timer cancellation confirmed)
          if (pendingActions.has(zoneId)) {
            const expectedState = expectedZoneStates[zoneId];
            console.log('Pending check', {
              zoneId,
              realActive: value.active,
              expectedActive: expectedState?.active,
              pendingActions: Array.from(pendingActions),
              expectedZoneStates,
            });
            
            const shouldClearPending = value.active || // Zone activated (start confirmed)
                                     (!value.active && expectedState?.active) || // Zone deactivated when expected active (completion confirmed)
                                     (!value.active && !expectedState?.active); // Zone deactivated when expected inactive (cancellation confirmed)
            
            if (shouldClearPending) {
              console.log(`Clearing pending state for zone ${zoneId}`);
              setPendingActions(prev => {
                const newSet = new Set(prev);
                newSet.delete(zoneId);
                return newSet;
              });
              // Clear error tracking when pending action succeeds
              setErrorStartTimes(prev => {
                const newTimes = { ...prev };
                delete newTimes[zoneId];
                return newTimes;
              });
              setErrorDurations(prev => {
                const newDurations = { ...prev };
                delete newDurations[zoneId];
                return newDurations;
              });
            } else {
              console.log(`Zone ${zoneId} still pending - not clearing`);
            }
          }
          
          // Clear error tracking when states match or zone becomes active
          if (value.active || !expectedZoneStates[zoneId]?.active) {
            setErrorStartTimes(prev => {
              const newTimes = { ...prev };
              delete newTimes[zoneId];
              return newTimes;
            });
            setErrorDurations(prev => {
              const newDurations = { ...prev };
              delete newDurations[zoneId];
              return newDurations;
            });
          }
          
          // Update expected state based on actual status
          if (value.active) {
            // Zone is active, update expected state
            const endTime = new Date(now.getTime() + (value.remaining || 0) * 1000);
            setExpectedZoneStates(prev => ({
              ...prev,
              [zoneId]: {
                active: true,
                startTime: now,
                endTime: endTime,
                type: value.type || 'unknown'
              }
            }));
          } else {
            // Zone is inactive, clear expected state if it was expecting to be active
            if (expectedState && expectedState.active) {
              setExpectedZoneStates(prev => {
                const newStates = { ...prev };
                delete newStates[zoneId];
                return newStates;
              });
            }
          }
        });
        setZoneStatuses(statuses);
        
        // Sync manual timers with backend zone status
        const newManualTimers: Record<number, number> = {};
        Object.entries(data).forEach(([zoneIdStr, value]: [string, any]) => {
          const zoneId = parseInt(zoneIdStr);
          if (value.active && value.remaining && value.remaining > 0) {
            newManualTimers[zoneId] = value.remaining;
          }
        });
        setManualTimers(newManualTimers);
      } catch (error: any) {
        if (error.name === 'AbortError') {
          console.warn('Zone status fetch timed out');
        } else {
          console.error('Error fetching zone statuses:', error);
        }
      }
    };

    fetchZoneStatuses();
    const interval = setInterval(fetchZoneStatuses, 3000);  // Poll every 3 seconds to reduce load
    return () => clearInterval(interval);
  }, [pendingActions, expectedZoneStates]);

  useEffect(() => {
    if (zones.length === 0) return;

    zones.forEach(async (zone) => {
      if (zone.mode === 'disabled' || (zone.period !== 'W' && zone.period !== 'M')) return;

      const nextDate = getNextScheduledDate(zone);
      if (!nextDate) return;

      const dateKey = nextDate.toISOString().slice(0, 10);
      const timeCode = zone.time?.value || (zone.times?.[0]?.value);
      if (!timeCode) return;

      if (dateSpecificResolvedTimes[dateKey]?.[timeCode]) return;

      const resolvedTime = await resolveTimeForDate(zone, timeCode, nextDate);

      setDateSpecificResolvedTimes(prev => ({
        ...prev,
        [dateKey]: {
          ...prev[dateKey] || {},
          [timeCode]: resolvedTime
        }
      }));
    });
  }, [zones]);

  // Helper: get all plant instances for a location
  const getPlantsForLocation = (location_id: number) => {
    let result: PlantInstance[] = [];
    Object.entries(map).forEach(([instanceId, inst]: [string, any]) => {
      if (inst && typeof inst === 'object' && inst.location_id === location_id) {
        // Add the instance_id to the plant instance data
        result.push({
          ...inst,
          instance_id: instanceId
      });
      }
    });
    return result;
  };

  // Helper: get common name
  const getCommonName = (library_book: string, plant_id: number) => {
    return plantNames[library_book]?.[plant_id] || `Plant ${plant_id}`;
  };

  // Helper: get latin name
  const getLatinName = (library_book: string, plant_id: number) => {
    return plantLatinNames[library_book]?.[plant_id] || '';
  };

  // Helper: get zones for a location (one-based zone_id)
  const getZonesForLocation = (loc: Location) => {
    return (loc.zones || []).map(zid => zones.find(z => z.zone_id === zid)).filter(Boolean);
  };

  // Helper: parse HHMMSS duration string to seconds
  function parseDuration(dur: string): number {
    if (!dur || dur.length !== 6) return 0;
    const h = parseInt(dur.slice(0, 2), 10);
    const m = parseInt(dur.slice(2, 4), 10);
    const s = parseInt(dur.slice(4, 6), 10);
    return h * 3600 + m * 60 + s;
  }

  // Helper: format seconds as MM:SS
  function formatCountdown(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Helper: get the next scheduled start time as a Date object
  function getNextStartTime(zone_id: number, code: string): Date | null {
    const resolved = zoneResolvedTimes[zone_id]?.[code];
    if (!resolved || resolved === 'N/A' || resolved === '...') return null;
    
    // Check if resolved contains a date (for W and M schedules)
    if (resolved.includes('-') || resolved.includes('/')) {
      // Parse full date and time
      const dateTime = new Date(resolved);
      return isNaN(dateTime.getTime()) ? null : dateTime;
    } else {
    // Assume resolved is in HH:MM format for today
    const now = new Date();
    const [h, m] = resolved.split(':');
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(h), Number(m), 0);
    return date;
    }
  }

  // Helper: calculate next scheduled date for weekly/monthly schedules
  function getNextScheduledDate(zone: any): Date | null {
    if (!zone.startDay) return null;
    
    const startDate = new Date(zone.startDay);
    if (isNaN(startDate.getTime())) return null;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (zone.period === 'D') {
      // Daily: check if any times haven't passed today, otherwise tomorrow
      if (Array.isArray(zone.times)) {
        const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
        
        // Check if any scheduled times are still coming today
        const hasTimeToday = zone.times.some((t: any) => {
          const timeValue = t.value;
          
          // Handle HH:MM format directly
          if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
            const [h, m] = timeValue.split(':').map(Number);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
              return (h * 60 + m) > currentTime;
            }
          }
          
          // Handle resolved times (solar times, legacy HHMM)
          const resolved = zoneResolvedTimes[zone.zone_id]?.[timeValue];
          if (resolved && resolved !== 'N/A' && resolved !== '...') {
            const [h, m] = resolved.split(':').map(Number);
            return (h * 60 + m) > currentTime;
          }
          
          return false;
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
    } else if (zone.period === 'W') {
      // Weekly: find next occurrence based on startDay
      const startDayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const currentDayOfWeek = today.getDay();
      
      let daysToAdd = startDayOfWeek - currentDayOfWeek;
      if (daysToAdd <= 0) daysToAdd += 7; // Next week
      
      const nextDate = new Date(today.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
      return nextDate;
    } else if (zone.period === 'M') {
      // Monthly: find next occurrence based on startDay
      const startDayOfMonth = startDate.getDate(); // Day of month (1-31)
      const currentDayOfMonth = today.getDate();
      
      let nextDate = new Date(today.getFullYear(), today.getMonth(), startDayOfMonth);
      
      // If this month's date has passed, move to next month
      if (nextDate < today) {
        nextDate = new Date(today.getFullYear(), today.getMonth() + 1, startDayOfMonth);
      }
      
      return nextDate;
    }
    
    return null;
  }

  // Helper: get next scheduled time for daily zones
  function getNextDailyTime(zone: any): string {
    if (zone.period !== 'D') return '...';
    
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
    
    // Get all times for this zone
    let allTimes: Array<{ time: string; minutes: number; original: any }> = [];
    
    if (Array.isArray(zone.times)) {
      // All times in array
      allTimes = zone.times.map((t: any) => {
        const timeValue = t.value;
        
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

  // Helper: resolve time code for a specific date
  async function resolveTimeForDate(zone: any, timeCode: string, targetDate: Date): Promise<string> {
    try {
      const settingsResp = await fetch(`${getApiBaseUrl()}/config/settings.cfg`);
      const settings = await settingsResp.json();
      // Check for new format first (gps_lat, gps_lon)
      let lat, lon;
      if (settings.gps_lat !== undefined && settings.gps_lon !== undefined) {
        lat = settings.gps_lat;
        lon = settings.gps_lon;
      } else {
        // Fallback to old format (coords array)
        const coords = settings.coords || [0, 0];
        lat = coords[1];
        lon = coords[0];
      }
      const date = targetDate.toISOString().slice(0, 10);
      const query = { codes: [timeCode], date, lat, lon };
      
      const resp = await fetch(`${getApiBaseUrl()}/api/resolve_times`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query)
      });
      
      if (resp.ok) {
        const resolvedArr = await resp.json();
        return resolvedArr[0] || '...';
      }
    } catch (error: any) {
      console.error('Error resolving time for date:', error);
    }
    return '...';
  }

  // Helper: format next scheduled time with date and time
  function formatNextScheduledTime(zone: any): string {
    // Calculate the next scheduled date for all periods
    const nextDate = getNextScheduledDate(zone);
    if (!nextDate) return '...';
    
    // For daily schedules, find the next upcoming time
    if (zone.period === 'D') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const currentTime = now.getHours() * 60 + now.getMinutes(); // Current time in minutes
      
      // Get all times for this zone with their resolved values
      let allTimes: Array<{ timeStr: string; minutes: number; original: string }> = [];
      
      if (Array.isArray(zone.times)) {
        allTimes = zone.times.map((t: any) => {
          const timeValue = t.value;
          
          // Handle HH:MM format directly
          if (timeValue && timeValue.includes(':') && timeValue.length === 5) {
            const [h, m] = timeValue.split(':').map(Number);
            if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
              return { timeStr: timeValue, minutes: h * 60 + m, original: timeValue };
            }
          }
          
          // Handle resolved times (solar times, legacy HHMM)
          const resolved = zoneResolvedTimes[zone.zone_id]?.[timeValue];
          if (resolved && resolved !== 'N/A' && resolved !== '...') {
            const [h, m] = resolved.split(':').map(Number);
            return { timeStr: resolved, minutes: h * 60 + m, original: timeValue };
          }
          
          return null;
        }).filter(Boolean) as Array<{ timeStr: string; minutes: number; original: string }>;
      }
      
      if (allTimes.length === 0) return '...';
      
      // Return just the date portion for daily schedules
      const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
      
      if (nextDate.getTime() === today.getTime()) {
        return 'Today';
      } else if (nextDate.getTime() === tomorrow.getTime()) {
        return 'Tomorrow';
      } else {
        return nextDate.toLocaleDateString('en-US', { 
          month: '2-digit', 
          day: '2-digit' 
        });
      }
    }
    
    // For weekly and monthly schedules, get the first time
    const timeCode = zone.times?.[0]?.value;
    if (!timeCode) return '...';
    
    // Handle HH:MM format directly (no resolution needed)
    let timeStr = timeCode;
    if (timeCode && timeCode.includes(':') && timeCode.length === 5) {
      const [h, m] = timeCode.split(':').map(Number);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        timeStr = timeCode; // Use the HH:MM format directly
      } else {
        return '...';
      }
    } else {
      // Handle solar times and legacy HHMM format through resolution
      const dateKey = nextDate.toISOString().slice(0, 10);
      let resolved = dateSpecificResolvedTimes[dateKey]?.[timeCode];
      
      // Fallback to today's resolved time if date-specific not available
      if (!resolved || resolved === 'N/A' || resolved === '...') {
        resolved = zoneResolvedTimes[zone.zone_id]?.[timeCode] || '...';
      }
      
      if (!resolved || resolved === 'N/A' || resolved === '...') return '...';
      
      // Extract time from resolved
      if (resolved.includes(':')) {
        timeStr = resolved;
      } else if (resolved.includes('-') || resolved.includes('/')) {
        // If resolved contains full date-time, extract just the time
        try {
          const dateTime = new Date(resolved);
          if (!isNaN(dateTime.getTime())) {
            timeStr = dateTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false 
            });
          }
        } catch {
          timeStr = resolved;
        }
      }
    }
    
    // Format the display for weekly and monthly schedules (date only)
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const targetDate = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    
    if (targetDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (targetDate.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else {
      return nextDate.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit' 
      });
    }
  }

  // Helper: format period code to human readable text
  function formatPeriodCode(period: string): string {
    switch (period) {
      case 'D': return 'Daily';
      case 'W': return 'Weekly';
      case 'M': return 'Monthly';
      default: return period;
    }
  }

  // Helper: get duration for a zone (in seconds)
  function getZoneDuration(z: any): number {
    let baseDuration = 600; // fallback 10 min
    
    if (Array.isArray(z.times) && z.times[0]?.duration) {
      baseDuration = parseDuration(z.times[0].duration);
    }
    
    // Apply timer multiplier
    return Math.round(baseDuration * timerMultiplier);
  }

  // State for manual timers
  const [manualTimers, setManualTimers] = useState<Record<number, number>>({});
  const [showManualControl, setShowManualControl] = useState<number | null>(null);
  const [manualInput, setManualInput] = useState<Record<number, string>>({});
  const [manualInputError, setManualInputError] = useState<Record<number, string>>({});
  const [confirmCancelZone, setConfirmCancelZone] = useState<number | null>(null);

  // Manual timer countdown effect - REMOVED: now synced with backend

  // Helper: get remaining time for a zone (manual overrides schedule)
  function getZoneRemainingTime(z: any): number {
    if (manualTimers[z.zone_id] != null) return manualTimers[z.zone_id];
    let start: Date | null = null;
    let code = '';
    if (Array.isArray(z.times) && z.times.length > 0) {
      code = z.times[0].value;
      start = getNextStartTime(z.zone_id, code);
    }
    const dur = getZoneDuration(z);
    if (!start) return 0;
    const now = new Date();
    const end = new Date(start.getTime() + dur * 1000);
    if (now < start) return 0; // not started yet
    const remaining = Math.floor((end.getTime() - now.getTime()) / 1000);
    return remaining > 0 ? remaining : 0;
  }

  // Helper: determine indicator color based on expected vs actual state
  function getIndicatorColor(zoneId: number): { color: string; shadow: string; border: string; title: string } {
    const realStatus = zoneStatuses[zoneId] || { active: false, remaining: 0 };
    const isPending = pendingActions.has(zoneId);
    const now = new Date();
    
    // Check if pending action has timed out
    const pendingStartTime = errorStartTimes[zoneId];
    const pendingDuration = pendingStartTime ? (now.getTime() - pendingStartTime.getTime()) / 1000 : 0;
    const isPendingTimedOut = isPending && pendingDuration > ERROR_DETECTION_LIMITS.PENDING_TIMEOUT;
    
    // Only log important state changes
    if (isPending && isPendingTimedOut) {
      console.warn(`Zone ${zoneId}: Pending timeout after ${Math.round(pendingDuration)}s`);
    }
    
    // Green: Zone is active (GPIO confirmed it's on)
    if (realStatus.active) {
      return { 
        color: '#00ff00', 
        shadow: '0 0 8px #00ff00', 
        border: '#00ff00',
        title: 'Active: Zone is running'
      };
    }
    
    // Red: Pending action has timed out (error state)
    if (isPending && isPendingTimedOut) {
      return { 
        color: '#ff0000', 
        shadow: '0 0 8px #ff0000', 
        border: '#ff0000',
        title: `Error: Pending action timed out after ${Math.round(pendingDuration)}s`
      };
    }
    
    // Orange: Pending action (UI knows an event started but hasn't received GPIO confirmation)
    // But only if not timed out
    if (isPending && !isPendingTimedOut) {
      return { 
        color: '#ff8800', 
        shadow: '0 0 8px #ff8800', 
        border: '#ff8800',
        title: `Pending: Waiting for GPIO confirmation (${Math.round(pendingDuration)}s)`
      };
    }
    
    // Gray: Zone is off (default state)
    return { 
      color: '#888', 
      shadow: 'none', 
      border: '#232b3b',
      title: 'Inactive: Zone is off'
    };
  }

  // Helper: log red light events to backend
  function logRedLightEvent(zoneId: number, expectedState: any, realStatus: any, duration: number) {
    // Only log if this is a new error or significant duration milestone
    const lastLoggedDuration = errorDurations[zoneId] || 0;
    const shouldLog = !errorStartTimes[zoneId] || // New error
                     (duration >= 30 && lastLoggedDuration < 30) || // 30s milestone
                     (duration >= 60 && lastLoggedDuration < 60) || // 1min milestone
                     (duration >= 300 && lastLoggedDuration < 300); // 5min milestone
    
    if (shouldLog) {
      const logData = {
        zone_id: zoneId,
        event_type: 'red_light_error',
        expected_state: expectedState.active ? 'ON' : 'OFF',
        actual_state: realStatus.active ? 'ON' : 'OFF',
        expected_type: expectedState.type || 'unknown',
        actual_type: realStatus.type || 'unknown',
        duration_seconds: Math.round(duration),
        timestamp: new Date().toISOString(),
        message: `Zone ${zoneId} state mismatch: expected ${expectedState.active ? 'ON' : 'OFF'} (${expectedState.type}), actual ${realStatus.active ? 'ON' : 'OFF'} (${realStatus.type}) for ${Math.round(duration)}s`
      };
      
      // Log to backend with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for logging
      
      fetch(`${getApiBaseUrl()}/api/logs/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(logData),
        signal: controller.signal
      })
      .then(response => {
        clearTimeout(timeoutId);
        if (response.ok) {
          console.log(`Red light event logged for zone ${zoneId}:`, logData.message);
        } else {
          console.error(`Failed to log red light event for zone ${zoneId}:`, response.status);
        }
      })
      .catch(error => {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.warn(`Logging request timed out for zone ${zoneId}`);
        } else {
          console.error(`Error logging red light event for zone ${zoneId}:`, error);
        }
      });
    }
  }

  // Helper function to parse manual timer input with leading zero support
  function parseManualTimeInput(input: string): { hours: number; minutes: number; seconds: number; isValid: boolean; error: string } {
    // Remove any non-numeric characters
    const cleanInput = input.replace(/[^0-9]/g, '');
    
    if (!cleanInput) {
      return { hours: 0, minutes: 0, seconds: 0, isValid: false, error: 'Enter a duration' };
    }
    
    // Pad with leading zeros to 6 digits (HHMMSS format)
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

  // Handler to start a manual timer
  function startManualTimer(zone_id: number, seconds: number) {
    // Set pending state after a brief delay to avoid red flash
    setTimeout(() => {
      setPendingActions(prev => new Set(prev).add(zone_id));
      // Set error tracking start time for pending action
      setErrorStartTimes(prev => ({ ...prev, [zone_id]: new Date() }));
    }, 100); // 100ms delay to let the API call start
    
    // Set expected state
    const now = new Date();
    const endTime = new Date(now.getTime() + seconds * 1000);
    setExpectedZoneStates(prev => ({
      ...prev,
      [zone_id]: {
        active: true,
        startTime: now,
        endTime: endTime,
        type: 'manual'
      }
    }));
    
    // Use the standard manual timer endpoint (scheduler-based) with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    fetch(`${getApiBaseUrl()}/api/manual-timer/${zone_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: seconds }),
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutId);
      if (response.ok) {
        // Clear input and hide control only on success
        setManualInput(inp => ({ ...inp, [zone_id]: '' }));
        setManualInputError(errs => ({ ...errs, [zone_id]: '' }));
        setShowManualControl(null);
        // Backend sync will update manualTimers state
      } else {
        console.error(`Failed to start manual timer for zone ${zone_id}:`, response.status);
        alert('Failed to start manual timer. Please try again.');
        // Clear pending state on failure
        setPendingActions(prev => {
          const newSet = new Set(prev);
          newSet.delete(zone_id);
          return newSet;
        });
        setExpectedZoneStates(prev => {
          const newStates = { ...prev };
          delete newStates[zone_id];
          return newStates;
        });
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('Manual timer request timed out');
        alert('Request timed out. Please try again.');
      } else {
        console.error('Error starting manual timer:', error);
        alert('Error starting manual timer. Please try again.');
      }
      // Clear pending state on error
      setPendingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(zone_id);
        return newSet;
      });
      setExpectedZoneStates(prev => {
        const newStates = { ...prev };
        delete newStates[zone_id];
        return newStates;
      });
    });
  }

  // Calculate pump status based on real zone states from GPIO
  const calculatePumpStatus = () => {
    // Check if any zones are currently active based on real GPIO status
    const anyZoneRunning = Object.values(zoneStatuses).some(status => status.active);
    
    // Pump should be ON if any zone is running, OFF if all zones are off
    const pumpStatus = anyZoneRunning ? 'HIGH' : 'LOW';
    setPumpInfo(prev => ({ ...prev, pumpStatus }));
  };

  // Update pump status based on real zone states
  useEffect(() => {
    calculatePumpStatus();
    const interval = setInterval(calculatePumpStatus, 1000); // Update every second to match zone timers
    
    return () => clearInterval(interval);
  }, [zoneStatuses]); // Recalculate when real zone statuses change

  // Monitor for scheduled events and set expected states
  useEffect(() => {
    const checkScheduledEvents = () => {
      const now = new Date();
      
      zones.forEach(zone => {
        if (zone.mode === 'disabled') return;
        
        // Check if this zone should be starting now
        const nextStartTime = getNextStartTime(zone.zone_id, zone.times?.[0]?.value || '');
        if (!nextStartTime) return;
        
        // Only set pending state if the scheduled time has actually arrived (within 5 seconds)
        const timeDiff = Math.abs(now.getTime() - nextStartTime.getTime()) / 1000;
        const realStatus = zoneStatuses[zone.zone_id] || { active: false };
        
        if (timeDiff <= 5 && !realStatus.active && !expectedZoneStates[zone.zone_id]?.active) {
          // Set expected state for scheduled event
          const duration = getZoneDuration(zone);
          const endTime = new Date(nextStartTime.getTime() + duration * 1000);
          
          setExpectedZoneStates(prev => ({
            ...prev,
            [zone.zone_id]: {
              active: true,
              startTime: nextStartTime,
              endTime: endTime,
              type: 'scheduled'
            }
          }));
          
          // Set pending state and error tracking
          setPendingActions(prev => new Set(prev).add(zone.zone_id));
          setErrorStartTimes(prev => ({ ...prev, [zone.zone_id]: now }));
        }
      });
    };
    
    checkScheduledEvents();
    const interval = setInterval(checkScheduledEvents, 1000); // Check every second
    
    return () => clearInterval(interval);
  }, [zones, zoneStatuses, expectedZoneStates]);

  // Cleanup old errors and timeouts
  useEffect(() => {
    const cleanupErrors = () => {
      const now = new Date();
      const zonesToCleanup: number[] = [];
      
      // Find zones that need cleanup
      Object.entries(errorStartTimes).forEach(([zoneIdStr, startTime]) => {
        const zoneId = parseInt(zoneIdStr);
        const duration = (now.getTime() - startTime.getTime()) / 1000;
        
        // Clear if error has been tracked for too long (5 minutes)
        if (duration > 300) {
          zonesToCleanup.push(zoneId);
        }
      });
      
      // Apply all cleanups separately to avoid nested setState
      if (zonesToCleanup.length > 0) {
        setErrorStartTimes(prev => {
          const newTimes = { ...prev };
          zonesToCleanup.forEach(zoneId => delete newTimes[zoneId]);
          return newTimes;
        });
        
        setExpectedZoneStates(prev => {
          const newStates = { ...prev };
          zonesToCleanup.forEach(zoneId => delete newStates[zoneId]);
          return newStates;
        });
        
        setPendingActions(prev => {
          const newSet = new Set(prev);
          zonesToCleanup.forEach(zoneId => newSet.delete(zoneId));
          return newSet;
        });
      }
      
      // Clean up old error durations
      setErrorDurations(prev => {
        const newDurations = { ...prev };
        Object.keys(newDurations).forEach(zoneIdStr => {
          const zoneId = parseInt(zoneIdStr);
          if (!errorStartTimes[zoneId]) {
            delete newDurations[zoneId];
          }
        });
        return newDurations;
      });
    };
    
    cleanupErrors();
    const interval = setInterval(cleanupErrors, 10000); // Clean up every 10 seconds
    
    return () => clearInterval(interval);
  }, []); // Remove errorStartTimes dependency to prevent infinite loop

  // Handler to cancel a timer (manual or scheduled)
  function cancelTimer(zone_id: number) {
    const zoneStatus = zoneStatuses[zone_id];
    const timerType = zoneStatus?.type || 'manual';
    const isScheduled = timerType === 'scheduled';
    
    const message = isScheduled 
      ? 'Are you sure you want to stop this scheduled event? This action cannot be undone.'
      : 'Are you sure you want to stop this manual timer? This action cannot be undone.';
    
    if (!confirm(message)) {
      return;
    }
    
    // Set expected state to inactive
    console.log(`Setting expected state for zone ${zone_id} to inactive (canceled)`);
    setExpectedZoneStates(prev => ({
      ...prev,
      [zone_id]: {
        active: false,
        startTime: null,
        endTime: null,
        type: 'canceled'
      }
    }));
    
    // Set pending state immediately for cancellation
    console.log(`Adding zone ${zone_id} to pending actions`);
    setPendingActions(prev => {
      const newSet = new Set(prev);
      newSet.add(zone_id);
      console.log(`Updated pending actions:`, Array.from(newSet));
      return newSet;
    });
    setErrorStartTimes(prev => ({ ...prev, [zone_id]: new Date() }));
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    fetch(`${getApiBaseUrl()}/api/manual-timer/${zone_id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close'
      },
      mode: 'cors',
      signal: controller.signal
    })
    .then(response => {
      clearTimeout(timeoutId);
      if (response.ok) {
        // Backend sync will update manualTimers state
        setConfirmCancelZone(null);
      } else {
        console.error(`Failed to cancel timer for zone ${zone_id}:`, response.status);
        alert('Failed to cancel manual timer. Please try again.');
        // Clear pending state on failure
        setPendingActions(prev => {
          const newSet = new Set(prev);
          newSet.delete(zone_id);
          return newSet;
        });
        setExpectedZoneStates(prev => {
          const newStates = { ...prev };
          delete newStates[zone_id];
          return newStates;
        });
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('Cancel timer request timed out');
        alert('Request timed out. Please try again.');
      } else {
        console.error(`Error canceling timer for zone ${zone_id}:`, error.message);
        alert('Error canceling manual timer. Please try again.');
      }
      // Clear pending state on error
      setPendingActions(prev => {
        const newSet = new Set(prev);
        newSet.delete(zone_id);
        return newSet;
      });
      setExpectedZoneStates(prev => {
        const newStates = { ...prev };
        delete newStates[zone_id];
        return newStates;
      });
    });
  }

  return (
    <div style={{
      minHeight: '100vh',
      minWidth: '100vw',
      background: '#181f2a',
      padding: '0 0 0 20px',
      marginLeft: '150px',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      <div style={{
        maxWidth: '1200px',
        marginLeft: 0,
        marginRight: 0,
        padding: '20px 20px 20px 0',
        overflow: 'hidden'
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
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          {/* Health Warning Banner */}
          {healthStatus === 'warning' && (
            <div style={{
              background: '#FF9800',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 4px 24px rgba(255,152,0,0.3)',
              border: '1px solid #E68900',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#FFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#FF9800',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}>
                  !
                </span>
                <div style={{
                  color: '#FFF',
                  fontWeight: 600,
                  fontSize: '16px'
                }}>
                  Health Warning: {orphanedPlants.filter(plant => 
                    !ignoredAlerts?.has(`orphaned_plant-${plant.instanceId}`)
                  ).length} orphaned plant(s) detected
                </div>
                <button
                  onClick={() => window.location.href = '/health'}
                  style={{
                    marginLeft: 'auto',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #FFF',
                    background: 'transparent',
                    color: '#FFF',
                    fontWeight: 600,
                    fontSize: '14px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#FFF';
                    e.currentTarget.style.color = '#FF9800';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = '#FFF';
                  }}
                >
                  View Details
                </button>
              </div>
            </div>
          )}

          {/* Pump Status Display */}
          {pumpInfo.pumpIndex && (
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '16px 20px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <span style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: pumpInfo.pumpStatus === 'HIGH' ? '#00ff00' : '#888',
                  display: 'inline-block',
                  border: '2px solid #222',
                  boxShadow: pumpInfo.pumpStatus === 'HIGH' ? '0 0 10px #00ff00' : 'none',
                  transition: 'all 0.3s ease'
                }}></span>
                <span style={{
                  color: '#00bcd4',
                  fontWeight: 700,
                  fontSize: '18px'
                }}>
                  Main Pump (Zone {pumpInfo.pumpIndex})
                </span>
                <span style={{
                  color: pumpInfo.pumpStatus === 'HIGH' ? '#00bcd4' : '#bdbdbd',
                  fontSize: '16px',
                  fontWeight: 600
                }}>
                  {pumpInfo.pumpStatus === 'HIGH' ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div style={{
                color: '#888',
                fontSize: '14px',
                marginTop: '8px'
              }}>
                {pumpInfo.pumpStatus === 'HIGH' ? 
                  'Pump is currently active and supplying water to zones' : 
                  'Pump is idle - will activate when zones are running'
                }
              </div>
            </div>
          )}
          
          {/* Zone grid at the top */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px',
            justifyContent: 'start',
            marginBottom: '40px'
          }}>
            {zones
              .filter(z => z && typeof z.zone_id === 'number' && z.mode !== 'disabled')
              .map(z => {
                const realStatus = zoneStatuses[z.zone_id] || { active: false, remaining: 0 };
                const isOn = realStatus.active;
                const remaining = realStatus.remaining;
                const rowNumber = Math.floor((z.zone_id - 1) / 4);
                const isExpanded = expandedRow === rowNumber;
                const indicatorStyle = getIndicatorColor(z.zone_id);
                return (
                  <div key={z.zone_id} style={{
                    width: '100%',
                    margin: 0,
                    background: '#232b3b',
                    color: '#f4f4f4',
                    borderRadius: '16px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    border: `2px solid ${indicatorStyle.border}`,
                    cursor: 'pointer',
                    transition: 'border 0.2s',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    alignItems: 'stretch',
                    height: '100%',
                    boxSizing: 'border-box',
                    overflow: 'hidden'
                  }}
                    onClick={() => setExpandedRow(expandedRow === rowNumber ? null : rowNumber)}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginBottom: '8px'
                    }}>
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: indicatorStyle.color,
                          display: 'inline-block',
                          border: '2px solid #222',
                          cursor: 'pointer',
                          boxShadow: indicatorStyle.shadow,
                          transition: 'all 0.3s ease'
                        }}
                        onClick={e => { e.stopPropagation(); setShowManualControl(showManualControl === z.zone_id ? null : z.zone_id); }}
                        title={indicatorStyle.title}
                      ></span>
                      <span style={{
                        color: '#00bcd4',
                        fontWeight: 700,
                        fontSize: '18px'
                      }}>
                        Zone {z.zone_id}
                        {isOn && (
                          <span style={{
                            color: '#00bcd4',
                            fontWeight: 700,
                            fontSize: '16px',
                            marginLeft: '8px'
                          }}>- {formatCountdown(remaining)}</span>
                        )}
                      </span>
                    </div>
                    <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                    {/* Manual timer controls */}
                    {showManualControl === z.zone_id && (
                      <div style={{
                        background: '#232b3b',
                        borderRadius: '8px',
                        padding: '10px',
                        marginBottom: '8px',
                        color: '#fff',
                        fontSize: '15px',
                        width: '100%'
                      }}>
                        {manualTimers[z.zone_id] == null ? (
                          <>
                            <div style={{ marginBottom: '8px' }}>Start manual timer:</div>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <input
                                type="text"
                                value={manualInput[z.zone_id] || ''}
                                onChange={e => {
                                  const val = e.target.value.replace(/[^0-9]/g, '');
                                  setManualInput(inp => ({ ...inp, [z.zone_id]: val }));
                                  setManualInputError(errs => ({ ...errs, [z.zone_id]: '' }));
                                }}
                                placeholder="HHMMSS"
                                style={{
                                  width: '80px',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  border: '1px solid #00bcd4',
                                  background: '#2d2350',
                                  color: '#fff',
                                  fontSize: '15px',
                                  textAlign: 'center'
                                }}
                                maxLength={6}
                              />
                              <button
                                                onClick={e => {
                  e.stopPropagation();
                  const val = manualInput[z.zone_id] || '';
                  const parsed = parseManualTimeInput(val);
                  
                  if (!parsed.isValid) {
                    setManualInputError(errs => ({ ...errs, [z.zone_id]: parsed.error }));
                    return;
                  }
                  
                                            const totalSeconds = parsed.hours * 3600 + parsed.minutes * 60 + parsed.seconds;
                  startManualTimer(z.zone_id, totalSeconds);
                }}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background: '#00bcd4',
                                  color: '#181f2a',
                                  fontWeight: 700,
                                  fontSize: '15px',
                                  cursor: 'pointer'
                                }}
                                disabled={!manualInput[z.zone_id]}
                              >
                                Start
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  setShowManualControl(null);
                                  setManualInput(inp => ({ ...inp, [z.zone_id]: '' }));
                                  setManualInputError(errs => ({ ...errs, [z.zone_id]: '' }));
                                }}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: '6px',
                                  border: '2px solid #ff512f',
                                  background: 'transparent',
                                  color: '#ff512f',
                                  fontWeight: 700,
                                  fontSize: '15px',
                                  cursor: 'pointer'
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                            {manualInputError[z.zone_id] && (
                              <div style={{
                                color: '#ff512f',
                                marginTop: '4px',
                                fontSize: '14px'
                              }}>{manualInputError[z.zone_id]}</div>
                            )}
                          </>
                        ) : (
                          <>
                            <div style={{ marginBottom: '8px' }}>
                              {zoneStatuses[z.zone_id]?.type === 'scheduled' ? 'Scheduled event running' : 'Manual timer running'}: <b>{formatCountdown(manualTimers[z.zone_id])}</b>
                            </div>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmCancelZone(z.zone_id);
                              }}
                              style={{
                                padding: '6px 14px',
                                borderRadius: '6px',
                                border: '2px solid #ff512f',
                                background: 'transparent',
                                color: '#ff512f',
                                fontWeight: 700,
                                fontSize: '15px',
                                cursor: 'pointer'
                              }}
                            >
                              Cancel
                            </button>
                            {confirmCancelZone === z.zone_id && (
                              <div style={{
                                marginTop: '10px',
                                color: '#fff',
                                background: '#232b3b',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontSize: '15px'
                              }}>
                                <div style={{ marginBottom: '10px' }}>Are you sure you want to stop this zone?</div>
                                <div style={{
                                  display: 'flex',
                                  gap: '10px'
                                }}>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      cancelTimer(z.zone_id);
                                      setConfirmCancelZone(null);
                                    }}
                                    style={{
                                      padding: '6px 14px',
                                      borderRadius: '6px',
                                      border: '2px solid #ff512f',
                                      background: 'transparent',
                                      color: '#ff512f',
                                      fontWeight: 700,
                                      fontSize: '15px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Yes, Stop
                                  </button>
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      setConfirmCancelZone(null);
                                    }}
                                    style={{
                                      padding: '6px 14px',
                                      borderRadius: '6px',
                                      border: '2px solid #ff512f',
                                      background: 'transparent',
                                      color: '#ff512f',
                                      fontWeight: 700,
                                      fontSize: '15px',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    <div style={{
                      color: '#bdbdbd',
                      fontSize: '15px',
                      marginBottom: '4px',
                      textAlign: 'left'
                    }}>{z.comment || 'No description'}</div>
                    <div style={{
                      color: '#00bcd4',
                      fontWeight: 600,
                      fontSize: '15px',
                      textAlign: 'left'
                    }}>
                      Next: {formatNextScheduledTime(z)}
                    </div>

                    {isExpanded && (
                      <div style={{
                        marginTop: '12px',
                        color: '#fff',
                        fontSize: '15px',
                        background: '#232b3b',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        width: '100%',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                      }}>
                        <div><b>Zone ID:</b> {z.zone_id}</div>
                        <div><b>GPIO Pin:</b> {gpioPins[z.zone_id - 1] || 'N/A'}</div>
                        <div><b>Mode:</b> {z.mode}</div>
                        <div><b>Period:</b> {formatPeriodCode(z.period)}</div>
                        <div><b>Cycles:</b> {z.cycles}</div>
                        <div><b>Schedule:</b>
                          <ul style={{ margin: 0, paddingLeft: '18px', textAlign: 'left' }}>
                            {(() => {
                              let scheduledTimes: { raw: string, resolved: string }[] = [];
                              if (Array.isArray(z.times)) {
                                scheduledTimes = z.times.map((t: any, idx: number) => {
                                  const timeCode = t.start_time || t.value;
                                  const nextDate = getNextScheduledDate(z);
                                  const dateKey = nextDate ? nextDate.toISOString().slice(0, 10) : null;
                                  const resolvedTime = dateKey && dateSpecificResolvedTimes[dateKey]?.[timeCode] 
                                    ? dateSpecificResolvedTimes[dateKey][timeCode] 
                                    : zoneResolvedTimes[z.zone_id]?.[timeCode] || '...';
                                  return { raw: timeCode, resolved: resolvedTime };
                                });
                              }
                              return scheduledTimes.map((t, idx) => (
                                <li key={idx}>
                                  <span style={{ color: '#00bcd4' }}>{t.raw}</span> &rarr; <span style={{ color: '#fff' }}>{t.resolved}</span>
                                </li>
                              ));
                            })()}
                          </ul>
                        </div>
                        <div><b>Used by locations:</b>
                          <ul style={{ margin: 0, paddingLeft: '18px', textAlign: 'left' }}>
                            {(() => {
                              const usedByLocations = locations.filter(loc => (loc.zones || []).includes(z.zone_id));
                              return usedByLocations.length === 0 ? (
                                <li style={{ color: '#888' }}>None</li>
                              ) : usedByLocations.map(loc => (
                                <li key={loc.location_id}>{loc.name}</li>
                              ));
                            })()}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
          
          {/* Locations grid */}
          {locations.length === 0 ? (
            <div style={{
              color: '#888',
              fontStyle: 'italic',
              textAlign: 'left',
              padding: '24px',
              background: '#232b3b',
              borderRadius: '16px',
              border: '1px solid #1a1f2a',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              minWidth: '320px',
              maxWidth: '500px'
            }}>No locations found. Please add locations first.</div>
          ) : Object.keys(map).length === 0 ? (
            <div style={{
              color: '#888',
              fontStyle: 'italic',
              textAlign: 'left',
              padding: '24px',
              background: '#232b3b',
              borderRadius: '16px',
              border: '1px solid #1a1f2a',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              minWidth: '320px',
              maxWidth: '500px'
            }}>No plant assignments found. Please assign plants and click Finish.</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '32px',
              width: '100%'
            }}>
              {locations.map(loc => (
                <div key={loc.location_id} style={{
                  width: '100%',
                  marginBottom: '16px',
                  background: '#232b3b',
                  borderRadius: '16px',
                  boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                  color: '#f4f4f4',
                  padding: '24px'
                }}>
                  <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}>
                    <h2 style={{
                      color: '#00bcd4',
                      fontWeight: 700,
                      margin: '0 0 8px 0',
                      textAlign: 'left'
                    }}>{loc.name}</h2>
                    <div style={{
                      color: '#bdbdbd',
                      fontSize: '15px',
                      marginTop: '6px'
                    }}>{loc.description}</div>
                  </div>
                  <div style={{ padding: 0 }}>
                    {getPlantsForLocation(loc.location_id).length === 0 ? (
                      <div style={{
                        color: '#888',
                        fontStyle: 'italic',
                        textAlign: 'left'
                      }}>No plants assigned to this location.</div>
                    ) : (
                      <ul style={{
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                        textAlign: 'left'
                      }}>
                        {getPlantsForLocation(loc.location_id).map(inst => (
                          <li
                            key={inst.instance_id}
                            style={{
                              background: '#1a1f2a',
                              color: '#00bcd4',
                              borderRadius: '8px',
                              padding: '8px 12px',
                              marginBottom: '4px',
                              fontSize: '14px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              position: 'relative'
                            }}
                            onClick={() => setExpandedPlant(prev => ({ ...prev, [loc.location_id]: prev[loc.location_id] === inst.instance_id ? null : inst.instance_id }))}
                          >
                            <span style={{ fontWeight: 'bold' }}>
                              {getCommonName(inst.library_book, inst.plant_id)}
                            </span>
                            <span style={{ color: '#bdbdbd' }}>x{inst.quantity}</span>
                            {expandedPlant[loc.location_id] === inst.instance_id && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                marginTop: '4px',
                                color: '#fff',
                                fontSize: '12px',
                                background: '#232b3b',
                                borderRadius: '8px',
                                padding: '8px 12px',
                                zIndex: 10,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                              }}>
                                <div><b>Emitter:</b> {inst.emitter_size} GPH</div>
                                <div><b>Zone:</b> {inst.zone_id}</div>
                                <div><b>Planted:</b> {inst.planted_date}</div>
                                <div><b>Comments:</b> {inst.comments || <span style={{ color: '#888' }}>None</span>}</div>
                                <div style={{ color: '#888' }}><b>Time to Maturity:</b> (coming soon)</div>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}  