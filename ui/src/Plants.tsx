import React, { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from './utils';

/**
 * CRITICAL DATA RELATIONSHIPS & ID SYSTEM
 * =======================================
 * 
 * This application uses three distinct ID systems that must be understood to prevent data corruption:
 * 
 * 1. LOCATION_ID (location_id)
 *    - Used in: locations.json, map.json (plant instances)
 *    - Purpose: Identifies physical garden locations (e.g., "orchard", "perimeter")
 *    - Behavior: When a location is deleted, plant instances with that location_id become orphaned
 *    - This is ACCEPTABLE - orphaned instances can still function with their zone_id
 * 
 * 2. ZONE_ID (zone_id) 
 *    - Used in: gpio.cfg, schedule.json, map.json (plant instances)
 *    - Purpose: Identifies irrigation zones and corresponds to relay channels (1+)
 *    - Behavior: Zone deletion would break plant instances, so zones should not be deleted
 *    - Critical: zone_id = relay channel number (1-based)
 * 
 * 3. INSTANCE_ID (instance_id)
 *    - Used in: map.json (plant instances)
 *    - Purpose: Unique identifier for each individual plant instance in the field
 *    - Behavior: This is the PRIMARY key for plant operations (add, remove, edit)
 *    - Format: Generated as combination of location_id + plant_id + zone_id + quantity + emitter_size + timestamp
 *    - Critical: Always use instance_id for plant operations, never plant_id
 * 
 * PLANT_ID vs INSTANCE_ID:
 * - plant_id: References the plant type in the library (e.g., "Strawberry, Red")
 * - instance_id: References the specific plant instance in the field (e.g., "10 strawberry plants in zone 2")
 * 
 * DATA INTEGRITY RULES:
 * - When working with plants: Use instance_id (not plant_id)
 * - When working with locations: Use location_id
 * - When working with zones: Use zone_id
 * - Location deletion creates orphaned instances (acceptable)
 * - Zone deletion would break instances (prevent this)
 * - Instance deletion is safe (removes specific plant group)
 */

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
  location_id: number;
  instanceId: string;
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
  mode?: string;
  times?: { value: string; duration: string }[];
}

