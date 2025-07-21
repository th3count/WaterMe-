import React, { useState, useEffect } from 'react';
import { getApiBaseUrl } from './utils';

interface Plant {
  plant_id: number;
  common_name: string;
  alternative_name?: string;
  latin_name: string;
  watering_frequency: string[];
  compatible_watering_frequencies: string[];
  preferred_time: string[];
  compatible_watering_times: string[];
  watering_cycles?: number[];
  root_area_sqft: number;
  water_optimal_in_week: number;
  tolerance_min_in_week: number;
  tolerance_max_in_week: number;
  usda_zones: string;
  soil_type: string;
  soil_ph: string;
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
  const [filterWaterNeeds, setFilterWaterNeeds] = useState('');
  const [filterUSDAZone, setFilterUSDAZone] = useState('');
  const [expandedPlant, setExpandedPlant] = useState<number | null>(null);
  const [selectedPlant, setSelectedPlant] = useState<Plant | null>(null);
  const [plantDetails, setPlantDetails] = useState<any>(null);
  const [loadingPlant, setLoadingPlant] = useState(false);
  const [showAddPlant, setShowAddPlant] = useState(false);
  const [newPlant, setNewPlant] = useState<Partial<Plant>>({
    common_name: '',
    alternative_name: '',
    latin_name: '',
    watering_frequency: ['Weekly'],
    compatible_watering_frequencies: ['Weekly'],
    preferred_time: ['SUNRISE+30'],
    compatible_watering_times: ['SUNSET-60'],
    watering_cycles: [1],
    root_area_sqft: 1.0,
    water_optimal_in_week: 1.0,
    tolerance_min_in_week: 0.7,
    tolerance_max_in_week: 1.3,
    usda_zones: '',
    soil_type: '',
    soil_ph: '',
    sun_exposure: '',
    fruiting_period: '',
    planting_time: '',
    spacing_inches: undefined,
    growth_type: 'Perennial'
  });
  const [savingPlant, setSavingPlant] = useState(false);
  const [wateringCyclesInput, setWateringCyclesInput] = useState('');
  // Raw input strings for comma-separated time fields so the user can type a trailing comma
  const [preferredTimeInput, setPreferredTimeInput] = useState('');
  const [compatibleTimesInput, setCompatibleTimesInput] = useState('');
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  // Edit mode helpers
  const [isEditing, setIsEditing] = useState(false);
  const [editingPlantId, setEditingPlantId] = useState<number | null>(null);
  const [editingSourceFile, setEditingSourceFile] = useState<string | null>(null);

  useEffect(() => {
    loadLibraryFiles();
  }, []);

