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
  const [zoneStatuses, setZoneStatuses] = useState<Record<string, { active: boolean, remaining: number, type?: string }>>({});

  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/locations`)
      .then(res => res.json())
      .then(data => setLocations(data));
    fetch(`${getApiBaseUrl()}/api/map`)
      .then(res => res.json())
      .then(data => setMap(data));
    fetch(`${getApiBaseUrl()}/api/schedule`)
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
          }
          if (codes.length) {
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
              const query = { codes, date, lat, lon };
              const resp = await fetch(`${getApiBaseUrl()}/api/resolve_times`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query)
              });
              const resolvedArr = await resp.json();
              // Map each code to its resolved time
              const codeToTime: Record<string, string> = {};
              codes.forEach((code, idx) => {
                codeToTime[code] = resolvedArr[idx] || 'N/A';
              });
              setZoneResolvedTimes(prev => ({ ...prev, [zone.zone_id]: codeToTime }));
            } catch {
              setZoneResolvedTimes(prev => ({ ...prev, [zone.zone_id]: {} }));
            }
          }
        });
      });
    // Fetch plant library files and build lookup
    fetch(`${getApiBaseUrl()}/api/library-files`)
      .then(res => res.json())
      .then(async (files: any[]) => {
        const lookup: Record<string, Record<number, string>> = {};
        const latinLookup: Record<string, Record<number, string>> = {};
        await Promise.all(files.map(async (fileObj: any) => {
          const filename = fileObj.filename;
          const resp = await fetch(`${getApiBaseUrl()}/library/${filename}`);
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
    fetch(`${getApiBaseUrl()}/config/settings.cfg`)
      .then(res => res.json())
      .then(data => setTimerMultiplier(data.timer_multiplier || 1.0))
      .catch(() => setTimerMultiplier(1.0));
    
    // Load pump information from GPIO config
    fetch(`${getApiBaseUrl()}/config/gpio.cfg`)
      .then(res => res.json())
      .then(data => {
        const pumpIndex = data.pumpIndex && data.pumpIndex > 0 ? data.pumpIndex : null;
        setPumpInfo(prev => ({ ...prev, pumpIndex }));
        setGpioPins(data.pins || []);
      })
      .catch(() => setPumpInfo(prev => ({ ...prev, pumpIndex: null })));

    // Load health alerts
    fetch(`${getApiBaseUrl()}/api/health/alerts`)
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
        const statuses: Record<string, { active: boolean, remaining: number, type?: string }> = {};
        
        // data is already in the format { "1": { active: true, remaining: 30, type: "manual" }, ... }
        Object.entries(data).forEach(([zoneIdStr, value]: [string, any]) => {
          const zoneId = parseInt(zoneIdStr);
          statuses[zoneId] = {
            active: value.active || false,
            remaining: value.remaining || 0,
            type: value.type
          };
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
  }, []);

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
    
    if (zone.period === 'W') {
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
        const resolved = zoneResolvedTimes[zone.zone_id]?.[t.value];
        if (resolved && resolved !== 'N/A' && resolved !== '...') {
          // Convert HH:MM to minutes for comparison
          const [h, m] = resolved.split(':').map(Number);
          return { time: resolved, minutes: h * 60 + m, original: t.value };
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
    // For daily schedules, find the next time
    if (zone.period === 'D') {
      return getNextDailyTime(zone);
    }
    
    // For weekly and monthly schedules, calculate the actual date first
    const nextDate = getNextScheduledDate(zone);
    if (!nextDate) return '...';
    
    // Get the time code to resolve
    const timeCode = zone.times?.[0]?.value;
    if (!timeCode) return '...';
    
    // Try to get date-specific resolved time first
    const dateKey = nextDate.toISOString().slice(0, 10);
    let resolved = dateSpecificResolvedTimes[dateKey]?.[timeCode];
    
    // Fallback to today's resolved time if date-specific not available
    if (!resolved || resolved === 'N/A' || resolved === '...') {
      resolved = zoneResolvedTimes[zone.zone_id]?.[timeCode] || '...';
    }
    
    if (!resolved || resolved === 'N/A' || resolved === '...') return '...';
    
    // Extract time from resolved (assuming HH:MM format)
    let timeStr = resolved;
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
    
    // Format the display
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const targetDate = new Date(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
    
    if (targetDate.getTime() === today.getTime()) {
      return `Today ${timeStr}`;
    } else if (targetDate.getTime() === tomorrow.getTime()) {
      return `Tomorrow ${timeStr}`;
    } else {
      return `${nextDate.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit' 
      })} ${timeStr}`;
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

  // Helper function to parse manual timer input with leading zero support
  function parseManualTimeInput(input: string): { hours: number; minutes: number; isValid: boolean; error: string } {
    // Remove any non-numeric characters
    const cleanInput = input.replace(/[^0-9]/g, '');
    
    if (!cleanInput) {
      return { hours: 0, minutes: 0, isValid: false, error: 'Enter a time' };
    }
    
    // Pad with leading zeros to 4 digits
    const paddedInput = cleanInput.padStart(4, '0');
    
    // Extract hours and minutes
    const hours = parseInt(paddedInput.slice(0, 2), 10);
    const minutes = parseInt(paddedInput.slice(2, 4), 10);
    
    // Validate ranges
    if (hours > 23) {
      return { hours: 0, minutes: 0, isValid: false, error: 'Hours must be 0-23' };
    }
    if (minutes > 59) {
      return { hours: 0, minutes: 0, isValid: false, error: 'Minutes must be 0-59' };
    }
    if (hours === 0 && minutes === 0) {
      return { hours: 0, minutes: 0, isValid: false, error: 'Enter a positive time' };
    }
    
    return { hours, minutes, isValid: true, error: '' };
  }

  // Handler to start a manual timer
  function startManualTimer(zone_id: number, seconds: number) {
    console.log(`Starting manual timer for zone ${zone_id} with ${seconds}s duration...`);
    console.log(`API URL: ${getApiBaseUrl()}/api/manual-timer/${zone_id}`);
    
    // Use the standard manual timer endpoint (scheduler-based)
    fetch(`${getApiBaseUrl()}/api/manual-timer/${zone_id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: seconds })
    })
    .then(response => {
      console.log(`API Response status: ${response.status}`);
      if (response.ok) {
        console.log('Manual timer started successfully');
        // Clear input and hide control only on success
        setManualInput(inp => ({ ...inp, [zone_id]: '' }));
        setManualInputError(errs => ({ ...errs, [zone_id]: '' }));
        setShowManualControl(null);
        console.log('Input cleared and control hidden');
        // Backend sync will update manualTimers state
      } else {
        console.error('Failed to start manual timer, status:', response.status);
        response.text().then(text => console.error('Response text:', text));
        alert('Failed to start manual timer. Please try again.');
      }
    })
    .catch(error => {
      console.error('Error starting manual timer:', error);
      alert('Error starting manual timer. Please try again.');
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

    fetch(`${getApiBaseUrl()}/api/manual-timer/${zone_id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close'
      }
    })
    .then(response => {
      console.log(`DELETE Response status: ${response.status}`);
      if (response.ok) {
        console.log('Manual timer canceled successfully');
        // Backend sync will update manualTimers state
        setConfirmCancelZone(null);
      } else {
        console.error('Failed to cancel manual timer, status:', response.status);
        response.text().then(text => console.error('Response text:', text));
        alert('Failed to cancel manual timer. Please try again.');
      }
    })
    .catch(error => {
      console.error('Error canceling manual timer:', error);
      alert('Error canceling manual timer. Please try again.');
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
                  background: pumpInfo.pumpStatus === 'HIGH' ? '#00bcd4' : '#888',
                  display: 'inline-block',
                  border: '2px solid #222',
                  boxShadow: pumpInfo.pumpStatus === 'HIGH' ? '0 0 10px #00bcd4' : 'none',
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
                return (
                  <div key={z.zone_id} style={{
                    width: '100%',
                    margin: 0,
                    background: '#232b3b',
                    color: '#f4f4f4',
                    borderRadius: '16px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    border: isOn ? '2px solid #00bcd4' : '2px solid #232b3b',
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
                          background: isOn ? '#00bcd4' : '#888',
                          display: 'inline-block',
                          border: '2px solid #222',
                          cursor: 'pointer',
                          boxShadow: isOn ? '0 0 8px #00bcd4' : 'none'
                        }}
                        onClick={e => { e.stopPropagation(); setShowManualControl(showManualControl === z.zone_id ? null : z.zone_id); }}
                        title="Manual control"
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
                                placeholder="HHMM"
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
                                maxLength={4}
                              />
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  const val = manualInput[z.zone_id] || '';
                                  console.log(`Button clicked for zone ${z.zone_id}, input value: "${val}"`);
                                  const parsed = parseManualTimeInput(val);
                                  console.log(`Parsed result:`, parsed);
                                  
                                  if (!parsed.isValid) {
                                    console.log(`Validation failed: ${parsed.error}`);
                                    setManualInputError(errs => ({ ...errs, [z.zone_id]: parsed.error }));
                                    return;
                                  }
                                  
                                  const totalSeconds = parsed.hours * 3600 + parsed.minutes * 60;
                                  console.log(`Total seconds calculated: ${totalSeconds}`);
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
                                  const nextDate = getNextScheduledDate(z);
                                  const dateKey = nextDate ? nextDate.toISOString().slice(0, 10) : null;
                                  const resolvedTime = dateKey && dateSpecificResolvedTimes[dateKey]?.[t.value] 
                                    ? dateSpecificResolvedTimes[dateKey][t.value] 
                                    : zoneResolvedTimes[z.zone_id]?.[t.value] || '...';
                                  return { raw: t.value, resolved: resolvedTime };
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
                              background: '#232b3b',
                              color: '#00bcd4',
                              borderRadius: '8px',
                              padding: '10px 14px',
                              marginBottom: 0,
                              fontSize: '16px',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start'
                            }}
                            onClick={() => setExpandedPlant(prev => ({ ...prev, [loc.location_id]: prev[loc.location_id] === inst.instance_id ? null : inst.instance_id }))}
                          >
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column'
                            }}>
                              <span style={{
                                fontWeight: 'bold',
                                minWidth: '120px'
                              }}>{getCommonName(inst.library_book, inst.plant_id)}</span>
                              {getLatinName(inst.library_book, inst.plant_id) && (
                                <span style={{
                                  color: '#fff',
                                  fontSize: '12px',
                                  fontStyle: 'italic'
                                }}>({getLatinName(inst.library_book, inst.plant_id)})</span>
                              )}
                            </div>
                            <span style={{
                              color: '#bdbdbd',
                              minWidth: '60px'
                            }}>x{inst.quantity}</span>
                            {expandedPlant[loc.location_id] === inst.instance_id && (
                              <div style={{
                                marginTop: '10px',
                                color: '#fff',
                                fontSize: '15px',
                                background: '#232b3b',
                                borderRadius: '8px',
                                padding: '10px 12px'
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