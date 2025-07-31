import React, { useState, useEffect, useRef } from 'react';
import { getFormLayerStyle, getFormOverlayClassName } from './utils';
import { useFormLayer } from './FormLayerManager';
import { getApiBaseUrl } from '../utils';
import './forms.css';

interface PlantInstance {
  instance_id: string;
  plant_id: number;
  library_book: string;
  common_name: string;
  quantity: number;
  emitter_size: number;
  zone_id: number;
  location_id: number;
  comments: string;
  planted_date: string;
  smart_overrides: {
    zone_selection: string;
    emitter_sizing: string;
  };
}

interface Location {
  location_id: number;
  name: string;
  description?: string;
}

interface PlantDetails {
  plant_id: number;
  common_name: string;
  alternative_name?: string;
  latin_name?: string;
  description?: string;
  watering_frequency?: string[];
  preferred_time?: string[];
  compatible_watering_times?: string[];
  compatible_watering_frequencies?: string[];
  water_optimal_in_week?: number;
  tolerance_min_in_week?: number;
  tolerance_max_in_week?: number;
  usda_zones?: string;
  root_area_sqft?: number;
  library_book?: string;
  soil_preference?: string;
  sun_exposure?: string;
  fruiting_period?: string;
  planting_time?: string;
  spacing_inches?: number;
  growth_type?: string;
}

interface DetailedPlantFormProps {
  instance_id: string;
  onClose: () => void;
}

