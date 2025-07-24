import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from './utils';

const PERIODS = [
  { label: 'Daily', code: 'D', maxCycles: 10 },
  { label: 'Weekly', code: 'W', maxCycles: 6 },
  { label: 'Monthly', code: 'M', maxCycles: 3 },
  { label: 'Specific (future)', code: 'S', maxCycles: 1, disabled: true },
  { label: 'Intervals (future)', code: 'I', maxCycles: 1, disabled: true }
];

function defaultTime() {
  return { value: '0600', start_time: '0600', duration: '010000' };
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
  const [success, setSuccess] = useState('');
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'manual' | 'smart'>('manual');
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
    setZones(prev => prev.map((zone, i) => {
      if (i === idx) {
        const updatedZone = { ...zone, [field]: value };
        
        // If period is changing, enforce cycle limits and update times array
        if (field === 'period') {
          const newPeriod = PERIODS.find(p => p.code === value);
          if (newPeriod && updatedZone.cycles > newPeriod.maxCycles) {
            updatedZone.cycles = newPeriod.maxCycles;
          }
          
          // Ensure times array matches the new cycle count
          const currentTimes = updatedZone.times || [defaultTime()];
          let newTimes = [...currentTimes];
          
          if (updatedZone.cycles > currentTimes.length) {
            // Add more time slots
            const additionalSlots = updatedZone.cycles - currentTimes.length;
            for (let j = 0; j < additionalSlots; j++) {
              newTimes.push(defaultTime());
            }
          } else if (updatedZone.cycles < currentTimes.length) {
            // Remove excess time slots
            newTimes = currentTimes.slice(0, updatedZone.cycles);
          }
          
          updatedZone.times = newTimes;
        }
        
        return updatedZone;
      }
      return zone;
    }));
  };

  const handleCyclesChange = (idx: number, value: number) => {
    setZones(prev => prev.map((zone, i) => {
      if (i === idx) {
        // Enforce cycle limits for the current period
        const currentPeriod = PERIODS.find(p => p.code === zone.period);
        const maxCycles = currentPeriod ? currentPeriod.maxCycles : 10;
        const enforcedValue = Math.min(value, maxCycles);
        
        // Ensure times array matches the number of cycles
        const currentTimes = zone.times || [defaultTime()];
        let newTimes = [...currentTimes];
        
        if (enforcedValue > currentTimes.length) {
          // Add more time slots
          const additionalSlots = enforcedValue - currentTimes.length;
          for (let j = 0; j < additionalSlots; j++) {
            newTimes.push(defaultTime());
          }
        } else if (enforcedValue < currentTimes.length) {
          // Remove excess time slots
          newTimes = currentTimes.slice(0, enforcedValue);
        }
        
        return { ...zone, cycles: enforcedValue, times: newTimes };
      }
      return zone;
    }));
  };

  const handleTimeChange = (zoneIdx: number, timeIdx: number, value: string, duration?: string) => {
    setZones(prev => prev.map((zone, i) => {
      if (i === zoneIdx) {
        const newTimes = [...(zone.times || [])];
        if (newTimes[timeIdx]) {
          if (duration !== undefined) {
            newTimes[timeIdx] = { ...newTimes[timeIdx], duration };
          } else if (value !== undefined) {
            newTimes[timeIdx] = { ...newTimes[timeIdx], start_time: value, value };
          }
        }
        return { ...zone, times: newTimes };
      }
      return zone;
    }));
  };

  const handleSingleTimeChange = (zoneIdx: number, value: string, duration?: string) => {
    setZones(prev => prev.map((zone, i) => {
      if (i === zoneIdx) {
        if (duration !== undefined) {
          return { ...zone, time: { ...zone.time, duration } };
        } else if (value !== undefined) {
          return { ...zone, time: { ...zone.time, start_time: value, value } };
        }
      }
      return zone;
    }));
  };

  function isValidTimeInput(val: string) {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(val);
  }

  function isValidDurationInput(val: string) {
    return /^\d{6}$/.test(val);
  }



  const handleModalSave = async () => {
    if (selectedZone) {
      // Convert new mode system back to old system for backend compatibility
      let zoneToSave = { ...selectedZone };
      
      if (selectedZone.mode === 'active') {
        zoneToSave.mode = scheduleMode; // Convert to 'manual' or 'smart'
      } else if (selectedZone.mode === 'disabled') {
        // For disabled zones, purge all data except mode
        zoneToSave = { mode: 'disabled' };
      }
      
      setZones(prev => prev.map((zone, i) => 
        i === selectedZone.originalIndex ? zoneToSave : zone
      ));
      
      // Save to backend
      setSaving(true);
      setError('');
      try {
        const updatedZones = zones.map((zone, i) => {
          let zoneWithId;
          if (i === selectedZone.originalIndex) {
            if (selectedZone.mode === 'disabled') {
              // For disabled zones, only send mode
              zoneWithId = { mode: 'disabled', zone_id: i + 1 };
            } else {
              zoneWithId = { ...zoneToSave, zone_id: i + 1 };
            }
          } else {
            zoneWithId = { ...zone, zone_id: i + 1 };
          }
          return zoneWithId;
        });
        
        const response = await fetch(`${getApiBaseUrl()}/api/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedZones)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('Server response:', response.status, errorText);
          throw new Error(`Failed to save schedule: ${response.status} - ${errorText}`);
        }
        
        // Show success message and close modal
        setError(''); // Clear any previous errors
        setSuccess('Zone configuration saved successfully!');
        setShowZoneModal(false);
        setSelectedZone(null);
        setSaving(false);
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccess(''), 3000);
      } catch (err) {
        setError('Failed to save zone configuration.');
        setSaving(false);
      }
    }
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
        <div style={{ color: '#f4f4f4', fontSize: '18px' }}>Loading zone configuration...</div>
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


        {error && (
          <div style={{
            background: '#ff4444',
            color: 'white',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}
        
        {success && (
          <div style={{
            background: '#4caf50',
            color: 'white',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            {success}
          </div>
        )}
        
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '24px'
        }}>
          
          {/* Zone Status Legend */}
          <div style={{
            background: '#232b3b',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #1a1f2a'
          }}>
            <div style={{
              color: '#f4f4f4',
              fontSize: '16px',
              fontWeight: 600,
              marginBottom: '12px'
            }}>
              Zone Status Legend:
            </div>
            <div style={{
              display: 'flex',
              gap: '24px',
              flexWrap: 'wrap'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#4caf50',
                  border: '2px solid #232b3b'
                }} />
                <span style={{
                  color: '#4caf50',
                  fontSize: '14px',
                  fontWeight: 600
                }}>
                  Active
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#00bcd4',
                  border: '2px solid #232b3b'
                }} />
                <span style={{
                  color: '#00bcd4',
                  fontSize: '14px',
                  fontWeight: 600
                }}>
                  Pump Zone
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  background: '#666',
                  border: '2px solid #232b3b'
                }} />
                <span style={{
                  color: '#666',
                  fontSize: '14px',
                  fontWeight: 600
                }}>
                  Disabled
                </span>
              </div>
            </div>
          </div>

          {/* Zone List */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px'
          }}>
            {zones.map((zone, idx) => {
              const periodObj = PERIODS.find(p => p.code === zone.period) || PERIODS[0];
              return (
                <div
                  key={idx}
                  style={{
                    background: '#232b3b',
                    borderRadius: '16px',
                    padding: '20px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    border: pumpIndex === zone.zone_id - 1 ? '2px solid #00bcd4' :
                           zone.mode === 'disabled' ? '2px solid #666' : 
                           zone.mode === 'manual' || zone.mode === 'smart' ? '2px solid #4caf50' : 
                           '1px solid #1a1f2a',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    // Convert old mode system to new system
                    let newMode = zone.mode;
                    let newScheduleMode: 'manual' | 'smart' = 'manual';
                    
                    if (zone.mode === 'manual' || zone.mode === 'smart') {
                      newMode = 'active';
                      newScheduleMode = zone.mode;
                    }
                    
                    // Ensure times array exists and is properly sized
                    let newTimes = [...(zone.times || [])];
                    
                    // If zone has old 'time' object structure, convert it to 'times' array
                    if (zone.time && (!zone.times || zone.times.length === 0)) {
                      newTimes = [zone.time];
                      console.log('Converting old time structure to times array:', zone.time);
                    }
                    
                    console.log('Zone data:', {
                      zone_id: zone.zone_id,
                      period: zone.period,
                      cycles: zone.cycles,
                      mode: zone.mode,
                      hasTime: !!zone.time,
                      hasTimes: !!zone.times,
                      timesLength: zone.times?.length || 0,
                      newTimesLength: newTimes.length
                    });
                    
                    if (newMode === 'active' && newScheduleMode === 'manual') {
                      if (zone.period === 'daily') {
                        const targetTimesLength = zone.cycles;
                        if (newTimes.length !== targetTimesLength) {
                          if (targetTimesLength > newTimes.length) {
                            // Add more times
                            for (let i = newTimes.length; i < targetTimesLength; i++) {
                              newTimes.push({ start_time: '', duration: '' });
                            }
                          } else {
                            // Remove excess times
                            newTimes = newTimes.slice(0, targetTimesLength);
                          }
                        }
                      } else {
                        // Weekly/Monthly periods: must have exactly 1 slot
                        if (newTimes.length !== 1) {
                          if (newTimes.length === 0) {
                            newTimes = [{ start_time: '', duration: '' }];
                          } else {
                            newTimes = [newTimes[0]]; // Keep only the first time
                          }
                        }
                      }
                    }
                    
                    // Ensure times array is properly initialized for daily zones
                    let finalTimes = newTimes;
                    if (newMode === 'active' && newScheduleMode === 'manual' && zone.period === 'daily') {
                      const expectedTimes = zone.cycles;
                      if (finalTimes.length !== expectedTimes) {
                        if (expectedTimes > finalTimes.length) {
                          // Add more time slots while preserving existing ones
                          for (let i = finalTimes.length; i < expectedTimes; i++) {
                            finalTimes.push({ start_time: '', duration: '' });
                          }
                        } else {
                          // Remove excess time slots
                          finalTimes = finalTimes.slice(0, expectedTimes);
                        }
                      }
                    }
                    
                    setSelectedZone({ ...zone, mode: newMode, times: finalTimes, originalIndex: idx });
                    setScheduleMode(newScheduleMode);
                    setShowZoneModal(true);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 32px rgba(24,31,42,0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 24px rgba(24,31,42,0.18)';
                  }}
                >
                  {/* Status indicator */}
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: pumpIndex === zone.zone_id - 1 ? '#00bcd4' :
                               zone.mode === 'disabled' ? '#666' : 
                               zone.mode === 'active' ? '#4caf50' : '#666',
                    border: '2px solid #232b3b'
                  }} />
                  
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '12px'
                  }}>
                    <span style={{
                      color: '#00bcd4',
                      fontWeight: 700,
                      fontSize: '18px'
                    }}>
                      Zone {zone.zone_id}
                    </span>
                    <span style={{
                      color: pumpIndex === zone.zone_id - 1 ? '#00bcd4' :
                             zone.mode === 'disabled' ? '#666' : 
                             zone.mode === 'active' ? '#4caf50' : '#666',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      background: pumpIndex === zone.zone_id - 1 ? 'rgba(0, 188, 212, 0.1)' :
                                 zone.mode === 'disabled' ? 'rgba(102, 102, 102, 0.1)' : 
                                 zone.mode === 'active' ? 'rgba(76, 175, 80, 0.1)' : 
                                 'rgba(102, 102, 102, 0.1)',
                      border: `1px solid ${pumpIndex === zone.zone_id - 1 ? '#00bcd4' :
                                       zone.mode === 'disabled' ? '#666' : 
                                       zone.mode === 'active' ? '#4caf50' : '#666'}`
                    }}>
                      {pumpIndex === zone.zone_id - 1 ? 'PUMP' : (zone.mode === 'active' ? 'Active' : 'Disabled')}
                    </span>
                  </div>

                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '14px',
                    marginBottom: '8px'
                  }}>
                    GPIO: {gpioPins[zone.zone_id - 1] || 'N/A'}
                  </div>

                  {pumpIndex !== zone.zone_id - 1 && (
                    <div style={{
                      color: '#bdbdbd',
                      fontSize: '14px',
                      marginBottom: '8px'
                    }}>
                      Period: {periodObj.label} ({zone.cycles} cycle{zone.cycles !== 1 ? 's' : ''})
                    </div>
                  )}

                  {zone.comment && (
                    <div style={{
                      color: '#888',
                      fontSize: '13px',
                      fontStyle: 'italic',
                      marginTop: '8px'
                    }}>
                      "{zone.comment}"
                    </div>
                  )}


                </div>
              );
            })}
          </div>
        </div>

        {/* Zone Configuration Modal */}
        {showZoneModal && selectedZone && (
          <div style={{
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
          }}>
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
              border: '1px solid #1a1f2a',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
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

              {pumpIndex === selectedZone.zone_id - 1 ? (
                <div style={{
                  color: '#bdbdbd',
                  padding: '16px',
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  fontSize: '14px',
                  textAlign: 'center'
                }}>
                  This zone is configured as the pump and does not require scheduling.
                </div>
              ) : (
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
                      onChange={(e) => {
                        const newPeriod = e.target.value;
                        const newPeriodObj = PERIODS.find(p => p.code === newPeriod);
                        
                        // Ensure times array matches the new period requirements
                        const currentTimes = selectedZone.times || [defaultTime()];
                        let newTimes = [...currentTimes];
                        let newCycles = selectedZone.cycles;
                        
                        if (newPeriod === 'daily') {
                          // Daily: times array should match cycles count
                          if (newTimes.length !== newCycles) {
                            if (newCycles > newTimes.length) {
                              // Add more time slots
                              for (let j = newTimes.length; j < newCycles; j++) {
                                newTimes.push({ start_time: '', duration: '' });
                              }
                            } else {
                              // Remove excess time slots
                              newTimes = newTimes.slice(0, newCycles);
                            }
                          }
                        } else {
                          // Weekly/Monthly: enforce cycle limits and use 1 time slot
                          if (newPeriodObj && newCycles > newPeriodObj.maxCycles) {
                            newCycles = newPeriodObj.maxCycles;
                          }
                          newTimes = [currentTimes[0] || { start_time: '', duration: '' }];
                        }
                        
                        setSelectedZone({ 
                          ...selectedZone, 
                          period: newPeriod, 
                          cycles: newCycles,
                          times: newTimes 
                        });
                      }}
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
                      max={PERIODS.find(p => p.code === selectedZone.period)?.maxCycles || 10}
                      value={selectedZone.cycles}
                      onChange={(e) => {
                        const newCycles = parseInt(e.target.value);
                        // Ensure times array matches the new cycle count
                        const currentTimes = selectedZone.times || [defaultTime()];
                        let newTimes = [...currentTimes];
                        
                        if (newCycles > currentTimes.length) {
                          // Add more time slots
                          const additionalSlots = newCycles - currentTimes.length;
                          for (let j = 0; j < additionalSlots; j++) {
                            newTimes.push({ start_time: '', duration: '' });
                          }
                        } else if (newCycles < currentTimes.length) {
                          // Remove excess time slots
                          newTimes = currentTimes.slice(0, newCycles);
                        }
                        
                        setSelectedZone({ 
                          ...selectedZone, 
                          cycles: newCycles, 
                          times: newTimes 
                        });
                      }}
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
                      justifyContent: 'space-between'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        <span>⏰</span>
                        Schedule Times:
                      </div>
                      
                      {/* Schedule Mode Slider */}
                      {selectedZone.mode === 'active' && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}>
                          <span style={{
                            color: scheduleMode === 'smart' ? '#00bcd4' : '#666',
                            fontSize: '12px',
                            fontWeight: scheduleMode === 'smart' ? 600 : 500
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
                            onClick={() => setScheduleMode(scheduleMode === 'manual' ? 'smart' : 'manual')}
                          >
                            <div style={{
                              width: '16px',
                              height: '16px',
                              background: scheduleMode === 'smart' ? '#00bcd4' : '#666',
                              borderRadius: '50%',
                              position: 'absolute',
                              top: '1px',
                              left: scheduleMode === 'smart' ? '1px' : '23px',
                              transition: 'all 0.2s'
                            }} />
                          </div>
                          <span style={{
                            color: scheduleMode === 'manual' ? '#00bcd4' : '#666',
                            fontSize: '12px',
                            fontWeight: scheduleMode === 'manual' ? 600 : 500
                          }}>Manual</span>
                        </div>
                      )}
                                        </div>
                    
                    {/* Schedule Times - Only show for manual mode */}
                    {selectedZone.mode === 'active' && scheduleMode === 'manual' && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        {/* Always use times array for consistency */}
                        {(selectedZone.times || []).map((time: any, timeIdx: number) => (
                          <div key={timeIdx} style={{
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'center'
                          }}>
                            <div style={{
                              color: '#bdbdbd',
                              fontSize: '12px',
                              minWidth: '60px'
                            }}>
                              {selectedZone.period === 'daily' ? `Time ${timeIdx + 1}:` : 'Time:'}
                            </div>
                                                                                        <div style={{ position: 'relative' }}>
                                <input
                                  type="text"
                                  placeholder="Time (HH:MM or SUNRISE/SUNSET)"
                                  value={time.start_time || time.value || ''}
                                  onChange={(e) => {
                                    const newTimes = [...(selectedZone.times || [])];
                                    newTimes[timeIdx] = { 
                                      ...newTimes[timeIdx], 
                                      start_time: e.target.value, 
                                      value: e.target.value 
                                    };
                                    setSelectedZone({ ...selectedZone, times: newTimes });
                                  }}
                                  onFocus={() => {
                                    // Show time picker when input is focused
                                    setSelectedZone((prev: any) => ({
                                      ...prev,
                                      showTimePicker: timeIdx
                                    }));
                                  }}
                                  style={{
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #1a1f2a',
                                    background: '#232b3b',
                                    color: '#f4f4f4',
                                    fontSize: '14px',
                                    fontFamily: 'monospace',
                                    cursor: 'pointer'
                                  }}
                                />
                                
                                {/* Time Picker Modal */}
                                {selectedZone.showTimePicker === timeIdx && (
                                  <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    zIndex: 1000,
                                    background: '#2a3441',
                                    borderRadius: '8px',
                                    border: '1px solid #444',
                                    padding: '12px',
                                    minWidth: '280px',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      gap: '8px',
                                      marginBottom: '12px'
                                    }}>
                                      {/* Solar Time Column */}
                                      <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        minWidth: '80px'
                                      }}>
                                        <div style={{
                                          fontSize: '12px',
                                          color: '#00bcd4',
                                          fontWeight: 600,
                                          marginBottom: '4px',
                                          textAlign: 'center'
                                        }}>
                                          Solar
                                        </div>
                                        {['SUNRISE', 'SUNSET', 'ZENITH'].map(solarTime => (
                                          <button
                                            key={solarTime}
                                            onClick={() => {
                                              // Toggle solar mode and set selected time
                                              setSelectedZone((prev: any) => {
                                                const isCurrentlySelected = prev.selectedSolarTime === solarTime;
                                                const isSolarModeOn = prev.solarMode;
                                                
                                                if (isCurrentlySelected && isSolarModeOn) {
                                                  // If clicking the same solar time and solar mode is on, turn it off
                                                  return {
                                                    ...prev,
                                                    selectedSolarTime: null,
                                                    solarMode: false
                                                  };
                                                } else {
                                                  // Otherwise, turn solar mode on and select this time
                                                  return {
                                                    ...prev,
                                                    selectedSolarTime: solarTime,
                                                    solarMode: true
                                                  };
                                                }
                                              });
                                            }}
                                            style={{
                                              padding: '6px 8px',
                                              borderRadius: '4px',
                                              border: '1px solid #444',
                                              background: selectedZone.selectedSolarTime === solarTime && selectedZone.solarMode ? '#00bcd4' : '#1a1f2a',
                                              color: selectedZone.selectedSolarTime === solarTime && selectedZone.solarMode ? '#000' : '#f4f4f4',
                                              fontSize: '12px',
                                              cursor: 'pointer',
                                              textAlign: 'center',
                                              transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                              if (selectedZone.selectedSolarTime !== solarTime || !selectedZone.solarMode) {
                                                e.currentTarget.style.background = '#00bcd4';
                                                e.currentTarget.style.color = '#000';
                                              }
                                            }}
                                            onMouseLeave={(e) => {
                                              if (selectedZone.selectedSolarTime !== solarTime || !selectedZone.solarMode) {
                                                e.currentTarget.style.background = '#1a1f2a';
                                                e.currentTarget.style.color = '#f4f4f4';
                                              }
                                            }}
                                          >
                                            {solarTime === 'SUNRISE' ? '🌅' : 
                                             solarTime === 'SUNSET' ? '🌇' : '☀️'} {solarTime}
                                          </button>
                                        ))}
                                      </div>
                                      
                                      {/* Clock Time Column or Offset Options */}
                                      <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        flex: 1
                                      }}>
                                        <div style={{
                                          fontSize: '12px',
                                          color: '#00bcd4',
                                          fontWeight: 600,
                                          marginBottom: '4px',
                                          textAlign: 'center'
                                        }}>
                                          {selectedZone.solarMode ? 'Offset' : 'Clock'}
                                        </div>
                                        
                                        {selectedZone.solarMode ? (
                                          /* Offset Options */
                                          <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '4px'
                                          }}>
                                            {/* Exact Time Button */}
                                            <button
                                              onClick={() => {
                                                const newTimes = [...(selectedZone.times || [])];
                                                newTimes[timeIdx] = { 
                                                  ...newTimes[timeIdx], 
                                                  start_time: selectedZone.selectedSolarTime, 
                                                  value: selectedZone.selectedSolarTime 
                                                };
                                                setSelectedZone({ 
                                                  ...selectedZone, 
                                                  times: newTimes,
                                                  showTimePicker: null,
                                                  selectedSolarTime: null,
                                                  solarMode: false
                                                });
                                              }}
                                              style={{
                                                padding: '6px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid #444',
                                                background: '#1a1f2a',
                                                color: '#f4f4f4',
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                textAlign: 'center',
                                                transition: 'all 0.2s'
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.background = '#00bcd4';
                                                e.currentTarget.style.color = '#000';
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.background = '#1a1f2a';
                                                e.currentTarget.style.color = '#f4f4f4';
                                              }}
                                            >
                                              Exact {selectedZone.selectedSolarTime}
                                            </button>
                                            
                                            {/* Offset Presets */}
                                            <div style={{
                                              display: 'grid',
                                              gridTemplateColumns: 'repeat(2, 1fr)',
                                              gap: '4px'
                                            }}>
                                              {[-60, -30, -15, -5, 5, 15, 30, 60].map(offset => (
                                                <button
                                                  key={offset}
                                                  onClick={() => {
                                                    const sign = offset > 0 ? '+' : '';
                                                    const newTimes = [...(selectedZone.times || [])];
                                                    newTimes[timeIdx] = { 
                                                      ...newTimes[timeIdx], 
                                                      start_time: `${selectedZone.selectedSolarTime}${sign}${offset}`, 
                                                      value: `${selectedZone.selectedSolarTime}${sign}${offset}` 
                                                    };
                                                    setSelectedZone({ 
                                                      ...selectedZone, 
                                                      times: newTimes,
                                                      showTimePicker: null,
                                                      selectedSolarTime: null
                                                    });
                                                  }}
                                                  style={{
                                                    padding: '4px 6px',
                                                    borderRadius: '3px',
                                                    border: '1px solid #444',
                                                    background: '#1a1f2a',
                                                    color: '#f4f4f4',
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    transition: 'all 0.2s'
                                                  }}
                                                  onMouseEnter={(e) => {
                                                    e.currentTarget.style.background = '#00bcd4';
                                                    e.currentTarget.style.color = '#000';
                                                  }}
                                                  onMouseLeave={(e) => {
                                                    e.currentTarget.style.background = '#1a1f2a';
                                                    e.currentTarget.style.color = '#f4f4f4';
                                                  }}
                                                >
                                                  {offset > 0 ? '+' : ''}{offset}m
                                                </button>
                                              ))}
                                            </div>
                                            
                                            {/* Custom Offset Input */}
                                            <div style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px'
                                            }}>
                                              <input
                                                type="number"
                                                placeholder="Custom ±min"
                                                min="-120"
                                                max="120"
                                                style={{
                                                  flex: 1,
                                                  padding: '4px 6px',
                                                  borderRadius: '3px',
                                                  border: '1px solid #444',
                                                  background: '#1a1f2a',
                                                  color: '#f4f4f4',
                                                  fontSize: '11px',
                                                  textAlign: 'center'
                                                }}
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') {
                                                    const offset = e.currentTarget.value;
                                                    if (offset && offset !== '0') {
                                                      const sign = parseInt(offset) > 0 ? '+' : '';
                                                      const newTimes = [...(selectedZone.times || [])];
                                                      newTimes[timeIdx] = { 
                                                        ...newTimes[timeIdx], 
                                                        start_time: `${selectedZone.selectedSolarTime}${sign}${offset}`, 
                                                        value: `${selectedZone.selectedSolarTime}${sign}${offset}` 
                                                      };
                                                      setSelectedZone({ 
                                                        ...selectedZone, 
                                                        times: newTimes,
                                                        showTimePicker: null,
                                                        selectedSolarTime: null
                                                      });
                                                    }
                                                  }
                                                }}
                                              />
                                              <button
                                                onClick={(e) => {
                                                  const offsetInput = e.currentTarget.previousElementSibling as HTMLInputElement;
                                                  const offset = offsetInput.value;
                                                  if (offset && offset !== '0') {
                                                    const sign = parseInt(offset) > 0 ? '+' : '';
                                                    const newTimes = [...(selectedZone.times || [])];
                                                    newTimes[timeIdx] = { 
                                                      ...newTimes[timeIdx], 
                                                      start_time: `${selectedZone.selectedSolarTime}${sign}${offset}`, 
                                                      value: `${selectedZone.selectedSolarTime}${sign}${offset}` 
                                                    };
                                                    setSelectedZone({ 
                                                      ...selectedZone, 
                                                      times: newTimes,
                                                      showTimePicker: null,
                                                      selectedSolarTime: null
                                                    });
                                                  }
                                                }}
                                                style={{
                                                  padding: '4px 8px',
                                                  borderRadius: '3px',
                                                  border: '1px solid #444',
                                                  background: '#00bcd4',
                                                  color: '#000',
                                                  fontSize: '11px',
                                                  cursor: 'pointer',
                                                  fontWeight: 'bold'
                                                }}
                                              >
                                                Apply
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          /* Clock Time Grid */
                                          <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(3, 1fr)',
                                            gap: '4px',
                                            maxHeight: '120px',
                                            overflowY: 'auto'
                                          }}>
                                            {Array.from({ length: 24 }, (_, hour) => 
                                              Array.from({ length: 4 }, (_, minute) => {
                                                const timeStr = `${hour.toString().padStart(2, '0')}:${(minute * 15).toString().padStart(2, '0')}`;
                                                return (
                                                  <button
                                                    key={timeStr}
                                                    onClick={() => {
                                                      const newTimes = [...(selectedZone.times || [])];
                                                      newTimes[timeIdx] = { 
                                                        ...newTimes[timeIdx], 
                                                        start_time: timeStr, 
                                                        value: timeStr 
                                                      };
                                                      setSelectedZone({ 
                                                        ...selectedZone, 
                                                        times: newTimes,
                                                        showTimePicker: null 
                                                      });
                                                    }}
                                                    style={{
                                                      padding: '4px 6px',
                                                      borderRadius: '3px',
                                                      border: '1px solid #444',
                                                      background: '#1a1f2a',
                                                      color: '#f4f4f4',
                                                      fontSize: '11px',
                                                      cursor: 'pointer',
                                                      textAlign: 'center',
                                                      transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={(e) => {
                                                      e.currentTarget.style.background = '#00bcd4';
                                                      e.currentTarget.style.color = '#000';
                                                    }}
                                                    onMouseLeave={(e) => {
                                                      e.currentTarget.style.background = '#1a1f2a';
                                                      e.currentTarget.style.color = '#f4f4f4';
                                                    }}
                                                  >
                                                    {timeStr}
                                                  </button>
                                                );
                                              })
                                            ).flat()}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Close button */}
                                    <button
                                      onClick={() => setSelectedZone((prev: any) => ({
                                        ...prev,
                                        showTimePicker: null
                                      }))}
                                      style={{
                                        width: '100%',
                                        padding: '6px',
                                        borderRadius: '4px',
                                        border: '1px solid #666',
                                        background: '#1a1f2a',
                                        color: '#888',
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Close
                                    </button>
                                  </div>
                                )}
                              </div>
                              
                              {(time.start_time || time.value) && (
                                <div style={{
                                  fontSize: '11px',
                                  color: '#888',
                                  marginTop: '2px'
                                }}>
                                  {(time.start_time || time.value).toUpperCase() === 'SUNRISE' || 
                                   (time.start_time || time.value).toUpperCase() === 'SUNSET' ||
                                   (time.start_time || time.value).toUpperCase() === 'ZENITH' ? 
                                   '🌅 Solar time' : '⏰ Clock time'}
                                </div>
                              )}
                            <input
                              type="number"
                              placeholder="HHMM"
                              value={time.duration || ''}
                              onChange={(e) => {
                                const newTimes = [...(selectedZone.times || [])];
                                newTimes[timeIdx] = { 
                                  ...newTimes[timeIdx], 
                                  duration: e.target.value 
                                };
                                setSelectedZone({ ...selectedZone, times: newTimes });
                              }}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '6px',
                                border: '1px solid #1a1f2a',
                                background: '#232b3b',
                                color: '#f4f4f4',
                                fontSize: '14px',
                                width: '120px'
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Smart Mode Message */}
                    {selectedZone.mode === 'active' && scheduleMode === 'smart' && (
                      <div style={{
                        padding: '16px',
                        background: '#232b3b',
                        borderRadius: '8px',
                        border: '1px solid #1a1f2a',
                        textAlign: 'center'
                      }}>
                        <div style={{
                          color: '#00bcd4',
                          fontSize: '14px',
                          fontWeight: 600,
                          marginBottom: '8px'
                        }}>
                          Smart Scheduling Enabled
                        </div>
                        <div style={{
                          color: '#bdbdbd',
                          fontSize: '13px'
                        }}>
                          Schedule times will be automatically calculated based on plant requirements.
                        </div>
                      </div>
                    )}
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
                      onClick={handleModalSave}
                      disabled={saving}
                      style={{
                        padding: '12px 20px',
                        borderRadius: '8px',
                        border: '1px solid #00bcd4',
                        background: saving ? '#666' : '#00bcd4',
                        color: saving ? '#888' : '#000',
                        fontSize: '14px',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        fontWeight: 600
                      }}
                    >
                      {saving ? 'Saving...' : 'Save & Continue'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 