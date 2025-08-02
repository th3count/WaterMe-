/**
 * health.ui.tsx - System health monitoring and orphaned plant detection
 * 
 * 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
 * 📖 System Overview: ~/rules/system-overview.md
 * 🏗️ Project Structure: ~/rules/project-structure.md
 * 🎨 Layer System: ~/rules/layer-system.md
 * 🌐 API Patterns: ~/rules/api-patterns.md
 * 🎨 CSS Conventions: ~/rules/css-conventions.md
 * 💻 Coding Standards: ~/rules/coding-standards.md
 */

import React, { useEffect, useState } from 'react';
import { getApiBaseUrl } from './utils';
import { useFormLayer } from '../../core/useFormLayer';
import LocationForm from './forms/locations.addlocation';

// Health status icons component
const HealthIcon = ({ status }: { status: 'good' | 'warning' | 'error' }) => {
  const getIcon = () => {
    switch (status) {
      case 'good':
        return (
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#4CAF50',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            ✓
          </div>
        );
      case 'warning':
        return (
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#FF9800',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            !
          </div>
        );
      case 'error':
        return (
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#F44336',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px'
          }}>
            ✕
          </div>
        );
    }
  };

  return getIcon();
};

export default function Health() {
  const [locations, setLocations] = useState<any[]>([]);
  const [map, setMap] = useState<Record<string, any>>({});
  const [orphanedPlants, setOrphanedPlants] = useState<any[]>([]);
  const [systemStatus, setSystemStatus] = useState<'good' | 'warning' | 'error'>('good');
  const [ignoredAlerts, setIgnoredAlerts] = useState<Set<string>>(new Set());
  const [ignoredAlertsData, setIgnoredAlertsData] = useState<any[]>([]);
  const [showIgnoredAlerts, setShowIgnoredAlerts] = useState(false);
  const [plantNames, setPlantNames] = useState<Record<string, Record<number, string>>>({});
  

  
  // Smart placement modal state (adapted from Garden page for reassignment)
  const [reassignmentModal, setReassignmentModal] = useState<{ plant: any; bookFile: string; recommendations: any[] } | null>(null);
  const [modalData, setModalData] = useState({
    quantity: '',
    emitterSize: '',
    zoneId: '',
    locationId: '',
    comments: ''
  });
  const { addLayer, removeLayer } = useFormLayer();
  const [locationName, setLocationName] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [selectedLocationZones, setSelectedLocationZones] = useState<number[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);
  const [zoneSelectionMode, setZoneSelectionMode] = useState<'smart' | 'manual'>('smart');
  const [zones, setZones] = useState<any[]>([]);

  useEffect(() => {
    // Load locations, map data, and zones
    Promise.all([
      fetch(`${getApiBaseUrl()}/api/locations`).then(res => res.json()),
      fetch(`${getApiBaseUrl()}/api/schedule`).then(res => res.json())
    ]).then(([locationsData, zonesData]) => {
      setLocations(locationsData);
      setZones(zonesData);
    })
      .catch(() => setLocations([]));

    fetch(`${getApiBaseUrl()}/api/map`)
      .then(res => res.json())
      .then(data => {
        setMap(data);
      })
      .catch(() => setMap({}));
    
    // Load plant library for common names
    fetch(`${getApiBaseUrl()}/api/library-files`)
      .then(res => res.json())
      .then(async (files: any[]) => {
        const lookup: Record<string, Record<number, string>> = {};
        await Promise.all(files.map(async (fileObj: any) => {
          const filename = fileObj.filename;
          const resp = await fetch(`${getApiBaseUrl()}/library/${filename}`);
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
          lookup[filename.replace('.json', '')] = book;
        }));
        setPlantNames(lookup);
      })
      .catch(() => setPlantNames({}));
    
    // Load ignored alerts
    fetch(`${getApiBaseUrl()}/api/health/alerts`)
      .then(res => res.json())
      .then(data => {
        setIgnoredAlertsData(data.ignored_alerts || []);
        const ignoredSet = new Set<string>(
          data.ignored_alerts?.map((alert: any) => `${alert.alert_type}-${alert.alert_id}`) || []
        );
        setIgnoredAlerts(ignoredSet);
      })
      .catch(() => {
        setIgnoredAlertsData([]);
        setIgnoredAlerts(new Set());
      });
  }, []); // Remove dependency on locations to prevent infinite loops

  // Separate effect to check for orphaned plants when locations or map changes
  useEffect(() => {
    if (locations.length === 0 || Object.keys(map).length === 0) return;
    
    // Check for orphaned plants (both location and zone issues)
    const orphaned = Object.entries(map).filter(([instanceId, plant]: [string, any]) => {
      if (!plant) return false;
      
      // Check for missing or invalid location_id
      const hasInvalidLocation = !plant.location_id || !locations.some(loc => loc.location_id === plant.location_id);
      
      // Check for missing zone_id (critical state)
      const hasMissingZone = !plant.zone_id;
      
      return hasInvalidLocation || hasMissingZone;
    }).map(([instanceId, plant]: [string, any]) => ({ 
      instanceId, 
      plant_id: plant.plant_id, 
      library_book: plant.library_book,
      location_id: plant.location_id, 
      zone_id: plant.zone_id, 
      quantity: plant.quantity,
      common_name: plant.common_name, // Include common_name for display
      issue_type: !plant.zone_id ? 'missing_zone' : 'invalid_location' // Track the type of issue
    }));
    setOrphanedPlants(orphaned);
  }, [locations, map]);

  // Determine overall system status
  useEffect(() => {
    const activeOrphanedPlants = orphanedPlants.filter(plant => 
      !ignoredAlerts.has(`orphaned_plant-${plant.instanceId}`)
    );
    
    if (activeOrphanedPlants.length > 0) {
      setSystemStatus('warning');
    } else {
      setSystemStatus('good');
    }
  }, [orphanedPlants, ignoredAlerts]);

  // Function to ignore an alert
  const ignoreAlert = async (alertType: string, alertId: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/health/alerts/ignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_type: alertType, alert_id: alertId })
      });
      
      if (response.ok) {
        setIgnoredAlerts(prev => new Set([...prev, `${alertType}-${alertId}`]));
        // Reload ignored alerts data
        const alertsResponse = await fetch(`${getApiBaseUrl()}/api/health/alerts`);
        const alertsData = await alertsResponse.json();
        setIgnoredAlertsData(alertsData.ignored_alerts || []);
      }
    } catch (error) {
      console.error('Error ignoring alert:', error);
    }
  };

  // Function to unignore an alert
  const unignoreAlert = async (alertType: string, alertId: string) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/health/alerts/unignore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_type: alertType, alert_id: alertId })
      });
      
      if (response.ok) {
        setIgnoredAlerts(prev => {
          const newSet = new Set(prev);
          newSet.delete(`${alertType}-${alertId}`);
          return newSet;
        });
        // Reload ignored alerts data
        const alertsResponse = await fetch(`${getApiBaseUrl()}/api/health/alerts`);
        const alertsData = await alertsResponse.json();
        setIgnoredAlertsData(alertsData.ignored_alerts || []);
      }
    } catch (error) {
      console.error('Error unignoring alert:', error);
    }
  };

  // Helper function to get common name
  const getCommonName = (libraryBook: string, plantId: number) => {
    const result = plantNames[libraryBook]?.[plantId];
    if (!result) {
      console.log(`Plant lookup failed: ${libraryBook}[${plantId}] - Available:`, Object.keys(plantNames));
    }
    return result || `Plant ${plantId}`;
  };



  const handleSaveLocation = async () => {
    if (!locationName.trim()) {
      alert('Please enter a location name');
      return;
    }

    setSavingLocation(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: locationName,
          description: locationDescription,
          zones: selectedLocationZones
        })
      });

      if (response.ok) {
        const newLocation = await response.json();
        // Location form now handled by layer system
        setLocationName('');
        setLocationDescription('');
        setSelectedLocationZones([]);
        
        // Reload locations for the smart placement modal
        const locationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
        const locationsData = await locationsResponse.json();
        setLocations(locationsData);
      } else {
        console.error('Failed to create location:', response.status);
        alert('Failed to create location. Please try again.');
      }
    } catch (error) {
      console.error('Error creating location:', error);
      alert('Error creating location. Please try again.');
    } finally {
      setSavingLocation(false);
    }
  };

  const handleZoneCheck = (zoneId: number) => {
    setSelectedLocationZones(prev => 
      prev.includes(zoneId) 
        ? prev.filter(id => id !== zoneId)
        : [...prev, zoneId]
    );
  };

  // Plant reassignment functions (adapted from Garden page)
  const handleReassignmentConfirm = async () => {
    if (!reassignmentModal || !modalData.zoneId || !modalData.locationId) return;
    
    try {
      // Use the reassignment API to update the existing plant
      const response = await fetch(`${getApiBaseUrl()}/api/map/${reassignmentModal.plant.instanceId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: parseInt(modalData.locationId),
          zone_id: parseInt(modalData.zoneId)
        })
      });

      if (response.ok) {
        // Close modal and reload data
        setReassignmentModal(null);
        setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
        
        // Reload map data to refresh orphaned plants list
        const mapResponse = await fetch(`${getApiBaseUrl()}/api/map`);
        const mapData = await mapResponse.json();
        setMap(mapData);
        
        // Reload locations in case they changed
        const locationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
        const locationsData = await locationsResponse.json();
        setLocations(locationsData);
        
        alert('Plant reassigned successfully!');
      } else {
        const errorText = await response.text();
        console.error('Failed to reassign plant:', response.status, errorText);
        alert(`Failed to reassign plant: ${errorText}`);
      }
    } catch (error) {
      console.error('Error reassigning plant:', error);
      alert('Error reassigning plant. Please try again.');
    }
  };

  const handleModalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setModalData(prev => ({ ...prev, [name]: value }));
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


          {/* Health Status Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px'
          }}>
            {/* System Status */}
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <HealthIcon status={systemStatus} />
                <h3 style={{
                  color: '#00bcd4',
                  margin: 0,
                  fontWeight: 600
                }}>System Status</h3>
              </div>
              <p style={{
                color: '#f4f4f4',
                margin: 0,
                fontSize: '15px'
              }}>
                {systemStatus === 'good' && 'All systems operational'}
                {systemStatus === 'warning' && `${orphanedPlants.length} orphaned plant(s) detected`}
                {systemStatus === 'error' && 'System issues detected'}
              </p>
            </div>

            {/* Orphaned Plants Warning */}
            {orphanedPlants.filter(plant => 
              !ignoredAlerts.has(`orphaned_plant-${plant.instanceId}`)
            ).length > 0 && (
              <div style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                border: '1px solid #1a1f2a'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <HealthIcon status="warning" />
                  <h3 style={{
                    color: '#00bcd4',
                    margin: 0,
                    fontWeight: 600
                  }}>Orphaned Plants</h3>
                </div>
                <p style={{
                  color: '#f4f4f4',
                  margin: '0 0 12px 0',
                  fontSize: '15px'
                }}>
                  {orphanedPlants.filter(plant => 
                    !ignoredAlerts.has(`orphaned_plant-${plant.instanceId}`)
                  ).length} plant(s) assigned to deleted locations
                </p>
                <div style={{
                  fontSize: '13px',
                  color: '#bdbdbd'
                }}>
                  These plants need to be reassigned to valid locations or removed.
                </div>
              </div>
            )}

            {/* TODO: Water Pressure (Well Features) */}
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a',
              opacity: 0.5
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>
                  ?
                </div>
                <h3 style={{
                  color: '#666',
                  margin: 0,
                  fontWeight: 600
                }}>Water Pressure</h3>
              </div>
              <p style={{
                color: '#666',
                margin: '0 0 8px 0',
                fontSize: '15px'
              }}>Coming soon with well features</p>
              <div style={{
                fontSize: '12px',
                color: '#666',
                fontStyle: 'italic'
              }}>
                TODO: Add water pressure monitoring when well water management is implemented
              </div>
            </div>

            {/* TODO: Reservoir Level (Well Features) */}
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a',
              opacity: 0.5
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#666',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}>
                  ?
                </div>
                <h3 style={{
                  color: '#666',
                  margin: 0,
                  fontWeight: 600
                }}>Reservoir Level</h3>
              </div>
              <p style={{
                color: '#666',
                margin: '0 0 8px 0',
                fontSize: '15px'
              }}>Coming soon with well features</p>
              <div style={{
                fontSize: '12px',
                color: '#666',
                fontStyle: 'italic'
              }}>
                TODO: Add reservoir level monitoring when well water management is implemented
              </div>
            </div>
          </div>

          {/* Detailed Health Information */}
          <div style={{
            background: '#232b3b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            border: '1px solid #1a1f2a'
          }}>
            <h3 style={{
              color: '#00bcd4',
              margin: '0 0 16px 0',
              fontWeight: 600
            }}>Health Details</h3>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '16px'
            }}>
              <div>
                <h4 style={{
                  color: '#f4f4f4',
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  fontWeight: 600
                }}>Last Check</h4>
                <p style={{
                  color: '#bdbdbd',
                  margin: 0,
                  fontSize: '13px'
                }}>{new Date().toLocaleString()}</p>
              </div>
              
              <div>
                <h4 style={{
                  color: '#f4f4f4',
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  fontWeight: 600
                }}>Total Plants</h4>
                <p style={{
                  color: '#bdbdbd',
                  margin: 0,
                  fontSize: '13px'
                }}>{Object.keys(map).length} plants</p>
              </div>
              
              <div>
                <h4 style={{
                  color: '#f4f4f4',
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  fontWeight: 600
                }}>Valid Locations</h4>
                <p style={{
                  color: '#bdbdbd',
                  margin: 0,
                  fontSize: '13px'
                }}>{locations.length} locations</p>
              </div>
              
              <div>
                <h4 style={{
                  color: '#f4f4f4',
                  margin: '0 0 8px 0',
                  fontSize: '14px',
                  fontWeight: 600
                }}>Orphaned Plants</h4>
                <p style={{
                  color: orphanedPlants.length > 0 ? '#FF9800' : '#bdbdbd',
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: orphanedPlants.length > 0 ? 600 : 400
                }}>{orphanedPlants.length} orphaned</p>
              </div>
            </div>

            {/* Orphaned Plants List */}
            {orphanedPlants.filter(plant => 
              !ignoredAlerts.has(`orphaned_plant-${plant.instanceId}`)
            ).length > 0 && (
              <div style={{
                marginTop: '20px',
                padding: '16px',
                background: '#1a1f2a',
                borderRadius: '8px',
                border: '1px solid #FF9800'
              }}>
                <h4 style={{
                  color: '#FF9800',
                  margin: '0 0 12px 0',
                  fontSize: '14px',
                  fontWeight: 600
                }}>Orphaned Plant Details:</h4>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  {orphanedPlants
                    .filter(plant => !ignoredAlerts.has(`orphaned_plant-${plant.instanceId}`))
                    .map((plant, index) => (
                    <div key={plant.instanceId} style={{
                      background: plant.issue_type === 'missing_zone' ? '#2d1b1b' : '#2a2b1b', // Different colors for different issues
                      borderRadius: '8px',
                      padding: '16px',
                      border: plant.issue_type === 'missing_zone' ? '2px solid #f44336' : '2px solid #FF9800', // Red for critical, orange for warning
                      marginBottom: '12px'
                    }}>
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '12px'
                      }}>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            color: plant.issue_type === 'missing_zone' ? '#f44336' : '#FF9800',
                            fontWeight: 600,
                            fontSize: '16px',
                            marginBottom: '4px'
                          }}>
                            {getCommonName(plant.library_book, plant.plant_id) || `Plant ${plant.plant_id}`}
                          </div>
                          <div style={{
                            color: '#bdbdbd',
                            fontSize: '14px',
                            marginBottom: '8px'
                          }}>
                            {plant.issue_type === 'missing_zone' ? (
                              <>
                                <span style={{ color: '#f44336', fontWeight: 'bold' }}>⚠ CRITICAL:</span> No zone assigned - plant cannot be watered
                              </>
                            ) : (
                              <>Zone: {plant.zone_id || 'None'}, Qty: {plant.quantity}</>
                            )}
                          </div>
                          {plant.issue_type === 'invalid_location' && (
                            <div style={{
                              color: '#FF9800',
                              fontSize: '13px',
                              fontStyle: 'italic'
                            }}>
                              Location {plant.location_id} no longer exists
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={async () => {
                            // Handle plants with missing zones differently
                            if (plant.issue_type === 'missing_zone') {
                              alert('This plant has no zone assigned and needs to be manually reassigned from the Garden Overview page where you can select both location and zone.');
                              return;
                            }
                            
                            // Refresh zones and get smart recommendations for this plant
                            try {
                              console.log('Getting recommendations for orphaned plant:', plant);
                              
                              // Refresh zones data first to ensure we have the latest state
                              const zonesResponse = await fetch(`${getApiBaseUrl()}/api/schedule`);
                              if (zonesResponse.ok) {
                                const zonesData = await zonesResponse.json();
                                setZones(zonesData);
                                console.log('Refreshed zones data for analysis:', zonesData);
                              }
                              
                              const plantData = {
                                library_book: plant.library_book.replace('.json', ''), // Remove .json extension
                                plant_id: plant.plant_id,
                                common_name: plant.common_name,
                                quantity: plant.quantity || 1,
                                emitter_size: plant.emitter_size || 1.0,
                                zone_id: 1, // Default for analysis
                                location_id: 1, // Default for analysis
                                comments: '',
                                planted_date: new Date().toISOString().split('T')[0]
                              };
                              
                              console.log('Analyzing placement with data:', plantData);
                              console.log('Plant details:', {
                                library_book: plantData.library_book,
                                plant_id: plantData.plant_id,
                                common_name: plantData.common_name
                              });
                              
                              const response = await fetch(`${getApiBaseUrl()}/api/smart/analyze-placement`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(plantData)
                              });
                              
                              console.log('Analysis response status:', response.status);
                              
                              if (response.ok) {
                                const analysis = await response.json();
                                console.log('Analysis result:', analysis);
                                
                                // Pre-fill the modal with current plant data
                                setModalData({
                                  quantity: plant.quantity?.toString() || '1',
                                  emitterSize: plant.emitter_size?.toString() || '4',
                                  zoneId: plant.zone_id?.toString() || '',
                                  locationId: plant.location_id?.toString() || '',
                                  comments: plant.comments || ''
                                });
                                
                                setReassignmentModal({
                                  plant: plant,
                                  bookFile: plant.library_book.endsWith('.json') ? plant.library_book : `${plant.library_book}.json`,
                                  recommendations: analysis.recommendations || []
                                });
                              } else {
                                const errorText = await response.text();
                                console.error('Failed to analyze placement:', response.status, errorText);
                                alert(`Failed to analyze plant placement: ${errorText}`);
                              }
                            } catch (error) {
                              console.error('Error analyzing placement:', error);
                              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                              alert(`Error analyzing plant placement: ${errorMessage}`);
                            }
                          }}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #00bcd4',
                            background: 'transparent',
                            color: '#00bcd4',
                            fontSize: '12px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                          title="Reassign to new location"
                        >
                          {plant.issue_type === 'missing_zone' ? 'Manual Fix Required' : 'Reassign'}
                        </button>
                        <button
                          onClick={() => ignoreAlert('orphaned_plant', plant.instanceId)}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            border: '1px solid #FF9800',
                            background: 'transparent',
                            color: '#FF9800',
                            fontSize: '12px',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap'
                          }}
                          title="Ignore this alert"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ignored Alerts Section */}
            {ignoredAlertsData.length > 0 && (
              <div style={{
                background: '#232b3b',
                borderRadius: '16px',
                padding: '16px 20px',
                boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
                border: '1px solid #1a1f2a',
                marginTop: '24px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }} onClick={() => setShowIgnoredAlerts(!showIgnoredAlerts)}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <span style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: '#666',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFF',
                      fontWeight: 'bold',
                      fontSize: '12px'
                    }}>
                      {ignoredAlertsData.length}
                    </span>
                    <h3 style={{
                      color: '#888',
                      margin: 0,
                      fontWeight: 600,
                      fontSize: '16px'
                    }}>Ignored Alerts</h3>
                  </div>
                  <span style={{
                    color: '#888',
                    fontSize: '18px',
                    transition: 'transform 0.2s',
                    transform: showIgnoredAlerts ? 'rotate(90deg)' : 'rotate(0deg)'
                  }}>
                    ▶
                  </span>
                </div>
                
                {showIgnoredAlerts && (
                  <div style={{
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid #1a1f2a'
                  }}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {ignoredAlertsData.map((alert, index) => (
                        <div key={index} style={{
                          padding: '8px 12px',
                          background: '#1a1f2a',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#888',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div>
                            <strong>{alert.alert_type.replace('_', ' ').toUpperCase()}</strong> - ID: {alert.alert_id}
                            <div style={{
                              fontSize: '12px',
                              color: '#666',
                              marginTop: '2px'
                            }}>
                              Ignored: {new Date(alert.ignored_at).toLocaleString()}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              unignoreAlert(alert.alert_type, alert.alert_id);
                            }}
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #00bcd4',
                              background: 'transparent',
                              color: '#00bcd4',
                              fontSize: '12px',
                              cursor: 'pointer'
                            }}
                            title="Show this alert again"
                          >
                            Show
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

        {/* Plant Reassignment Modal */}
        {reassignmentModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '32px',
              minWidth: '500px',
              maxWidth: '700px',
              maxHeight: '95vh',
              color: '#f4f4f4',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              overflow: 'auto'
            }}>
              <h3 style={{
                color: '#00bcd4',
                fontWeight: 700,
                margin: '0 0 16px 0',
                textAlign: 'left',
                flexShrink: 0
              }}>
                Reassign Plant: {reassignmentModal.plant.common_name || getCommonName(reassignmentModal.bookFile, reassignmentModal.plant.plant_id) || `Plant ${reassignmentModal.plant.plant_id}`}
              </h3>
              
              {reassignmentModal.recommendations.length === 0 && (
                <div style={{
                  background: '#2d1b1b',
                  border: '1px solid #ff512f',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ color: '#ff512f', fontSize: '16px' }}>⚠️</span>
                  <span style={{ color: '#ff512f', fontWeight: 600, fontSize: '14px' }}>
                    No compatible zones found for this plant. Use manual selection below.
                  </span>
                </div>
              )}

              <div style={{
                background: '#1a1f2a',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
                border: '1px solid #00bcd4'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}>
                  <p style={{ margin: 0, color: '#00bcd4', fontWeight: 600 }}>
                    🎯 {reassignmentModal.recommendations.length > 0 ? 'Compatible zones found! Select your preferred zone:' : 'Available zones:'}
                  </p>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{
                      color: zoneSelectionMode === 'smart' ? '#00bcd4' : '#666',
                      fontSize: '12px',
                      fontWeight: zoneSelectionMode === 'smart' ? 600 : 500
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
                      onClick={() => setZoneSelectionMode(prev => prev === 'smart' ? 'manual' : 'smart')}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        background: zoneSelectionMode === 'smart' ? '#00bcd4' : '#666',
                        borderRadius: '50%',
                        position: 'absolute',
                        top: '1px',
                        left: zoneSelectionMode === 'smart' ? '1px' : '23px',
                        transition: 'all 0.2s'
                      }} />
                    </div>
                    <span style={{
                      color: zoneSelectionMode === 'manual' ? '#00bcd4' : '#666',
                      fontSize: '12px',
                      fontWeight: zoneSelectionMode === 'manual' ? 600 : 500
                    }}>Manual</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(zoneSelectionMode === 'smart' ? reassignmentModal.recommendations.slice(0, 3) : zones.filter(z => z.mode !== 'disabled')).map((rec: any, index: number) => {
                    const isSmartMode = zoneSelectionMode === 'smart';
                    const zoneId = isSmartMode ? rec.zone_id : rec.zone_id;
                    const isSelected = modalData.zoneId === zoneId.toString();
                    
                    return (
                      <div key={zoneId} style={{
                        background: isSelected ? '#00bcd4' : '#2a3441',
                        borderRadius: '6px',
                        padding: '12px',
                        border: isSelected ? '2px solid #00bcd4' : '1px solid #444',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }} onClick={() => {
                        // Find locations that have this zone
                        const locationsWithZone = locations.filter(loc => loc.zones.includes(zoneId));
                        if (locationsWithZone.length > 0) {
                          setModalData(prev => ({
                            ...prev,
                            zoneId: zoneId.toString(),
                            locationId: locationsWithZone[0].location_id.toString() // Auto-select first location
                          }));
                        } else {
                          // Just set the zone if no locations support it
                          setModalData(prev => ({
                            ...prev,
                            zoneId: zoneId.toString(),
                            locationId: '' // Clear location since none support this zone
                          }));
                        }
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>Zone {zoneId}</strong> ({isSmartMode ? rec.period : rec.period})
                            <div style={{ fontSize: '12px', opacity: 0.8 }}>
                              {isSmartMode ? rec.comment : rec.comment}
                            </div>
                          </div>
                          {isSmartMode && (
                            <div style={{ 
                              background: isSelected ? '#fff' : '#00bcd4', 
                              color: isSelected ? '#00bcd4' : '#fff',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              {Math.round(rec.score * 100)}% match
                            </div>
                          )}
                          {!isSmartMode && (
                            <div style={{ 
                              background: isSelected ? '#fff' : '#666', 
                              color: isSelected ? '#00bcd4' : '#fff',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 'bold'
                            }}>
                              Manual
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }} onSubmit={e => { 
                e.preventDefault(); 
                handleReassignmentConfirm();
              }}>
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '20px',
                  border: '1px solid #00bcd4'
                }}>
                  <p style={{ margin: '0 0 12px 0', color: '#00bcd4', fontWeight: 600 }}>
                    📍 Select location:
                  </p>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '12px'
                  }}>
                    {locations
                      .filter(loc => loc.zones.includes(parseInt(modalData.zoneId)))
                      .map(loc => (
                        <div
                          key={loc.location_id}
                          onClick={() => setModalData(prev => ({ ...prev, locationId: loc.location_id.toString() }))}
                          style={{
                            background: modalData.locationId === loc.location_id.toString() ? '#00bcd4' : '#2a3441',
                            color: modalData.locationId === loc.location_id.toString() ? '#181f2a' : '#fff',
                            borderRadius: '6px',
                            padding: '12px',
                            cursor: 'pointer',
                            border: modalData.locationId === loc.location_id.toString() ? '2px solid #00bcd4' : '1px solid #444',
                            transition: 'all 0.2s',
                            fontSize: '14px',
                            fontWeight: modalData.locationId === loc.location_id.toString() ? 'bold' : 'normal',
                            minWidth: '100px',
                            height: '50px',
                            textAlign: 'center',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {loc.name}
                        </div>
                      ))}
                    {locations.filter(loc => loc.zones.includes(parseInt(modalData.zoneId))).length === 0 && (
                      <div style={{
                        color: '#666',
                        fontSize: '14px',
                        fontStyle: 'italic'
                      }}>
                        No locations support this zone
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    marginTop: '8px'
                  }}>
                    <button
                      type="button"
                      onClick={() => {
                        const availableZones = zones.map((_, idx) => idx);
                        addLayer('location-form', 'form', LocationForm, {
                          availableZones: availableZones,
                          onSave: async (locationData: any) => {
                            console.log('Saving location from health:', locationData);
                            removeLayer('location-form');
                            // Reload data
                            // Reload would happen here
                          },
                          onCancel: () => removeLayer('location-form'),
                          loading: savingLocation,
                          error: '',
                          isTopLayer: true
                        });
                      }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #00bcd4',
                        color: '#00bcd4',
                        borderRadius: '6px',
                        padding: '8px 16px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      + Add New Location
                    </button>
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '12px',
                  marginTop: '16px'
                }}>
                  <button
                    type="button"
                    onClick={() => { 
                      setReassignmentModal(null);
                      setModalData({ quantity: '', emitterSize: '', zoneId: '', locationId: '', comments: '' });
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
                    disabled={!modalData.zoneId || !modalData.locationId}
                    style={{
                      padding: '10px 20px',
                      borderRadius: '8px',
                      border: 'none',
                      background: modalData.zoneId && modalData.locationId ? '#00bcd4' : '#666',
                      color: modalData.zoneId && modalData.locationId ? '#181f2a' : '#999',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: modalData.zoneId && modalData.locationId ? 'pointer' : 'not-allowed',
                      transition: 'all 0.2s',
                      flex: 1
                    }}
                  >
                    Reassign Plant
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Location Creation Form */}
        {false && (
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
            zIndex: 1001
          }}>
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
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
                  color: '#00bcd4',
                  margin: 0,
                  fontWeight: 600
                }}>
                  Create New Location
                </h2>
                <button
                  onClick={() => removeLayer('location-form')}
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

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#f4f4f4',
                  marginBottom: '8px',
                  fontWeight: 600
                }}>
                  Location Name *
                </label>
                <input
                  type="text"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #1a1f2a',
                    background: '#1a1f2a',
                    color: '#f4f4f4',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Enter location name"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  color: '#f4f4f4',
                  marginBottom: '8px',
                  fontWeight: 600
                }}>
                  Description
                </label>
                <textarea
                  value={locationDescription}
                  onChange={(e) => setLocationDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #1a1f2a',
                    background: '#1a1f2a',
                    color: '#f4f4f4',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    minHeight: '80px',
                    resize: 'vertical'
                  }}
                  placeholder="Enter location description"
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{
                  display: 'block',
                  color: '#f4f4f4',
                  marginBottom: '12px',
                  fontWeight: 600
                }}>
                  Select Zones
                </label>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                  gap: '8px'
                }}>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map(zoneId => (
                    <label
                      key={zoneId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        borderRadius: '6px',
                        background: selectedLocationZones.includes(zoneId) ? '#00bcd4' : '#1a1f2a',
                        color: selectedLocationZones.includes(zoneId) ? '#000' : '#f4f4f4',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: selectedLocationZones.includes(zoneId) ? 600 : 400
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLocationZones.includes(zoneId)}
                        onChange={() => handleZoneCheck(zoneId)}
                        style={{ display: 'none' }}
                      />
                      Zone {zoneId}
                    </label>
                  ))}
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end'
              }}>
                <button
                  onClick={() => removeLayer('location-form')}
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
                  onClick={handleSaveLocation}
                  disabled={savingLocation}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '8px',
                    border: '1px solid #00bcd4',
                    background: savingLocation ? '#666' : '#00bcd4',
                    color: savingLocation ? '#888' : '#000',
                    fontSize: '14px',
                    cursor: savingLocation ? 'not-allowed' : 'pointer',
                    fontWeight: 600
                  }}
                >
                  {savingLocation ? 'Creating...' : 'Create Location'}
                </button>
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>
    </div>
  );
} 