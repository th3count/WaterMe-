import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * LOCATION MANAGEMENT & DATA RELATIONSHIPS
 * ========================================
 * 
 * LOCATION_ID SYSTEM:
 * - location_id: Unique identifier for physical garden locations
 * - Used in: locations.json, map.json (plant instances)
 * - Purpose: Groups plants by physical area (e.g., "orchard", "perimeter")
 * 
 * CRITICAL BEHAVIOR:
 * - When a location is deleted, plant instances with that location_id become orphaned
 * - This is ACCEPTABLE - orphaned instances can still function with their zone_id
 * - Plant instances will show "Unknown" location in zone view
 * - No cascade deletion of plant instances when location is removed
 * 
 * DATA INTEGRITY:
 * - Location deletion only affects location_id references
 * - Plant instances (instance_id) remain intact and functional
 * - Zone assignments (zone_id) remain intact
 * - This allows for flexible garden reorganization
 */

interface ScheduleZone {
  pin?: number;
  mode?: string;
  period?: string;
  cycles?: number;
  duration?: string;
  comment?: string;
  times?: { value: string; duration: string }[];
  time?: { value: string; duration: string };
  startDay?: string;
  zone_id?: number; // Added zone_id to the interface
}

// Helper to format HHMMSS as human readable
function formatDuration(d: string): string {
  if (!d || d.length !== 6) return 'N/A';
  const h = parseInt(d.slice(0, 2), 10);
  const m = parseInt(d.slice(2, 4), 10);
  const s = parseInt(d.slice(4, 6), 10);
  let out = '';
  if (h) out += `${h}h `;
  if (m) out += `${m}m `;
  if (s) out += `${s}s`;
  return out.trim() || '0s';
}