export default function Plants() {
  console.log('=== PLANTS COMPONENT STARTING ===');
  const [libraryFiles, setLibraryFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [plantBooks, setPlantBooks] = useState<Record<string, PlantBook>>({});
  const [selectedPlants, setSelectedPlants] = useState<Record<string, number | ''>>({});
  const [heldPlant, setHeldPlant] = useState<{ plant: PlantEntry; bookFile: string } | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [zoneResolvedTimes, setZoneResolvedTimes] = useState<Record<number, Record<string, string>>>({});
  const [modal, setModal] = useState<null | { locationIdx: number }>(null);
  const [modalData, setModalData] = useState<{ quantity: string; emitterSize: string; zoneId: string; locationId: string; comments: string }>({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'location' | 'zone'>('zone');

  const navigate = useNavigate();

  // Handle clicking outside of valid drop targets to cancel placement
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!heldPlant) return;
      
      const target = event.target as HTMLElement;
      
      // Check if click is on a valid drop target
      const isValidDropTarget = target.closest('[data-drop-target="true"]') || 
                               target.closest('[data-modal="true"]') ||
                               target.closest('[data-plant-library="true"]');
      
      // If click is not on a valid drop target, cancel the held plant
      if (!isValidDropTarget) {
        setHeldPlant(null);
        setModal(null);
        setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
      }
    };

    if (heldPlant) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [heldPlant]);

  // Load locations and zones from backend
  useEffect(() => {
    fetch(`${getApiBaseUrl()}/api/library-files`)
      .then(res => res.json())
      .then(async files => {
        // Extract filenames from the response objects
        const filenames = files.map((fileObj: any) => fileObj.filename);
        
        // Sort files by priority
        const sortedFiles = filenames.sort((a: string, b: string) => {
          // custom.json always has highest priority (00)
          if (a === 'custom.json') return -1;
          if (b === 'custom.json') return 1;
          
          // Extract priority numbers from filenames
          const getPriority = (filename: string) => {
            const match = filename.match(/^(\d+)_/);
            return match ? parseInt(match[1], 10) : 99;
          };
          
          const priorityA = getPriority(a);
          const priorityB = getPriority(b);
          
          return priorityA - priorityB;
        });
        
        setLibraryFiles(sortedFiles);
        setLoading(false);
        const books: Record<string, PlantBook> = {};
        await Promise.all(sortedFiles.map(async (file: string) => {
          try {
            const resp = await fetch(`${getApiBaseUrl()}/library/${file}`);
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
      console.log('Plants component useEffect starting...');
  // Load locations and map data together to ensure proper order
  Promise.all([
    fetch(`${getApiBaseUrl()}/api/locations`).then(res => res.json()),
    fetch(`${getApiBaseUrl()}/api/map`).then(res => res.json())
  ]).then(async ([locationsData, mapData]) => {
      // Load plant library data to get plant names
      const plantLibraryData: Record<string, Record<number, string>> = {};
      try {
        const libraryFiles = await fetch(`${getApiBaseUrl()}/api/library-files`).then(res => res.json());
        const filenames = libraryFiles.map((fileObj: any) => fileObj.filename);
        await Promise.all(filenames.map(async (file: string) => {
          try {
            const resp = await fetch(`${getApiBaseUrl()}/library/${file}`);
            if (!resp.ok) return;
            const data = await resp.json();
            let book: Record<number, string> = {};
            if (data && typeof data === 'object' && data['Book Name'] && Array.isArray(data['plants'])) {
              data['plants'].forEach((plant: any) => {
                book[plant.plant_id] = plant.common_name || 'Unknown';
              });
            } else if (Array.isArray(data)) {
              data.forEach((plant: any) => {
                book[plant.plant_id] = plant.common_name || 'Unknown';
              });
            }
            plantLibraryData[file.replace('.json', '')] = book;
          } catch (err) {
            console.log('Failed to load plant library file:', file);
          }
        }));
      } catch (err) {
        console.log('Failed to load plant library files');
      }

      // Convert map data to assigned plants
      const locationAssignments: Record<number, AssignedPlant[]> = {};
      console.log('Processing map data:', mapData);
      console.log('Available locations:', locationsData);
      
      Object.entries(mapData).forEach(([instanceId, instance]: [string, any]) => {
        console.log('Processing instance:', instanceId, instance);
        if (instance && typeof instance === 'object' && instance.location_id) {
            const locationId = instance.location_id;
            console.log('Location ID from instance:', locationId, 'Type:', typeof locationId);
            if (!locationAssignments[locationId]) {
              locationAssignments[locationId] = [];
            }
            
          // Use common_name from map data if available, otherwise look it up
            const libraryBook = instance.library_book;
          const plantName = instance.common_name || plantLibraryData[libraryBook]?.[instance.plant_id] || `Plant ${instance.plant_id}`;
            
            locationAssignments[locationId].push({
              plant: {
                plant_id: instance.plant_id,
                common_name: plantName
              },
              quantity: instance.quantity,
              emitterSize: instance.emitter_size,
              zoneId: instance.zone_id,
              location_id: instance.location_id,
            instanceId: instanceId,
              comments: instance.comments || ''
          });
        }
      });

      console.log('Location assignments:', locationAssignments);
      
      // Set locations with assigned plants
      const updatedLocations = locationsData.map((loc: any) => {
        const assignedPlants = locationAssignments[loc.location_id] || [];
        console.log(`Location ${loc.location_id} (${loc.name}) gets ${assignedPlants.length} plants:`, assignedPlants);
        return {
          ...loc,
          assignedPlants
        };
      });
      
      console.log('Final locations with plants:', updatedLocations);
      setLocations(updatedLocations);
    }).catch(err => {
      console.log('Failed to load locations or plant assignments:', err);
    });
    // Load zones
    fetch(`${getApiBaseUrl()}/api/schedule`)
      .then(res => res.json())
      .then(data => {
        setZones(data.map((z: any) => ({
          zone_id: z.zone_id,
          comment: z.comment,
          period: z.period,
          cycles: z.cycles,
          mode: z.mode
        })));
      });
    // Note: Zone resolved times are not needed for the Plants page
    // They are only used in GardenOverview for displaying next scheduled times
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
      setModalData({ 
        quantity: '', 
        emitterSize: '', 
        zoneId: '', 
        locationId: locations[idx].location_id.toString(), 
        comments: '' 
      });
    }
  };

  // When a zone is clicked (for zone view)
  const handleZoneClick = (zoneId: number) => {
    if (heldPlant) {
      // Find a location that has this zone
      const locationWithZone = locations.find(loc => loc.zones.includes(zoneId));
      if (locationWithZone) {
        const locationIdx = locations.findIndex(loc => loc.location_id === locationWithZone.location_id);
        setModal({ locationIdx });
        setModalData({ quantity: '', emitterSize: '', zoneId: zoneId.toString(), locationId: '', comments: '' });
      }
    }
  };

  // Handle modal input changes
  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const newData = { ...modalData, [e.target.name]: e.target.value };
    
    // If zone changes, clear the location selection if it's not available for the new zone
    if (e.target.name === 'zoneId' && e.target.value) {
      const selectedZone = Number(e.target.value);
      if (newData.locationId) {
        const selectedLocation = locations.find(loc => loc.location_id === Number(newData.locationId));
        if (selectedLocation && !selectedLocation.zones.includes(selectedZone)) {
          newData.locationId = '';
        }
      }
    }
    
    // If location changes, clear the zone selection if it's not available in the new location
    if (e.target.name === 'locationId' && e.target.value) {
      const selectedLocation = locations.find(loc => loc.location_id === Number(e.target.value));
      if (selectedLocation && newData.zoneId && !selectedLocation.zones.includes(Number(newData.zoneId))) {
        newData.zoneId = '';
      }
    }
    
    setModalData(newData);
  };

  const handleRemovePlant = async (locationIdx: number, instanceId: string) => {
    if (!confirm('Are you sure you want to remove this plant? This action cannot be undone.')) {
      return;
    }

    try {
      // Remove from backend
      const response = await fetch(`${getApiBaseUrl()}/api/map/${instanceId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to remove plant');
      }

      // Update local state
      setLocations(prev => prev.map((loc, idx) => {
        if (idx === locationIdx) {
          return {
            ...loc,
            assignedPlants: loc.assignedPlants?.filter(ap => ap.instanceId !== instanceId) || []
          };
        }
        return loc;
      }));

      alert('Plant removed successfully!');
    } catch (error) {
      console.error('Error removing plant:', error);
      alert('Failed to remove plant. Please try again.');
    }
  };

  const handleModalConfirm = async () => {
    if (!modalData.quantity || !modalData.emitterSize || !modalData.zoneId) {
      alert('Please fill in all required fields.');
      return;
    }

    if (!heldPlant || !modal) return;

    try {
      const plantData = {
        library_book: heldPlant.bookFile.replace('.json', ''),
        plant_id: heldPlant.plant.plant_id,
        common_name: heldPlant.plant.common_name,
        quantity: parseInt(modalData.quantity),
        emitter_size: parseFloat(modalData.emitterSize),
        zone_id: parseInt(modalData.zoneId),
        location_id: parseInt(modalData.locationId) || locations[modal.locationIdx].location_id,
        comments: modalData.comments || '',
        planted_date: new Date().toISOString().split('T')[0]
      };

      // Save to backend
      const response = await fetch(`${getApiBaseUrl()}/api/map/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(plantData)
      });

      if (!response.ok) {
        throw new Error('Failed to assign plant');
      }

      const result = await response.json();
      
      // Update local state
      const newAssignedPlant: AssignedPlant = {
        plant: heldPlant.plant,
        quantity: plantData.quantity,
        emitterSize: plantData.emitter_size,
        zoneId: plantData.zone_id,
        location_id: plantData.location_id,
        instanceId: result.instance_id || `${plantData.location_id}-${plantData.plant_id}-${plantData.zone_id}-${plantData.quantity}-${plantData.emitter_size}-${Date.now()}`,
        comments: plantData.comments
      };

      setLocations(prev => prev.map((loc, idx) => {
        if (idx === modal.locationIdx) {
          return {
            ...loc,
            assignedPlants: [...(loc.assignedPlants || []), newAssignedPlant]
          };
        }
        return loc;
      }));

      // Reset modal and held plant
      setModal(null);
      setHeldPlant(null);
      setSelectedPlants({});
      setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });

      alert('Plant assigned successfully!');
    } catch (error) {
      console.error('Error assigning plant:', error);
      alert('Failed to assign plant. Please try again.');
    }
  };

  // Get zone details for a location
  const getZonesForLocation = (loc: Location) => {
    return (loc.zones || []).map(zid => zones.find(z => z.zone_id === zid)).filter(Boolean) as Zone[];
  };

  // Get plants grouped by zone for zone view
  const getPlantsByZone = () => {
    const zonePlants: Record<number, { zone: Zone; plants: AssignedPlant[] }> = {};
    
    // Only create zone entries for zones that have plants assigned
    locations.forEach(loc => {
      loc.assignedPlants?.forEach(ap => {
        if (!zonePlants[ap.zoneId]) {
          const zone = zones.find(z => z.zone_id === ap.zoneId);
          if (zone) {
            zonePlants[ap.zoneId] = { zone, plants: [] };
          }
        }
        if (zonePlants[ap.zoneId]) {
          zonePlants[ap.zoneId].plants.push(ap);
        }
      });
    });
    
    return Object.values(zonePlants);
  };

  // Rain Bird emitter sizes (GPH)
  const EMITTER_SIZES = [0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0];

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: '#181f2a',
      padding: '0 0 0 20px',
      marginLeft: '150px',
      boxSizing: 'border-box',
      overflowX: 'hidden',
      overflowY: 'auto'
    }}>
      <div style={{
        maxWidth: '1200px',
        marginLeft: 0,
        marginRight: 0,
        padding: '20px 20px 20px 0',
        overflow: 'visible'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: '20px',
          alignItems: 'center',
          gap: '12px',
          height: '30px'
        }}>
          {/* Invisible spacer to match Plants page layout */}
        </div>


        

        
        <div style={{
          display: 'flex',
          gap: '24px',
          alignItems: 'flex-start',
          width: '100%'
        }}>
          {/* Plant Library Card */}
          <div 
            data-plant-library="true"
            style={{
              background: '#232b3b',
              color: '#f4f4f4',
              borderRadius: '16px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              padding: '24px',
              width: '300px',
              flexShrink: 0
            }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ color: '#00bcd4', fontWeight: 700, margin: 0, textAlign: 'left' }}>Library</h3>
        {/* View Mode Toggle */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
                gap: '8px'
        }}>
                <span style={{ color: '#00bcd4', fontSize: '12px', fontWeight: 600 }}>Location</span>
          <div
            onClick={() => setViewMode(prev => prev === 'location' ? 'zone' : 'location')}
            style={{
                    width: '40px',
                    height: '20px',
                    background: (viewMode as string) === 'zone' ? '#00bcd4' : '#444',
                    borderRadius: '10px',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.3s ease',
              display: 'flex',
              alignItems: 'center',
                    padding: '0 2px'
            }}
          >
            <div style={{
                    width: '16px',
                    height: '16px',
              background: '#fff',
              borderRadius: '50%',
                    transform: (viewMode as string) === 'zone' ? 'translateX(20px)' : 'translateX(0)',
              transition: 'transform 0.3s ease',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
            }} />
          </div>
                <span style={{ color: '#00bcd4', fontSize: '12px', fontWeight: 600 }}>Zone</span>
        </div>
            </div>
            <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
            {heldPlant && (
              <div style={{ marginBottom: '16px', color: '#00bcd4', fontWeight: 600, fontSize: '16px', textAlign: 'left' }}>
                Holding: {heldPlant.plant.common_name}
              </div>
            )}
            {loading ? (
              <div style={{ color: '#bdbdbd' }}>Loading...</div>
            ) : error ? (
              <div style={{ color: '#ff512f' }}>{error}</div>
            ) : (
              <>
                {libraryFiles.map((file) => (
                  <div key={file} style={{ marginBottom: '18px', textAlign: 'left' }}>
                    <div style={{ color: '#00bcd4', fontWeight: 600, marginBottom: '6px' }}>{plantBooks[file]?.bookName || file.replace('.json', '')}</div>
                    <select
                      style={{
                        width: '100%',
                        padding: '8px',
                        borderRadius: '8px',
                        background: '#232b3b',
                        color: '#fff',
                        border: '1px solid #00bcd4',
                        outline: 'none'
                      }}
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
          
          {/* Main Content Area */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            minWidth: 0,
            flex: 1,
            maxWidth: '500px'
          }}>
            {/* Locations/Zone Cards */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '24px'
            }}>
              {viewMode === 'location' ? (
                // Location View
                locations.map((loc, idx) => (
                <div
                  key={loc.location_id}
                  data-drop-target="true"
                  onClick={() => handleLocationClick(idx)}
                  style={{
                    background: heldPlant ? '#00bcd4' : '#232b3b',
                    color: heldPlant ? '#181f2a' : '#f4f4f4',
                    borderRadius: '16px',
                    boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                    padding: '24px',
                    minWidth: '320px',
                    maxWidth: '500px',
                    transition: 'background 0.2s',
                    border: '2px solid #232b3b',
                    cursor: heldPlant ? 'pointer' : 'default'
                  }}
                >

                  <h2 style={{
                    color: heldPlant ? '#181f2a' : '#00bcd4',
                    fontWeight: 700,
                    margin: '0 0 8px 0',
                    textAlign: 'left'
                  }}>{loc.name}</h2>
                  <div style={{
                    color: heldPlant ? '#181f2a' : '#bdbdbd',
                    marginBottom: '8px',
                    textAlign: 'left'
                  }}>{loc.description}</div>
                  <div style={{
                    color: heldPlant ? '#181f2a' : '#bdbdbd',
                    fontSize: '14px',
                    marginBottom: '12px',
                    textAlign: 'left'
                  }}>
                    Zones: {getZonesForLocation(loc).map(z => z.zone_id).sort((a: number, b: number) => a - b).join(', ')}
                  </div>
                  <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                  {loc.assignedPlants && loc.assignedPlants.length > 0 && (
                    <ul style={{
                      margin: 0,
                      padding: 0,
                      listStyle: 'none',
                      textAlign: 'left'
                    }}>
                      {loc.assignedPlants.map((ap, i) => (
                        <li key={ap.instanceId} style={{
                          background: '#232b3b',
                          color: '#00bcd4',
                          borderRadius: '8px',
                          padding: '8px 12px',
                          marginBottom: '4px',
                          fontSize: '15px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px'
                          }}>
                            <span style={{
                              fontWeight: 700,
                              minWidth: '120px',
                              color: '#fff',
                              fontSize: '16px'
                            }}>{ap.plant.common_name}</span>
                            <span style={{
                              color: '#fff',
                              minWidth: '60px',
                              fontWeight: 600
                            }}>Qty: {ap.quantity}</span>
                            <span style={{
                              color: '#bdbdbd',
                              minWidth: '80px'
                            }}>Emitter: {ap.emitterSize}</span>
                            <span style={{
                              color: '#bdbdbd',
                              minWidth: '60px'
                            }}>Zone: {(() => {
                              const z = zones.find(z => z.zone_id === ap.zoneId);
                              return z ? z.zone_id : ap.zoneId;
                            })()}</span>
                          </div>
                          <button
                            onClick={e => { 
                              e.stopPropagation(); 
                              console.log('Clicking remove for plant:', ap.plant.common_name, 'instanceId:', ap.instanceId);
                              handleRemovePlant(idx, ap.instanceId); 
                            }}
                            style={{
                              marginLeft: '12px',
                              background: 'transparent',
                              border: 'none',
                              color: '#ff512f',
                              fontWeight: 700,
                              fontSize: '18px',
                              cursor: 'pointer'
                            }}
                            title="Remove plant"
                          >×</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
              ) : (
                // Zone View
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '24px'
                }}>
                  {getPlantsByZone().map((zoneData) => (
                  <div
                    key={zoneData.zone.zone_id}
                    data-drop-target="true"
                    onClick={() => handleZoneClick(zoneData.zone.zone_id)}
                    style={{
                      background: heldPlant ? '#00bcd4' : '#232b3b',
                      color: heldPlant ? '#181f2a' : '#f4f4f4',
                      borderRadius: '16px',
                      boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                      padding: '24px',
                      minWidth: '320px',
                      maxWidth: '500px',
                      transition: 'background 0.2s',
                      border: '2px solid #232b3b',
                      cursor: heldPlant ? 'pointer' : 'default'
                    }}
                  >
                    <h2 style={{
                      color: heldPlant ? '#181f2a' : '#00bcd4',
                      fontWeight: 700,
                      margin: '0 0 8px 0',
                      textAlign: 'left'
                    }}>
                      Zone {zoneData.zone.zone_id}
                    </h2>
                    <div style={{
                      color: heldPlant ? '#181f2a' : '#bdbdbd',
                      marginBottom: '8px',
                      textAlign: 'left'
                    }}>
                      {(() => {
                        const periodMap: Record<string, string> = {
                          'D': 'Daily',
                          'W': 'Weekly',
                          'M': 'Monthly',
                          'Y': 'Yearly'
                        };
                        const resolvedPeriod = periodMap[zoneData.zone.period] || zoneData.zone.period;
                        return `${resolvedPeriod} - ${zoneData.zone.cycles} cycles`;
                      })()}
                    </div>
                    <div style={{
                      color: heldPlant ? '#181f2a' : '#bdbdbd',
                      fontSize: '14px',
                      marginBottom: '8px',
                      textAlign: 'left'
                    }}>
                      {zoneData.zone.comment}
                    </div>
                    <div style={{
                      color: heldPlant ? '#181f2a' : '#00bcd4',
                      fontWeight: 600,
                      fontSize: '14px',
                      marginBottom: '12px',
                      textAlign: 'left'
                    }}>
                      Next: {
                        (() => {
                          let nextTime = '...';
                          if (zoneData.zone.times && zoneData.zone.times.length > 0) {
                            const code = zoneData.zone.times[0].value;
                            nextTime = zoneResolvedTimes[zoneData.zone.zone_id]?.[code] || '...';
                          }
                          return nextTime;
                        })()
                      }
                    </div>
                    <div style={{ borderBottom: '1px solid #00bcd4', marginBottom: '16px' }}></div>
                    {zoneData.plants.length > 0 ? (
                      <ul style={{
                        margin: 0,
                        padding: 0,
                        listStyle: 'none',
                        textAlign: 'left'
                      }}>
                        {zoneData.plants.map((ap, i) => (
                          <li key={`${ap.plant.plant_id}-${i}`} style={{
                            background: '#232b3b',
                            color: '#00bcd4',
                            borderRadius: '8px',
                            padding: '10px 12px',
                            marginBottom: '8px',
                            fontSize: '15px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <div style={{
                              display: 'flex',
                                alignItems: 'flex-start',
                              gap: '16px'
                            }}>
                              <span style={{
                                fontWeight: 700,
                                minWidth: '120px',
                                color: '#fff',
                                fontSize: '16px'
                              }}>{ap.plant.common_name}</span>
                              <span style={{
                                color: '#fff',
                                minWidth: '60px',
                                fontWeight: 600
                              }}>Qty: {ap.quantity}</span>
                              <span style={{
                                color: '#bdbdbd',
                                minWidth: '80px'
                              }}>Emitter: {ap.emitterSize}</span>
                              <span style={{
                                color: '#bdbdbd',
                                minWidth: '60px'
                              }}>Location: {(() => {
                                const loc = locations.find(l => l.location_id === ap.location_id);
                                return loc ? loc.name : `Unknown (ID: ${ap.location_id})`;
                              })()}</span>
                            </div>
                            <button
                              onClick={e => { 
                                e.stopPropagation(); 
                                console.log('Clicking remove for plant:', ap.plant.common_name, 'instanceId:', ap.instanceId);
                                // Find the location index for this plant
                                const locationIdx = locations.findIndex(loc => loc.location_id === ap.location_id);
                                handleRemovePlant(locationIdx, ap.instanceId); 
                              }}
                              style={{
                                marginLeft: '12px',
                                background: 'transparent',
                                border: 'none',
                                color: '#ff512f',
                                fontWeight: 700,
                                fontSize: '18px',
                                cursor: 'pointer'
                              }}
                              title="Remove plant"
                            >×</button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: '#888', fontStyle: 'italic' }}>
                        No plants assigned to this zone
                      </div>
                    )}
                  </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Active Zones List - Always present but only visible in Zone View */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: '24px',
            background: '#232b3b',
            borderRadius: '16px',
            height: 'fit-content',
            position: 'sticky',
            top: '20px',
            width: 'fit-content',
            flexShrink: 0,
            visibility: viewMode === 'zone' ? 'visible' : 'hidden',
            alignSelf: 'flex-start'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {zones
                .filter(z => z && typeof z.zone_id === 'number')
                .map(zone => (
                  <div
                    key={zone.zone_id}
                    onClick={() => {
                      if (heldPlant && zone.mode !== 'disabled') {
                        // Find a location that has this zone
                        const locationWithZone = locations.find(loc => loc.zones.includes(zone.zone_id));
                        if (locationWithZone) {
                          const locationIdx = locations.findIndex(loc => loc.location_id === locationWithZone.location_id);
                          setModal({ locationIdx });
                          setModalData({ quantity: '', emitterSize: '', zoneId: zone.zone_id.toString(), locationId: locationWithZone.location_id.toString(), comments: '' });
                        } else {
                          // If no location uses this zone, show all locations in the modal
                          setModal({ locationIdx: 0 });
                          setModalData({ quantity: '', emitterSize: '', zoneId: zone.zone_id.toString(), locationId: '', comments: '' });
                        }
                      }
                    }}
                    style={{
                      padding: '4px 8px',
                      background: zone.mode === 'disabled' ? '#444' : (heldPlant ? '#00bcd4' : '#00bcd4'),
                      color: zone.mode === 'disabled' ? '#888' : '#181f2a',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textAlign: 'center',
                      opacity: zone.mode === 'disabled' ? 0.6 : 1,
                      width: 'fit-content',
                      minWidth: '40px',
                      cursor: heldPlant && zone.mode !== 'disabled' ? 'pointer' : 'default',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    Zone {zone.zone_id}
                  </div>
                ))}
            </div>
          </div>
        </div>
        
        {/* Modal for assignment */}
        {modal && heldPlant && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div 
              data-modal="true"
              style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '32px',
                minWidth: '320px',
                color: '#f4f4f4',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
              }}
            >
              <h3 style={{
                color: '#00bcd4',
                fontWeight: 700,
                margin: '0 0 16px 0',
                textAlign: 'left'
              }}>
                {viewMode === 'zone' ? 'Assign Plant to Zone' : 'Assign Plant to Location'}
              </h3>
              <form style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }} onSubmit={e => { e.preventDefault(); handleModalConfirm(); }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                    textAlign: 'left'
                  }}>Quantity:</label>
                  <select
                    name="quantity"
                    value={modalData.quantity}
                    onChange={handleModalChange}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                    required
                  >
                    <option value="">Select quantity...</option>
                    {Array.from({ length: 99 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                    textAlign: 'left'
                  }}>Emitter Size (GPH):</label>
                  <select
                    name="emitterSize"
                    value={modalData.emitterSize}
                    onChange={handleModalChange}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                    required
                  >
                    <option value="">Select emitter size...</option>
                    {[0.2, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 15.0, 18.0, 20.0, 25.0].map(size => (
                      <option key={size} value={size}>{size} GPH</option>
                    ))}
                  </select>
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                    textAlign: 'left'
                  }}>Zone:</label>
                  <select
                    name="zoneId"
                    value={modalData.zoneId}
                    onChange={handleModalChange}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                    required
                  >
                    <option value="">Select zone...</option>
                      {zones.filter(z => z.mode !== 'disabled').map(zone => {
                        // Check if this zone is available in the selected location
                        const selectedLocation = locations.find(loc => loc.location_id === Number(modalData.locationId));
                        const isAvailable = !selectedLocation || selectedLocation.zones.includes(zone.zone_id);
                        return (
                          <option 
                            key={zone.zone_id} 
                            value={zone.zone_id}
                            disabled={!isAvailable}
                            style={{ color: isAvailable ? '#fff' : '#666' }}
                          >
                            Zone {zone.zone_id} {!isAvailable ? '(not available in this location)' : ''}
                          </option>
                        );
                      })}
                  </select>
                </div>
                {(viewMode === 'zone' || viewMode === 'location') && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <label style={{
                      color: '#fff',
                      fontWeight: 600,
                      textAlign: 'left'
                    }}>Location:</label>
                    <select
                      name="locationId"
                      value={modalData.locationId}
                      onChange={handleModalChange}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #00bcd4',
                        background: '#1a1f2a',
                        color: '#fff',
                        outline: 'none'
                      }}
                      required
                    >
                      <option value="">Select location...</option>
                      {locations.map(loc => {
                        const isAvailable = !modalData.zoneId || loc.zones.includes(Number(modalData.zoneId));
                        return (
                          <option 
                            key={loc.location_id} 
                            value={loc.location_id}
                            disabled={!isAvailable}
                            style={{ color: isAvailable ? '#fff' : '#666' }}
                          >
                            {loc.name} {!isAvailable ? '(zone not available)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <label style={{
                    color: '#fff',
                    fontWeight: 600,
                    textAlign: 'left'
                  }}>Comments (optional):</label>
                  <input
                    type="text"
                    name="comments"
                    value={modalData.comments}
                    onChange={handleModalChange}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: '#1a1f2a',
                      color: '#fff',
                      outline: 'none'
                    }}
                    placeholder="Any additional notes..."
                  />
                </div>
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '16px'
                }}>
                  <button
                    type="button"
                    onClick={() => { 
                      setModal(null); 
                      setHeldPlant(null);
                      setSelectedPlants({});
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: '2px solid #ff512f',
                      background: 'transparent',
                      color: '#ff512f',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >Cancel</button>
                  <button
                    type="submit"
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#00bcd4',
                      color: '#181f2a',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >
                    Assign Plant
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 