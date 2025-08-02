/**
 * library.ui.tsx - Plant library browser and management
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
import { getApiBaseUrl } from './utils';
import { FormLayerProvider } from '../../core/FormLayerManager';
import LibraryForm from './forms/library.form';

interface Plant {
  plant_id: number;
  common_name: string;
  alternative_name?: string;
  latin_name: string;
  watering_frequency: string[];
  compatible_watering_frequencies: string[];
  preferred_time: string[];
  compatible_watering_times: string[];
  root_area_sqft: number;
  water_optimal_in_week: number;
  tolerance_min_in_week: number;
  tolerance_max_in_week: number;
  usda_zones: string;
  soil_preference: string;
  sun_exposure: string;
  fruiting_period: string;
  planting_time: string;
  spacing_inches: number;
  growth_type: string;
}

interface LibraryFile {
  filename: string;
  plants: Plant[];
}

export default function Library() {
  const [libraryFiles, setLibraryFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterUSDAZone, setFilterUSDAZone] = useState('');
  const [selectedPlantForForm, setSelectedPlantForForm] = useState<{ plant: Plant; libraryBook: string } | null>(null);

  useEffect(() => {
    loadLibraryFiles();
  }, []);

  const loadLibraryFiles = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${getApiBaseUrl()}/api/library-files`);
      if (!response.ok) {
        throw new Error('Failed to load library files');
      }
      const files = await response.json();
      setLibraryFiles(files);
    } catch (err) {
      console.error('Error loading library files:', err);
      setError('Failed to load plant library files');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredPlants = (): Plant[] => {
    if (!selectedFile) return [];
    
    const file = libraryFiles.find(f => f.filename === selectedFile);
    if (!file) return [];

    let plants = [...file.plants].sort((a, b) => a.common_name.localeCompare(b.common_name));

    // Apply search filter
    if (searchTerm) {
      plants = plants.filter(plant => 
        plant.common_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plant.latin_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        plant.growth_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // USDA Zone filter
    if (filterUSDAZone) {
      plants = plants.filter(plant => {
        if (!plant.usda_zones) return false;
        // Accept ranges and comma-separated
        return plant.usda_zones.split(',').some(z => {
          z = z.trim();
          if (z.includes('-')) {
            const [start, end] = z.split('-').map(Number);
            if (!isNaN(start) && !isNaN(end)) {
              return Number(filterUSDAZone) >= start && Number(filterUSDAZone) <= end;
            }
          }
          return z === filterUSDAZone;
        });
      });
    }

    return plants;
  };

  const getUniqueUSDAZones = (): string[] => {
    if (!selectedFile) return [];
    const file = libraryFiles.find(f => f.filename === selectedFile);
    if (!file) return [];
    // Split ranges like '3-9' into individual zones, flatten, and deduplicate
    const zones = file.plants.flatMap(p => {
      if (!p.usda_zones) return [];
      return p.usda_zones.split(',').flatMap(z => {
        z = z.trim();
        if (z.includes('-')) {
          const [start, end] = z.split('-').map(Number);
          if (!isNaN(start) && !isNaN(end)) {
            return Array.from({length: end - start + 1}, (_, i) => (start + i).toString());
          }
        }
        return z;
      });
    });
    return [...new Set(zones)].sort((a, b) => Number(a) - Number(b));
  };

  const openPlantForm = (plant: Plant) => {
    if (!selectedFile) return;
    setSelectedPlantForForm({ plant, libraryBook: selectedFile });
  };

  const closePlantForm = () => {
    setSelectedPlantForForm(null);
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
        <div style={{ color: '#00bcd4', fontSize: '18px' }}>Loading plant library...</div>
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

  const filteredPlants = getFilteredPlants();

  return (
    <FormLayerProvider>
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
          flexDirection: 'column',
          gap: '24px'
        }}>
          
          {/* Library Files Selection */}
          <div style={{
            background: '#232b3b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            border: '1px solid #1a1f2a'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{
                color: '#00bcd4',
                fontWeight: 600,
                margin: 0
              }}>Select Library File</h3>
            </div>
            <select
              value={selectedFile || ''}
              onChange={(e) => setSelectedFile(e.target.value || null)}
              style={{
                background: '#1a1f2a',
                color: '#f4f4f4',
                border: '1px solid #00bcd4',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '14px',
                minWidth: '200px'
              }}
            >
              <option value="">Choose a library file...</option>
              {libraryFiles.map(file => (
                <option key={file.filename} value={file.filename}>
                  {file.filename.replace('.json', '')} ({file.plants.length} plants)
                </option>
              ))}
            </select>
          </div>

          {selectedFile && (
            <>
              {/* Search and Filters */}
              <div style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                border: '1px solid #1a1f2a'
              }}>
                <h3 style={{
                  color: '#00bcd4',
                  fontWeight: 600,
                  margin: '0 0 16px 0'
                }}>Search & Filters</h3>
                
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '16px'
                }}>
                  {/* Search */}
                  <div>
                    <label style={{
                      color: '#f4f4f4',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'block'
                    }}>
                      Search Plants:
                    </label>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name or family..."
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

                  {/* USDA Zone Filter */}
                  <div>
                    <label style={{
                      color: '#f4f4f4',
                      fontSize: '14px',
                      fontWeight: 600,
                      marginBottom: '8px',
                      display: 'block'
                    }}>
                      Filter by USDA Zone:
                    </label>
                    <select
                      value={filterUSDAZone}
                      onChange={e => setFilterUSDAZone(e.target.value)}
                      style={{
                        background: '#1a1f2a',
                        color: '#f4f4f4',
                        border: '1px solid #00bcd4',
                        borderRadius: '6px',
                        padding: '8px 12px',
                        fontSize: '14px',
                        width: '100%'
                      }}
                    >
                      <option value="">All USDA Zones</option>
                      {getUniqueUSDAZones().map(zone => (
                        <option key={zone} value={zone}>{zone}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{
                  marginTop: '16px',
                  color: '#bdbdbd',
                  fontSize: '14px'
                }}>
                  Showing {filteredPlants.length} of {libraryFiles.find(f => f.filename === selectedFile)?.plants.length || 0} plants
                </div>
              </div>

              {/* Plants List */}
              <div style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                border: '1px solid #1a1f2a'
              }}>
                <h3 style={{
                  color: '#00bcd4',
                  fontWeight: 600,
                  margin: '0 0 16px 0'
                }}>Plants</h3>
                
                {filteredPlants.length === 0 ? (
                  <div style={{
                    color: '#bdbdbd',
                    textAlign: 'center',
                    padding: '32px',
                    fontSize: '16px'
                  }}>
                    No plants found matching your search criteria.
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {filteredPlants.map((plant) => (
                      <div
                        key={plant.plant_id}
                        style={{
                          background: '#1a1f2a',
                          borderRadius: '12px',
                          padding: '16px',
                          border: '1px solid #2d3748',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          borderColor: '#2d3748'
                        }}
                      >
                        <div 
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onClick={() => openPlantForm(plant)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              color: '#00bcd4',
                              fontWeight: 700,
                              fontSize: '18px',
                              marginRight: '12px'
                            }}>{plant.common_name}</span>
                            {plant.latin_name && (
                              <span style={{
                                color: '#bdbdbd',
                                fontSize: '14px',
                                fontStyle: 'italic'
                              }}>({plant.latin_name})</span>
                            )}
                          </div>
                          <div style={{
                            color: '#00bcd4',
                            fontSize: '14px',
                            fontWeight: '600'
                          }}>
                            View Details
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!selectedFile && libraryFiles.length > 0 && (
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a',
              textAlign: 'center'
            }}>
              <p style={{
                color: '#bdbdbd',
                fontSize: '16px',
                margin: 0
              }}>
                Select a library file above to browse plants
              </p>
            </div>
          )}

          {libraryFiles.length === 0 && (
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a',
              textAlign: 'center'
            }}>
              <p style={{
                color: '#bdbdbd',
                fontSize: '16px',
                margin: 0
              }}>
                No plant library files found. Please add library files to the library directory.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Library Form Modal */}
      {selectedPlantForForm && (
        <LibraryForm
          plant_id={selectedPlantForForm.plant.plant_id}
          library_book={selectedPlantForForm.libraryBook}
          onClose={closePlantForm}
        />
      )}
    </FormLayerProvider>
  );
}