export default function LocationsCreate() {
  const [zones, setZones] = useState<ScheduleZone[]>([]);
  const [resolvedTimes, setResolvedTimes] = useState<Record<number, string[] | null>>({});
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLocation, setEditingLocation] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editZones, setEditZones] = useState<number[]>([]);
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedZones, setSelectedZones] = useState<number[]>([]);
  const [resolveDebug, setResolveDebug] = useState<Record<number, {query: any, result: any}>>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [nextLocationId, setNextLocationId] = useState(1);
  const [map, setMap] = useState<Record<string, any>>({});
  const [plantNames, setPlantNames] = useState<Record<string, Record<number, string>>>({});
  const [reassignMessage, setReassignMessage] = useState<string>('');
  const [reassignInstanceId, setReassignInstanceId] = useState<string>('');

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Handle reassignment from health alerts
  useEffect(() => {
    const reassignId = searchParams.get('reassign');
    if (reassignId) {
      // Clear the URL parameter
      navigate('/locations', { replace: true });
      
      // Set reassignment data
      setReassignInstanceId(reassignId);
      setReassignMessage(`Select a location to reassign the orphaned plant (Instance ${reassignId})`);
      
      // Clear message after 10 seconds
      setTimeout(() => setReassignMessage(''), 10000);
    }
  }, [searchParams, navigate]);

  // Fetch zones and resolve times on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load pump index from GPIO config
        const gpioResp = await fetch('http://127.0.0.1:5000/config/gpio.cfg');
        const gpioData = await gpioResp.json();
        // Convert 1-based pump index from config to 0-based for frontend
        setPumpIndex(gpioData.pumpIndex !== undefined && gpioData.pumpIndex > 0 ? gpioData.pumpIndex - 1 : null);
        
        // Load zones
        const scheduleResp = await fetch('http://127.0.0.1:5000/api/schedule');
        const data = await scheduleResp.json();
        setZones(data);
        // For each zone, resolve times
        const settingsResp = await fetch('http://127.0.0.1:5000/config/settings.cfg');
        const settings = await settingsResp.json();
        const coords = settings.coords || [0, 0];
        const lat = coords[1], lon = coords[0];
        const resolved: Record<number, string[] | null> = {};
        const debug: Record<number, {query: any, result: any}> = {};
        await Promise.all(data.map(async (zone: ScheduleZone, idx: number) => {
          if (zone.mode === 'disabled') { resolved[idx] = null; return; }
          let codes: string[] = [];
          let date = zone.startDay || new Date().toISOString().slice(0, 10);
          if (Array.isArray(zone.times)) {
            codes = zone.times.map(t => t.value).filter(Boolean);
          }
          if (codes.length) {
            try {
              const query = { codes, date, lat, lon };
              const resp = await fetch('http://127.0.0.1:5000/api/resolve_times', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(query)
              });
              const resolvedArr = await resp.json();
              resolved[idx] = Array.isArray(resolvedArr) ? resolvedArr : null;
              debug[idx] = { query, result: resolvedArr };
            } catch (e) {
              resolved[idx] = null;
              debug[idx] = { query: { codes, date, lat, lon }, result: String(e) };
            }
          } else {
            resolved[idx] = null;
          }
        }));
        setResolvedTimes(resolved);
        setResolveDebug(debug);
        
        // Load map data and plant library
        const [mapResp, libraryFilesResp] = await Promise.all([
          fetch('http://127.0.0.1:5000/api/map'),
          fetch('http://127.0.0.1:5000/api/library-files')
        ]);
        
        const mapData = await mapResp.json();
        setMap(mapData);
        
        // Load plant library data
        const libraryFiles = await libraryFilesResp.json();
        const lookup: Record<string, Record<number, string>> = {};
        await Promise.all(libraryFiles.map(async (fileObj: any) => {
          const filename = fileObj.filename;
          const resp = await fetch(`http://127.0.0.1:5000/library/${filename}`);
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
          lookup[filename.replace('.json', '')] = book;
        }));
        setPlantNames(lookup);
      } catch (err) {
        console.error('Failed to load zone data:', err);
      }
    };
    
    loadData();
  }, []);

  // Load existing locations
  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/locations')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setLocations(data);
          // Set next location ID to be higher than existing ones
          const maxId = Math.max(...data.map((loc: any) => loc.location_id || 0));
          setNextLocationId(maxId + 1);
        }
      })
      .catch(err => {
        console.log('No existing locations found or error loading:', err);
      });
  }, []);

  // Helper: get all plant instances for a location
  const getPlantsForLocation = (location_id: number) => {
    let result: any[] = [];
    Object.entries(map).forEach(([instanceId, inst]: [string, any]) => {
      if (inst && typeof inst === 'object' && inst.location_id === location_id) {
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

  const handleZoneCheck = (idx: number) => {
    setSelectedZones(zs => zs.includes(idx) ? zs.filter(z => z !== idx) : [...zs, idx]);
  };

  const handleAddLocation = () => {
    setShowForm(true);
  };

  const handleStartEdit = (location: any) => {
    setEditingLocation(location.location_id);
    setEditName(location.name);
    setEditDescription(location.description);
    setEditZones(location.zones.map((z: number) => zones.findIndex(zone => zone.zone_id === z)));
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      alert('Please enter a location name');
      return;
    }

    setSaving(true);
    try {
      const updatedLocation = {
        ...locations.find(loc => loc.location_id === editingLocation)!,
        name: editName.trim(),
        description: editDescription.trim(),
        zones: editZones.map(idx => zones[idx].zone_id).filter((id): id is number => id !== undefined).sort((a: number, b: number) => a - b)
      };

      // Create updated locations array with the edited location
      const updatedLocations = locations.map(loc => 
        loc.location_id === editingLocation ? updatedLocation : loc
      );

      // Save all locations to backend
      const response = await fetch('http://127.0.0.1:5000/api/locations', {
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
      setEditingLocation(null);
      setEditName('');
      setEditDescription('');
      setEditZones([]);
      
      alert('Location updated successfully!');
    } catch (error) {
      console.error('Error updating location:', error);
      alert('Failed to update location. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingLocation(null);
    setEditName('');
    setEditDescription('');
    setEditZones([]);
  };

  const handleSave = async () => {
    if (!locationName.trim()) {
      alert('Please enter a location name');
      return;
    }

    setSaving(true);
    try {
      const newLocation = {
        location_id: nextLocationId,
        name: locationName.trim(),
        description: description.trim(),
        zones: selectedZones.map(idx => zones[idx].zone_id).filter((id): id is number => id !== undefined).sort((a: number, b: number) => a - b)
      };

      // Create updated locations array with the new location
      const updatedLocations = [...locations, newLocation];

      // Save all locations to backend (including the new one)
      const response = await fetch('http://127.0.0.1:5000/api/locations', {
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
      setNextLocationId(nextLocationId + 1);
      setLocationName('');
      setDescription('');
      setSelectedZones([]);
      setShowForm(false);
      
      alert('Location saved successfully!');
    } catch (error) {
      console.error('Error saving location:', error);
      alert('Failed to save location. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLocation = async (locationId: number) => {
    if (!confirm('Are you sure you want to delete this location? This action cannot be undone.')) {
      return;
    }

    try {
      // Remove from backend
      const response = await fetch(`http://127.0.0.1:5000/api/locations/${locationId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete location');
      }

      // Update local state
      setLocations(prev => prev.filter(loc => loc.location_id !== locationId));
      alert('Location deleted successfully!');
    } catch (error) {
      console.error('Error deleting location:', error);
      alert('Failed to delete location. Please try again.');
    }
  };

  const handleContinue = async () => {
    if (locations.length === 0) {
      alert('Please add at least one location before continuing.');
      return;
    }

    setSaving(true);
    try {
      // Save all locations to backend
      const response = await fetch('http://127.0.0.1:5000/api/locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(locations)
      });

      if (!response.ok) {
        throw new Error('Failed to save locations');
      }

      alert('All locations saved successfully!');
      navigate('/plants');
    } catch (error) {
      console.error('Error saving locations:', error);
      alert('Failed to save locations. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReassignPlant = async (locationId: number) => {
    if (!reassignInstanceId) return;

    try {
      setSaving(true);
      
      // Reassign the plant to this location
      const reassignResponse = await fetch(`http://127.0.0.1:5000/api/map/${reassignInstanceId}/reassign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ location_id: locationId })
      });

      if (!reassignResponse.ok) {
        throw new Error('Failed to reassign plant');
      }

      // Clear reassignment state
      setReassignMessage('');
      setReassignInstanceId('');
      
      alert('Plant reassigned successfully!');
      navigate('/health'); // Go back to health page to see the fix
    } catch (error) {
      console.error('Error reassigning plant:', error);
      alert('Failed to reassign plant. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Only show zones that are not pumps and not disabled
  const selectableZones = zones
    .map((z, idx) => ({ ...z, idx }))
    .filter(z => (pumpIndex === null || z.idx !== pumpIndex) && z.mode !== 'disabled');

  if (zones.length === 0) {
    return (
      <div style={{
        minHeight: '100vh',
        minWidth: '100vw',
        background: '#181f2a',
        padding: '0 0 0 20px',
        boxSizing: 'border-box',
        overflowX: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ 
          background: '#232b3b', 
          color: '#f4f4f4', 
          borderRadius: 16, 
          boxShadow: '0 4px 24px rgba(24,31,42,0.18)', 
          padding: 32,
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#00bcd4', margin: '0 0 16px 0' }}>No Zones Found</h2>
          <p style={{ color: '#bdbdbd', margin: '0 0 16px 0' }}>
            Please create at least one zone in the Settings page before adding locations.
          </p>
          <button
            onClick={() => navigate('/settings')}
            style={{
              padding: '12px 24px',
              background: '#00bcd4',
              color: '#181f2a',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              cursor: 'pointer'
            }}
          >
            Go to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      minWidth: '100vw',
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
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚠️</span>
            {reassignMessage}
          </div>
        )}
        
        {showForm ? (
          // Add Location Form View
          <div style={{
            display: 'flex',
            gap: '24px',
            alignItems: 'flex-start',
            width: '100%'
          }}>
            {/* Zone Legend Card */}
            <div style={{
              background: '#232b3b',
              color: '#f4f4f4',
              borderRadius: '16px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              padding: '24px',
              width: '300px',
              flexShrink: 0
            }}>
                              <h3 style={{ color: '#00bcd4', fontWeight: 700, margin: '0 0 16px 0', textAlign: 'left' }}>Zone Legend</h3>
                <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
              {zones.filter(z => z.mode !== 'disabled').map((zone, idx) => {
                const zoneCode = (zone.period || '-') + (zone.cycles || '');
                let durationDisplay = 'N/A';
                let startTimeDisplay = 'N/A';
                let resolvedStartDisplay: string | null = null;
                let codesToResolve: string[] = [];
                if (zone.period === 'D' && Array.isArray(zone.times)) {
                  const durations = zone.times.map((t: any) => t.duration).filter(Boolean);
                  if (durations.length) durationDisplay = durations.map(formatDuration).join(', ');
                  const times = zone.times.map((t: any) => t.value).filter(Boolean);
                  if (times.length) {
                    startTimeDisplay = times.join(', ');
                    // Only resolve codes that are not plain HHMM
                    codesToResolve = times.filter(val => !/^\d{4}$/.test(val));
                    if (codesToResolve.length) {
                      resolvedStartDisplay = (resolvedTimes[idx] && resolvedTimes[idx]!.length)
                        ? resolvedTimes[idx]!.join(', ')
                        : (resolvedTimes[idx] === null ? 'N/A' : 'Loading...');
                    }
                  }
                } else if (zone.time && zone.time.value) {
                  durationDisplay = formatDuration(zone.time.duration);
                  if (zone.time.value) {
                    startTimeDisplay = zone.time.value;
                    if (!/^\d{4}$/.test(zone.time.value)) {
                      codesToResolve = [zone.time.value];
                      resolvedStartDisplay = (resolvedTimes[idx] && resolvedTimes[idx]!.length)
                        ? resolvedTimes[idx]![0]
                        : (resolvedTimes[idx] === null ? 'N/A' : 'Loading...');
                    }
                  }
                }
                return (
                  <div key={idx} style={{
                    background: '#1a1f2a',
                    color: '#f4f4f4',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '8px',
                    fontSize: '14px'
                  }}>
                    <div style={{ color: '#00bcd4', fontWeight: 700, marginBottom: '4px' }}>Zone {zone.zone_id || idx + 1}</div>
                    <div style={{ marginBottom: '2px' }}>Code: <b>{zoneCode}</b></div>
                    <div style={{ marginBottom: '2px' }}>Duration: <b>{durationDisplay}</b></div>
                    <div style={{ marginBottom: '2px' }}>Start: <b>{startTimeDisplay}</b></div>
                    {codesToResolve.length > 0 && (
                      <div style={{ marginBottom: '2px', color: '#00bcd4' }}>(resolved: <b>{resolvedStartDisplay}</b>)</div>
                    )}
                    <div style={{ color: '#bdbdbd', fontSize: '12px' }}>{zone.comment || <span style={{ color: '#555' }}>No description</span>}</div>
                  </div>
                );
              })}
            </div>
            
            {/* Add Location form */}
            <div style={{
              background: '#232b3b',
              color: '#f4f4f4',
              borderRadius: '16px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              padding: '24px',
              flex: 1,
              minWidth: 0
            }}>
              <h2 style={{ color: '#00bcd4', fontWeight: 700, margin: '0 0 16px 0', textAlign: 'left' }}>Add New Location</h2>
              <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                              <form onSubmit={e => { e.preventDefault(); handleSave(); }} style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                  <input
                    type="text"
                    placeholder="Location Name"
                    value={locationName}
                    onChange={e => setLocationName(e.target.value)}
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
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
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
                    <div style={{
                      color: '#fff',
                      fontWeight: 600,
                      textAlign: 'left'
                    }}>Attach zones to this location:</div>
                  {selectableZones.map((zone) => (
                      <label key={zone.idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#fff',
                        cursor: 'pointer'
                      }}>
                      <input
                        type="checkbox"
                        checked={selectedZones.includes(zone.idx)}
                        onChange={() => handleZoneCheck(zone.idx)}
                          style={{
                            width: '16px',
                            height: '16px',
                            accentColor: '#00bcd4'
                          }}
                      />
                      Zone {zone.zone_id}
                    </label>
                  ))}
                </div>
                                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    marginTop: '16px'
                  }}>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
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
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
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
                    {saving ? 'Saving...' : 'Add Location'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <>
            {/* Main Locations View - Consistent with Plants page layout */}
            <div style={{
              display: 'flex',
              gap: '24px',
              alignItems: 'flex-start',
              width: '100%'
            }}>
              {/* Zone Legend Card (Left Sidebar) */}
              <div style={{
                background: '#232b3b',
                color: '#f4f4f4',
                borderRadius: '16px',
                boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                padding: '24px',
                width: '300px',
                flexShrink: 0
              }}>
                <h3 style={{ color: '#00bcd4', fontWeight: 700, margin: '0 0 16px 0', textAlign: 'left' }}>Zone Legend</h3>
                <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                {zones.filter(z => z.mode !== 'disabled').map((zone, idx) => {
                  const zoneCode = (zone.period || '-') + (zone.cycles || '');
                  let durationDisplay = 'N/A';
                  let startTimeDisplay = 'N/A';
                  let resolvedStartDisplay: string | null = null;
                  let codesToResolve: string[] = [];
                  if (zone.period === 'D' && Array.isArray(zone.times)) {
                    const durations = zone.times.map((t: any) => t.duration).filter(Boolean);
                    if (durations.length) durationDisplay = durations.map(formatDuration).join(', ');
                    const times = zone.times.map((t: any) => t.value).filter(Boolean);
                    if (times.length) {
                      startTimeDisplay = times.join(', ');
                      codesToResolve = times.filter(val => !/^\d{4}$/.test(val));
                      if (codesToResolve.length) {
                        resolvedStartDisplay = (resolvedTimes[idx] && resolvedTimes[idx]!.length)
                          ? resolvedTimes[idx]!.join(', ')
                          : (resolvedTimes[idx] === null ? 'N/A' : 'Loading...');
                      }
                    }
                  } else if (zone.time && zone.time.duration) {
                    durationDisplay = formatDuration(zone.time.duration);
                    if (zone.time.value) {
                      startTimeDisplay = zone.time.value;
                      if (!/^\d{4}$/.test(zone.time.value)) {
                        codesToResolve = [zone.time.value];
                        resolvedStartDisplay = (resolvedTimes[idx] && resolvedTimes[idx]!.length)
                          ? resolvedTimes[idx]![0]
                          : (resolvedTimes[idx] === null ? 'N/A' : 'Loading...');
                      }
                    }
                  }
                  return (
                    <div key={idx} style={{
                      background: '#1a1f2a',
                      color: '#f4f4f4',
                      borderRadius: '8px',
                      padding: '12px',
                      marginBottom: '8px',
                      fontSize: '14px'
                    }}>
                      <div style={{ color: '#00bcd4', fontWeight: 700, marginBottom: '4px' }}>Zone {zone.zone_id || idx + 1}</div>
                      <div style={{ marginBottom: '2px' }}>Code: <b>{zoneCode}</b></div>
                      <div style={{ marginBottom: '2px' }}>Duration: <b>{durationDisplay}</b></div>
                      <div style={{ marginBottom: '2px' }}>Start: <b>{startTimeDisplay}</b></div>
                      {codesToResolve.length > 0 && (
                        <div style={{ marginBottom: '2px', color: '#00bcd4' }}>(resolved: <b>{resolvedStartDisplay}</b>)</div>
                      )}
                      <div style={{ color: '#bdbdbd', fontSize: '12px' }}>{zone.comment || <span style={{ color: '#555' }}>No description</span>}</div>
                    </div>
                  );
                })}
              </div>
              
              {/* Locations Cards (Right Content Area) */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                minWidth: 0,
                flex: 1,
                maxWidth: '500px'
              }}>
                
                {locations.length > 0 ? (
                  locations.map((loc, i) => (
                    <div key={i} style={{
                      background: '#232b3b',
                      color: '#f4f4f4',
                      borderRadius: '16px',
                      boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                      padding: '24px',
                      position: 'relative',
                      border: editingLocation === loc.location_id ? '2px solid #00bcd4' : '2px solid #232b3b',
                      cursor: editingLocation === loc.location_id ? 'default' : 'pointer'
                    }}
                    onClick={() => {
                      if (editingLocation !== loc.location_id) {
                        handleStartEdit(loc);
                      }
                    }}>
                      {editingLocation !== loc.location_id && (
                        <button
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            handleRemoveLocation(loc.location_id); 
                          }}
                          style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            background: 'transparent',
                            border: 'none',
                            color: '#ff512f',
                            fontWeight: 700,
                            fontSize: '18px',
                            cursor: 'pointer'
                          }}
                          title="Remove location"
                        >
                          ×
                        </button>
                      )}
                      
                      {editingLocation === loc.location_id && (
                        <div style={{
                          position: 'absolute',
                          top: '12px',
                          left: '12px',
                          background: '#00bcd4',
                          color: '#181f2a',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 700
                        }}>
                          Edit
                        </div>
                      )}
                      
                      {editingLocation === loc.location_id ? (
                        // Edit Mode
                        <div>
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            marginBottom: '16px'
                          }}>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #00bcd4',
                                background: '#1a1f2a',
                                color: '#fff',
                                outline: 'none'
                              }}
                              placeholder="Location Name"
                            />
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: '1px solid #00bcd4',
                                background: '#1a1f2a',
                                color: '#fff',
                                outline: 'none'
                              }}
                              placeholder="Description"
                            />
                          </div>
                          
                          <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                          
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px',
                            marginBottom: '16px'
                          }}>
                            <div style={{
                              color: '#fff',
                              fontWeight: 600,
                              textAlign: 'left'
                            }}>Zones:</div>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                              gap: '8px'
                            }}>
                              {selectableZones.map((zone, idx) => (
                                <div
                                  key={idx}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (editZones.includes(idx)) {
                                      setEditZones(editZones.filter(z => z !== idx));
                                    } else {
                                      setEditZones([...editZones, idx]);
                                    }
                                  }}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    background: editZones.includes(idx) ? '#00bcd4' : '#1a1f2a',
                                    color: editZones.includes(idx) ? '#181f2a' : '#fff',
                                    border: '1px solid #00bcd4',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    textAlign: 'center',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px'
                                  }}
                                  title={`Click to ${editZones.includes(idx) ? 'deselect' : 'select'} Zone ${zone.zone_id}`}
                                >
                                  {editZones.includes(idx) && (
                                    <span style={{ marginRight: 4, fontSize: 12 }}>✓</span>
                                  )}
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
                              onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                              disabled={saving}
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
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCancelEdit(); }}
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
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <>
                          <h2 style={{ color: '#00bcd4', fontWeight: 700, margin: '0 0 8px 0', textAlign: 'left' }}>{loc.name}</h2>
                          <div style={{ color: '#bdbdbd', marginBottom: '8px' }}>{loc.description}</div>
                          <div style={{ color: '#fff', marginBottom: '16px' }}>Zones: {loc.zones.sort((a: number, b: number) => a - b).join(', ')}</div>
                          
                          {/* Reassignment Button - Only show when reassigning */}
                          {reassignInstanceId && (
                            <div style={{ marginBottom: '16px' }}>
                              <button
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  handleReassignPlant(loc.location_id); 
                                }}
                                disabled={saving}
                                style={{
                                  padding: '8px 16px',
                                  borderRadius: '6px',
                                  border: '1px solid #00bcd4',
                                  background: 'transparent',
                                  color: '#00bcd4',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  width: '100%'
                                }}
                                title="Reassign orphaned plant to this location"
                              >
                                {saving ? 'Reassigning...' : 'Reassign Plant Here'}
                              </button>
                            </div>
                          )}
                          <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                          {getPlantsForLocation(loc.location_id).length === 0 ? (
                            <div style={{ color: '#bdbdbd', fontStyle: 'italic' }}>
                              No plants assigned to this location.
                            </div>
                          ) : (
                            <div>
                              <div style={{ color: '#fff', fontWeight: 600, marginBottom: '8px' }}>Assigned Plants:</div>
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
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <span style={{ fontWeight: 'bold' }}>
                                      {getCommonName(inst.library_book, inst.plant_id)}
                                    </span>
                                    <span style={{ color: '#bdbdbd' }}>x{inst.quantity}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))
                ) : (
                  <div style={{
                    background: '#232b3b',
                    color: '#bdbdbd',
                    borderRadius: '16px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    padding: '32px',
                    textAlign: 'center',
                    fontStyle: 'italic'
                  }}>
                    No locations created yet. Use the "Add Location" button below to create your first location.
                  </div>
                )}
                
                {/* Bottom Action Buttons - Positioned under location cards */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginTop: '24px'
                }}>
                  <button
                    onClick={handleAddLocation}
                    style={{
                      padding: '12px 24px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#00bcd4',
                      color: '#181f2a',
                      fontWeight: 700,
                      fontSize: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    Add Location
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
} 