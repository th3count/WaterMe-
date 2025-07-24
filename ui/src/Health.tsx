import React, { useEffect, useState } from 'react';
import { getApiBaseUrl } from './utils';

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
  

  
  // Smart placement modal state (same as Garden page)
  const [smartPlacementModal, setSmartPlacementModal] = useState<{ plant: any; bookFile: string; recommendations: any[] } | null>(null);
  const [showLocationForm, setShowLocationForm] = useState(false);
  const [locationName, setLocationName] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [selectedLocationZones, setSelectedLocationZones] = useState<number[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);
  const [zoneSelectionMode, setZoneSelectionMode] = useState<'smart' | 'manual'>('smart');

  useEffect(() => {
    // Load locations and map data
    fetch(`${getApiBaseUrl()}/api/locations`)
      .then(res => res.json())
      .then(data => setLocations(data))
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
    
    // Check for orphaned plants
    const orphaned = Object.entries(map).filter(([instanceId, plant]: [string, any]) => {
      if (!plant || !plant.location_id) return false;
      // Check if the location_id exists in locations
      return !locations.some(loc => loc.location_id === plant.location_id);
    }).map(([instanceId, plant]: [string, any]) => ({ 
      instanceId, 
      plant_id: plant.plant_id, 
      library_book: plant.library_book,
      location_id: plant.location_id, 
      zone_id: plant.zone_id, 
      quantity: plant.quantity 
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
    return plantNames[libraryBook]?.[plantId] || `Plant ${plantId}`;
  };

  // Smart placement functions (same as Garden page)
  const handleSmartPlacementConfirm = async (selectedZoneId: number, selectedLocationId: number) => {
    if (!smartPlacementModal) return;
    
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/map/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plant_id: smartPlacementModal.plant.plant_id,
          library_book: smartPlacementModal.bookFile,
          quantity: 1, // Default quantity for reassignment
          emitter_size: 4, // Default emitter size for reassignment
          zone_id: selectedZoneId,
          location_id: selectedLocationId,
          comments: `Reassigned from orphaned plant (Instance ${smartPlacementModal.plant.instanceId})`
        })
      });

      if (response.ok) {
        // Close modal and reload data
        setSmartPlacementModal(null);
        // Reload orphaned plants
        const alertsResponse = await fetch(`${getApiBaseUrl()}/api/health/alerts`);
        const alertsData = await alertsResponse.json();
        setOrphanedPlants(alertsData.orphaned_plants || []);
        setSystemStatus(alertsData.orphaned_plants?.length > 0 ? 'warning' : 'good');
      } else {
        console.error('Failed to reassign plant:', response.status);
        alert('Failed to reassign plant. Please try again.');
      }
    } catch (error) {
      console.error('Error reassigning plant:', error);
      alert('Error reassigning plant. Please try again.');
    }
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
        setShowLocationForm(false);
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
                      padding: '8px 12px',
                      background: '#232b3b',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#f4f4f4',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <strong>{getCommonName(plant.library_book, plant.plant_id)}</strong> - 
                        Zone: {plant.zone_id}, Qty: {plant.quantity}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button
                          onClick={async () => {
                            // Get smart recommendations for this plant
                            try {
                              console.log('Getting recommendations for plant:', plant);
                              const requestData = {
                                plant_id: plant.plant_id,
                                library_book: plant.library_book
                              };
                              console.log('Request data:', requestData);
                              
                              const response = await fetch(`${getApiBaseUrl()}/api/smart/zone-recommendations`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(requestData)
                              });
                              
                              console.log('Response status:', response.status);
                              
                              if (response.ok) {
                                const data = await response.json();
                                console.log('Response data:', data);
                                setSmartPlacementModal({
                                  plant: plant,
                                  bookFile: plant.library_book,
                                  recommendations: data.recommendations || []
                                });
                              } else {
                                const errorText = await response.text();
                                console.error('Failed to get recommendations:', response.status, errorText);
                                alert(`Failed to get placement recommendations: ${errorText}`);
                              }
                            } catch (error) {
                              console.error('Error getting recommendations:', error);
                              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                              alert(`Error getting placement recommendations: ${errorMessage}`);
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
                          Reassign
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

        {/* Smart Placement Modal */}
        {smartPlacementModal && (
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
            zIndex: 1000
          }}>
            <div style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto',
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
                  Reassign Plant: {getCommonName(smartPlacementModal.bookFile, smartPlacementModal.plant.plant_id)}
                </h2>
                <button
                  onClick={() => setSmartPlacementModal(null)}
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

              {/* Zone Recommendations */}
              {smartPlacementModal.recommendations.length > 0 ? (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{
                    color: '#f4f4f4',
                    margin: '0 0 16px 0',
                    fontWeight: 600,
                    fontSize: '16px'
                  }}>
                    Recommended Zones
                  </h3>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {smartPlacementModal.recommendations.map((rec, idx) => (
                      <div
                        key={idx}
                        style={{
                          background: '#1a1f2a',
                          borderRadius: '8px',
                          padding: '16px',
                          border: '2px solid #00bcd4',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => handleSmartPlacementConfirm(rec.zone_id, rec.location_id)}
                      >
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '8px'
                        }}>
                          <div style={{
                            color: '#00bcd4',
                            fontWeight: 600,
                            fontSize: '16px'
                          }}>
                            Zone {rec.zone_id}
                          </div>
                          <div style={{
                            color: '#4CAF50',
                            fontSize: '14px',
                            fontWeight: 600
                          }}>
                            {rec.compatibility_score}% Match
                          </div>
                        </div>
                        <div style={{
                          color: '#bdbdbd',
                          fontSize: '14px',
                          marginBottom: '8px'
                        }}>
                          Location: {locations.find(loc => loc.location_id === rec.location_id)?.name || `Location ${rec.location_id}`}
                        </div>
                        <div style={{
                          color: '#888',
                          fontSize: '12px'
                        }}>
                          {rec.reasoning}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#1a1f2a',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '24px',
                  border: '1px solid #FF9800'
                }}>
                  <div style={{
                    color: '#FF9800',
                    fontWeight: 600,
                    marginBottom: '8px'
                  }}>
                    No Compatible Zones Found
                  </div>
                  <div style={{
                    color: '#bdbdbd',
                    fontSize: '14px'
                  }}>
                    This plant doesn't have any compatible zones. You may need to create a new location or manually assign it to an existing zone.
                  </div>
                </div>
              )}

              {/* Manual Options */}
              <div style={{
                borderTop: '1px solid #1a1f2a',
                paddingTop: '20px'
              }}>
                <h3 style={{
                  color: '#f4f4f4',
                  margin: '0 0 16px 0',
                  fontWeight: 600,
                  fontSize: '16px'
                }}>
                  Manual Options
                </h3>
                <div style={{
                  display: 'flex',
                  gap: '12px'
                }}>
                  <button
                    onClick={() => setShowLocationForm(true)}
                    style={{
                      padding: '12px 20px',
                      borderRadius: '8px',
                      border: '1px solid #00bcd4',
                      background: 'transparent',
                      color: '#00bcd4',
                      fontSize: '14px',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    Create New Location
                  </button>
                  <button
                    onClick={() => setSmartPlacementModal(null)}
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
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Location Creation Form */}
        {showLocationForm && (
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
                  onClick={() => setShowLocationForm(false)}
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
                  onClick={() => setShowLocationForm(false)}
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