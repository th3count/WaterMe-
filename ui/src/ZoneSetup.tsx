import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const AVAILABLE_GPIO_PINS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27];

export default function ZoneSetup() {
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [zoneCount, setZoneCount] = useState(1);
  const [pins, setPins] = useState<number[]>([2]);
  const [pumpIndex, setPumpIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

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

  const handleContinue = async () => {
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
      const config = { zoneCount, pins, pumpIndex };
      const resp = await fetch('http://127.0.0.1:5000/api/gpio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error('Failed to save GPIO config');
      navigate('/zoneschedule');
    } catch (err) {
      setError('Failed to save GPIO config.');
    }
    setSaving(false);
  };

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
      <div style={{ width: '100%' }}>
        <h2 style={{ color: '#ff9800', fontWeight: 700 }}>Zone & Relay Setup</h2>
        <div style={{ margin: '2rem auto', maxWidth: 400, background: 'rgba(30,20,50,0.95)', borderRadius: 12, padding: 24 }}>
          {/* Mode Slider */}
          <div style={{ marginBottom: 24 }}>
            <span style={{ color: '#fff', marginRight: 12 }}>Mode:</span>
            <label style={{ color: mode === 'manual' ? '#ff9800' : '#fff', marginRight: 8 }}>
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
              <div style={{ marginBottom: 20 }}>
                <label>
                  How many zones/relays?&nbsp;
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={zoneCount}
                    onChange={handleZoneCountChange}
                    style={{ width: 60, padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                  />
                </label>
              </div>
              <div>
                {Array.from({ length: zoneCount }).map((_, idx) => (
                  <div key={idx} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <label>
                      Zone {idx + 1} GPIO Pin:&nbsp;
                      <select
                        value={pins[idx]}
                        onChange={e => handlePinChange(idx, Number(e.target.value))}
                        style={{ padding: 4, borderRadius: 6, border: '1px solid #ff9800', background: '#2d2350', color: '#fff' }}
                      >
                        {AVAILABLE_GPIO_PINS.map(pin => (
                          <option key={pin} value={pin}>{pin}</option>
                        ))}
                      </select>
                    </label>
                    {idx === zoneCount - 1 && (
                      <label style={{ marginLeft: 16, display: 'flex', alignItems: 'center', color: '#ff9800', fontWeight: 500 }}>
                        <input
                          type="checkbox"
                          checked={pumpIndex === idx}
                          onChange={() => setPumpIndex(pumpIndex === idx ? null : idx)}
                          style={{ marginRight: 6 }}
                        />
                        Is pump
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: '#bdbdbd', marginTop: 24 }}>
              Auto-detect hardware coming soon.
            </div>
          )}
          {error && (
            <div style={{ color: '#ff512f', margin: '12px 0', fontSize: 14 }}>{error}</div>
          )}
          <button
            onClick={handleContinue}
            disabled={saving || !pinsAreUnique || !pinsAreValid}
            style={{
              width: '100%',
              padding: '0.75rem',
              marginTop: 24,
              background: pinsAreUnique && pinsAreValid
                ? 'linear-gradient(90deg, #ff9800 0%, #ff512f 100%)'
                : 'linear-gradient(90deg, #bdbdbd 0%, #bdbdbd 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              cursor: pinsAreUnique && pinsAreValid ? 'pointer' : 'not-allowed',
              transition: 'background 0.2s'
            }}
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
} 