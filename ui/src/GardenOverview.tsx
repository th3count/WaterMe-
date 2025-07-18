import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';

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
  const [expandedPlant, setExpandedPlant] = useState<{ [locationId: number]: number | null }>({});
  const [zones, setZones] = useState<any[]>([]);
  const [zoneResolvedTimes, setZoneResolvedTimes] = useState<Record<number, Record<string, string>>>({});
  // Only one expanded zone at a time
  const [expandedZone, setExpandedZone] = useState<number | null>(null);
  // Instead of tracking a single expandedZone, track a boolean: areAnyZonesExpanded
  const [areAnyZonesExpanded, setAreAnyZonesExpanded] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/locations')
      .then(res => res.json())
      .then(data => setLocations(data));
    fetch('http://127.0.0.1:5000/api/map')
      .then(res => res.json())
      .then(data => setMap(data));
    fetch('http://127.0.0.1:5000/api/schedule')
      .then(res => res.json())
      .then(data => {
        setZones(data);
        // For each zone, resolve next scheduled time(s)
        data.forEach(async (zone: any) => {
          if (zone.mode === 'disabled') return;
          let codes: string[] = [];
          let date = dayjs().format('YYYY-MM-DD');
          if (zone.period === 'D' && Array.isArray(zone.times)) {
            codes = zone.times.map((t: any) => t.value).filter(Boolean);
          } else if (zone.time && zone.time.value) {
            codes = [zone.time.value];
          }
          if (codes.length) {
            try {
              const settingsResp = await fetch('http://127.0.0.1:5000/config/settings.cfg');
              const settings = await settingsResp.json();
              const coords = settings.coords || [0, 0];
              const lat = coords[1], lon = coords[0];
              const query = { codes, date, lat, lon };
              const resp = await fetch('http://127.0.0.1:5000/api/resolve_times', {
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
    fetch('http://127.0.0.1:5000/api/library-files')
      .then(res => res.json())
      .then(async (files: string[]) => {
        const lookup: Record<string, Record<number, string>> = {};
        await Promise.all(files.map(async (file: string) => {
          const resp = await fetch(`http://127.0.0.1:5000/library/${file}`);
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
          lookup[file.replace('.json', '')] = book;
        }));
        setPlantNames(lookup);
      });
  }, []);

  // Helper: get all plant instances for a location
  const getPlantsForLocation = (location_id: number) => {
    let result: PlantInstance[] = [];
    Object.values(map).forEach((arr) => {
      arr.forEach((inst) => {
        if (inst.location_id === location_id) result.push(inst);
      });
    });
    return result;
  };

  // Helper: get common name
  const getCommonName = (library_book: string, plant_id: number) => {
    return plantNames[library_book]?.[plant_id] || `Plant ${plant_id}`;
  };

  // Helper: get zones for a location (one-based zone_id)
  const getZonesForLocation = (loc: Location) => {
    return (loc.zones || []).map(zid => zones.find(z => z.zone_id === zid)).filter(Boolean);
  };

  // Helper: simulate relay status (random for now)
  const getRelayStatus = (zone_id: number) => {
    // Simulate: ON for one random zone, OFF for others
    // For demo, turn ON the first zone
    return zone_id === 1; // or: return Math.random() > 0.8;
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

  // Helper: get the next scheduled start time as a dayjs object
  // Update to accept zone_id and code
  function getNextStartTime(zone_id: number, code: string): dayjs.Dayjs | null {
    const resolved = zoneResolvedTimes[zone_id]?.[code];
    if (!resolved || resolved === 'N/A' || resolved === '...') return null;
    // Assume resolved is in HH:MM format for today
    const today = dayjs();
    const [h, m] = resolved.split(':');
    return today.hour(Number(h)).minute(Number(m)).second(0);
  }

  // Helper: get duration for a zone (in seconds)
  function getZoneDuration(z: any): number {
    if (z.period === 'D' && Array.isArray(z.times) && z.times[0]?.duration) {
      return parseDuration(z.times[0].duration);
    } else if (z.time && z.time.duration) {
      return parseDuration(z.time.duration);
    }
    return 600; // fallback 10 min
  }

  // State for manual timers
  const [manualTimers, setManualTimers] = useState<Record<number, number>>({});
  const [showManualControl, setShowManualControl] = useState<number | null>(null);
  const [manualInput, setManualInput] = useState<Record<number, string>>({});
  const [manualInputError, setManualInputError] = useState<Record<number, string>>({});
  const [confirmCancelZone, setConfirmCancelZone] = useState<number | null>(null);

  // Manual timer countdown effect
  useEffect(() => {
    const interval = setInterval(() => {
      setManualTimers(prev => {
        const updated: Record<number, number> = { ...prev };
        Object.keys(updated).forEach(zid => {
          if (updated[Number(zid)] > 0) updated[Number(zid)] -= 1;
          if (updated[Number(zid)] <= 0) delete updated[Number(zid)];
        });
        return updated;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper: get remaining time for a zone (manual overrides schedule)
  function getZoneRemainingTime(z: any): number {
    if (manualTimers[z.zone_id] != null) return manualTimers[z.zone_id];
    let start: dayjs.Dayjs | null = null;
    let code = '';
    if (z.period === 'D' && Array.isArray(z.times) && z.times.length > 0) {
      code = z.times[0].value;
      start = getNextStartTime(z.zone_id, code);
    } else if (z.time && z.time.value) {
      code = z.time.value;
      start = getNextStartTime(z.zone_id, code);
    }
    const dur = getZoneDuration(z);
    if (!start) return 0;
    const now = dayjs();
    const end = start.add(dur, 'second');
    if (now.isBefore(start)) return 0; // not started yet
    const remaining = end.diff(now, 'second');
    return remaining > 0 ? remaining : 0;
  }

  // Handler to start a manual timer
  function startManualTimer(zone_id: number, seconds: number) {
    setManualTimers(prev => ({ ...prev, [zone_id]: seconds }));
    setShowManualControl(null);
  }

  // Handler to cancel a manual timer
  function cancelManualTimer(zone_id: number) {
    setManualTimers(prev => {
      const updated = { ...prev };
      delete updated[zone_id];
      return updated;
    });
    setShowManualControl(null);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)', padding: '40px 0' }}>
      <h1 style={{ color: '#ff9800', textAlign: 'center', fontWeight: 800, marginBottom: 32 }}>Garden Overview</h1>
      {/* Zone grid at the top */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', marginBottom: 40 }}>
        {zones
          .filter(z => z && typeof z.zone_id === 'number' && z.mode !== 'disabled')
          .map(z => {
            const remaining = getZoneRemainingTime(z);
            const isOn = remaining > 0;
            // If any zone is expanded, all are expanded
            const isExpanded = areAnyZonesExpanded;
            return (
              <div
                key={z.zone_id}
                style={{ minWidth: 180, maxWidth: 220, background: 'rgba(30,20,50,0.95)', borderRadius: 14, boxShadow: '0 2px 12px rgba(106, 17, 203, 0.10)', padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setAreAnyZonesExpanded(prev => !prev)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span
                    style={{ width: 16, height: 16, borderRadius: '50%', background: isOn ? '#4caf50' : '#888', display: 'inline-block', border: '2px solid #222', boxShadow: isOn ? '0 0 8px #4caf50' : undefined }}
                    onClick={e => { e.stopPropagation(); setShowManualControl(showManualControl === z.zone_id ? null : z.zone_id); }}
                    title="Manual control"
                  ></span>
                  <span style={{ color: '#ff9800', fontWeight: 700, fontSize: 18 }}>Zone {z.zone_id}</span>
                </div>
                {/* Manual timer controls */}
                {showManualControl === z.zone_id && (
                  <div style={{ background: '#1a1530', borderRadius: 8, padding: 10, marginBottom: 8, color: '#fff', fontSize: 15, width: '100%' }}>
                    {manualTimers[z.zone_id] == null ? (
                      <>
                        <div style={{ marginBottom: 8 }}>Start manual timer:</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <input
                            type="text"
                            value={manualInput[z.zone_id] || ''}
                            onChange={e => {
                              const val = e.target.value.replace(/[^0-9]/g, '');
                              setManualInput(inp => ({ ...inp, [z.zone_id]: val }));
                              setManualInputError(errs => ({ ...errs, [z.zone_id]: '' }));
                            }}
                            placeholder="HHMM"
                            style={{ width: 48, padding: '6px 6px', borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff', fontSize: 15, textAlign: 'center' }}
                            maxLength={4}
                          />
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const val = manualInput[z.zone_id] || '';
                              const match = val.match(/^([0-1]?\d|2[0-3])([0-5]\d)$/);
                              if (!match) {
                                setManualInputError(errs => ({ ...errs, [z.zone_id]: 'Invalid format' }));
                                return;
                              }
                              const hours = parseInt(match[1], 10);
                              const minutes = parseInt(match[2], 10);
                              const totalSeconds = hours * 3600 + minutes * 60;
                              if (totalSeconds <= 0) {
                                setManualInputError(errs => ({ ...errs, [z.zone_id]: 'Enter a positive time' }));
                                return;
                              }
                              startManualTimer(z.zone_id, totalSeconds);
                              setManualInput(inp => ({ ...inp, [z.zone_id]: '' }));
                              setManualInputError(errs => ({ ...errs, [z.zone_id]: '' }));
                            }}
                            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#ff9800', color: '#221a38', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
                            disabled={!manualInput[z.zone_id] || !/^([0-1]?\d|2[0-3])([0-5]\d)$/.test(manualInput[z.zone_id] || '')}
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
                            style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#444', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                        {manualInputError[z.zone_id] && (
                          <div style={{ color: '#ff512f', marginTop: 4, fontSize: 14 }}>{manualInputError[z.zone_id]}</div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ marginBottom: 8 }}>Manual timer running: <b>{formatCountdown(manualTimers[z.zone_id])}</b></div>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setConfirmCancelZone(z.zone_id);
                          }}
                          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#ff512f', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        {confirmCancelZone === z.zone_id && (
                          <div style={{ marginTop: 10, color: '#fff', background: '#2d2350', borderRadius: 8, padding: '10px 12px', fontSize: 15 }}>
                            <div style={{ marginBottom: 10 }}>Are you sure you want to stop this zone?</div>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                cancelManualTimer(z.zone_id);
                                setConfirmCancelZone(null);
                              }}
                              style={{ marginRight: 10, padding: '6px 14px', borderRadius: 6, border: 'none', background: '#ff512f', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
                            >
                              Yes, Stop
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setConfirmCancelZone(null);
                              }}
                              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#444', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
                <div style={{ color: '#bdbdbd', fontSize: 15, marginBottom: 4 }}>{z.comment || 'No description'}</div>
                <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>
                  Next: {
                    (() => {
                      let nextTime = '...';
                      if (z.period === 'D' && Array.isArray(z.times) && z.times.length > 0) {
                        const code = z.times[0].value;
                        nextTime = zoneResolvedTimes[z.zone_id]?.[code] || '...';
                      } else if (z.time && z.time.value) {
                        nextTime = zoneResolvedTimes[z.zone_id]?.[z.time.value] || '...';
                      }
                      return nextTime;
                    })()
                  }
                </div>
                {isOn && (
                  <div style={{ color: '#4caf50', fontWeight: 700, fontSize: 15, marginTop: 6 }}>
                    Active — Time remaining: {formatCountdown(remaining)}
                  </div>
                )}
                {isExpanded && (
                  <div style={{ marginTop: 12, color: '#fff', fontSize: 15, background: '#1a1530', borderRadius: 8, padding: '10px 12px', width: '100%' }}>
                    <div><b>Zone ID:</b> {z.zone_id}</div>
                    <div><b>GPIO Pin:</b> {z.pin}</div>
                    <div><b>Mode:</b> {z.mode}</div>
                    <div><b>Period:</b> {z.period} {(() => {
                      const periodMap: Record<string, string> = { D: 'Daily', W: 'Weekly', M: 'Monthly', S: 'Specific', I: 'Intervals' };
                      return periodMap[z.period] ? `(${periodMap[z.period]})` : '';
                    })()}</div>
                    <div><b>Cycles:</b> {z.cycles}</div>
                    <div><b>Schedule:</b>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {(() => {
                          let scheduledTimes: { raw: string, resolved: string }[] = [];
                          if (z.period === 'D' && Array.isArray(z.times)) {
                            scheduledTimes = z.times.map((t: any, idx: number) => ({
                              raw: t.value,
                              resolved: zoneResolvedTimes[z.zone_id]?.[t.value] || '...'
                            }));
                          } else if (z.time && z.time.value) {
                            scheduledTimes = [{ raw: z.time.value, resolved: zoneResolvedTimes[z.zone_id]?.[z.time.value] || '...' }];
                          }
                          return scheduledTimes.map((t, idx) => (
                            <li key={idx}>
                              <span style={{ color: '#ff9800' }}>{t.raw}</span> &rarr; <span style={{ color: '#fff' }}>{t.resolved}</span>
                            </li>
                          ));
                        })()}
                      </ul>
                    </div>
                    <div><b>Used by locations:</b>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
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
        <div style={{ color: '#ff9800', textAlign: 'center', fontSize: 22, marginTop: 60 }}>No locations found. Please add locations first.</div>
      ) : Object.keys(map).length === 0 ? (
        <div style={{ color: '#ff9800', textAlign: 'center', fontSize: 22, marginTop: 60 }}>No plant assignments found. Please assign plants and click Finish.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, justifyContent: 'center' }}>
          {locations.map(loc => (
            <div key={loc.location_id} style={{ minWidth: 340, maxWidth: 400, background: 'rgba(30,20,50,0.95)', borderRadius: 16, boxShadow: '0 4px 24px rgba(106, 17, 203, 0.15)', marginBottom: 16 }}>
              <div style={{ padding: 24, borderBottom: '1px solid #ff9800', borderRadius: 16 }}>
                <h2 style={{ color: '#ff9800', margin: 0, fontWeight: 700 }}>{loc.name}</h2>
                <div style={{ color: '#bdbdbd', fontSize: 15, marginTop: 6 }}>{loc.description}</div>
              </div>
              {/* Zone tiles for this location (REMOVED) */}
              {/* <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-start', margin: '16px 0 0 0' }}>
                {(loc.zones || []).map(zid => (
                  <div key={zid} style={{ minWidth: 80, background: '#2d2350', borderRadius: 8, padding: '10px 0', textAlign: 'center', color: '#ff9800', fontWeight: 700, fontSize: 16 }}>
                  Zone {zid}
                </div>
              </div> */}
              <div style={{ padding: 20 }}>
                {getPlantsForLocation(loc.location_id).length === 0 ? (
                  <div style={{ color: '#bdbdbd', fontStyle: 'italic' }}>No plants assigned to this location.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {getPlantsForLocation(loc.location_id).map(inst => (
                      <li
                        key={inst.instance_id}
                        style={{ background: '#2d2350', color: '#ff9800', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 16, cursor: 'pointer' }}
                        onClick={() => setExpandedPlant(prev => ({ ...prev, [loc.location_id]: prev[loc.location_id] === inst.instance_id ? null : inst.instance_id }))}
                      >
                        <b>{getCommonName(inst.library_book, inst.plant_id)}</b> &nbsp; <span style={{ color: '#bdbdbd' }}>x{inst.quantity}</span>
                        {expandedPlant[loc.location_id] === inst.instance_id && (
                          <div style={{ marginTop: 10, color: '#fff', fontSize: 15, background: '#1a1530', borderRadius: 8, padding: '10px 12px' }}>
                            <div><b>Emitter:</b> {inst.emitter_size} GPH</div>
                            <div><b>Zone:</b> {inst.zone_id}</div>
                            <div><b>Planted:</b> {inst.planted_date}</div>
                            <div><b>Comments:</b> {inst.comments || <span style={{ color: '#888' }}>None</span>}</div>
                            <div style={{ color: '#888', fontSize: 13 }}><b>Time to Maturity:</b> (coming soon)</div>
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
  );
} 