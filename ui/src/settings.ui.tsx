/**
 * settings.ui.tsx - System settings and GPIO configuration
 * 
 * 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
 * 📖 System Overview: ~/rules/system-overview.md
 * 🏗️ Project Structure: ~/rules/project-structure.md
 * 🎨 Layer System: ~/rules/layer-system.md
 * 🌐 API Patterns: ~/rules/api-patterns.md
 * 🎨 CSS Conventions: ~/rules/css-conventions.md
 * 💻 Coding Standards: ~/rules/coding-standards.md
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from './utils';

interface GardenSettings {
  garden_name: string;
  gps_lat: number;
  gps_lon: number;
  city: string;
  timezone: string;
  timer_multiplier: number;
  mode: string;
  simulate?: boolean;
}

interface GpioConfig {
  channels: { [key: string]: number };
  mode: string;
  pumpIndex?: number;
  activeLow?: boolean;
  zoneCount?: number; // Added zoneCount to GpioConfig
}

interface BackupInfo {
  files: { [key: string]: any };
  total_size_mb: number;
  backup_version: string;
}

export default function Settings() {
  // const navigate = useNavigate(); // removed as unused
  const [activeTab, setActiveTab] = useState<'garden' | 'location' | 'datetime' | 'gpio' | 'backup'>('garden');
  const [gardenSettings, setGardenSettings] = useState<GardenSettings>({
    garden_name: '',
    gps_lat: 0,
    gps_lon: 0,
    city: '',
    timezone: 'UTC',
    timer_multiplier: 1.0,
    mode: 'manual',
    simulate: false
  });
  const [gpioConfig, setGpioConfig] = useState<GpioConfig>({
    channels: {},
    mode: 'BCM',
    pumpIndex: 0,
    activeLow: true,
    zoneCount: 8
  });
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);
  const [testingZone, setTestingZone] = useState<number | null>(null);
  const [gpioStatus, setGpioStatus] = useState<any>(null);
  const [loadingGpioStatus, setLoadingGpioStatus] = useState(false);



  // Expandable sections state
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    'garden-basic': true,
    'garden-advanced': true,
    'location-settings': true,
    'datetime-timezone': true,
    'gpio-mode': true,
    'gpio-channels': true,
    'backup-info': true,
    'backup-create': true,
    'backup-restore': true,
    'gpio-pump': false // Added for pump selection
  });

  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const [gardenResp, gpioResp, backupResp] = await Promise.all([
        fetch(`${getApiBaseUrl()}/config/settings.cfg`),
        fetch(`${getApiBaseUrl()}/config/gpio.cfg`),
        fetch(`${getApiBaseUrl()}/api/backup/info`)
      ]);

      if (gardenResp.ok) {
        const gardenData = await gardenResp.json();
        setGardenSettings(gardenData);
        setCitySearch(gardenData.city || ''); // Pre-fill city search input
      } else {
        console.error('Failed to load garden settings:', gardenResp.status);
      }

      if (gpioResp.ok) {
        const gpioData = await gpioResp.json();
        setGpioConfig({
          channels: gpioData && typeof gpioData.channels === 'object' ? gpioData.channels : {},
          mode: gpioData && typeof gpioData.mode === 'string' ? gpioData.mode : 'BCM',
          pumpIndex: typeof gpioData.pumpIndex === 'number' ? gpioData.pumpIndex : 0,
          activeLow: typeof gpioData.activeLow === 'boolean' ? gpioData.activeLow : true,
          zoneCount: typeof gpioData.zoneCount === 'number' ? gpioData.zoneCount : 8 // Load zoneCount
        });
      } else {
        console.error('Failed to load GPIO config:', gpioResp.status);
        // Set default GPIO config if loading fails
        setGpioConfig({
          channels: {},
          mode: 'BCM',
          pumpIndex: 0,
          activeLow: true,
          zoneCount: 8
        });
      }

      if (backupResp.ok) {
        const backupData = await backupResp.json();
        setBackupInfo(backupData);
      } else {
        console.error('Failed to load backup info:', backupResp.status);
      }
    } catch (err) {
      setError('Failed to load settings');
      console.error('Error loading settings:', err);
      // Set default configs on error
      setGpioConfig({
        channels: {},
        mode: 'BCM',
        pumpIndex: 0,
        activeLow: true,
        zoneCount: 8
      });
    } finally {
      setLoading(false);
    }
  };

  const saveGardenSettings = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiBaseUrl()}/api/garden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gardenSettings)
      });

      if (response.ok) {
        setSuccess('Garden settings saved successfully!');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save garden settings');
      }
    } catch (err) {
      setError('Failed to save garden settings');
      console.error('Error saving garden settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const saveGpioConfig = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      // Convert channels to pins array, ensuring it matches zoneCount
      const zoneCount = gpioConfig.zoneCount ?? 8;
      const pins = [];
      for (let i = 1; i <= zoneCount; i++) {
        const pin = gpioConfig.channels?.[i.toString()] || 0;
        pins.push(pin);
      }
      const payload = {
        pins,
        zoneCount: gpioConfig.zoneCount ?? 8,
        pumpIndex: gpioConfig.pumpIndex ?? 0, // Use the selected pumpIndex
        activeLow: gpioConfig.activeLow ?? true,
        mode: gpioConfig.mode ?? 'BCM'
      };
      const response = await fetch(`${getApiBaseUrl()}/api/gpio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) {
        setSuccess('GPIO configuration saved successfully!');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to save GPIO configuration');
      }
    } catch (err) {
      setError('Failed to save GPIO configuration');
      console.error('Error saving GPIO configuration:', err);
    } finally {
      setSaving(false);
    }
  };

  const createBackup = async () => {
    try {
      setBackupLoading(true);
      setError('');
      setSuccess('');

      const response = await fetch(`${getApiBaseUrl()}/api/backup/create`, {
        method: 'POST'
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `waterme_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setSuccess('Backup created and downloaded successfully!');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to create backup');
      }
    } catch (err) {
      setError('Failed to create backup');
      console.error('Error creating backup:', err);
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreBackup = async () => {
    if (!selectedFile) {
      setError('Please select a backup file');
      return;
    }

    try {
      setRestoreLoading(true);
      setError('');
      setSuccess('');

      const formData = new FormData();
      formData.append('backup_file', selectedFile);

      const response = await fetch(`${getApiBaseUrl()}/api/backup/restore`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        setSuccess(`Backup restored successfully! ${result.restored_files.length} files restored.`);
        setSelectedFile(null);
        // Reload settings after restore
        setTimeout(() => loadSettings(), 1000);
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Failed to restore backup');
      }
    } catch (err) {
      setError('Failed to restore backup');
      console.error('Error restoring backup:', err);
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.zip')) {
      setSelectedFile(file);
      setError('');
    } else {
      setError('Please select a valid backup file (.zip)');
      setSelectedFile(null);
    }
  };

  const searchCity = async () => {
    if (!citySearch.trim()) {
      setError('Please enter a city name to search');
      return;
    }

    try {
      setGeoLoading(true);
      setError('');
      setSuccess('');

      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(citySearch)}&limit=1`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && data.length > 0) {
          const location = data[0];
          const cityName = location.display_name.split(',')[0]; // Get just the city name
          const lat = parseFloat(location.lat);
          const lon = parseFloat(location.lon);
          
          // Determine timezone based on coordinates
          const timezone = getTimezoneFromCoordinates(lat, lon);
          
          setGardenSettings({
            ...gardenSettings,
            city: cityName,
            gps_lat: lat,
            gps_lon: lon,
            timezone: timezone
          });
          setCitySearch(location.display_name); // Update search field with full location
          setSuccess(`Found ${location.display_name} (${timezone})`);
        } else {
          setError('City not found. Please try a different search term.');
        }
      } else {
        setError('Failed to search for city. Please try again.');
      }
    } catch (err) {
      setError('Failed to search for city. Please check your internet connection.');
      console.error('Error searching city:', err);
    } finally {
      setGeoLoading(false);
    }
  };

  const getTimezoneFromCoordinates = (lat: number, lon: number): string => {
    // Simple timezone determination based on longitude and common regions
    // This is a basic implementation - could be enhanced with a proper timezone API
    
    // North America
    if (lat >= 24 && lat <= 72 && lon >= -168 && lon <= -52) {
      if (lon >= -67) return 'America/New_York';      // Eastern
      if (lon >= -87) return 'America/Chicago';       // Central
      if (lon >= -105) return 'America/Denver';       // Mountain
      if (lon >= -125) return 'America/Los_Angeles';  // Pacific
      return 'America/Vancouver';                     // Alaska/Pacific
    }
    
    // Canada specific regions
    if (lat >= 49 && lat <= 60 && lon >= -141 && lon <= -52) {
      if (lon >= -67) return 'America/Toronto';       // Eastern
      if (lon >= -95) return 'America/Winnipeg';      // Central
      if (lon >= -110) return 'America/Regina';       // Central
      return 'America/Vancouver';                     // Pacific
    }
    
    // Europe
    if (lat >= 35 && lat <= 71 && lon >= -10 && lon <= 40) {
      if (lon >= -5) return 'Europe/London';          // UK/Ireland
      return 'Europe/Paris';                          // Central Europe
    }
    
    // Asia
    if (lat >= 20 && lat <= 55 && lon >= 70 && lon <= 145) {
      if (lon >= 135) return 'Asia/Tokyo';            // Japan
      if (lon >= 110) return 'Asia/Shanghai';         // China
      return 'Asia/Tokyo';                            // Default Asia
    }
    
    // Australia
    if (lat >= -45 && lat <= -10 && lon >= 110 && lon <= 155) {
      return 'Australia/Sydney';
    }
    
    // Default to UTC if no match
    return 'UTC';
  };

  // Test GPIO zone function
  const checkGpioStatus = async () => {
    setLoadingGpioStatus(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/gpio/status/detailed`);
      if (response.ok) {
        const status = await response.json();
        setGpioStatus(status);
      } else {
        console.error('Failed to get GPIO status:', response.status);
      }
    } catch (error) {
      console.error('Error getting GPIO status:', error);
    } finally {
      setLoadingGpioStatus(false);
    }
  };

  const testZone = async (zoneId: number) => {
    if (testingZone === zoneId) return; // Prevent double-clicking
    
    setTestingZone(zoneId);
    try {
      // Try direct GPIO test first (bypasses scheduler)
      console.log(`Testing zone ${zoneId} with direct GPIO test...`);
      const directResponse = await fetch(`${getApiBaseUrl()}/api/gpio/test/${zoneId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 2 })
      });
      
      if (directResponse.ok) {
        console.log('Direct GPIO test successful');
        // Wait 2.5 seconds then check if it's still active
        setTimeout(() => {
          setTestingZone(null);
        }, 2500);
        return;
      } else {
        console.log('Direct GPIO test failed, trying scheduler method...');
      }
      
      // Fallback to scheduler method
      const response = await fetch(`${getApiBaseUrl()}/api/manual-timer/${zoneId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration: 2 })
      });
      
      if (response.ok) {
        // Wait 2.5 seconds then check if it's still active
        setTimeout(() => {
          setTestingZone(null);
        }, 2500);
      } else {
        console.error('Failed to test zone:', response.status);
        setTestingZone(null);
      }
    } catch (error) {
      console.error('Error testing zone:', error);
      setTestingZone(null);
    }
  };

  const getTimezoneAbbreviation = (timezone: string): string => {
    try {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        timeZoneName: 'short'
      };
      const formatter = new Intl.DateTimeFormat('en-US', options);
      const parts = formatter.formatToParts(now);
      const timeZonePart = parts.find(part => part.type === 'timeZoneName');
      return timeZonePart ? timeZonePart.value : timezone.split('/').pop() || timezone;
    } catch (error) {
      // Fallback to extracting the last part of the timezone name
      return timezone.split('/').pop() || timezone;
    }
  };

  if (loading) {
    return (
      <div style={{
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
        marginLeft: '150px'
      }}>
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#f4f4f4'
        }}>
          Loading settings...
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '24px',
      maxWidth: '1200px',
      margin: '0 auto',
      marginLeft: '150px'
    }}>
      <h1 style={{
        color: '#f4f4f4',
        marginBottom: '24px',
        fontSize: '28px',
        fontWeight: 700
      }}>
        Settings
      </h1>

      {/* Error/Success Messages */}
      {error && (
        <div style={{
          background: '#721c24',
          color: '#f8d7da',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #f5c6cb'
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          background: '#155724',
          color: '#d4edda',
          padding: '12px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          border: '1px solid #c3e6cb'
        }}>
          {success}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid #2d3748'
      }}>
        <button
          onClick={() => setActiveTab('garden')}
          style={{
            background: activeTab === 'garden' ? '#00bcd4' : 'transparent',
            color: activeTab === 'garden' ? '#181f2a' : '#f4f4f4',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          Garden Settings
        </button>
        <button
          onClick={() => setActiveTab('location')}
          style={{
            background: activeTab === 'location' ? '#00bcd4' : 'transparent',
            color: activeTab === 'location' ? '#181f2a' : '#f4f4f4',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          GPS/Location
        </button>
        <button
          onClick={() => setActiveTab('datetime')}
          style={{
            background: activeTab === 'datetime' ? '#00bcd4' : 'transparent',
            color: activeTab === 'datetime' ? '#181f2a' : '#f4f4f4',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          Date/Time
        </button>
        <button
          onClick={() => setActiveTab('gpio')}
          style={{
            background: activeTab === 'gpio' ? '#00bcd4' : 'transparent',
            color: activeTab === 'gpio' ? '#181f2a' : '#f4f4f4',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          GPIO Configuration
        </button>
        <button
          onClick={() => setActiveTab('backup')}
          style={{
            background: activeTab === 'backup' ? '#00bcd4' : 'transparent',
            color: activeTab === 'backup' ? '#181f2a' : '#f4f4f4',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          Backup & Restore
        </button>
      </div>

      {/* Garden Settings Tab */}
      {activeTab === 'garden' && (
        <div style={{
          background: '#1a1f2a',
          borderRadius: '8px',
          padding: '24px',
          border: '1px solid #2d3748'
        }}>
          <h2 style={{
            color: '#f4f4f4',
            marginBottom: '24px',
            fontSize: '20px',
            fontWeight: 600
          }}>
            Garden Configuration
          </h2>

          {/* Basic Settings Section */}
          <ExpandableSection
            title="Basic Settings"
            expanded={expandedSections['garden-basic']}
            onToggle={() => toggleSection('garden-basic')}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '20px',
              marginBottom: '20px'
            }}>
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
                  value={gardenSettings.garden_name}
                  onChange={(e) => setGardenSettings({...gardenSettings, garden_name: e.target.value})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                  placeholder="My Garden"
                />
              </div>
            </div>
          </ExpandableSection>

          {/* Advanced Settings Section */}
          <ExpandableSection
            title="Advanced Settings"
            expanded={expandedSections['garden-advanced']}
            onToggle={() => toggleSection('garden-advanced')}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
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
                <select
                  value={gardenSettings.mode}
                  onChange={(e) => setGardenSettings({...gardenSettings, mode: e.target.value})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="manual">Manual</option>
                  <option value="smart">Smart</option>
                </select>
                <div style={{
                  color: '#888',
                  fontSize: '12px',
                  marginTop: '4px',
                  fontStyle: 'italic'
                }}>
                  Smart mode enables intelligent plant placement and zone optimization. Manual options remain available for full control.
                </div>
              </div>

              <div style={{ display: gardenSettings.mode === 'smart' ? 'block' : 'none' }}>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Timer Multiplier:
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10.0"
                  value={gardenSettings.timer_multiplier}
                  onChange={(e) => setGardenSettings({...gardenSettings, timer_multiplier: parseFloat(e.target.value) || 1.0})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                  placeholder="1.0"
                />
                <div style={{
                  color: '#888',
                  fontSize: '12px',
                  marginTop: '4px',
                  fontStyle: 'italic'
                }}>
                  Adjusts smart duration calculations when flow rates differ from expected values
                </div>
              </div>
            </div>

            {/* Simulation Mode Toggle */}
            <div style={{ marginTop: '24px' }}>
              <label style={{
                color: '#f4f4f4',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                display: 'block'
              }}>
                Simulation Mode:
              </label>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <input
                  type="checkbox"
                  id="simulate"
                  checked={gardenSettings.simulate || false}
                  onChange={(e) => setGardenSettings({...gardenSettings, simulate: e.target.checked})}
                  style={{
                    width: '16px',
                    height: '16px',
                    accentColor: '#00bcd4'
                  }}
                />
                <label htmlFor="simulate" style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}>
                  Enable mock GPIO (no real relays)
                </label>
              </div>
              <div style={{
                color: '#888',
                fontSize: '12px',
                marginTop: '4px',
                fontStyle: 'italic'
              }}>
                Use mock relays for development and testing
              </div>
            </div>
          </ExpandableSection>

          <div style={{
            marginTop: '24px',
            display: 'flex',
            gap: '12px'
          }}>
            <button
              onClick={saveGardenSettings}
              disabled={saving}
              style={{
                background: saving ? '#666' : '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 24px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              {saving ? 'Saving...' : 'Save Garden Settings'}
            </button>
          </div>
        </div>
      )}

      {/* GPS/Location Tab */}
      {activeTab === 'location' && (
        <div style={{
          background: '#1a1f2a',
          borderRadius: '8px',
          padding: '24px',
          border: '1px solid #2d3748'
        }}>
          <h2 style={{
            color: '#f4f4f4',
            marginBottom: '24px',
            fontSize: '20px',
            fontWeight: 600
          }}>
            GPS/Location Configuration
          </h2>

          {/* Location Settings Section */}
          <ExpandableSection
            title="Location Settings"
            expanded={expandedSections['location-settings']}
            onToggle={() => toggleSection('location-settings')}
          >
            {/* City Search */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '20px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  City:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') searchCity();
                    }}
                    style={{
                      flex: 1,
                      background: '#2d3748',
                      color: '#f4f4f4',
                      border: '1px solid #4a5568',
                      borderRadius: '4px',
                      padding: '10px 12px',
                      fontSize: '14px'
                    }}
                    placeholder="Search for a city"
                  />
                  <button
                    onClick={searchCity}
                    disabled={geoLoading}
                    style={{
                      background: geoLoading ? '#666' : '#00bcd4',
                      color: '#181f2a',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '10px 16px',
                      cursor: geoLoading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {geoLoading ? '🔍' : 'Search'}
                  </button>
                </div>
              </div>
            </div>

            {/* GPS Coordinates */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px'
            }}>
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Latitude:
                </label>
                <input
                  type="number"
                  step="any"
                  value={gardenSettings.gps_lat}
                  onChange={(e) => setGardenSettings({...gardenSettings, gps_lat: parseFloat(e.target.value) || 0})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                  placeholder="40.7128"
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
                  Longitude:
                </label>
                <input
                  type="number"
                  step="any"
                  value={gardenSettings.gps_lon}
                  onChange={(e) => setGardenSettings({...gardenSettings, gps_lon: parseFloat(e.target.value) || 0})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                  placeholder="-74.0060"
                />
              </div>
            </div>
          </ExpandableSection>

          {/* Save Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '24px'
          }}>
            <button
              onClick={saveGardenSettings}
              disabled={saving}
              style={{
                background: saving ? '#666' : '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 24px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              {saving ? 'Saving...' : 'Save Location Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Date/Time Tab */}
      {activeTab === 'datetime' && (
        <div style={{
          background: '#1a1f2a',
          borderRadius: '8px',
          padding: '24px',
          border: '1px solid #2d3748'
        }}>
          <h2 style={{
            color: '#f4f4f4',
            marginBottom: '24px',
            fontSize: '20px',
            fontWeight: 600
          }}>
            Date/Time Configuration
          </h2>

          {/* Timezone Settings Section */}
          <ExpandableSection
            title="Timezone Settings"
            expanded={expandedSections['datetime-timezone']}
            onToggle={() => toggleSection('datetime-timezone')}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: '20px'
            }}>
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Timezone: {gardenSettings.timezone !== 'UTC' && `(${getTimezoneAbbreviation(gardenSettings.timezone)})`}
                </label>
                <select
                  value={gardenSettings.timezone}
                  onChange={(e) => setGardenSettings({...gardenSettings, timezone: e.target.value})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="UTC">UTC (UTC)</option>
                  <option value="America/Regina">America/Regina ({getTimezoneAbbreviation('America/Regina')})</option>
                  <option value="America/Winnipeg">America/Winnipeg ({getTimezoneAbbreviation('America/Winnipeg')})</option>
                  <option value="America/Toronto">America/Toronto ({getTimezoneAbbreviation('America/Toronto')})</option>
                  <option value="America/Vancouver">America/Vancouver ({getTimezoneAbbreviation('America/Vancouver')})</option>
                  <option value="America/New_York">America/New_York ({getTimezoneAbbreviation('America/New_York')})</option>
                  <option value="America/Chicago">America/Chicago ({getTimezoneAbbreviation('America/Chicago')})</option>
                  <option value="America/Denver">America/Denver ({getTimezoneAbbreviation('America/Denver')})</option>
                  <option value="America/Los_Angeles">America/Los_Angeles ({getTimezoneAbbreviation('America/Los_Angeles')})</option>
                  <option value="Europe/London">Europe/London ({getTimezoneAbbreviation('Europe/London')})</option>
                  <option value="Europe/Paris">Europe/Paris ({getTimezoneAbbreviation('Europe/Paris')})</option>
                  <option value="Asia/Tokyo">Asia/Tokyo ({getTimezoneAbbreviation('Asia/Tokyo')})</option>
                  <option value="Asia/Shanghai">Asia/Shanghai ({getTimezoneAbbreviation('Asia/Shanghai')})</option>
                  <option value="Australia/Sydney">Australia/Sydney ({getTimezoneAbbreviation('Australia/Sydney')})</option>
                </select>
              </div>
            </div>
          </ExpandableSection>

          {/* Save Button */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '24px'
          }}>
            <button
              onClick={saveGardenSettings}
              disabled={saving}
              style={{
                background: saving ? '#666' : '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 24px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              {saving ? 'Saving...' : 'Save Date/Time Settings'}
            </button>
          </div>
        </div>
      )}

      {/* GPIO Configuration Tab */}
      {activeTab === 'gpio' && (
        <div style={{
          background: '#1a1f2a',
          borderRadius: '8px',
          padding: '24px',
          border: '1px solid #2d3748'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px'
          }}>
            <h2 style={{
              color: '#f4f4f4',
              fontSize: '20px',
              fontWeight: 600,
              margin: 0
            }}>
              GPIO Configuration
            </h2>
            <button
              onClick={checkGpioStatus}
              disabled={loadingGpioStatus}
              style={{
                background: loadingGpioStatus ? '#666' : '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loadingGpioStatus ? 'not-allowed' : 'pointer',
                opacity: loadingGpioStatus ? 0.6 : 1
              }}
            >
              {loadingGpioStatus ? 'Checking...' : 'Check GPIO Status'}
            </button>
          </div>
          
          {/* Debug info - remove this later */}
          <div style={{
            background: '#2d3748',
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '12px',
            color: '#bdbdbd'
          }}>
            Debug: GPIO Mode: {gpioConfig.mode}, Channels: {Object.keys(gpioConfig.channels || {}).length}
          </div>

          {/* GPIO Status Display */}
          {gpioStatus && (
            <div style={{
              background: '#1a1f2a',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '16px',
              border: '1px solid #2d3748'
            }}>
              <h3 style={{
                color: '#00bcd4',
                fontSize: '16px',
                fontWeight: 600,
                margin: '0 0 12px 0'
              }}>
                GPIO Status
              </h3>
              <div style={{
                fontSize: '12px',
                color: '#bdbdbd',
                fontFamily: 'monospace'
              }}>
                <div>Initialized: {gpioStatus.initialized ? 'Yes' : 'No'}</div>
                <div>Active Zones: {gpioStatus.active_zones?.join(', ') || 'None'}</div>
                <div>Pump Index: {gpioStatus.pump_index || 'None'}</div>
                <div>Active Low: {gpioStatus.active_low ? 'Yes' : 'No'}</div>
                <div>Mode: {gpioStatus.mode}</div>
                <div style={{ marginTop: '8px' }}>
                  <strong>Hardware States:</strong>
                  {Object.entries(gpioStatus.hardware_states || {}).map(([zone, state]: [string, any]) => (
                    <div key={zone} style={{ marginLeft: '8px' }}>
                      Zone {zone} (Pin {state.pin}): {state.error ? `Error: ${state.error}` : `${state.is_on ? 'ON' : 'OFF'} (raw: ${state.raw_state})`}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GPIO Mode Section */}
          <ExpandableSection
            title="GPIO Mode Settings"
            expanded={expandedSections['gpio-mode']}
            onToggle={() => toggleSection('gpio-mode')}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: '20px'
            }}>
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  GPIO Mode:
                </label>
                <select
                  value={gpioConfig.mode}
                  onChange={(e) => setGpioConfig({...gpioConfig, mode: e.target.value})}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="BCM">BCM (GPIO)</option>
                  <option value="BOARD">BOARD</option>
                </select>
              </div>
              <div>
                <label style={{
                  color: '#f4f4f4',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  display: 'block'
                }}>
                  Zone Count:
                </label>
                <select
                  value={gpioConfig.zoneCount}
                  onChange={(e) => {
                    const newZoneCount = parseInt(e.target.value) || 8;
                    const newPumpIndex = gpioConfig.pumpIndex && gpioConfig.pumpIndex > newZoneCount ? newZoneCount : gpioConfig.pumpIndex;
                    setGpioConfig({...gpioConfig, zoneCount: newZoneCount, pumpIndex: newPumpIndex});
                  }}
                  style={{
                    width: '100%',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="1">1 Zone</option>
                  <option value="2">2 Zones</option>
                  <option value="3">3 Zones</option>
                  <option value="4">4 Zones</option>
                  <option value="5">5 Zones</option>
                  <option value="6">6 Zones</option>
                  <option value="7">7 Zones</option>
                  <option value="8">8 Zones</option>
                </select>
              </div>
            </div>
          </ExpandableSection>

          {/* Pump Zone & Signal Polarity */}
          <ExpandableSection
            title="Signal Polarity"
            expanded={expandedSections['gpio-pump']}
            onToggle={() => toggleSection('gpio-pump')}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, marginBottom: '8px', display: 'block' }}>
                  Signal Polarity:
                </label>
                <select
                  value={gpioConfig.activeLow ? 'low' : 'high'}
                  onChange={e => setGpioConfig({ ...gpioConfig, activeLow: e.target.value === 'low' })}
                  style={{
                    width: '200px',
                    background: '#2d3748',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '10px 12px',
                    fontSize: '14px'
                  }}
                >
                  <option value="low">Active Low (recommended for relays)</option>
                  <option value="high">Active High</option>
                </select>
              </div>
              
            </div>
          </ExpandableSection>

          {/* Channel Configuration Section */}
          <ExpandableSection
            title="Channel Configuration"
            expanded={expandedSections['gpio-channels']}
            onToggle={() => toggleSection('gpio-channels')}
          >
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
              gap: '16px'
            }}>
              {Array.from({ length: gpioConfig.zoneCount || 8 }, (_, i) => i + 1).map(channel => (
                <div key={channel} style={{
                  background: '#2d3748',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #4a5568'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <label style={{
                      color: '#f4f4f4',
                      fontSize: '14px',
                      fontWeight: 600,
                      display: 'block'
                    }}>
                      Zone {channel}:
                    </label>
                    <button
                      onClick={() => testZone(channel)}
                      disabled={testingZone === channel}
                      style={{
                        background: testingZone === channel ? '#666' : '#00bcd4',
                        color: testingZone === channel ? '#ccc' : '#181f2a',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: testingZone === channel ? 'not-allowed' : 'pointer',
                        transition: 'background 0.2s',
                        minWidth: '60px'
                      }}
                      onMouseOver={e => {
                        if (testingZone !== channel) {
                          e.currentTarget.style.background = '#0097a7';
                        }
                      }}
                      onMouseOut={e => {
                        if (testingZone !== channel) {
                          e.currentTarget.style.background = '#00bcd4';
                        }
                      }}
                    >
                      {testingZone === channel ? 'Testing...' : 'Test'}
                    </button>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={(gpioConfig.channels || {})[channel.toString()] || ''}
                    onChange={(e) => setGpioConfig({
                      ...gpioConfig,
                      channels: {
                        ...(gpioConfig.channels || {}),
                        [channel.toString()]: parseInt(e.target.value) || 0
                      }
                    })}
                    style={{
                      width: '100%',
                      background: '#1a1f2a',
                      color: '#f4f4f4',
                      border: '1px solid #4a5568',
                      borderRadius: '4px',
                      padding: '8px 12px',
                      fontSize: '14px'
                    }}
                    placeholder="GPIO Pin"
                  />
                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '11px',
                    marginTop: '4px'
                  }}>
                    GPIO Pin: {(gpioConfig.channels || {})[channel.toString()] || 'Not set'}
                  </div>
                </div>
              ))}
            </div>
            
            {/* Pump Zone Selector */}
            <div style={{
              marginTop: '16px',
              background: '#2d3748',
              padding: '12px',
              borderRadius: '6px',
              border: '1px solid #4a5568'
            }}>
              <label style={{
                color: '#f4f4f4',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                display: 'block'
              }}>
                Pump Zone:
              </label>
              <select
                value={gpioConfig.pumpIndex || 0}
                onChange={(e) => setGpioConfig({
                  ...gpioConfig,
                  pumpIndex: Number(e.target.value)
                })}
                style={{
                  width: '100%',
                  padding: '8px',
                  borderRadius: '4px',
                  border: '1px solid #4a5568',
                  background: '#2d3748',
                  color: '#f4f4f4',
                  fontSize: '14px'
                }}
              >
                <option value={0}>Disabled</option>
                {Array.from({ length: gpioConfig.zoneCount || 8 }, (_, i) => i + 1).map(zone => (
                  <option key={zone} value={zone}>Zone {zone}</option>
                ))}
              </select>
            </div>
          </ExpandableSection>

          <div style={{
            marginTop: '24px',
            display: 'flex',
            gap: '12px'
          }}>
            <button
              onClick={saveGpioConfig}
              disabled={saving}
              style={{
                background: saving ? '#666' : '#00bcd4',
                color: '#181f2a',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 24px',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 600
              }}
            >
              {saving ? 'Saving...' : 'Save GPIO Configuration'}
            </button>
          </div>
        </div>
      )}

      {/* Backup & Restore Tab */}
      {activeTab === 'backup' && (
        <div style={{
          background: '#1a1f2a',
          borderRadius: '8px',
          padding: '24px',
          border: '1px solid #2d3748'
        }}>
          <h2 style={{
            color: '#f4f4f4',
            marginBottom: '24px',
            fontSize: '20px',
            fontWeight: 600
          }}>
            Backup & Restore
          </h2>

          {/* Backup Information Section */}
          <ExpandableSection
            title="System Information"
            expanded={expandedSections['backup-info']}
            onToggle={() => toggleSection('backup-info')}
          >
            {backupInfo && (
              <div style={{
                background: '#2d3748',
                padding: '16px',
                borderRadius: '6px'
              }}>
                <div style={{
                  color: '#bdbdbd',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  <div>Total backup size: {backupInfo.total_size_mb} MB</div>
                  <div>Backup version: {backupInfo.backup_version}</div>
                  <div>Files to backup: {Object.keys(backupInfo.files).filter(f => backupInfo.files[f].exists).length}</div>
                </div>
              </div>
            )}
          </ExpandableSection>

          {/* Create Backup Section */}
          <ExpandableSection
            title="Create Backup"
            expanded={expandedSections['backup-create']}
            onToggle={() => toggleSection('backup-create')}
          >
            <div style={{
              background: '#2d3748',
              padding: '20px',
              borderRadius: '6px'
            }}>
              <p style={{
                color: '#bdbdbd',
                marginBottom: '16px',
                fontSize: '14px',
                lineHeight: '1.5'
              }}>
                Create a complete backup of all your configuration files, schedules, and data. 
                This will download a ZIP file containing all your settings.
              </p>
              <button
                onClick={createBackup}
                disabled={backupLoading}
                style={{
                  background: backupLoading ? '#666' : '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px 24px',
                  cursor: backupLoading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                {backupLoading ? 'Creating Backup...' : '📦 Create Backup'}
              </button>
            </div>
          </ExpandableSection>

          {/* Restore Backup Section */}
          <ExpandableSection
            title="Restore Backup"
            expanded={expandedSections['backup-restore']}
            onToggle={() => toggleSection('backup-restore')}
          >
            <div style={{
              background: '#2d3748',
              padding: '20px',
              borderRadius: '6px'
            }}>
              <p style={{
                color: '#bdbdbd',
                marginBottom: '16px',
                fontSize: '14px',
                lineHeight: '1.5'
              }}>
                Restore your system from a previously created backup file. 
                This will replace all current settings with the backup data.
              </p>
              <div style={{
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                flexWrap: 'wrap'
              }}>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  style={{
                    background: '#1a1f2a',
                    color: '#f4f4f4',
                    border: '1px solid #4a5568',
                    borderRadius: '4px',
                    padding: '8px 12px',
                    fontSize: '14px'
                  }}
                />
                <button
                  onClick={restoreBackup}
                  disabled={restoreLoading || !selectedFile}
                  style={{
                    background: restoreLoading || !selectedFile ? '#666' : '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '12px 24px',
                    cursor: restoreLoading || !selectedFile ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                >
                  {restoreLoading ? 'Restoring...' : '🔄 Restore Backup'}
                </button>
              </div>
              {selectedFile && (
                <div style={{
                  marginTop: '12px',
                  color: '#28a745',
                  fontSize: '14px'
                }}>
                  Selected: {selectedFile.name}
                </div>
              )}
            </div>
          </ExpandableSection>
        </div>
      )}
    </div>
  );
}

// ExpandableSection component
function ExpandableSection({ title, expanded, onToggle, children }: { 
  title: string; 
  expanded: boolean; 
  onToggle: () => void; 
  children: React.ReactNode 
}) {
  return (
    <div style={{
      marginBottom: '16px',
      border: '1px solid #2d3748',
      borderRadius: '6px',
      overflow: 'hidden'
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: expanded ? '#2d3748' : '#1a1f2a',
          color: '#f4f4f4',
          border: 'none',
          outline: 'none',
          padding: '16px 20px',
          fontSize: '16px',
          fontWeight: 600,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'background 0.2s'
        }}
        aria-expanded={expanded}
      >
        {title}
        <span style={{ 
          fontSize: '18px', 
          transition: 'transform 0.2s', 
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' 
        }}>
          ▶
        </span>
      </button>
      <div
        style={{
          maxHeight: expanded ? 2000 : 0,
          opacity: expanded ? 1 : 0,
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.2s',
          overflow: 'hidden',
          background: '#1a1f2a',
          padding: expanded ? '20px' : '0 20px'
        }}
      >
        {expanded && children}
      </div>
    </div>
  );
} 