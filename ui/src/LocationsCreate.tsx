import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [locationName, setLocationName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedZones, setSelectedZones] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [resolveDebug, setResolveDebug] = useState<Record<number, {query: any, result: any}>>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [nextLocationId, setNextLocationId] = useState(1);

  const navigate = useNavigate();

  // Fetch zones and resolve times on mount
  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/schedule')
      .then(res => res.json())
      .then(async data => {
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
          if (zone.period === 'D' && Array.isArray(zone.times)) {
            codes = zone.times.map(t => t.value).filter(Boolean);
          } else if (zone.time && zone.time.value) {
            codes = [zone.time.value];
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
      });
  }, []);

  const handleZoneCheck = (idx: number) => {
    setSelectedZones(zs => zs.includes(idx) ? zs.filter(z => z !== idx) : [...zs, idx]);
  };

  const handleAddLocation = () => {
    setShowForm(true);
  };

  const handleSave = () => {
    setSaving(true);
    // Add the new location to the list with a unique location_id
    setLocations(locs => [
      ...locs,
      {
        location_id: nextLocationId,
        name: locationName,
        description,
        zones: selectedZones.map(idx => zones[idx].zone_id), // <-- PATCHED
      }
    ]);
    setNextLocationId(id => id + 1);
    // Reset form
    setLocationName('');
    setDescription('');
    setSelectedZones([]);
    setTimeout(() => {
      setSaving(false);
    }, 500);
  };

  const handleRemoveLocation = (location_id: number) => {
    setLocations(locs => locs.filter(loc => loc.location_id !== location_id));
  };

  const handleContinue = async () => {
    // Save locations to backend
    await fetch('http://127.0.0.1:5000/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(locations)
    });
    navigate('/plants');
  };

  // Only show zones that are not pumps and not disabled
  const selectableZones = zones
    .map((z, idx) => ({ ...z, idx }))
    .filter(z => (pumpIndex === null || z.idx !== pumpIndex) && z.mode !== 'disabled');

  if (zones.length === 0) {
    alert("Please create at least one zone before adding locations.");
    return;
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
      color: '#fff',
      textAlign: 'center',
      gap: 32
    }}>
      {/* Legend on the left */}
      <div style={{ minWidth: 220, background: 'rgba(30,20,50,0.95)', borderRadius: 12, padding: 20, marginTop: 40, textAlign: 'left' }}>
        <h3 style={{ color: '#ff9800', fontWeight: 700, marginTop: 0, fontSize: 20 }}>Zone Legend</h3>
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
            <div key={idx} style={{ marginBottom: 16, borderBottom: '1px solid #444', paddingBottom: 8 }}>
              <div style={{ fontWeight: 600, color: '#ff9800' }}>Zone {idx + 1}</div>
              <div style={{ fontSize: 14, color: '#bdbdbd' }}>Code: <b>{zoneCode}</b></div>
              <div style={{ fontSize: 14, color: '#bdbdbd' }}>Duration: <b>{durationDisplay}</b></div>
              <div style={{ fontSize: 14, color: '#bdbdbd' }}>Start: <b>{startTimeDisplay}</b></div>
              {codesToResolve.length > 0 && (
                <div style={{ fontSize: 14, color: '#bdbdbd' }}>(resolved: <b>{resolvedStartDisplay}</b>)</div>
              )}
              <div style={{ fontSize: 13, color: '#bdbdbd' }}>{zone.comment || <span style={{ color: '#555' }}>No description</span>}</div>
            </div>
          );
        })}
      </div>
      {/* Add Location form on the right */}
      <div style={{ margin: '2rem auto', maxWidth: 500, background: 'rgba(30,20,50,0.95)', borderRadius: 12, padding: 24, flex: 1 }}>
        <h2 style={{ color: '#ff9800', fontWeight: 700, marginTop: 0 }}>Locations</h2>
        <form onSubmit={e => { e.preventDefault(); handleSave(); }}>
            <div style={{ marginBottom: 16 }}>
              <input
                type="text"
                placeholder="Location Name"
                value={locationName}
                onChange={e => setLocationName(e.target.value)}
                style={{ width: '90%', padding: 8, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff', marginBottom: 8 }}
                required
              />
              <br />
              <input
                type="text"
                placeholder="Description (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                style={{ width: '90%', padding: 8, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
              />
            </div>
            <div style={{ marginBottom: 16, textAlign: 'left' }}>
              <div style={{ color: '#bdbdbd', marginBottom: 6 }}>Attach zones to this location:</div>
              {selectableZones.map((zone) => (
                <label key={zone.idx} style={{ display: 'block', marginBottom: 4, color: '#fff', fontWeight: 500 }}>
                  <input
                    type="checkbox"
                    checked={selectedZones.includes(zone.idx)}
                    onChange={() => handleZoneCheck(zone.idx)}
                    style={{ marginRight: 8 }}
                  />
                  Zone {zone.idx + 1}
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={saving}
              style={{
                width: '100%',
                padding: '0.75rem',
                marginTop: 12,
                background: 'linear-gradient(90deg, #ff9800 0%, #ff512f 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 16,
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
            >
              {saving ? 'Saving...' : 'Save Location'}
            </button>
          </form>
        <div style={{ marginBottom: 32 }}>
          {locations.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ color: '#ff9800', fontWeight: 700, fontSize: 18, margin: 0 }}>Added Locations</h3>
              {locations.map((loc, i) => (
                <div key={i} style={{ background: '#221a38', borderRadius: 8, padding: 12, margin: '12px 0', textAlign: 'left', position: 'relative' }}>
                  <button
                    onClick={() => handleRemoveLocation(loc.location_id)}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      background: 'transparent',
                      border: 'none',
                      color: '#ff512f',
                      fontWeight: 700,
                      fontSize: 18,
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Remove location"
                  >
                    ×
                  </button>
                  <div style={{ fontWeight: 600, color: '#ff9800' }}>Location {loc.location_id}: {loc.name}</div>
                  <div style={{ color: '#bdbdbd', fontSize: 13 }}>{loc.description}</div>
                  <div style={{ color: '#bdbdbd', fontSize: 13 }}>Zones: {loc.zones.map((z: number) => `Zone ${z + 1}`).join(', ')}</div>
                </div>
              ))}
              <button
                onClick={handleContinue}
                disabled={locations.length === 0}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  marginTop: 16,
                  background: locations.length > 0 ? 'linear-gradient(90deg, #ff9800 0%, #ff512f 100%)' : 'linear-gradient(90deg, #bdbdbd 0%, #bdbdbd 100%)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 16,
                  cursor: locations.length > 0 ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s'
                }}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 