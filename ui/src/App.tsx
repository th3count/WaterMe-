import { Routes, Route, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import ZoneSetup from './ZoneSetup';
import ZoneSchedule from './ZoneSchedule';
import LocationsCreate from './LocationsCreate';
import Plants from './Plants';
import GardenOverview from './GardenOverview';
import Health from './Health';
import Library from './Library';
import Logs from './Logs';
import Settings from './Settings';
import Sidebar from './Sidebar';

const OPENCAGE_API_KEY = '2e52d2925b4a4575a786f4ba0ae2b6cc';

const TIMEZONES = [
  "America/Regina",
  "America/Winnipeg",
  "America/Toronto",
  "America/Vancouver",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney"
  // ...add more as needed
];

function CreateGarden() {
  const [gardenName, setGardenName] = useState('');
  const [location, setLocation] = useState('');
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [mode, setMode] = useState<'manual' | 'smart'>('manual');
  const [error, setError] = useState('');
  const [created, setCreated] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const navigate = useNavigate();
  const [timezone, setTimezone] = useState('America/Regina');
  const [currentTime, setCurrentTime] = useState(DateTime.now().setZone(timezone).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS));
  const [timerMultiplier, setTimerMultiplier] = useState(1.0);
  
  // GPIO Configuration state
  const [zoneCount, setZoneCount] = useState(1);
  const [pins, setPins] = useState<number[]>([2]);
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [activeLow, setActiveLow] = useState(true);
  const [gpioLoading, setGpioLoading] = useState(true);
  const [gpioError, setGpioError] = useState('');
  const [gpioSaving, setGpioSaving] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(DateTime.now().setZone(timezone).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS));
    }, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  // Load existing GPIO configuration
  useEffect(() => {
    const loadGPIOConfig = async () => {
      try {
        console.log('Loading GPIO config...');
        const resp = await fetch('http://127.0.0.1:5000/config/gpio.cfg');
        console.log('GPIO config response status:', resp.status);
        if (resp.ok) {
          const config = await resp.json();
          console.log('Loaded GPIO config:', config);
          setZoneCount(config.zoneCount || 1);
          setPins(config.pins || [2]);
          // Convert 1-based pump index from config to 0-based for frontend
          setPumpIndex(config.pumpIndex !== undefined && config.pumpIndex > 0 ? config.pumpIndex - 1 : null);
          setActiveLow(config.activeLow !== undefined ? config.activeLow : true);
          console.log('GPIO config loaded successfully');
        } else {
          console.error('Failed to load GPIO config, status:', resp.status);
        }
      } catch (err) {
        console.error('Error loading GPIO config:', err);
        console.log('No existing GPIO config found, using defaults');
      } finally {
        setGpioLoading(false);
      }
    };
    
    loadGPIOConfig();
  }, []);

  // Load existing garden configuration
  useEffect(() => {
    const loadGardenConfig = async () => {
      try {
        const resp = await fetch('http://127.0.0.1:5000/config/settings.cfg');
        if (resp.ok) {
          const config = await resp.json();
          setGardenName(config.name || config.garden_name || '');
          setLocation(config.city || config.location || '');
          setCoords(config.gps_lat && config.gps_lon ? [config.gps_lon, config.gps_lat] : null);
          setMode(config.mode || 'manual');
          setTimezone(config.timezone || 'America/Regina');
          setTimerMultiplier(config.timer_multiplier || 1.0);
          
          // Auto-geocode if location exists but no coordinates
          if ((config.city || config.location) && !(config.gps_lat && config.gps_lon)) {
            const locationToSearch = config.city || config.location;
            setLocation(locationToSearch);
            // Trigger geocoding after a short delay to ensure state is set
            setTimeout(() => {
              geocodeLocation();
            }, 100);
          }
        }
      } catch (err) {
        console.log('No existing garden config found, using defaults');
      }
    };
    
    loadGardenConfig();
  }, []);

  // GPIO helper functions
  const handleZoneCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let count = Math.max(1, Math.min(8, Number(e.target.value)));
    setZoneCount(count);
    setPins((prev) => {
      let next = prev.slice(0, count);
      while (next.length < count) next.push(2);
      return next;
    });
    setPumpIndex((prev) => (prev !== null && prev >= count ? null : prev));
  };

  const handlePinChange = (idx: number, value: number) => {
    setPins((prev) => prev.map((p, i) => (i === idx ? value : p)));
  };

  const handlePumpChange = (idx: number) => {
    setPumpIndex(idx === pumpIndex ? null : idx);
  };

  const pinsAreUnique = pins.length === new Set(pins).size;
  const pinsAreValid = pins.every(pin => [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27].includes(pin));

  const handleGPIOSave = async () => {
    setGpioError('');
    if (!pinsAreUnique) {
      setGpioError('Each zone must use a unique GPIO pin.');
      return;
    }
    if (!pinsAreValid) {
      setGpioError('Invalid GPIO pin selected.');
      return;
    }
    setGpioSaving(true);
    try {
      // Convert 0-based pump index back to 1-based for config
      const configPumpIndex = pumpIndex !== null ? pumpIndex + 1 : 0;
      const config = { zoneCount, pins, pumpIndex: configPumpIndex, activeLow };
      console.log('Saving GPIO config:', config);
      const resp = await fetch('http://127.0.0.1:5000/api/gpio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error('Failed to save GPIO config');
      setGpioError('');
      console.log('GPIO config saved successfully');
    } catch (err) {
      console.error('Failed to save GPIO config:', err);
      setGpioError('Failed to save GPIO config.');
    }
    setGpioSaving(false);
  };

  const handleSaveGarden = async () => {
    if (!gardenName.trim()) {
      setError('Please enter a garden name.');
      return;
    }
    if (!coords) {
      setError('Please search for a valid location.');
      return;
    }
    setError('');
    setCreated(true);

    // Prepare the config object in the format expected by settings.cfg
    const config = {
      name: gardenName,
      city: location,
      gps_lat: coords[1],
      gps_lon: coords[0],
      mode,
      timezone,
      timer_multiplier: timerMultiplier,
    };

    try {
      const resp = await fetch('http://127.0.0.1:5000/api/garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error('Failed to save config');
      setError('');
      console.log('Garden settings saved successfully');
      // Show success message briefly
      setTimeout(() => {
        setCreated(false);
      }, 1000);
    } catch (err) {
      console.error('Failed to save garden config:', err);
      setError('Failed to save garden config.');
      setCreated(false);
    }
  };

  const geocodeLocation = async () => {
    if (!location.trim()) return;
    setGeoLoading(true);
    try {
      const resp = await fetch(
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(location)}&key=${OPENCAGE_API_KEY}`
      );
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const { lat, lng } = data.results[0].geometry;
        setCoords([lng, lat]);
        setError('');
      } else {
        setError('Location not found.');
      }
    } catch {
      setError('Error looking up location.');
    }
    setGeoLoading(false);
  };

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
          {/* Garden Settings Section */}
          <div style={{
            background: '#232b3b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            border: '1px solid #1a1f2a'
          }}>
            <h2 style={{
              color: '#00bcd4',
              fontWeight: 600,
              margin: '0 0 16px 0'
            }}>Garden Settings</h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Garden Name:
                </label>
                <input
                  type="text"
                  value={gardenName}
                  onChange={e => setGardenName(e.target.value)}
                  placeholder="My Garden"
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
              
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Location:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="Search for a city..."
                    style={{
                      background: '#1a1f2a',
                      color: '#f4f4f4',
                      border: '1px solid #00bcd4',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      flex: 1,
                      boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={geocodeLocation}
                    disabled={!location.trim() || geoLoading}
                    style={{
                      background: geoLoading ? '#666' : '#00bcd4',
                      color: '#181f2a',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      cursor: geoLoading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      minWidth: '100px',
                      opacity: geoLoading ? 0.6 : 1
                    }}
                  >
                    {geoLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>
                {coords && (
                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '12px',
                    marginTop: '8px'
                  }}>
                    Found: {coords[1].toFixed(4)}, {coords[0].toFixed(4)}
                  </div>
                )}
              </div>
              
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
                <div style={{ display: 'flex', gap: '16px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#f4f4f4',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="radio"
                      checked={mode === 'manual'}
                      onChange={() => setMode('manual')}
                      style={{ cursor: 'pointer' }}
                    />
                    Manual
                  </label>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#666',
                    cursor: 'not-allowed'
                  }}>
                    <input
                      type="radio"
                      checked={mode === 'smart'}
                      disabled
                      style={{ cursor: 'not-allowed' }}
                    />
                    Smart (coming soon)
                  </label>
                </div>
              </div>
              
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Timezone:
                </label>
                <select
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
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
                >
                  {TIMEZONES.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label style={{
                  color: mode === 'smart' ? '#f4f4f4' : '#666',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Timer Multiplier (Smart Mode):
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="number"
                    value={timerMultiplier}
                    onChange={e => setTimerMultiplier(Math.max(0.1, Math.min(10.0, parseFloat(e.target.value) || 1.0)))}
                    step="0.1"
                    min="0.1"
                    max="10.0"
                    disabled={mode === 'manual'}
                    style={{
                      background: mode === 'manual' ? '#1a1f2a' : '#1a1f2a',
                      color: mode === 'manual' ? '#666' : '#f4f4f4',
                      border: mode === 'manual' ? '1px solid #444' : '1px solid #00bcd4',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '14px',
                      width: '120px',
                      boxSizing: 'border-box',
                      cursor: mode === 'manual' ? 'not-allowed' : 'text'
                    }}
                  />
                  <span style={{
                    color: mode === 'manual' ? '#666' : '#bdbdbd',
                    fontSize: '14px'
                  }}>
                    {mode === 'manual' ? 'Disabled in manual mode' :
                     timerMultiplier === 1.0 ? 'Normal watering' : 
                     timerMultiplier > 1.0 ? `${timerMultiplier}x more water` : 
                     `${timerMultiplier}x less water`}
                  </span>
                </div>
                <div style={{
                  color: mode === 'manual' ? '#666' : '#888',
                  fontSize: '12px',
                  marginTop: '4px'
                }}>
                  {mode === 'manual' ? 
                    'Timer multiplier is only available in smart mode for automated watering adjustments.' :
                    'Adjusts all watering durations globally. 1.0 = normal, 2.0 = double water, 0.5 = half water'
                  }
                </div>
              </div>
              
              <div style={{
                color: '#bdbdbd',
                fontSize: '14px',
                marginBottom: '16px'
              }}>
                Current time: {currentTime}
              </div>
              
              {/* Well Water Management Settings - Future Feature */}
              <div style={{
                borderTop: '1px solid #444',
                paddingTop: '20px',
                marginTop: '20px'
              }}>
                <h3 style={{
                  color: '#888',
                  fontWeight: 600,
                  margin: '0 0 16px 0',
                  fontSize: '16px'
                }}>
                  Well Water Management (Coming Soon)
                </h3>
                <div style={{
                  color: '#666',
                  fontSize: '13px',
                  marginBottom: '16px',
                  fontStyle: 'italic'
                }}>
                  These settings will help manage water flow for well systems by limiting total GPH usage and tracking reservoir capacity.
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label style={{
                      color: '#666',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'block'
                    }}>
                      Max Flow Rate (GPH):
                    </label>
                    <input
                      type="number"
                      disabled
                      placeholder="e.g., 500"
                      style={{
                        background: '#1a1f2a',
                        color: '#666',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        width: '120px',
                        boxSizing: 'border-box',
                        opacity: 0.5
                      }}
                    />
                    <div style={{
                      color: '#555',
                      fontSize: '12px',
                      marginTop: '4px'
                    }}>
                      Maximum gallons per hour your well can safely provide
                    </div>
                  </div>
                  
                  <div>
                    <label style={{
                      color: '#666',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'block'
                    }}>
                      Reservoir Size (Gallons):
                    </label>
                    <input
                      type="number"
                      disabled
                      placeholder="e.g., 1000"
                      style={{
                        background: '#1a1f2a',
                        color: '#666',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        width: '120px',
                        boxSizing: 'border-box',
                        opacity: 0.5
                      }}
                    />
                    <div style={{
                      color: '#555',
                      fontSize: '12px',
                      marginTop: '4px'
                    }}>
                      Capacity of your water storage tank
                    </div>
                  </div>
                  
                  <div>
                    <label style={{
                      color: '#666',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'block'
                    }}>
                      Recharge Time (Minutes):
                    </label>
                    <input
                      type="number"
                      disabled
                      placeholder="e.g., 120"
                      style={{
                        background: '#1a1f2a',
                        color: '#666',
                        border: '1px solid #444',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        width: '120px',
                        boxSizing: 'border-box',
                        opacity: 0.5
                      }}
                    />
                    <div style={{
                      color: '#555',
                      fontSize: '12px',
                      marginTop: '4px'
                    }}>
                      Time needed for reservoir to refill after depletion
                    </div>
                  </div>
                </div>
              </div>
              
              {error && (
                <div style={{
                  color: '#ff512f',
                  fontSize: '14px',
                  marginBottom: '16px'
                }}>
                  {error}
                </div>
              )}
              
              <button
                onClick={handleSaveGarden}
                disabled={!gardenName.trim() || !coords || created}
                style={{
                  background: (!gardenName.trim() || !coords || created) ? '#666' : '#00bcd4',
                  color: '#181f2a',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px 24px',
                  cursor: (!gardenName.trim() || !coords || created) ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 600,
                  width: '100%',
                  opacity: (!gardenName.trim() || !coords || created) ? 0.6 : 1
                }}
              >
                {created ? 'Saved!' : 'Save Garden Settings'}
              </button>
            </div>
          </div>

          {/* GPIO Configuration Section */}
          <div style={{
            background: '#232b3b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            border: '1px solid #1a1f2a'
          }}>
            <h2 style={{
              color: '#00bcd4',
              fontWeight: 600,
              margin: '0 0 16px 0'
            }}>GPIO Configuration</h2>
            
            {gpioLoading ? (
              <div style={{ color: '#00bcd4', fontSize: '16px' }}>Loading GPIO configuration...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{
                    color: '#f4f4f4',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    display: 'block'
                  }}>
                    How many zones/relays?
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={zoneCount}
                      onChange={handleZoneCountChange}
                      style={{
                        background: '#1a1f2a',
                        color: '#f4f4f4',
                        border: '1px solid #00bcd4',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        width: '80px',
                        marginLeft: '8px',
                        boxSizing: 'border-box'
                      }}
                    />
                  </label>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Array.from({ length: zoneCount }).map((_, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      padding: '12px',
                      background: '#1a1f2a',
                      borderRadius: '8px',
                      border: '1px solid #2d3748'
                    }}>
                      <label style={{
                        color: '#f4f4f4',
                        fontSize: '14px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        Zone {idx + 1} GPIO Pin:
                        <select
                          value={pins[idx]}
                          onChange={e => handlePinChange(idx, Number(e.target.value))}
                          style={{
                            background: '#232b3b',
                            color: '#f4f4f4',
                            border: '1px solid #00bcd4',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '14px',
                            width: '100px'
                          }}
                        >
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27].map(pin => (
                            <option key={pin} value={pin}>{pin}</option>
                          ))}
                        </select>
                      </label>
                      {idx === zoneCount - 1 && (
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          color: '#f4f4f4',
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={pumpIndex === idx}
                            onChange={() => handlePumpChange(idx)}
                            style={{ cursor: 'pointer' }}
                          />
                          Is pump
                        </label>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Active Low Setting */}
                <div style={{
                  padding: '16px',
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  border: '1px solid #2d3748',
                  marginTop: '8px'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#f4f4f4',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}>
                    <input
                      type="checkbox"
                      checked={activeLow}
                      onChange={(e) => setActiveLow(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Active Low (relays activate when GPIO is LOW)
                  </label>
                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '12px',
                    marginTop: '8px',
                    marginLeft: '24px'
                  }}>
                    Most relay modules are active low. When checked, relays turn ON when GPIO pin is set to LOW (0V).
                  </div>
                </div>
                
                {gpioError && (
                  <div style={{
                    color: '#ff512f',
                    fontSize: '14px',
                    margin: '12px 0'
                  }}>
                    {gpioError}
                  </div>
                )}
                
                <button
                  onClick={handleGPIOSave}
                  disabled={gpioSaving || !pinsAreUnique || !pinsAreValid}
                  style={{
                    background: (gpioSaving || !pinsAreUnique || !pinsAreValid) ? '#666' : '#00bcd4',
                    color: '#181f2a',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '12px 24px',
                    cursor: (gpioSaving || !pinsAreUnique || !pinsAreValid) ? 'not-allowed' : 'pointer',
                    fontSize: '16px',
                    fontWeight: 600,
                    width: '100%',
                    opacity: (gpioSaving || !pinsAreUnique || !pinsAreValid) ? 0.6 : 1
                  }}
                >
                  {gpioSaving ? 'Saving...' : 'Save GPIO Configuration'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="page-container">
      <Sidebar />
      <Routes>
        <Route path="/" element={<GardenOverview />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/zones" element={<ZoneSchedule />} />
        <Route path="/zoneschedule" element={<ZoneSchedule />} />
        <Route path="/locations" element={<LocationsCreate />} />
        <Route path="/plants" element={<Plants />} />
        <Route path="/library" element={<Library />} />
        <Route path="/health" element={<Health />} />
        <Route path="/logs" element={<Logs />} />
      </Routes>
    </div>
  );
}

export default App;
