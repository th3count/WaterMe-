import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from './utils';

const PERIODS = [
  { label: 'Daily', code: 'D', maxCycles: 10 },
  { label: 'Weekly', code: 'W', maxCycles: 10 },
  { label: 'Monthly', code: 'M', maxCycles: 10 },
  { label: 'Specific (future)', code: 'S', maxCycles: 1, disabled: true },
  { label: 'Intervals (future)', code: 'I', maxCycles: 1, disabled: true }
];

function defaultTime() {
  return { value: '0600', duration: '010000' };
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ZoneSchedule() {
  const [zones, setZones] = useState<any[]>([]);
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [gpioPins, setGpioPins] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedZoneIdx, setExpandedZoneIdx] = useState<number | null>(0);
  const navigate = useNavigate();

  useEffect(() => {
    const loadZoneData = async () => {
      try {
        // First load GPIO config to get zone count and pump index
        const gpioResp = await fetch(`${getApiBaseUrl()}/config/gpio.cfg`);
        const gpioData = await gpioResp.json();
        const zoneCount = gpioData.zoneCount || (gpioData.pins ? gpioData.pins.length : 0);
        // Convert 1-based pump index from config to 0-based for frontend
        setPumpIndex(gpioData.pumpIndex !== undefined && gpioData.pumpIndex > 0 ? gpioData.pumpIndex - 1 : null);
        setGpioPins(gpioData.pins || []);

        // Then load existing schedule data
        const scheduleResp = await fetch(`${getApiBaseUrl()}/api/schedule`);
        console.log('Schedule response status:', scheduleResp.status);
        if (scheduleResp.ok) {
          const scheduleData = await scheduleResp.json();
          console.log('Loaded schedule data:', scheduleData);
          setZones(scheduleData);
        } else {
          console.log('API failed, trying direct file access...');
          // Try loading from the data file directly
          try {
            const fileResp = await fetch(`${getApiBaseUrl()}/data/schedule.json`);
            if (fileResp.ok) {
              const fileData = await fileResp.json();
              console.log('Loaded from file:', fileData);
              setZones(fileData);
            } else {
              console.log('File also failed, creating default zones');
              // If no schedule data exists, create default zones
              setZones(
                Array.from({ length: zoneCount }, (_, idx) => ({
                  zone_id: idx + 1,
                  mode: 'disabled',
                  period: PERIODS[0].code,
                  cycles: 1,
                  times: [defaultTime()],
                  startDay: getTomorrow(),
                  comment: '',
                }))
              );
            }
          } catch (fileErr) {
            console.log('File access failed:', fileErr);
            // If no schedule data exists, create default zones
        setZones(
          Array.from({ length: zoneCount }, (_, idx) => ({
                zone_id: idx + 1,
            mode: 'disabled',
            period: PERIODS[0].code,
            cycles: 1,
                times: [defaultTime()],
            startDay: getTomorrow(),
            comment: '',
          }))
        );
          }
        }
        setLoading(false);
      } catch (err) {
        console.error('Failed to load zone data:', err);
        setError('Failed to load zone configuration.');
        setLoading(false);
      }
    };

    loadZoneData();
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
      times[timeIdx] = { ...times[timeIdx], value };
      return { ...z, times };
    }));
  };

  // For non-daily, update the single time (first time in times array)
  const handleSingleTimeChange = (zoneIdx: number, value: string) => {
    setZones(zones => zones.map((z, i) => {
      if (i !== zoneIdx) return z;
      const times = [...(z.times || [])];
      if (times.length > 0) {
        times[0] = { ...times[0], value };
      } else {
        times.push({ value, duration: '010000' });
      }
      return { ...z, times };
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



  const handleContinue = async () => {
    setSaving(true);
    setError('');
    try {
      // Preserve exact data structure to avoid breaking other systems
      const zonesToSave = zones.map(zone => {
        // Keep all existing fields exactly as they are
        const zoneToSave = { ...zone };
        
        // Only ensure required fields exist with safe defaults
        if (!zoneToSave.times) zoneToSave.times = [{ value: '0600', duration: '010000' }];
        if (!zoneToSave.startDay) zoneToSave.startDay = getTomorrow();
        if (!zoneToSave.comment) zoneToSave.comment = '';
        
        return zoneToSave;
      });

      console.log('Saving zones:', zonesToSave);
      
      const resp = await fetch(`${getApiBaseUrl()}/api/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zonesToSave)
      });
      
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`Failed to save schedule: ${errorText}`);
      }
      
      console.log('Schedule saved successfully');
      
      // Show success message
      alert('Zone schedule saved successfully!');
      
    } catch (err) {
      console.error('Save error:', err);
      setError(`Failed to save schedule: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        minWidth: '100vw',
        background: '#181f2a',
        padding: '0 0 0 20px',
        marginLeft: '150px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#00bcd4', fontSize: '18px' }}>Loading zone configuration...</div>
      </div>
    );
  }

  if (error) {
  return (
      <div style={{
        minHeight: '100vh',
        minWidth: '100vw',
        background: '#181f2a',
        padding: '0 0 0 20px',
        marginLeft: '150px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#ff512f', fontSize: '18px' }}>{error}</div>
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
          {/* Invisible spacer to match other pages layout */}
        </div>
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          

          {/* Zone Configuration Cards */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            {zones.map((zone, idx) => {
              const periodObj = PERIODS.find(p => p.code === zone.period) || PERIODS[0];
              const expanded = expandedZoneIdx === idx;
              return (
                <div
                  key={idx}
                  style={{
                    background: '#232b3b',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    border: '1px solid #1a1f2a'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      marginBottom: expanded ? '16px' : 0
                    }}
                    onClick={() => setExpandedZoneIdx(expanded ? null : idx)}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <span style={{
                        color: '#00bcd4',
                        fontWeight: 700,
                        fontSize: '18px'
                      }}>
                        Zone {zone.zone_id} (GPIO {gpioPins[zone.zone_id - 1] || 'N/A'})
                      </span>
                      {zone.comment && (
                        <span style={{
                          color: '#bdbdbd',
                          fontSize: '14px',
                          fontStyle: 'italic'
                        }}>
                          - {zone.comment}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontSize: '16px',
                      color: '#00bcd4',
                      transition: 'transform 0.2s',
                      transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)'
                    }}>
                      ▶
                    </span>
                  </div>

                    {expanded && (
                    <div style={{
                      borderTop: '1px solid #1a1f2a',
                      paddingTop: '16px'
                    }}>
                      {pumpIndex === zone.zone_id - 1 ? (
                        <div style={{
                          color: '#bdbdbd',
                          padding: '12px',
                          background: '#1a1f2a',
                          borderRadius: '8px',
                          fontSize: '14px'
                        }}>
                          This zone is configured as the pump and does not require scheduling.
                        </div>
                        ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '16px'
                        }}>
                          {/* Mode Selection */}
                          <div>
                            <label style={{
                              color: '#f4f4f4',
                              fontSize: '14px',
                              fontWeight: 600,
                              marginBottom: '8px',
                              display: 'block'
                            }}>
                              Mode:
                              </label>
                            <div style={{
                              display: 'flex',
                              gap: '16px'
                            }}>
                              {['manual', 'smart', 'disabled'].map(mode => (
                                <label key={mode} style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  cursor: 'pointer',
                                  color: zone.mode === mode ? '#00bcd4' : '#bdbdbd'
                                }}>
                                <input
                                  type="radio"
                                    checked={zone.mode === mode}
                                    onChange={() => handleZoneChange(idx, 'mode', mode)}
                                    style={{
                                      accentColor: '#00bcd4'
                                    }}
                                />
                                  <span style={{
                                    textTransform: 'capitalize',
                                    fontSize: '14px'
                                  }}>
                                    {mode === 'smart' ? 'Smart (coming soon)' : mode}
                                  </span>
                              </label>
                              ))}
                            </div>
                          </div>

                          {/* Period Selection */}
                          <div>
                            <label style={{
                              color: '#f4f4f4',
                              fontSize: '14px',
                              fontWeight: 600,
                              marginBottom: '8px',
                              display: 'block'
                            }}>
                              Period:
                            </label>
                                    <select
                                      value={zone.period}
                              onChange={(e) => handleZoneChange(idx, 'period', e.target.value)}
                              style={{
                                background: '#1a1f2a',
                                color: '#f4f4f4',
                                border: '1px solid #00bcd4',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                fontSize: '14px',
                                minWidth: '120px'
                              }}
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

                          {/* Cycles Selection */}
                          <div>
                            <label style={{
                              color: '#f4f4f4',
                              fontSize: '14px',
                              fontWeight: 600,
                              marginBottom: '8px',
                              display: 'block'
                            }}>
                              Cycles: {zone.cycles}
                                  </label>
                                      <input
                              type="range"
                              min="1"
                                        max={periodObj.maxCycles}
                                        value={zone.cycles}
                              onChange={(e) => handleCyclesChange(idx, parseInt(e.target.value))}
                              style={{
                                width: '100%',
                                accentColor: '#00bcd4'
                              }}
                                      />
                          </div>

                          {/* Time Configuration */}
                          <div>
                            <label style={{
                              color: '#f4f4f4',
                              fontSize: '14px',
                              fontWeight: 600,
                              marginBottom: '8px',
                              display: 'block'
                            }}>
                              Schedule:
                                  </label>
                            {zone.period === 'D' ? (
                              // Daily - multiple times
                              <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                {zone.times?.map((time: any, timeIdx: number) => (
                                  <div key={timeIdx} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px',
                                    background: '#1a1f2a',
                                    borderRadius: '8px'
                                  }}>
                                    <span style={{
                                      color: '#bdbdbd',
                                      fontSize: '14px',
                                      minWidth: '60px'
                                    }}>
                                      Time {timeIdx + 1}:
                                    </span>
                                    <input
                                      type="text"
                                      value={time.value}
                                      onChange={(e) => handleTimeChange(idx, timeIdx, e.target.value)}
                                      placeholder="0600 or SUNRISE"
                                      style={{
                                        background: '#232b3b',
                                        color: '#f4f4f4',
                                        border: '1px solid #00bcd4',
                                        borderRadius: '4px',
                                        padding: '6px 8px',
                                        fontSize: '14px',
                                        width: '100px'
                                      }}
                                    />
                                    <span style={{
                                      color: '#bdbdbd',
                                      fontSize: '14px'
                                    }}>
                                      Duration:
                                    </span>
                                            <input
                                              type="text"
                                       value={time.duration || ''}
                                       onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                                setZones(zones => zones.map((z, i) => {
                                                  if (i !== idx) return z;
                                                  const times = [...(z.times || [])];
                                           times[timeIdx] = { ...times[timeIdx], duration: val };
                                                  return { ...z, times };
                                                }));
                                              }}
                                       style={{
                                         background: '#232b3b',
                                         color: '#f4f4f4',
                                         border: '1px solid #00bcd4',
                                         borderRadius: '4px',
                                         padding: '6px 8px',
                                         fontSize: '14px',
                                         width: '100px'
                                       }}
                                     />
                                     <span style={{
                                       color: '#bdbdbd',
                                       fontSize: '12px'
                                     }}>
                                       HHMMSS
                                     </span>
                                        </div>
                                ))}
                                  </div>
                                ) : (
                              // Non-daily - single time
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '12px',
                                background: '#1a1f2a',
                                borderRadius: '8px'
                              }}>
                                <span style={{
                                  color: '#bdbdbd',
                                  fontSize: '14px'
                                }}>
                                  Time:
                                </span>
                                                                      <input
                                  type="text"
                                  value={zone.times?.[0]?.value || ''}
                                  onChange={(e) => handleSingleTimeChange(idx, e.target.value)}
                                  placeholder="0600 or SUNRISE"
                                  style={{
                                    background: '#232b3b',
                                    color: '#f4f4f4',
                                    border: '1px solid #00bcd4',
                                    borderRadius: '4px',
                                    padding: '6px 8px',
                                    fontSize: '14px',
                                    width: '100px'
                                  }}
                                />
                                <span style={{
                                  color: '#bdbdbd',
                                  fontSize: '14px'
                                }}>
                                  Duration:
                                </span>
                                      <input
                                        type="text"
                                   value={zone.times?.[0]?.duration || ''}
                                   onChange={(e) => {
                                          const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                                          setZones(zones => zones.map((z, i) => {
                                            if (i !== idx) return z;
                                            const times = [...(z.times || [])];
                                            if (times.length > 0) {
                                              times[0] = { ...times[0], duration: val };
                                            } else {
                                              times.push({ value: '0600', duration: val });
                                            }
                                            return { ...z, times };
                                          }));
                                        }}
                                   style={{
                                     background: '#232b3b',
                                     color: '#f4f4f4',
                                     border: '1px solid #00bcd4',
                                     borderRadius: '4px',
                                     padding: '6px 8px',
                                     fontSize: '14px',
                                     width: '100px'
                                   }}
                                      />
                                 <span style={{
                                   color: '#bdbdbd',
                                   fontSize: '12px'
                                 }}>
                                   HHMMSS
                                 </span>
                              </div>
                                      )}
                                    </div>

                          {/* Comment */}
                          <div>
                            <label style={{
                              color: '#f4f4f4',
                              fontSize: '14px',
                              fontWeight: 600,
                              marginBottom: '8px',
                              display: 'block'
                            }}>
                              Comment:
                            </label>
                                    <input
                                      type="text"
                              value={zone.comment || ''}
                              onChange={(e) => handleZoneChange(idx, 'comment', e.target.value)}
                              placeholder="Optional description"
                              style={{
                                background: '#1a1f2a',
                                color: '#f4f4f4',
                                border: '1px solid #00bcd4',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                fontSize: '14px',
                                width: '100%',
                                boxSizing: 'border-box'
                              }}
                                    />
                          </div>
                                </div>
                    )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Continue Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '32px'
          }}>
            <button
              onClick={handleContinue}
              disabled={saving}
              style={{
                background: '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 32px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
                transition: 'opacity 0.2s'
              }}
            >
                              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>

          {error && (
            <div style={{
              color: '#ff512f',
              textAlign: 'center',
              padding: '12px',
              background: '#1a1f2a',
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 