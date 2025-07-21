import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from './utils';

const AVAILABLE_GPIO_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];

export default function ZoneSetup() {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [zoneCount, setZoneCount] = useState(1);
  const [pins, setPins] = useState<number[]>([2]);
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Load existing GPIO configuration on mount
  useEffect(() => {
    const loadGPIOConfig = async () => {
      try {
        const resp = await fetch(`${getApiBaseUrl()}/api/gpio`);
        if (resp.ok) {
          const config = await resp.json();
          setZoneCount(config.zoneCount || 1);
          setPins(config.pins || [2]);
          // Convert 1-based pump index from config to 0-based for frontend
          setPumpIndex(config.pumpIndex !== undefined && config.pumpIndex > 0 ? config.pumpIndex - 1 : null);
        }
      } catch (err) {
        console.log('No existing GPIO config found, using defaults');
      } finally {
        setLoading(false);
      }
    };
    
    loadGPIOConfig();
  }, []);

  // Update pins array when zoneCount changes
  const handleZoneCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let count = Math.max(1, Math.min(8, Number(e.target.value)));
    setZoneCount(count);
    setPins((prev) => {
      let next = prev.slice(0, count);
      while (next.length < count) next.push(2);
      return next;
    });
    // Reset pumpIndex if zone count shrinks below current pumpIndex
    setPumpIndex((prev) => (prev !== null && prev >= count ? null : prev));
  };

  // Update pin for a specific zone
  const handlePinChange = (idx: number, value: number) => {
    setPins((prev) => prev.map((p, i) => (i === idx ? value : p)));
  };

  // Only one zone can be the pump
  const handlePumpChange = (idx: number) => {
    setPumpIndex(idx === pumpIndex ? null : idx);
  };

  // Check for unique pins
  const pinsAreUnique = pins.length === new Set(pins).size;
  const pinsAreValid = pins.every(pin => AVAILABLE_GPIO_PINS.includes(pin));

  const handleSave = async () => {
    setError('');
    if (!pinsAreUnique) {
      setError('Each zone must use a unique GPIO pin.');
      return;
    }
    if (!pinsAreValid) {
      setError('Invalid GPIO pin selected.');
      return;
    }
    setSaving(true);
    try {
      // Convert 0-based pump index back to 1-based for config
      const configPumpIndex = pumpIndex !== null ? pumpIndex + 1 : 0;
      const config = { zoneCount, pins, pumpIndex: configPumpIndex };
      const resp = await fetch(`${getApiBaseUrl()}/api/gpio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error('Failed to save GPIO config');
      setError('');
      // Show success message briefly
      setTimeout(() => {
        navigate('/garden');
      }, 1000);
    } catch (err) {
      setError('Failed to save GPIO config.');
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
        boxSizing: 'border-box',
        overflowX: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ color: '#00bcd4', fontSize: 18 }}>Loading GPIO configuration...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      minWidth: '100vw',
      background: '#181f2a',
      padding: '0 0 0 20px',
      boxSizing: 'border-box',
      overflowX: 'hidden'
    }}>
      <div style={{
        maxWidth: 800,
        marginLeft: 0,
        marginRight: 0,
        padding: '40px 20px 20px 0',
        overflow: 'hidden'
      }}>
        {/* Add same spacing as Plants page view mode toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 20,
          alignItems: 'center',
          gap: 12,
          height: 30 // Same height as the toggle
        }}>
          {/* Invisible spacer to match Plants page layout */}
        </div>
        
        <div style={{
          background: '#232b3b',
          color: '#f4f4f4',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
          padding: 24,
          marginBottom: 24
        }}>
          <h2 style={{ color: '#00bcd4', fontWeight: 700, margin: '0 0 16px 0', textAlign: 'left' }}>Zone & Relay Setup</h2>
          <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: 16 }}></div>
          
          {/* Mode Selection */}
          <div style={{ marginBottom: 24, textAlign: 'left' }}>
            <span style={{ color: '#fff', marginRight: 12 }}>Mode:</span>
            <label style={{ color: mode === 'manual' ? '#00bcd4' : '#fff', marginRight: 8 }}>
              <input
                type="radio"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
                style={{ marginRight: 4 }}
              />
              Manual
            </label>
            <label style={{ color: '#bdbdbd', opacity: 0.5, cursor: 'not-allowed' }}>
              <input
                type="radio"
                checked={mode === 'auto'}
                disabled
                style={{ marginRight: 4 }}
              />
              Auto (coming soon)
            </label>
          </div>
          
          {mode === 'manual' ? (
            <>
              <div style={{ marginBottom: 20, textAlign: 'left' }}>
                <label style={{ color: '#fff' }}>
                  How many zones/relays?&nbsp;
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={zoneCount}
                    onChange={handleZoneCountChange}
                    style={{ 
                      width: 60, 
                      padding: 8, 
                      borderRadius: 6, 
                      border: '1px solid #00bcd4', 
                      background: '#232b3b', 
                      color: '#fff',
                      marginLeft: 8
                    }}
                  />
                </label>
              </div>
              <div style={{ textAlign: 'left' }}>
                {Array.from({ length: zoneCount }).map((_, idx) => (
                  <div key={idx} style={{ 
                    marginBottom: 12, 
                    display: 'flex', 
                    alignItems: 'center',
                    background: '#232b3b',
                    padding: 12,
                    borderRadius: 8,
                    border: '1px solid #1a1f2a'
                  }}>
                    <label style={{ color: '#fff', display: 'flex', alignItems: 'center' }}>
                      Zone {idx + 1} GPIO Pin:&nbsp;
                      <select
                        value={pins[idx]}
                        onChange={e => handlePinChange(idx, Number(e.target.value))}
                        style={{ 
                          padding: 6, 
                          borderRadius: 6, 
                          border: '1px solid #00bcd4', 
                          background: '#232b3b', 
                          color: '#fff',
                          marginLeft: 8
                        }}
                      >
                        {AVAILABLE_GPIO_PINS.map(pin => (
                          <option key={pin} value={pin}>{pin}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ marginLeft: 16, display: 'flex', alignItems: 'center', color: '#00bcd4', fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={pumpIndex === idx}
                        onChange={() => setPumpIndex(pumpIndex === idx ? null : idx)}
                        style={{ marginRight: 6 }}
                      />
                      Is pump
                    </label>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: '#bdbdbd', marginTop: 24, textAlign: 'left' }}>
              Auto-detect hardware coming soon.
            </div>
          )}
          
          {error && (
            <div style={{ color: '#ff512f', margin: '12px 0', fontSize: 14, textAlign: 'left' }}>{error}</div>
          )}
          
          <button
            onClick={handleSave}
            disabled={saving || !pinsAreUnique || !pinsAreValid}
            style={{
              width: '100%',
              padding: '12px',
              marginTop: 24,
              background: pinsAreUnique && pinsAreValid
                ? '#00bcd4'
                : '#444',
              color: pinsAreUnique && pinsAreValid ? '#181f2a' : '#888',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              cursor: pinsAreUnique && pinsAreValid ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s'
            }}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
} 