const DetailedPlantForm: React.FC<DetailedPlantFormProps> = ({
  instance_id,
  onClose
}) => {
  const { isAnyFormAbove, registerForm, unregisterForm } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);
  const formId = `detailed-plant-form-${instance_id}`;

  // State for data
  const [plantInstance, setPlantInstance] = useState<PlantInstance | null>(null);
  const [location, setLocation] = useState<Location | null>(null);
  const [plantDetails, setPlantDetails] = useState<PlantDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load plant instance data
  const loadPlantInstanceData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load map data to get the plant instance
      const mapResponse = await fetch(`${getApiBaseUrl()}/api/map`);
      if (!mapResponse.ok) {
        throw new Error(`Failed to fetch map data: ${mapResponse.status}`);
      }
      const mapData = await mapResponse.json();
      
      const instance = mapData[instance_id];
      if (!instance) {
        throw new Error(`Plant instance ${instance_id} not found`);
      }
      
      setPlantInstance(instance);

      // Load location data
      const locationsResponse = await fetch(`${getApiBaseUrl()}/api/locations`);
      if (locationsResponse.ok) {
        const locationsData = await locationsResponse.json();
        const foundLocation = locationsData.find((loc: Location) => loc.location_id === instance.location_id);
        setLocation(foundLocation || null);
      }

      // Load plant details from library
      const libraryResponse = await fetch(`${getApiBaseUrl()}/api/library/${instance.library_book}/${instance.plant_id}`);
      if (libraryResponse.ok) {
        const plantData = await libraryResponse.json();
        setPlantDetails(plantData);
      }

    } catch (err) {
      console.error('Error loading plant instance data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load plant instance data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlantInstanceData();
  }, [instance_id]);

  useEffect(() => {
    registerForm(formId);
    return () => unregisterForm(formId);
  }, [registerForm, unregisterForm, formId]);

  // Handle click outside to close form (only when it's the top layer)
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Prevent background scrolling when form is open
  useEffect(() => {
    const disableWheel = (e: Event) => {
      const target = e.target as Element;
      if (formRef.current && formRef.current.contains(target)) {
        return; // Allow the scroll
      }
      e.preventDefault();
    };

    document.addEventListener('wheel', disableWheel, { passive: false });
    return () => document.removeEventListener('wheel', disableWheel);
  }, []);

  // Format date for display
  const formatDate = (dateString: string) => {
    if (!dateString) return '—';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  // Render plant instance details
  const renderPlantInstanceDetails = () => {
    if (!plantInstance) return null;

    return (
      <div className="form-cards-container form-cards-container--3wide" style={{ display: 'flex', flexDirection: 'row', gap: '20px', width: '100%', justifyContent: 'space-between' }}>
        {/* Instance Information Card */}
        <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
          <div className="form-section-title">Instance Information</div>
          <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div className="form-data-field">
              <label className="form-data-label">Instance ID</label>
              <div className="form-data-value">{plantInstance.instance_id}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Plant ID</label>
              <div className="form-data-value">{plantInstance.plant_id}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Library Book</label>
              <div className="form-data-value">{plantInstance.library_book.replace('.json', '')}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Common Name</label>
              <div className="form-data-value">{plantInstance.common_name}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Quantity</label>
              <div className="form-data-value">{plantInstance.quantity}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Emitter Size</label>
              <div className="form-data-value">{plantInstance.emitter_size}"</div>
            </div>
          </div>
        </div>

        {/* Location & Zone Information Card */}
        <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
          <div className="form-section-title">Location & Zone</div>
          <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div className="form-data-field">
              <label className="form-data-label">Location ID</label>
              <div className="form-data-value">{plantInstance.location_id}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Location Name</label>
              <div className="form-data-value">{location?.name || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Location Description</label>
              <div className="form-data-value">{location?.description || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Zone ID</label>
              <div className="form-data-value">{plantInstance.zone_id}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Planted Date</label>
              <div className="form-data-value">{formatDate(plantInstance.planted_date)}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Comments</label>
              <div className="form-data-value">{plantInstance.comments || '—'}</div>
            </div>
          </div>
        </div>

        {/* Smart Overrides Card */}
        <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
          <div className="form-section-title">Smart Overrides</div>
          <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div className="form-data-field">
              <label className="form-data-label">Zone Selection</label>
              <div className="form-data-value">{plantInstance.smart_overrides.zone_selection}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Emitter Sizing</label>
              <div className="form-data-value">{plantInstance.smart_overrides.emitter_sizing}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render plant details from library
  const renderPlantDetails = () => {
    if (!plantDetails) return null;

    return (
      <div className="form-cards-container form-cards-container--3wide" style={{ display: 'flex', flexDirection: 'row', gap: '20px', width: '100%', justifyContent: 'space-between', marginTop: '20px' }}>
        {/* Plant Information Card */}
        <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
          <div className="form-section-title">Plant Information</div>
          <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div className="form-data-field">
              <label className="form-data-label">Alternative Name</label>
              <div className="form-data-value">{plantDetails.alternative_name || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Latin Name</label>
              <div className="form-data-value" style={{ fontStyle: 'italic' }}>{plantDetails.latin_name || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Description</label>
              <div className="form-data-value">{plantDetails.description || '—'}</div>
            </div>
          </div>
        </div>

        {/* Watering Requirements Card */}
        <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
          <div className="form-section-title">Watering Requirements</div>
          <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div className="form-data-field">
              <label className="form-data-label">Frequency</label>
              <div className="form-data-value">{plantDetails.watering_frequency?.join(', ') || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Optimal/Week</label>
              <div className="form-data-value">{plantDetails.water_optimal_in_week}" /week</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Preferred Times</label>
              <div className="form-data-value">{plantDetails.preferred_time?.join(', ') || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Tolerance Min</label>
              <div className="form-data-value">{plantDetails.tolerance_min_in_week || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Tolerance Max</label>
              <div className="form-data-value">{plantDetails.tolerance_max_in_week || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Compatible Watering Times</label>
              <div className="form-data-value">{plantDetails.compatible_watering_times?.join(', ') || '—'}</div>
            </div>
          </div>
        </div>

        {/* Growing Conditions Card */}
        <div className="form-card" style={{ flex: '1', minWidth: '0' }}>
          <div className="form-section-title">Growing Conditions</div>
          <div className="form-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
            <div className="form-data-field">
              <label className="form-data-label">Soil Preference</label>
              <div className="form-data-value">{plantDetails.soil_preference || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Planting Time</label>
              <div className="form-data-value">{plantDetails.planting_time || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Sun Exposure</label>
              <div className="form-data-value">{plantDetails.sun_exposure || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Growth Type</label>
              <div className="form-data-value">{plantDetails.growth_type || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Root Area (sqft)</label>
              <div className="form-data-value">{plantDetails.root_area_sqft || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">USDA Zones</label>
              <div className="form-data-value">{plantDetails.usda_zones || '—'}</div>
            </div>

            <div className="form-data-field">
              <label className="form-data-label">Spacing (inches)</label>
              <div className="form-data-value">{plantDetails.spacing_inches || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
        <div
          ref={formRef}
          className="form-container form-container--compact"
          style={getFormLayerStyle(!isAnyFormAbove(formId))}
        >
          <div className="form-flex form-justify-center form-items-center" style={{ minHeight: '200px' }}>
            <div className="form-text-muted">Loading plant instance data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
        <div
          ref={formRef}
          className="form-container form-container--compact"
          style={getFormLayerStyle(!isAnyFormAbove(formId))}
        >
          <div className="form-flex form-justify-center form-items-center" style={{ minHeight: '200px' }}>
            <div className="form-text-error">Error: {error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!plantInstance) {
    return (
      <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
        <div
          ref={formRef}
          className="form-container form-container--compact"
          style={getFormLayerStyle(!isAnyFormAbove(formId))}
        >
          <div className="form-flex form-justify-center form-items-center" style={{ minHeight: '200px' }}>
            <div className="form-text-muted">No plant instance data available</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={getFormOverlayClassName(!isAnyFormAbove(formId))}>
      <div
        ref={formRef}
        className="form-container"
        style={{
          ...getFormLayerStyle(!isAnyFormAbove(formId)),
          minWidth: '900px',
          maxWidth: '1200px'
        }}
      >
        {/* Header */}
        <div className="form-header">
          <div className="form-header-content">
            <div className="form-title">Plant Instance Details</div>
            <div className="form-subtitle">Instance ID: {instance_id}</div>
          </div>
        </div>

        {/* Content */}
        <div className="form-content form-content--scrollable">
          {renderPlantInstanceDetails()}
          {renderPlantDetails()}
        </div>

        {/* Footer */}
        <div className="form-footer">
          <div className="form-actions form-actions--end">
            <button onClick={onClose} className="form-btn form-btn--secondary form-btn--flex">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DetailedPlantForm; 