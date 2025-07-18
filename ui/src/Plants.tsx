import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';

interface PlantEntry {
  plant_id: number;
  common_name: string;
}

interface PlantBook {
  bookName: string;
  plants: PlantEntry[];
}

interface AssignedPlant {
  plant: PlantEntry;
  quantity: number;
  emitterSize: number;
  zoneId: number;
  comments?: string;
}

interface Location {
  location_id: number;
  name: string;
  description: string;
  zones: number[];
  assignedPlants?: AssignedPlant[];
}

interface Zone {
  zone_id: number;
  comment: string;
  period: string;
  cycles: number;
}

export default function Plants() {
  const [libraryFiles, setLibraryFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plantBooks, setPlantBooks] = useState<Record<string, PlantBook>>({});
  const [selectedPlants, setSelectedPlants] = useState<Record<string, number | ''>>({});
  const [heldPlant, setHeldPlant] = useState<{ plant: PlantEntry; bookFile: string } | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [modal, setModal] = useState<null | { locationIdx: number }>(null);
  const [modalData, setModalData] = useState<{ quantity: string; emitterSize: string; zoneId: string; comments: string }>({ quantity: '', emitterSize: '', zoneId: '', comments: '' });

  const navigate = useNavigate();

  // Load locations and zones from backend
  useEffect(() => {
    fetch('http://127.0.0.1:5000/api/library-files')
      .then(res => res.json())
      .then(async files => {
        setLibraryFiles(files);
        setLoading(false);
        const books: Record<string, PlantBook> = {};
        await Promise.all(files.map(async (file: string) => {
          try {
            const resp = await fetch(`http://127.0.0.1:5000/library/${file}`);
            if (!resp.ok) return;
            const data = await resp.json();
            let bookName = file.replace('.json', '');
            let plants: PlantEntry[] = [];
            if (data && typeof data === 'object' && data['Book Name'] && Array.isArray(data['plants'])) {
              bookName = data['Book Name'];
              plants = data['plants'].map((plant: any) => ({
                plant_id: plant.plant_id,
                common_name: plant.common_name || 'Unknown'
              }));
            } else if (Array.isArray(data)) {
              plants = data.map((plant: any) => ({
                plant_id: plant.plant_id,
                common_name: plant.common_name || 'Unknown'
              }));
            }
            books[file] = { bookName, plants };
          } catch {
            books[file] = { bookName: file.replace('.json', ''), plants: [] };
          }
        }));
        setPlantBooks(books);
      })
      .catch(() => {
        setError('Failed to load library files.');
        setLoading(false);
      });
    // Load locations
    fetch('http://127.0.0.1:5000/api/locations')
      .then(res => res.json())
      .then(data => {
        setLocations(data.map((loc: any) => ({ ...loc, assignedPlants: [] })));
      });
    // Load zones
    fetch('http://127.0.0.1:5000/api/schedule')
      .then(res => res.json())
      .then(data => {
        setZones(data.map((z: any) => ({
          zone_id: z.zone_id,
          comment: z.comment,
          period: z.period,
          cycles: z.cycles
        })));
      });
  }, []);

  // When a plant is selected from a dropdown
  const handlePlantSelect = (file: string, plantId: number | '') => {
    setSelectedPlants(prev => ({ ...prev, [file]: plantId }));
    const plant = plantBooks[file]?.plants.find(p => p.plant_id === plantId) || null;
    setHeldPlant(plantId && plant ? { plant, bookFile: file } : null);
  };

  // When a location is clicked
  const handleLocationClick = (idx: number) => {
    if (heldPlant) {
      setModal({ locationIdx: idx });
      setModalData({ quantity: '', emitterSize: '', zoneId: '', comments: '' });
    }
  };

  // Handle modal input changes
  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setModalData({ ...modalData, [e.target.name]: e.target.value });
  };

  // Confirm modal assignment
  const handleModalConfirm = () => {
    if (!modal) return;
    const { locationIdx } = modal;
    const { quantity, emitterSize, zoneId, comments } = modalData;
    if (!quantity || !emitterSize || !zoneId) return;
    setLocations(locs => locs.map((loc, i) =>
      i === locationIdx && heldPlant
        ? {
            ...loc,
            assignedPlants: [
              ...(loc.assignedPlants || []),
              {
                plant: heldPlant.plant,
                quantity: Number(quantity),
                emitterSize: Number(emitterSize),
                zoneId: Number(zoneId),
                comments
              }
            ]
          }
        : loc
    ));
    setHeldPlant(null);
    setSelectedPlants({});
    setModal(null);
  };

  // Remove assigned plant
  const handleRemovePlant = (locationIdx: number, plantId: number) => {
    setLocations(locs => locs.map((loc, i) =>
      i === locationIdx
        ? { ...loc, assignedPlants: (loc.assignedPlants || []).filter(ap => ap.plant.plant_id !== plantId) }
        : loc
    ));
  };

  // Get zone details for a location
  const getZonesForLocation = (loc: Location) => {
    return (loc.zones || []).map(zid => zones.find(z => z.zone_id === zid)).filter(Boolean) as Zone[];
  };

  // Rain Bird emitter sizes (GPH)
  const EMITTER_SIZES = [0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0];

  // Finish button handler: save all assignments to backend
  const handleFinish = async () => {
    // Build map object: { zone_id: [plantInstance, ...], ... }
    let mapObj: Record<string, any[]> = {};
    let instance_id = 1;
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    locations.forEach(loc => {
      (loc.assignedPlants || []).forEach(ap => {
        const zoneKey = String(ap.zoneId);
        if (!mapObj[zoneKey]) mapObj[zoneKey] = [];
        mapObj[zoneKey].push({
          instance_id: instance_id++,
          library_book: Object.entries(plantBooks).find(([file, book]) => book.plants.some(p => p.plant_id === ap.plant.plant_id))?.[0]?.replace('.json', '') || '',
          plant_id: ap.plant.plant_id,
          quantity: ap.quantity,
          mode: 'Manual',
          comments: ap.comments || '',
          location_id: loc.location_id,
          zone_id: ap.zoneId,
          emitter_size: ap.emitterSize,
          planted_date: now,
          time_to_maturity: null
        });
      });
    });
    await fetch('http://127.0.0.1:5000/api/map/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mapObj)
    });
    navigate('/garden');
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
      color: '#fff',
      gap: 32,
      padding: '40px 0',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', gap: 32, width: '100%', justifyContent: 'center' }}>
        {/* Plant Library Legend */}
        <div style={{
          minWidth: 260,
          background: 'rgba(30,20,50,0.95)',
          borderRadius: 12,
          padding: 20,
          marginTop: 20,
          textAlign: 'left'
        }}>
          <h3 style={{ color: '#ff9800', fontWeight: 700, marginTop: 0, fontSize: 20 }}>Plant Library</h3>
          {heldPlant && (
            <div style={{ marginBottom: 16, color: '#ff9800', fontWeight: 600, fontSize: 16 }}>
              Holding: {heldPlant.plant.common_name}
            </div>
          )}
          {loading ? (
            <div>Loading...</div>
          ) : error ? (
            <div style={{ color: '#ff512f' }}>{error}</div>
          ) : (
            <>
              {libraryFiles.map((file) => (
                <div key={file} style={{ marginBottom: 18 }}>
                  <div style={{ color: '#ff9800', fontWeight: 600, marginBottom: 6 }}>{plantBooks[file]?.bookName || file.replace('.json', '')}</div>
                  <select
                    style={{ width: '100%', padding: 8, borderRadius: 8, background: '#2d2350', color: '#fff', border: '1px solid #ff9800' }}
                    value={selectedPlants[file] || ''}
                    onChange={e => handlePlantSelect(file, e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">Select a plant...</option>
                    {(plantBooks[file]?.plants || []).map((plant) => (
                      <option key={plant.plant_id} value={plant.plant_id}>{plant.common_name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </>
          )}
        </div>
        {/* Locations in the center */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
          marginTop: 20
        }}>
          {locations.map((loc, idx) => (
            <div
              key={loc.location_id}
              onClick={() => handleLocationClick(idx)}
              style={{
                background: heldPlant ? '#ff9800' : 'rgba(30,20,50,0.95)',
                borderRadius: 12,
                padding: 24,
                minWidth: 320,
                maxWidth: 400,
                boxShadow: '0 4px 24px rgba(106, 17, 203, 0.15)',
                transition: 'background 0.2s',
                color: heldPlant ? '#2d2350' : '#fff',
                border: heldPlant ? '2px solid #ff9800' : undefined,
                cursor: heldPlant ? 'pointer' : 'default'
              }}
            >
              <h2 style={{ color: heldPlant ? '#2d2350' : '#ff9800', fontWeight: 700, margin: 0 }}>{loc.name}</h2>
              <div style={{ color: heldPlant ? '#2d2350' : '#bdbdbd', marginTop: 8 }}>{loc.description}</div>
              {loc.assignedPlants && loc.assignedPlants.length > 0 && (
                <ul style={{ marginTop: 16, padding: 0, listStyle: 'none' }}>
                  {loc.assignedPlants.map((ap, i) => (
                    <li key={ap.plant.plant_id} style={{ background: '#2d2350', color: '#ff9800', borderRadius: 6, padding: '6px 10px', marginBottom: 6, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>
                        {ap.plant.common_name} (Qty: {ap.quantity}, Emitter: {ap.emitterSize}, Zone: {(() => {
                          const z = zones.find(z => z.zone_id === ap.zoneId);
                          return z ? z.zone_id : ap.zoneId;
                        })()})
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleRemovePlant(idx, ap.plant.plant_id); }}
                        style={{ marginLeft: 12, background: 'transparent', border: 'none', color: '#ff512f', fontWeight: 700, fontSize: 18, cursor: 'pointer' }}
                        title="Remove plant"
                      >×</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      {/* Finish Button */}
      <div style={{ width: '100%', display: 'flex', justifyContent: 'center', marginTop: 40 }}>
        <button
          onClick={handleFinish}
          style={{
            padding: '14px 48px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(90deg, #ff9800 0%, #ff512f 100%)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 20,
            boxShadow: '0 4px 24px rgba(106, 17, 203, 0.15)',
            cursor: 'pointer',
            marginTop: 16
          }}
        >
          Finish
        </button>
      </div>
      {/* Modal for assignment */}
      {modal && heldPlant && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: '#221a38', borderRadius: 14, padding: 32, minWidth: 320, color: '#fff', boxShadow: '0 8px 32px #0008' }}>
            <h3 style={{ color: '#ff9800', marginTop: 0, marginBottom: 18 }}>Assign Plant to Location</h3>
            <div style={{ marginBottom: 16 }}>
              <label>Quantity:<br />
                <select
                  name="quantity"
                  value={modalData.quantity}
                  onChange={handleModalChange}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ff9800', background: '#2d2350', color: '#fff', marginTop: 4 }}
                  required
                >
                  <option value="">Select quantity...</option>
                  {Array.from({ length: 99 }, (_, i) => i + 1).map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Emitter Size (GPH):<br />
                <select
                  name="emitterSize"
                  value={modalData.emitterSize}
                  onChange={handleModalChange}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ff9800', background: '#2d2350', color: '#fff', marginTop: 4 }}
                  required
                >
                  <option value="">Select emitter size...</option>
                  {EMITTER_SIZES.map(size => (
                    <option key={size} value={size}>{size} GPH</option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Connect to Zone:<br />
                <select
                  name="zoneId"
                  value={modalData.zoneId}
                  onChange={handleModalChange}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ff9800', background: '#2d2350', color: '#fff', marginTop: 4 }}
                  required
                >
                  <option value="">Select a zone...</option>
                  {getZonesForLocation(locations[modal.locationIdx]).map(z => (
                    <option key={z.zone_id} value={z.zone_id}>
                      Zone {z.zone_id} ({z.period}{z.cycles}) - {z.comment}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Comments:<br />
                <input
                  type="text"
                  name="comments"
                  value={modalData.comments}
                  onChange={handleModalChange}
                  style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #ff9800', background: '#2d2350', color: '#fff', marginTop: 4 }}
                  placeholder="Optional notes..."
                />
              </label>
            </div>
            <div style={{ marginBottom: 16, color: '#bdbdbd', fontSize: 14 }}>
              Time to Maturity: <span style={{ color: '#888', fontStyle: 'italic' }}>(coming soon)</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => { setModal(null); }}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#444', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}
              >Cancel</button>
              <button
                onClick={handleModalConfirm}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ff9800', color: '#221a38', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
                disabled={!modalData.quantity || !modalData.emitterSize || !modalData.zoneId}
              >Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 