import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from './utils';
import { useFormLayer } from '../../core/useFormLayer';
import ZoneForm from './forms/zones.form';

const PERIODS = [
  { label: 'Daily', code: 'D', maxCycles: 10 },
  { label: 'Weekly', code: 'W', maxCycles: 6 },
  { label: 'Monthly', code: 'M', maxCycles: 3 },
  { label: 'Specific (future)', code: 'S', maxCycles: 1, disabled: true },
  { label: 'Intervals (future)', code: 'I', maxCycles: 1, disabled: true }
];

function defaultTime() {
  return { start_time: '06:00', duration: '00:20:00' };
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function formatDuration(duration: string): string {
  if (!duration) return '00:20:00';
  
  // If already in HH:mm:ss format, return as is
  if (duration.includes(':') && duration.length === 8) {
    return duration;
  }
  
  // Handle legacy HHmmss format (6 digits)
  if (duration.length === 6 && !duration.includes(':')) {
    const hours = duration.substring(0, 2);
    const minutes = duration.substring(2, 4);
    const seconds = duration.substring(4, 6);
    return `${hours}:${minutes}:${seconds}`;
  }
  
  // Default fallback
  return '00:20:00';
}

export default function ZoneSchedule() {
  const [zones, setZones] = useState<any[]>([]);
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [gpioPins, setGpioPins] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [globalSmartMode, setGlobalSmartMode] = useState(false);
  const [selectedZone, setSelectedZone] = useState<any | null>(null);
  const navigate = useNavigate();
  const { addLayer, removeLayer } = useFormLayer();

  const loadZoneData = async () => {
      try {
        // First load GPIO config to get zone count and pump index
        const gpioResp = await fetch(`${getApiBaseUrl()}/config/gpio.cfg`);
        const gpioData = await gpioResp.json();
        const zoneCount = gpioData.zoneCount || (gpioData.pins ? gpioData.pins.length : 0);
        // Convert 1-based pump index from config to 0-based for frontend
        setPumpIndex(gpioData.pumpIndex !== undefined && gpioData.pumpIndex > 0 ? gpioData.pumpIndex - 1 : null);
        setGpioPins(gpioData.pins || []);

        // Load global smart mode setting from settings.cfg
        try {
          const settingsResp = await fetch(`${getApiBaseUrl()}/config/settings.cfg`);
          if (settingsResp.ok) {
            const settingsData = await settingsResp.json();
            setGlobalSmartMode(settingsData.mode === 'smart');
            console.log('Global smart mode:', settingsData.mode === 'smart');
          }
        } catch (settingsError) {
          console.warn('Failed to load settings, defaulting to manual mode:', settingsError);
          setGlobalSmartMode(false);
        }

        // Then load existing schedule data
        const scheduleResp = await fetch(`${getApiBaseUrl()}/api/schedule`);
        console.log('Schedule response status:', scheduleResp.status);
        if (scheduleResp.ok) {
          const scheduleData = await scheduleResp.json();
          console.log('Loaded schedule data:', scheduleData);
          
          // Convert backend mode system to new UI system and filter by zoneCount
          const convertedZones = scheduleData
            .filter((zone: any) => zone.zone_id <= zoneCount) // Only show zones within zoneCount limit
            .map((zone: any) => {
              if (zone.mode === 'disabled') {
                return { ...zone, mode: 'disabled' };
              } else if (zone.mode === 'smart' || zone.mode === 'manual') {
                return { 
                  ...zone, 
                  mode: 'active',
                  scheduleMode: zone.mode // 'smart' or 'manual'
                };
              } else {
                // Handle any other modes (like 'active') by defaulting to manual
                return { 
                  ...zone, 
                  mode: 'active',
                  scheduleMode: 'manual'
                };
              }
            });
          
          // If we have fewer zones than zoneCount, create the missing ones
          const existingZoneIds = convertedZones.map((z: any) => z.zone_id);
          for (let i = 1; i <= zoneCount; i++) {
            if (!existingZoneIds.includes(i)) {
              convertedZones.push({
                zone_id: i,
                mode: 'disabled',
                period: PERIODS[0].code,
                cycles: 1,
                times: [defaultTime()],
                startDay: getTomorrow(),
                comment: '',
              });
            }
          }
          
          // Sort zones by zone_id to ensure proper order
          convertedZones.sort((a: any, b: any) => a.zone_id - b.zone_id);
          
          setZones(convertedZones);
        } else {
          console.log('API failed, trying direct file access...');
          // Try loading from the data file directly
          try {
            const fileResp = await fetch(`${getApiBaseUrl()}/data/schedule.json`);
            if (fileResp.ok) {
              const fileData = await fileResp.json();
              console.log('Loaded from file:', fileData);
              
              // Filter file data to only show zones within zoneCount limit
              const filteredZones = Object.entries(fileData)
                .filter(([zoneId]) => parseInt(zoneId) <= zoneCount)
                .map(([zoneId, zoneData]: [string, any]) => ({
                  zone_id: parseInt(zoneId),
                  ...zoneData
                }))
                .sort((a: any, b: any) => a.zone_id - b.zone_id);
              
              setZones(filteredZones);
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

  useEffect(() => {
    loadZoneData();
  }, []);







  const calculateSmartDuration = async (zoneId: number) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/scheduler/calculate-duration/${zoneId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) {
        throw new Error('Failed to calculate smart duration');
      }
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error calculating smart duration:', error);
      return null;
    }
  };

  const handleZoneFormSave = async (zoneData: any) => {
    console.log('Zone form saved:', zoneData);
    // Refresh the zones data after save
    await loadZoneData();
    removeLayer('zone-form');
  };

  const handleZoneFormCancel = () => {
    removeLayer('zone-form');
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
                  Smart
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
                  background: '#ff9800',
                  border: '2px solid #232b3b'
                }} />
                <span style={{
                  color: '#ff9800',
                  fontSize: '14px',
                  fontWeight: 600
                }}>
                  Manual
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
                           zone.mode === 'active' ? (zone.scheduleMode === 'smart' ? '2px solid #4caf50' : '2px solid #ff9800') : 
                           '1px solid #1a1f2a',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onClick={() => {
                    setSelectedZone(zone);
                    addLayer('zone-form', 'form', ZoneForm, {
                      initialData: zone,
                      zone_id: zone.zone_id,
                      pumpIndex: pumpIndex,
                      onSave: handleZoneFormSave,
                      onCancel: handleZoneFormCancel,
                      loading: saving,
                      error: error,
                      isTopLayer: true
                    });
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
                               zone.mode === 'smart' ? '#4caf50' : 
                               zone.mode === 'manual' ? '#ff9800' : '#666',
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
                             zone.mode === 'smart' ? '#4caf50' : 
                             zone.mode === 'manual' ? '#ff9800' : '#666',
                      fontSize: '12px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      padding: '4px 8px',
                      borderRadius: '4px',
                                            background: pumpIndex === zone.zone_id - 1 ? 'rgba(0, 188, 212, 0.15)' :
                                 zone.mode === 'disabled' ? 'rgba(102, 102, 102, 0.15)' :
                                 zone.mode === 'active' ? (zone.scheduleMode === 'smart' ? 'rgba(76, 175, 80, 0.15)' : 'rgba(255, 152, 0, 0.15)') : 
                                 'rgba(102, 102, 102, 0.15)',
                      border: `1px solid ${pumpIndex === zone.zone_id - 1 ? '#00bcd4' :
                                       zone.mode === 'disabled' ? '#666' : 
                                       zone.mode === 'active' ? (zone.scheduleMode === 'smart' ? '#4caf50' : '#ff9800') : '#666'}`
                    }}>
                      {pumpIndex === zone.zone_id - 1 ? 'PUMP' : 
                       zone.mode === 'disabled' ? 'Disabled' : 
                       zone.mode === 'active' ? (zone.scheduleMode === 'smart' ? 'Smart' : 'Manual') : 'Unknown'}
                    </span>
                  </div>

                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '14px',
                    marginBottom: '8px'
                  }}>
                    GPIO: {gpioPins[zone.zone_id - 1] || 'N/A'}
                  </div>

                  {pumpIndex !== zone.zone_id - 1 && zone.mode !== 'disabled' && (
                    <div style={{
                      color: '#bdbdbd',
                      fontSize: '14px',
                      marginBottom: '8px'
                    }}>
                      Period: {periodObj.label} ({zone.cycles} cycle{zone.cycles !== 1 ? 's' : ''})
                    </div>
                  )}
                  
                  {zone.mode === 'active' && (
                    <div style={{
                      color: zone.scheduleMode === 'smart' ? '#4caf50' : '#ff9800',
                      fontSize: '12px',
                      fontWeight: 600,
                      marginBottom: '4px'
                    }}>
                      {zone.scheduleMode === 'smart' ? 'Smart' : 'Manual'} Schedule
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


        
      </div>
    </div>
  );
} 