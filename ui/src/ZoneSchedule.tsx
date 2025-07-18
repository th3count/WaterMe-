import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const PERIODS = [
  { label: 'Daily', code: 'D', maxCycles: 7 },
  { label: 'Weekly', code: 'W', maxCycles: 7 },
  { label: 'Monthly', code: 'M', maxCycles: 3 },
  { label: 'Specific (future)', code: 'S', maxCycles: 1, disabled: true },
  { label: 'Intervals (future)', code: 'I', maxCycles: 1, disabled: true }
];

function defaultTime() {
  return { value: '0600', duration: '' };
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Remove DurationInput component

export default function ZoneSchedule() {
  const [zones, setZones] = useState<any[]>([]);
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedZoneIdx, setExpandedZoneIdx] = useState<number | null>(0);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch GPIO config from backend
    fetch('http://127.0.0.1:5000/config/gpio.cfg')
      .then(res => res.json())
      .then(data => {
        const zoneCount = data.zoneCount || (data.pins ? data.pins.length : 0);
        setPumpIndex(data.pumpIndex ?? null);
        setZones(
          Array.from({ length: zoneCount }, (_, idx) => ({
            pin: data.pins ? data.pins[idx] : undefined,
            mode: 'disabled',
            period: PERIODS[0].code,
            cycles: 1,
            times: [defaultTime()], // for daily, one per cycle
            time: defaultTime(),    // for non-daily
            startDay: getTomorrow(),
            comment: '',
          }))
        );
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load GPIO config.');
        setLoading(false);
      });
  }, []);

  const handleZoneChange = (idx: number, field: string, value: any) => {
    setZones(zones => zones.map((z, i) => i === idx ? { ...z, [field]: value } : z));
  };

  // For daily, update times array when cycles changes
  const handleCyclesChange = (idx: number, value: number) => {
    setZones(zones => zones.map((z, i) => {
      if (i !== idx) return z;
      let times = z.times || [defaultTime()];
      if (z.period === 'D') {
        times = times.slice(0, value);
        while (times.length < value) times.push(defaultTime());
      }
      return { ...z, cycles: value, times };
    }));
  };

  // For daily, update a specific time
  const handleTimeChange = (zoneIdx: number, timeIdx: number, value: string) => {
    setZones(zones => zones.map((z, i) => {
      if (i !== zoneIdx) return z;
      const times = [...(z.times || [])];
      times[timeIdx] = { value };
      return { ...z, times };
    }));
  };

  // For non-daily, update the single time
  const handleSingleTimeChange = (zoneIdx: number, value: string) => {
    setZones(zones => zones.map((z, i) => {
      if (i !== zoneIdx) return z;
      return { ...z, time: { value } };
    }));
  };

  // Validation for time input
  function isValidTimeInput(val: string) {
    // Accept HHMM 24-hour
    if (/^([01]\d|2[0-3])[0-5]\d$/.test(val)) return true;
    // Accept SUNRISE, SUNSET, ZENITH
    if (/^(SUNRISE|SUNSET|ZENITH)([+-]\d+)?$/.test(val)) return true;
    return false;
  }

  function isValidDurationInput(val: string) {
    // Accept HHMMSS (e.g. 010000, 003000, 012345)
    return /^\d{6}$/.test(val);
  }

  function handleDurationChange(zoneIdx: number, timeIdx: number | null, slotIdx: number, value: string) {
    if (!/^[0-9]?$/.test(value)) return; // Only allow single digit or empty
    setZones(zones => zones.map((z, i) => {
      if (i !== zoneIdx) return z;
      if (timeIdx !== null) {
        // Daily, multiple cycles
        const times = [...(z.times || [])];
        let dur = times[timeIdx]?.duration || '000000';
        dur = dur.padEnd(6, '0').slice(0, 6);
        dur = dur.substring(0, slotIdx) + (value || '0') + dur.substring(slotIdx + 1);
        times[timeIdx] = { ...times[timeIdx], duration: dur };
        return { ...z, times };
      } else {
        // Non-daily
        let dur = z.time?.duration || '000000';
        dur = dur.padEnd(6, '0').slice(0, 6);
        dur = dur.substring(0, slotIdx) + (value || '0') + dur.substring(slotIdx + 1);
        return { ...z, time: { ...z.time, duration: dur } };
      }
    }));
  }

  const handleContinue = async () => {
    setSaving(true);
    setError('');
    try {
      // Add zone_id to each zone before saving (one-based)
      const zonesWithId = zones.map((z, idx) => ({ ...z, zone_id: idx + 1 }));
      const resp = await fetch('http://127.0.0.1:5000/api/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zonesWithId)
      });
      if (!resp.ok) throw new Error('Failed to save schedule');
      navigate('/locations');
    } catch (err) {
      setError('Failed to save schedule.');
    }
    setSaving(false);
  };

  if (loading) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: '4rem' }}>Loading zone configuration...</div>;
  }

  if (error) {
    return <div style={{ color: '#ff512f', textAlign: 'center', marginTop: '4rem' }}>{error}</div>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
        color: '#fff',
        textAlign: 'center'
      }}
    >
      <style>{`
        .zone-panel {
          transition: max-height 0.8s cubic-bezier(0.4,0,0.2,1), opacity 0.5s;
          overflow: hidden;
          opacity: 0;
          max-height: 0;
        }
        .zone-panel.expanded {
          opacity: 1;
          max-height: 1000px;
        }
        .duration-input-box {
          position: relative;
          display: inline-block;
        }
        .duration-placeholder {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          color: #bdbdbd;
          opacity: 0.4;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          font-family: inherit;
          z-index: 1;
        }
        .duration-input {
          background: transparent;
          color: #fff;
          border-radius: 4px;
          border: 1px solid #ff9800;
          width: 70px;
          text-align: center;
          padding: 4px;
          font-size: 15px;
          position: relative;
          z-index: 2;
          caret-color: #fff;
        }
      `}</style>
      <div style={{ width: '100%' }}>
        <div style={{ margin: '2rem auto', maxWidth: 500, background: 'rgba(30,20,50,0.95)', borderRadius: 12, padding: 24 }}>
          <h2 style={{ color: '#ff9800', fontWeight: 700, marginTop: 0 }}>Zone Scheduling</h2>
          <>
            {zones.map((zone, idx) => {
              const periodObj = PERIODS.find(p => p.code === zone.period) || PERIODS[0];
              const expanded = expandedZoneIdx === idx;
              return (
                <div
                  key={idx}
                  style={{ marginBottom: 32, borderBottom: '1px solid #444', paddingBottom: 16 }}
                >
                  <div
                    style={{ fontWeight: 600, color: '#ff9800', marginBottom: expanded ? 8 : 0, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                    onClick={() => setExpandedZoneIdx(expanded ? null : idx)}
                  >
                    <span>Zone {idx + 1} (GPIO {zone.pin})</span>
                    <span style={{ fontSize: 16, color: '#bdbdbd', marginLeft: 8 }}>{expanded ? '▼' : '▶'}</span>
                  </div>
                  <div className={`zone-panel${expanded ? ' expanded' : ''}`}>
                    {expanded && (
                      <>
                        {pumpIndex === idx ? (
                          <div style={{ color: '#bdbdbd', marginBottom: 8 }}>This zone is configured as the pump and does not require scheduling.</div>
                        ) : (
                          <>
                            {/* Mode Slider */}
                            <div style={{ marginBottom: 12 }}>
                              <span style={{ color: '#fff', marginRight: 12 }}>Mode:</span>
                              <label style={{ color: zone.mode === 'manual' ? '#ff9800' : '#fff', marginRight: 8 }}>
                                <input
                                  type="radio"
                                  checked={zone.mode === 'manual'}
                                  onChange={() => handleZoneChange(idx, 'mode', 'manual')}
                                  style={{ marginRight: 4 }}
                                />
                                Manual
                              </label>
                              <label style={{ color: '#bdbdbd', opacity: 0.5, marginRight: 8 }}>
                                <input
                                  type="radio"
                                  checked={zone.mode === 'smart'}
                                  disabled
                                  style={{ marginRight: 4 }}
                                />
                                Smart (coming soon)
                              </label>
                              <label style={{ color: zone.mode === 'disabled' ? '#ff9800' : '#fff' }}>
                                <input
                                  type="radio"
                                  checked={zone.mode === 'disabled'}
                                  onChange={() => handleZoneChange(idx, 'mode', 'disabled')}
                                  style={{ marginRight: 4 }}
                                />
                                Disabled
                              </label>
                            </div>
                            {/* Collapse scheduling controls if disabled */}
                            {zone.mode !== 'disabled' && (
                              <>
                                {/* Period and Cycles Controls */}
                                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <label style={{ marginRight: 8 }}>
                                    Period:&nbsp;
                                    <select
                                      value={zone.period}
                                      onChange={e => handleZoneChange(idx, 'period', e.target.value)}
                                      style={{ padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                                    >
                                      {PERIODS.map(opt => (
                                        <option key={opt.code} value={opt.code} disabled={!!opt.disabled} style={opt.disabled ? { color: '#bdbdbd' } : {}}>{opt.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label>
                                    Cycles:&nbsp;
                                    {zone.period === 'D' ? (
                                      <input
                                        type="number"
                                        min={1}
                                        max={periodObj.maxCycles}
                                        value={zone.cycles}
                                        onChange={e => handleCyclesChange(idx, Number(e.target.value))}
                                        style={{ width: 60, padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                                      />
                                    ) : (
                                      <select
                                        value={zone.cycles}
                                        onChange={e => handleZoneChange(idx, 'cycles', Number(e.target.value))}
                                        style={{ padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                                      >
                                        {Array.from({
                                          length: zone.period === 'W' ? 6 : zone.period === 'M' ? 3 : periodObj.maxCycles
                                        }, (_, i) => i + 1).map(n => (
                                          <option key={n} value={n}>{n}</option>
                                        ))}
                                      </select>
                                    )}
                                  </label>
                                </div>
                                {/* Start day calendar */}
                                <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <label style={{ marginRight: 8 }}>
                                    Start day:&nbsp;
                                    <input
                                      type="date"
                                      value={zone.startDay}
                                      onChange={e => handleZoneChange(idx, 'startDay', e.target.value)}
                                      style={{ padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                                    />
                                  </label>
                                </div>
                                {/* Mini-manual always below period/cycle, above time */}
                                {zone.period === 'D' && (
                                  <div style={{ color: '#bdbdbd', fontSize: 13, marginTop: 0, marginBottom: 8 }}>
                                    <b>Time format:</b> HHMM (24-hour, e.g. 0600, 1830) or use aliases:<br />
                                    <b>SUNRISE</b>, <b>SUNSET</b>, <b>ZENITH</b> (optionally + or - minutes, e.g. SUNRISE+30, SUNSET-15)<br />
                                    <br />
                                    <b>Duration format:</b> HHMMSS (e.g. 010000 = 1h, 003000 = 30m, 012345 = 1h23m45s)
                                  </div>
                                )}
                                {zone.period !== 'D' && (
                                  <div style={{ color: '#bdbdbd', fontSize: 13, marginTop: 0, marginBottom: 8 }}>
                                    <b>Time format:</b> HHMM (24-hour) or SUNRISE, SUNSET, ZENITH (+/- minutes)<br />
                                    <br />
                                    <b>Duration format:</b> HHMMSS (e.g. 010000 = 1h, 003000 = 30m, 012345 = 1h23m45s)
                                  </div>
                                )}
                                {zone.period === 'S' && (
                                  <div style={{ color: '#bdbdbd', fontSize: 13, marginTop: 0, marginBottom: 8 }}>
                                    <b>Specific</b> scheduling is a future feature (TODO).
                                  </div>
                                )}
                                {/* For daily, show a time text box for each cycle */}
                                {zone.period === 'D' ? (
                                  <div style={{ marginBottom: 12 }}>
                                    {Array.from({ length: zone.cycles }).map((_, cidx) => {
                                      const val = zone.times[cidx]?.value || '';
                                      const durationVal = zone.times[cidx]?.duration || '';
                                      const invalid = val && !isValidTimeInput(val);
                                      const invalidDuration = durationVal && !isValidDurationInput(durationVal);
                                      return (
                                        <div key={cidx} style={{ marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                          <label style={{ marginRight: 8 }}>
                                            Time for cycle {cidx + 1}:&nbsp;
                                            <input
                                              type="text"
                                              value={val}
                                              onChange={e => handleTimeChange(idx, cidx, e.target.value)}
                                              placeholder="e.g. 0600, 1830, SUNRISE+30, SUNSET-15, ZENITH"
                                              style={{ width: 120, padding: 4, borderRadius: 6, border: invalid ? '1px solid #ff512f' : '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                                            />
                                          </label>
                                          <div className="duration-input-box" style={{ marginRight: 8 }}>
                                            <input
                                              type="text"
                                              maxLength={6}
                                              value={durationVal || ''}
                                              onChange={e => {
                                                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                                setZones(zones => zones.map((z, i) => {
                                                  if (i !== idx) return z;
                                                  const times = [...(z.times || [])];
                                                  times[cidx] = { ...times[cidx], duration: val };
                                                  return { ...z, times };
                                                }));
                                              }}
                                              className="duration-input"
                                              style={{ border: invalidDuration ? '1px solid #ff512f' : '1px solid #ff9800' }}
                                            />
                                            {(!durationVal) && (
                                              <span className="duration-placeholder">HHMMSS</span>
                                            )}
                                          </div>
                                          {invalid && <span style={{ color: '#ff512f', fontSize: 13 }}>Invalid</span>}
                                          {invalidDuration && <span style={{ color: '#ff512f', fontSize: 13 }}>Invalid duration</span>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <label style={{ marginRight: 8 }}>
                                      Time:&nbsp;
                                      <input
                                        type="text"
                                        value={zone.time.value}
                                        onChange={e => handleSingleTimeChange(idx, e.target.value)}
                                        placeholder="e.g. 0600, 1830, SUNRISE+30, SUNSET-15, ZENITH"
                                        style={{ width: 120, padding: 4, borderRadius: 6, border: isValidTimeInput(zone.time.value) ? '1px solid #ff9800' : '1px solid #ff512f', background: '#2d2350', color: '#fff' }}
                                      />
                                    </label>
                                    <div className="duration-input-box" style={{ marginRight: 8 }}>
                                      <input
                                        type="text"
                                        maxLength={6}
                                        value={zone.time.duration || ''}
                                        onChange={e => {
                                          const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                          setZones(zones => zones.map((z, i) => {
                                            if (i !== idx) return z;
                                            return { ...z, time: { ...z.time, duration: val } };
                                          }));
                                        }}
                                        className="duration-input"
                                        style={{ border: zone.time.duration && !isValidDurationInput(zone.time.duration) ? '1px solid #ff512f' : '1px solid #ff9800' }}
                                      />
                                      {(!zone.time.duration) && (
                                        <span className="duration-placeholder">HHMMSS</span>
                                      )}
                                    </div>
                                    {!isValidTimeInput(zone.time.value) && <span style={{ color: '#ff512f', fontSize: 13 }}>Invalid</span>}
                                    {zone.time.duration && !isValidDurationInput(zone.time.duration) && <span style={{ color: '#ff512f', fontSize: 13 }}>Invalid duration</span>}
                                  </div>
                                )}
                                {/* Comments/Description */}
                                <div style={{ marginBottom: 0 }}>
                                  <label>
                                    Comments/Description:&nbsp;
                                    <input
                                      type="text"
                                      value={zone.comment}
                                      onChange={e => handleZoneChange(idx, 'comment', e.target.value)}
                                      style={{ width: 220, padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                                    />
                                  </label>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <button
              onClick={handleContinue}
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
              {saving ? 'Saving...' : 'Continue'}
            </button>
          </>
        </div>
      </div>
    </div>
  );
} 