  // Handle clicking outside of add plant modal to cancel
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!showAddPlant) return;
      
      const target = event.target as HTMLElement;
      
      // Check if click is on the modal, its contents, or the Add Plant button
      const isModalClick = target.closest('[data-add-plant-modal="true"]');
      const isAddPlantButton = target.closest('[data-add-plant-button="true"]');
      
      // If click is not on the modal or Add Plant button, close it
      if (!isModalClick && !isAddPlantButton) {
        setShowAddPlant(false);
        // Reset form data if not editing
        if (!isEditing) {
          setNewPlant({
            common_name: '',
            alternative_name: '',
            latin_name: '',
            watering_frequency: ['Weekly'],
            compatible_watering_frequencies: ['Weekly'],
            preferred_time: ['SUNRISE+30'],
            compatible_watering_times: ['SUNSET-60'],
            watering_cycles: [1],
            root_area_sqft: 1.0,
            water_optimal_in_week: 1.0,
            tolerance_min_in_week: 0.7,
            tolerance_max_in_week: 1.3,
            usda_zones: '',
            soil_type: '',
            soil_ph: '',
            sun_exposure: '',
            fruiting_period: '',
            planting_time: '',
            spacing_inches: undefined,
            growth_type: 'Perennial'
          });
          setValidationErrors({});
          setPreferredTimeInput('');
          setCompatibleTimesInput('');
          setWateringCyclesInput('');
        }
      }
    };

    if (showAddPlant) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showAddPlant, isEditing]);

  // Keep the raw string inputs in sync whenever the backing array changes (e.g. when the form opens / resets)
  useEffect(() => {
    setPreferredTimeInput(newPlant.preferred_time?.join(', ') || '');
    setCompatibleTimesInput(newPlant.compatible_watering_times?.join(', ') || '');
  }, [showAddPlant]);

  // Initialize watering cycles input when field becomes visible
  useEffect(() => {
    if (newPlant.watering_frequency?.[0] === 'Daily' || newPlant.compatible_watering_frequencies?.[0] === 'Daily') {
      setWateringCyclesInput(newPlant.watering_cycles?.join(', ') || '');
    }
  }, [newPlant.watering_frequency, newPlant.compatible_watering_frequencies]);

  // Validation functions
  const validateTimeFormat = (time: string): boolean => {
    // Accept keywords SUNRISE, SUNSET, ZENITH with optional +/-minutes (e.g., SUNRISE+30)
    // or 24-hour HHMM numeric times such as 0600, 1830, etc.
    const timeRegex = /^(SUNRISE|SUNSET|ZENITH)([+-]\d+)?$|^([01]?[0-9]|2[0-3])[0-5][0-9]$/i;
    return timeRegex.test(time.trim());
  };

  const validateField = (fieldName: string, value: any): string | null => {
    switch (fieldName) {
      case 'common_name':
        if (!value?.trim()) return 'Common name is required';
        if (value.trim().length < 2) return 'Common name must be at least 2 characters';
        if (value.trim().length > 100) return 'Common name must be 100 characters or less';
        break;
        
      case 'latin_name':
        if (value?.trim()) {
          if (value.trim().length < 3) return 'Latin name must be at least 3 characters';
          if (value.trim().length > 150) return 'Latin name must be 150 characters or less';
        }
        break;
        
      case 'watering_frequency':
        if (!value?.length || !value[0]?.trim()) return 'Watering frequency is required';
        const validFrequencies = ['Daily', 'Weekly', 'Monthly'];
        if (!validFrequencies.includes(value[0])) return 'Invalid watering frequency selected';
        break;
        
      case 'preferred_time':
        if (!value?.length || !value[0]?.trim()) return 'Preferred time is required';
        const invalidTimes = value.filter((time: string) => !validateTimeFormat(time));
        if (invalidTimes.length > 0) {
          return 'Invalid time format. Use SUNRISE/SUNSET with optional +/-minutes or 24hr format (e.g., 0600)';
        }
        break;
        
      case 'root_area_sqft':
        if (!value || value <= 0) return 'Root area must be greater than 0';
        if (value > 1000) return 'Root area must be 1000 sq ft or less';
        break;
        
      case 'water_optimal_in_week':
        if (!value || value <= 0) return 'Water optimal must be greater than 0';
        if (value > 100) return 'Water optimal must be 100 or less';
        break;
        
      case 'watering_cycles':
        if (newPlant.watering_frequency?.[0] === 'Daily') {
          if (!value || value.length === 0) return 'Watering cycle is required for Daily frequency';
          
          const cycle = value[0];
          if (!Number.isInteger(cycle)) return 'Watering cycle must be a whole number';
          if (cycle < 1 || cycle > 10) return 'Watering cycle must be between 1 and 10';
        }
        break;
        
      case 'usda_zones':
        if (value?.trim()) {
          const zoneRegex = /^[0-9]+(-[0-9]+)?$/;
          if (!zoneRegex.test(value.trim())) return 'Invalid USDA zone format (e.g., 3-9 or 5)';
        }
        break;
        
      case 'spacing_inches':
        if (value !== undefined) {
          if (value <= 0) return 'Spacing must be greater than 0';
          if (value > 1000) return 'Spacing must be 1000 inches or less';
        }
        break;
    }
    return null;
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setNewPlant({...newPlant, [fieldName]: value});
    
    // Clear existing error for this field
    if (validationErrors[fieldName]) {
      setValidationErrors(prev => {
        const newErrors = {...prev};
        delete newErrors[fieldName];
        return newErrors;
      });
    }
    
    // Validate the field
    const error = validateField(fieldName, value);
    if (error) {
      setValidationErrors(prev => ({...prev, [fieldName]: error}));
    }
  };

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

  const getFilteredPlants = () => {
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

  const getUniqueGrowthTypes = () => {
    if (!selectedFile) return [];
    const file = libraryFiles.find(f => f.filename === selectedFile);
    if (!file) return [];
    return [...new Set(file.plants.map(p => p.growth_type))].sort();
  };

  const getUniqueWaterFrequencies = () => {
    if (!selectedFile) return [];
    const file = libraryFiles.find(f => f.filename === selectedFile);
    if (!file) return [];
    const allFrequencies = file.plants.flatMap(p => [
      ...p.watering_frequency,
      ...p.compatible_watering_frequencies
    ]);
    return [...new Set(allFrequencies)].sort();
  };

  const getUniqueUSDAZones = () => {
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

  const togglePlantExpansion = (plant: Plant) => {
    if (expandedPlant === plant.plant_id) {
      setExpandedPlant(null);
      setSelectedPlant(null);
      setPlantDetails(null);
    } else {
      setExpandedPlant(plant.plant_id);
      setSelectedPlant(plant);
      setPlantDetails(plant);
    }
  };

  const saveNewPlant = async () => {
    // Clear previous validation errors
    setValidationErrors({});
    
    // Comprehensive validation for all fields
    const errors: {[key: string]: string} = {};
    
    // Required fields validation
    if (!newPlant.common_name?.trim()) {
      errors.common_name = 'Common name is required';
    } else if (newPlant.common_name.trim().length < 2) {
      errors.common_name = 'Common name must be at least 2 characters';
    } else if (newPlant.common_name.trim().length > 100) {
      errors.common_name = 'Common name must be 100 characters or less';
    }
    
    if (newPlant.latin_name?.trim()) {
      if (newPlant.latin_name.trim().length < 3) {
        errors.latin_name = 'Latin name must be at least 3 characters';
      } else if (newPlant.latin_name.trim().length > 150) {
        errors.latin_name = 'Latin name must be 150 characters or less';
      }
    }
    
    if (!newPlant.watering_frequency?.length || !newPlant.watering_frequency[0]?.trim()) {
      errors.watering_frequency = 'Watering frequency is required';
    } else {
      const validFrequencies = ['Daily', 'Weekly', 'Monthly'];
      if (!validFrequencies.includes(newPlant.watering_frequency[0])) {
        errors.watering_frequency = 'Invalid watering frequency selected';
      }
    }
    
    if (!newPlant.preferred_time?.length || !newPlant.preferred_time[0]?.trim()) {
      errors.preferred_time = 'Preferred time is required';
    } else {
      const invalidTimes = newPlant.preferred_time.filter((time: string) => !validateTimeFormat(time));
      if (invalidTimes.length > 0) {
        errors.preferred_time = 'Invalid time format. Use SUNRISE/SUNSET/ZENITH with optional +/-minutes or 24hr format (e.g., 0600)';
      }
    }
    
    if (!newPlant.root_area_sqft || newPlant.root_area_sqft <= 0) {
      errors.root_area_sqft = 'Root area is required and must be greater than 0';
    } else if (newPlant.root_area_sqft > 1000) {
      errors.root_area_sqft = 'Root area must be 1000 sq ft or less';
    }
    
    if (!newPlant.water_optimal_in_week || newPlant.water_optimal_in_week <= 0) {
      errors.water_optimal_in_week = 'Water optimal is required and must be greater than 0';
    } else if (newPlant.water_optimal_in_week > 100) {
      errors.water_optimal_in_week = 'Water optimal must be 100 or less';
    }
    
    // Watering cycles validation for Daily frequency
    if (newPlant.watering_frequency?.[0] === 'Daily') {
      if (!newPlant.watering_cycles || newPlant.watering_cycles.length === 0) {
        errors.watering_cycles = 'Watering cycle is required when Daily frequency is selected';
      } else {
        const cycle = newPlant.watering_cycles[0];
        if (!Number.isInteger(cycle)) {
          errors.watering_cycles = 'Watering cycle must be a whole number';
        } else if (cycle < 1 || cycle > 10) {
          errors.watering_cycles = 'Watering cycle must be between 1 and 10';
        }
      }
    }
    
    // USDA zones validation
    if (newPlant.usda_zones?.trim()) {
      const zoneRegex = /^[0-9]+(-[0-9]+)?$/;
      if (!zoneRegex.test(newPlant.usda_zones.trim())) {
        errors.usda_zones = 'USDA zones must be in format like "3-9" or "5"';
      }
    }
    
    // Spacing validation
    if (newPlant.spacing_inches !== undefined) {
      if (newPlant.spacing_inches <= 0) {
        errors.spacing_inches = 'Spacing must be greater than 0';
      } else if (newPlant.spacing_inches > 1000) {
        errors.spacing_inches = 'Spacing must be 1000 inches or less';
      }
    }
    
    // If there are validation errors, display them and stop
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      return;
    }

    setSavingPlant(true);
    try {
      const plantToSave = {
        ...newPlant,
        plant_id: Date.now()
      } as Plant;

      const endpoint = isEditing && editingSourceFile === 'custom.json' ? `${getApiBaseUrl()}/api/library/custom/update` : `${getApiBaseUrl()}/api/library/custom/add`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(plantToSave),
      });

      if (!response.ok) {
        throw new Error('Failed to add plant to custom library');
      }

      alert(isEditing ? `Plant "${plantToSave.common_name}" has been updated!` : `Plant "${plantToSave.common_name}" has been added to your custom library!`);
      setShowAddPlant(false);
      setIsEditing(false);
      setEditingPlantId(null);
      setEditingSourceFile(null);
      setNewPlant({
        common_name: '',
        alternative_name: '',
        latin_name: '',
        watering_frequency: ['Weekly'],
        compatible_watering_frequencies: ['Weekly'],
        preferred_time: ['SUNRISE+30'],
        compatible_watering_times: ['SUNSET-60'],
        watering_cycles: [1],
        root_area_sqft: 1.0,
        water_optimal_in_week: 1.0,
        tolerance_min_in_week: 0.7,
        tolerance_max_in_week: 1.3,
        usda_zones: '',
        soil_type: '',
        soil_ph: '',
        sun_exposure: '',
        fruiting_period: '',
        planting_time: '',
        spacing_inches: undefined,
        growth_type: 'Perennial'
      });
      await loadLibraryFiles();
      
    } catch (err) {
      console.error('Error adding plant:', err);
      alert('Failed to add plant to custom library. Please try again.');
    } finally {
      setSavingPlant(false);
    }
  };

  // Begin editing an existing plant
  const handleEditPlant = (plant: Plant) => {
    setIsEditing(true);
    setEditingPlantId(plant.plant_id);
    setEditingSourceFile(selectedFile);
    // Pre-populate form
    setNewPlant({...plant});
    setPreferredTimeInput(plant.preferred_time?.join(', ') || '');
    setCompatibleTimesInput(plant.compatible_watering_times?.join(', ') || '');
    setWateringCyclesInput(plant.watering_cycles ? plant.watering_cycles[0].toString() : '');
    setShowAddPlant(true);
  };

  // Delete a plant from the custom library
  const handleDeletePlant = async (plant: Plant) => {
    if (!selectedFile || selectedFile !== 'custom.json') {
      alert('Can only delete plants from the custom library.');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${plant.common_name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      // Find the current custom library file
      const customFile = libraryFiles.find(file => file.filename === 'custom.json');
      if (!customFile) {
        alert('Custom library not found.');
        return;
      }

      // Remove the plant from the plants array
      const updatedPlants = customFile.plants.filter(p => p.plant_id !== plant.plant_id);

      // Save the updated custom library
      const response = await fetch(`${getApiBaseUrl()}/library/custom.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'Book Name': 'Custom Plants',
          plants: updatedPlants
        })
      });

      if (!response.ok) {
        throw new Error('Failed to delete plant');
      }

      // Update local state
      setLibraryFiles(prev => prev.map(file => 
        file.filename === 'custom.json' 
          ? { ...file, plants: updatedPlants }
          : file
      ));

      // Close expanded plant if it was the deleted one
      if (expandedPlant === plant.plant_id) {
        setExpandedPlant(null);
      }

      alert('Plant deleted successfully!');
    } catch (error) {
      console.error('Error deleting plant:', error);
      alert('Failed to delete plant. Please try again.');
    }
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
  const uniqueGrowthTypes = getUniqueGrowthTypes();
  const uniqueWaterFrequencies = getUniqueWaterFrequencies();
  const uniqueUSDAZones = getUniqueUSDAZones();

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
        </div>
        
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
              <button
                data-add-plant-button="true"
                onClick={() => setShowAddPlant(true)}
                style={{
                  background: '#00bcd4',
                  color: '#181f2a',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                Add Plant
              </button>
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

          {/* Add Plant Modal */}
          {showAddPlant && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }}>
              <div 
                data-add-plant-modal="true"
                style={{
                  background: '#232b3b',
                  borderRadius: '16px',
                  padding: '24px',
                  maxWidth: '800px',
                  width: '90%',
                  maxHeight: '90vh',
                  overflow: 'auto',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  border: '1px solid #1a1f2a'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginBottom: '24px'
                }}>
                  <h2 style={{
                    color: '#00bcd4',
                    fontWeight: 600,
                    margin: 0
                  }}>{isEditing ? 'Edit Plant' : 'Add New Plant'}</h2>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px'
                }}>
                  {/* Left Column: Basic Information + Growing Conditions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Basic Information */}
                    <div>
                      <h3 style={{
                        color: '#00bcd4',
                        margin: '0 0 16px 0',
                        fontSize: '16px',
                        fontWeight: 600
                      }}>Basic Information</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Common Name *
                        </label>
                        <input
                          type="text"
                          value={newPlant.common_name}
                          onChange={(e) => handleFieldChange('common_name', e.target.value)}
                          style={{
                            background: '#1a1f2a',
                            color: '#f4f4f4',
                            border: validationErrors.common_name ? '1px solid #ff512f' : '1px solid #00bcd4',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '14px',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                          placeholder="e.g., Strawberry, Red"
                        />
                        {validationErrors.common_name && (
                          <div style={{
                            color: '#ff512f',
                            fontSize: '12px',
                            marginTop: '4px'
                          }}>
                            {validationErrors.common_name}
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Alternative Name
                        </label>
                        <input
                          type="text"
                          value={newPlant.alternative_name}
                          onChange={(e) => setNewPlant({...newPlant, alternative_name: e.target.value})}
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
                          placeholder="e.g., Garden Strawberry"
                        />
                      </div>
                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Latin Name
                        </label>
                        <input
                          type="text"
                          value={newPlant.latin_name}
                          onChange={(e) => setNewPlant({...newPlant, latin_name: e.target.value})}
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
                          placeholder="e.g., Fragaria × ananassa"
                        />
                      </div>
                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Growth Type
                        </label>
                        <select
                          value={newPlant.growth_type}
                          onChange={(e) => setNewPlant({...newPlant, growth_type: e.target.value})}
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
                          <option value="">Select growth type...</option>
                          <option value="Annual">Annual</option>
                          <option value="Biennial">Biennial</option>
                          <option value="Perennial">Perennial</option>
                          <option value="Shrub">Shrub</option>
                          <option value="Tree">Tree</option>
                          <option value="Vine">Vine</option>
                          <option value="Herb">Herb</option>
                          <option value="Grass">Grass</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          USDA Zones
                        </label>
                        <input
                          type="text"
                          value={newPlant.usda_zones}
                          onChange={(e) => {
                            const input = e.target.value;
                            // Only allow digits and dash
                            const filtered = input.replace(/[^0-9-]/g, '');
                            setNewPlant({...newPlant, usda_zones: filtered});
                          }}
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
                          placeholder="e.g., 3-9"
                        />
                      </div>
                    </div>
                  </div>

                    {/* Growing Conditions */}
                    <div>
                      <h3 style={{
                        color: '#00bcd4',
                        margin: '0 0 16px 0',
                        fontSize: '16px',
                        fontWeight: 600
                      }}>Growing Conditions</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                          <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                            Soil Type
                          </label>
                          <select
                            value={newPlant.soil_type}
                            onChange={(e) => setNewPlant({...newPlant, soil_type: e.target.value})}
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
                            <option value="">Select soil type...</option>
                            <option value="Well-drained">Well-drained</option>
                            <option value="Moist">Moist</option>
                            <option value="Sandy">Sandy</option>
                            <option value="Loamy">Loamy</option>
                            <option value="Clay">Clay</option>
                            <option value="Rich">Rich</option>
                            <option value="Poor">Poor</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                            Soil pH
                          </label>
                          <select
                            value={newPlant.soil_ph}
                            onChange={(e) => setNewPlant({...newPlant, soil_ph: e.target.value})}
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
                            <option value="">Select soil pH...</option>
                            <option value="Acidic (pH 4.5-6.0)">Acidic (pH 4.5-6.0)</option>
                            <option value="Neutral (pH 6.0-7.5)">Neutral (pH 6.0-7.5)</option>
                            <option value="Alkaline (pH 7.5-8.5)">Alkaline (pH 7.5-8.5)</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                            Sun Exposure
                          </label>
                          <select
                            value={newPlant.sun_exposure}
                            onChange={(e) => setNewPlant({...newPlant, sun_exposure: e.target.value})}
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
                            <option value="">Select sun exposure...</option>
                            <option value="Full Sun">Full Sun (6+ hours)</option>
                            <option value="Partial Sun">Partial Sun (4-6 hours)</option>
                            <option value="Partial Shade">Partial Shade (2-4 hours)</option>
                            <option value="Full Shade">Full Shade (0-2 hours)</option>
                            <option value="Dappled Shade">Dappled Shade</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                            Fruiting Period
                          </label>
                          <input
                            type="text"
                            value={newPlant.fruiting_period}
                            onChange={(e) => setNewPlant({...newPlant, fruiting_period: e.target.value})}
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
                            placeholder="e.g., Jun-Jul"
                          />
                        </div>
                        <div>
                          <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                            Planting Time
                          </label>
                          <select
                            value={newPlant.planting_time}
                            onChange={(e) => setNewPlant({...newPlant, planting_time: e.target.value})}
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
                            <option value="">Select planting time...</option>
                            <option value="Early Spring">Early Spring (Feb-Mar)</option>
                            <option value="Spring">Spring (Mar-May)</option>
                            <option value="Late Spring">Late Spring (May-Jun)</option>
                            <option value="Early Summer">Early Summer (Jun-Jul)</option>
                            <option value="Summer">Summer (Jun-Aug)</option>
                            <option value="Late Summer">Late Summer (Aug-Sep)</option>
                            <option value="Early Fall">Early Fall (Sep-Oct)</option>
                            <option value="Fall">Fall (Sep-Nov)</option>
                            <option value="Late Fall">Late Fall (Nov-Dec)</option>
                            <option value="Year-round">Year-round</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                            Spacing (inches)
                          </label>
                          <input
                            type="number"
                            value={newPlant.spacing_inches || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              // Only allow integers (no decimals)
                              if (value === '') {
                                setNewPlant({...newPlant, spacing_inches: undefined});
                              } else {
                                const intValue = parseInt(value);
                                if (!isNaN(intValue)) {
                                  setNewPlant({...newPlant, spacing_inches: intValue});
                                }
                              }
                            }}
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
                      </div>
                    </div>
                  </div>

                  {/* Watering Requirements */}
                  <div>
                    <h3 style={{
                      color: '#00bcd4',
                      margin: '0 0 16px 0',
                      fontSize: '16px',
                      fontWeight: 600
                    }}>Watering Requirements</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                             <div>
                         <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                           Watering Frequency *
                         </label>
                         <select
                           value={newPlant.watering_frequency?.[0] || 'Weekly'}
                           onChange={(e) => handleFieldChange('watering_frequency', [e.target.value])}
                           style={{
                             background: '#1a1f2a',
                             color: '#f4f4f4',
                             border: validationErrors.watering_frequency ? '1px solid #ff512f' : '1px solid #00bcd4',
                             borderRadius: '6px',
                             padding: '8px 12px',
                             fontSize: '14px',
                             width: '100%'
                           }}
                         >
                           <option value="Daily">Daily</option>
                           <option value="Weekly">Weekly</option>
                           <option value="Monthly">Monthly</option>
                         </select>
                         {validationErrors.watering_frequency && (
                           <div style={{
                             color: '#ff512f',
                             fontSize: '12px',
                             marginTop: '4px'
                           }}>
                             {validationErrors.watering_frequency}
                           </div>
                         )}
                       </div>
                       <div>
                         <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                           Compatible Watering Frequencies
                         </label>
                         <select
                           value={newPlant.compatible_watering_frequencies?.[0] || 'Weekly'}
                           onChange={(e) => setNewPlant({...newPlant, compatible_watering_frequencies: [e.target.value]})}
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
                           <option value="Daily">Daily</option>
                           <option value="Weekly">Weekly</option>
                           <option value="Monthly">Monthly</option>
                         </select>
                       </div>
                       {(newPlant.watering_frequency?.[0] === 'Daily' || newPlant.compatible_watering_frequencies?.[0] === 'Daily') && (
                         <div>
                           <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                             Watering Cycles *
                           </label>
                           <input
                             type="number"
                             min="1"
                             max="10"
                             value={newPlant.watering_cycles?.[0] || ''}
                             onChange={(e) => {
                               const value = e.target.value;
                               if (value === '') {
                                 setNewPlant(prev => ({...prev, watering_cycles: []}));
                               } else {
                                 const intValue = parseInt(value);
                                 if (!isNaN(intValue) && intValue >= 1 && intValue <= 10) {
                                   setNewPlant(prev => ({...prev, watering_cycles: [intValue]}));
                                 }
                               }
                             }}
                             style={{
                               background: '#1a1f2a',
                               color: '#f4f4f4',
                               border: validationErrors.watering_cycles ? '1px solid #ff512f' : '1px solid #00bcd4',
                               borderRadius: '6px',
                               padding: '8px 12px',
                               fontSize: '14px',
                               width: '100%',
                               boxSizing: 'border-box'
                             }}
                             placeholder="e.g., 1"
                           />
                           {validationErrors.watering_cycles && (
                             <div style={{
                               color: '#ff512f',
                               fontSize: '12px',
                               marginTop: '4px'
                             }}>
                               {validationErrors.watering_cycles}
                             </div>
                           )}
                         </div>
                       )}
                       
                       {/* Watering Cycles Manual */}
                       {(newPlant.watering_frequency?.[0] === 'Daily' || newPlant.compatible_watering_frequencies?.[0] === 'Daily') && (
                         <div style={{
                           background: '#1a1f2a',
                           borderRadius: '8px',
                           padding: '12px',
                           marginBottom: '16px',
                           border: '1px solid #2d3748'
                         }}>
                           <h4 style={{
                             color: '#00bcd4',
                             margin: '0 0 8px 0',
                             fontSize: '14px',
                             fontWeight: 600
                           }}>Watering Cycles Guide</h4>
                           <div style={{
                             color: '#bdbdbd',
                             fontSize: '12px',
                             lineHeight: '1.4'
                           }}>
                                                        <p style={{ margin: '0 0 8px 0' }}>
                             <strong>Watering Cycle:</strong> Enter a number (1-10) to water every N days
                           </p>
                           <p style={{ margin: '0 0 8px 0' }}>
                             <strong>Examples:</strong> 1 (daily), 2 (every 2 days), 3 (every 3 days)
                           </p>
                           <p style={{ margin: '0 0 8px 0' }}>
                             <strong>Rules:</strong> Whole numbers 1-10 only, no decimals
                           </p>
                           <p style={{ margin: 0 }}>
                             <strong>Range:</strong> 1-10 days between watering
                           </p>
                           </div>
                         </div>
                       )}
                       
                       {/* Watering Times Manual */}
                       <div style={{
                         background: '#1a1f2a',
                         borderRadius: '8px',
                         padding: '12px',
                         marginBottom: '16px',
                         border: '1px solid #2d3748'
                       }}>
                         <h4 style={{
                           color: '#00bcd4',
                           margin: '0 0 8px 0',
                           fontSize: '14px',
                           fontWeight: 600
                         }}>Watering Times Guide</h4>
                         <div style={{
                           color: '#bdbdbd',
                           fontSize: '12px',
                           lineHeight: '1.4'
                         }}>
                           <p style={{ margin: '0 0 8px 0' }}>
                             <strong>Time Aliases:</strong> SUNRISE, SUNSET, SUNRISE+30, SUNRISE+60, SUNSET-30, SUNSET-60
                           </p>
                           <p style={{ margin: '0 0 8px 0' }}>
                             <strong>24-Hour Format:</strong> 0600 (6 AM), 1200 (12 PM), 1800 (6 PM), 2000 (8 PM)
                           </p>
                           <p style={{ margin: '0 0 8px 0' }}>
                             <strong>Multiple Times:</strong> Separate with commas: SUNRISE+30, 1800, SUNSET-60
                           </p>
                           <p style={{ margin: 0 }}>
                             <strong>Example:</strong> SUNRISE+30, 1000, SUNSET-60
                           </p>
                         </div>
                       </div>
                       
                       <div>
                         <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                           Preferred Watering Time *
                         </label>
                         <input
                           type="text"
                           value={preferredTimeInput}
                           onChange={(e) => {
                             const raw = e.target.value;
                             // Allow only letters, digits, plus, minus, comma and space
                             const input = raw.replace(/[^a-zA-Z0-9,+\- ]/g, '');
                             setPreferredTimeInput(input);
                              
                              // Convert to array of times ignoring the last empty element (if any)
                              const times = input.split(',')
                                .map(t => t.trim())
                                .filter((t, idx, arr) => t.length > 0 || idx < arr.length - 1);
                              
                              setNewPlant(prev => ({...prev, preferred_time: times}));
                           }}
                           onKeyDown={(e) => {
                             // Explicitly allow comma key
                             if (e.key === ',') {
                               e.stopPropagation();
                             }
                           }}
                           style={{
                             background: '#1a1f2a',
                             color: '#f4f4f4',
                             border: validationErrors.preferred_time ? '1px solid #ff512f' : '1px solid #00bcd4',
                             borderRadius: '6px',
                             padding: '8px 12px',
                             fontSize: '14px',
                             width: '100%',
                             boxSizing: 'border-box'
                           }}
                           placeholder="e.g., SUNRISE+30, 1800, SUNSET-60"
                         />
                         {validationErrors.preferred_time && (
                           <div style={{
                             color: '#ff512f',
                             fontSize: '12px',
                             marginTop: '4px'
                           }}>
                             {validationErrors.preferred_time}
                           </div>
                         )}
                       </div>
                       <div>
                         <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                           Compatible Watering Times
                         </label>
                         <input
                           type="text"
                           value={compatibleTimesInput}
                           onChange={(e) => {
                             const raw = e.target.value;
                             const input = raw.replace(/[^a-zA-Z0-9,+\- ]/g, '');
                             setCompatibleTimesInput(input);
                             
                              const times = input.split(',')
                                .map(t => t.trim())
                                .filter((t, idx, arr) => t.length > 0 || idx < arr.length - 1);
                             
                              setNewPlant(prev => ({...prev, compatible_watering_times: times}));
                           }}
                           onKeyDown={(e) => {
                             // Explicitly allow comma key
                             if (e.key === ',') {
                               e.stopPropagation();
                             }
                           }}
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
                           placeholder="e.g., SUNRISE, 1000, SUNSET-30"
                         />
                       </div>

                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Water Optimal (per week) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={newPlant.water_optimal_in_week}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow floats with decimal points
                            if (value === '') {
                              handleFieldChange('water_optimal_in_week', 0);
                            } else {
                              const floatValue = parseFloat(value);
                              if (!isNaN(floatValue)) {
                                handleFieldChange('water_optimal_in_week', floatValue);
                              }
                            }
                          }}
                          style={{
                            background: '#1a1f2a',
                            color: '#f4f4f4',
                            border: validationErrors.water_optimal_in_week ? '1px solid #ff512f' : '1px solid #00bcd4',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '14px',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                        />
                        {validationErrors.water_optimal_in_week && (
                          <div style={{
                            color: '#ff512f',
                            fontSize: '12px',
                            marginTop: '4px'
                          }}>
                            {validationErrors.water_optimal_in_week}
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={{ color: '#f4f4f4', fontSize: '14px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                          Root Area (sq ft) *
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={newPlant.root_area_sqft}
                          onChange={(e) => {
                            const value = e.target.value;
                            // Allow floats with decimal points
                            if (value === '') {
                              handleFieldChange('root_area_sqft', 0);
                            } else {
                              const floatValue = parseFloat(value);
                              if (!isNaN(floatValue)) {
                                handleFieldChange('root_area_sqft', floatValue);
                              }
                            }
                          }}
                          style={{
                            background: '#1a1f2a',
                            color: '#f4f4f4',
                            border: validationErrors.root_area_sqft ? '1px solid #ff512f' : '1px solid #00bcd4',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            fontSize: '14px',
                            width: '100%',
                            boxSizing: 'border-box'
                          }}
                        />
                        {validationErrors.root_area_sqft && (
                          <div style={{
                            color: '#ff512f',
                            fontSize: '12px',
                            marginTop: '4px'
                          }}>
                            {validationErrors.root_area_sqft}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>



                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #2d3748'
                }}>
                  <button
                    onClick={() => setShowAddPlant(false)}
                    style={{
                      background: 'transparent',
                      color: '#bdbdbd',
                      border: '1px solid #bdbdbd',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveNewPlant}
                    disabled={savingPlant || !newPlant.common_name}
                    style={{
                      background: savingPlant || !newPlant.common_name ? '#666' : '#00bcd4',
                      color: '#181f2a',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      cursor: savingPlant || !newPlant.common_name ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      opacity: savingPlant || !newPlant.common_name ? 0.6 : 1
                    }}
                  >
                    {savingPlant ? 'Saving...' : (isEditing ? 'Update Plant' : 'Save Plant')}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                    {filteredPlants.map((plant, index) => (
                      <div
                        key={plant.plant_id}
                        style={{
                          background: '#1a1f2a',
                          borderRadius: '12px',
                          padding: '16px',
                          border: '1px solid #2d3748',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          borderColor: expandedPlant === plant.plant_id ? '#00bcd4' : '#2d3748'
                        }}
                      >
                        <div 
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onClick={() => togglePlantExpansion(plant)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              color: '#00bcd4',
                              fontWeight: 700,
                              fontSize: '18px',
                              marginRight: '12px'
                            }}>{plant.common_name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {selectedFile === 'custom.json' && (
                              <button
                                onClick={() => handleDeletePlant(plant)}
                                style={{
                                  background: '#dc3545',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  padding: '4px 8px',
                                  cursor: 'pointer'
                                }}
                                title="Delete from custom library"
                              >Delete</button>
                            )}
                            <button
                              onClick={() => handleEditPlant(plant)}
                              style={{
                                background: '#00bcd4',
                                color: '#181f2a',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '12px',
                                padding: '4px 8px',
                                cursor: 'pointer'
                              }}
                              title="Edit this plant"
                            >Edit</button>
                          </div>
                        </div>
                        
                        {/* Expanded Details */}
                        {expandedPlant === plant.plant_id && (
                          <div style={{
                            marginTop: '16px',
                            paddingTop: '16px',
                            borderTop: '1px solid #2d3748'
                          }}>
                            <div style={{
                              display: 'grid',
                              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                              gap: '16px'
                            }}>
                              {/* Basic Information */}
                              <div>
                                <h5 style={{
                                  color: '#00bcd4',
                                  margin: '0 0 8px 0',
                                  fontSize: '14px',
                                  fontWeight: 600
                                }}>
                                  Basic Information
                                </h5>
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Alternative Name:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.alternative_name || 'N/A'}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Growth Type:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.growth_type}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>USDA Zones:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.usda_zones}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Watering Requirements */}
                              <div>
                                <h5 style={{
                                  color: '#00bcd4',
                                  margin: '0 0 8px 0',
                                  fontSize: '14px',
                                  fontWeight: 600
                                }}>
                                  Watering Requirements
                                </h5>
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Frequency:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.watering_frequency.join(', ')}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Compatible Freq:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.compatible_watering_frequencies.join(', ')}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Preferred Time:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.preferred_time.join(', ')}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Compatible Times:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.compatible_watering_times.join(', ')}</span>
                                  </div>
                                  {plant.watering_cycles && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                      <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Cycle (days):</span>
                                      <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.watering_cycles.join(', ')}</span>
                                    </div>
                                  )}
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Optimal/week:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.water_optimal_in_week}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Tolerance Min:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.tolerance_min_in_week}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Tolerance Max:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.tolerance_max_in_week}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Root Area (sqft):</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.root_area_sqft}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Growing Conditions */}
                              <div>
                                <h5 style={{
                                  color: '#00bcd4',
                                  margin: '0 0 8px 0',
                                  fontSize: '14px',
                                  fontWeight: 600
                                }}>
                                  Growing Conditions
                                </h5>
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Soil Type:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.soil_type}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Soil pH:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.soil_ph}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Sun Exposure:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.sun_exposure}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Timing & Spacing */}
                              <div>
                                <h5 style={{
                                  color: '#00bcd4',
                                  margin: '0 0 8px 0',
                                  fontSize: '14px',
                                  fontWeight: 600
                                }}>
                                  Timing & Spacing
                                </h5>
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Fruiting Period:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.fruiting_period}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Planting Time:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.planting_time}</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: '#bdbdbd', fontSize: '12px' }}>Spacing:</span>
                                    <span style={{ color: '#f4f4f4', fontSize: '12px' }}>{plant.spacing_inches} inches</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            

                          </div>
                        )}
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
  );
} 