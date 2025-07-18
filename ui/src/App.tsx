import { Routes, Route, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { DateTime } from 'luxon';
import ZoneSetup from './ZoneSetup';
import ZoneSchedule from './ZoneSchedule';
import LocationsCreate from './LocationsCreate';
import Plants from './Plants';
import GardenOverview from './GardenOverview';

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

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(DateTime.now().setZone(timezone).toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS));
    }, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  const handleCreate = async () => {
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

    // Prepare the config object
    const config = {
      name: gardenName,
      location,
      coords,
      mode,
      timezone,
    };

    try {
      const resp = await fetch('http://127.0.0.1:5000/api/garden', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!resp.ok) throw new Error('Failed to save config');
      setTimeout(() => {
        navigate('/zonesetup');
      }, 1200);
    } catch (err) {
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
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)'
    }}>
      <div style={{
        background: 'rgba(30, 20, 50, 0.95)',
        padding: '2.5rem 2rem',
        borderRadius: '1.25rem',
        boxShadow: '0 4px 24px rgba(106, 17, 203, 0.15)',
        minWidth: 320,
        maxWidth: 400,
        width: '100%',
        textAlign: 'center'
      }}>
        <h2 style={{ marginBottom: 8, color: '#ff9800', fontWeight: 700 }}>Create Your Garden</h2>
        <p style={{ color: '#bdbdbd', marginBottom: 24 }}>
          Set up your new garden. You can always change these settings later!
        </p>
        <input
          type="text"
          placeholder="Garden Name"
          value={gardenName}
          onChange={e => setGardenName(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            marginBottom: 10,
            border: '1px solid #ff9800',
            borderRadius: 8,
            fontSize: 16,
            outline: 'none',
            boxSizing: 'border-box',
            background: '#2d2350',
            color: '#fff'
          }}
        />
        <div style={{ display: 'flex', marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Location (City, State or GPS)"
            value={location}
            onChange={e => setLocation(e.target.value)}
            style={{
              flex: 1,
              padding: '0.75rem',
              border: '1px solid #ff9800',
              borderRadius: 8,
              fontSize: 16,
              outline: 'none',
              boxSizing: 'border-box',
              background: '#2d2350',
              color: '#fff'
            }}
          />
          <button
            type="button"
            onClick={geocodeLocation}
            disabled={geoLoading}
            style={{
              marginLeft: 8,
              padding: '0.75rem 1rem',
              background: 'linear-gradient(90deg, #ff9800 0%, #ff512f 100%)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 16,
              cursor: geoLoading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
          >
            {geoLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        {coords && (
          <div style={{ color: '#bdbdbd', fontSize: 13, marginTop: 4 }}>
            Lat: {coords[1].toFixed(5)}, Lon: {coords[0].toFixed(5)}
          </div>
        )}
        {/* Mode Slider */}
        <div style={{ marginBottom: 20 }}>
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
              checked={mode === 'smart'}
              disabled
              style={{ marginRight: 4 }}
            />
            Smart (coming soon)
          </label>
        </div>
        <div style={{ margin: '16px 0' }}>
          <label style={{ color: '#fff', marginRight: 8 }}>Timezone:</label>
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: 8,
              border: '1px solid #ff9800',
              background: '#2d2350',
              color: '#fff',
              fontSize: 16
            }}
          >
            {TIMEZONES.map(tz => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <div style={{ color: '#bdbdbd', fontSize: 15, marginBottom: 12 }}>
          Current time: {currentTime}
        </div>
        {error && (
          <div style={{ color: '#ff512f', marginBottom: 10, fontSize: 14 }}>
            {error}
          </div>
        )}
        <button
          onClick={handleCreate}
          disabled={!gardenName.trim() || !coords || created}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: gardenName.trim() && coords
              ? 'linear-gradient(90deg, #ff9800 0%, #ff512f 100%)'
              : 'linear-gradient(90deg, #bdbdbd 0%, #bdbdbd 100%)',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: 16,
            cursor: gardenName.trim() && coords ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s'
          }}
        >
          {created ? 'Created!' : 'Create'}
        </button>
      </div>
    </div>
  );
}

function MainGarden() {
  return <h2>Garden Overview (Main Page)</h2>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<CreateGarden />} />
      <Route path="/zonesetup" element={<ZoneSetup />} />
      <Route path="/zoneschedule" element={<ZoneSchedule />} />
      <Route path="/locations" element={<LocationsCreate />} />
      <Route path="/garden" element={<GardenOverview />} />
      <Route path="/plants" element={<Plants />} />
    </Routes>
  );
}

export default App;
