import React, { useState, useEffect } from 'react';
import ZoneForm from './forms/zones.form';
import LocationForm from './forms/locations.addlocation';
import SmartPlacementForm from './forms/garden.form';
import LibraryForm from './forms/library.form';
import TimePicker from './forms/timepicker.item';
import DurationPicker from './forms/durationpicker.item';
import { useFormLayer } from '../../core/useFormLayer';

// Layer types are now handled by the global FormLayerManager

// Form component mapping with full import paths
const FORM_COMPONENTS: Record<string, { 
  component: React.ComponentType<any>, 
  importPath: string,
  directory: string,
  type: 'form' | 'item'
}> = {
  'zones.form.tsx': { 
    component: ZoneForm, 
    importPath: './forms/zones.form',
    directory: 'ui/src/forms/',
    type: 'form'
  },
  'locations.addlocation.tsx': { 
    component: LocationForm, 
    importPath: './forms/locations.addlocation',
    directory: 'ui/src/forms/',
    type: 'form'
  },
  'garden.form.tsx': { 
    component: SmartPlacementForm, 
    importPath: './forms/garden.form',
    directory: 'ui/src/forms/',
    type: 'form'
  },
  'library.form.tsx': { 
    component: LibraryForm, 
    importPath: './forms/library.form',
    directory: 'ui/src/forms/',
    type: 'form'
  },
  'timepicker.item.tsx': { 
    component: TimePicker, 
    importPath: './forms/timepicker.item',
    directory: 'ui/src/forms/',
    type: 'item'
  },
  'durationpicker.item.tsx': { 
    component: DurationPicker, 
    importPath: './forms/durationpicker.item',
    directory: 'ui/src/forms/',
    type: 'item'
  }
};

// Default props for each form
const FORM_DEFAULT_PROPS: Record<string, any> = {
  'zones.form.tsx': {
    initialData: {
      zone_id: 1,
      mode: 'active',
      scheduleMode: 'manual',
      period: 'D',
      cycles: 1,
      comment: 'Sample zone configuration'
    },
    pumpIndex: null,
    onSave: async () => { console.log('Demo save - Zone Form'); },
    onCancel: () => { console.log('Demo cancel - Zone Form'); },
    loading: false,
    error: ''
  },
  'locations.addlocation.tsx': {
    initialData: {
      name: 'Sample Location',
      description: 'A sample garden location',
      zones: [1, 2]
    },
    availableZones: [1, 2, 3, 4, 5],
    onSave: async () => { console.log('Demo save - Location Form'); },
    onCancel: () => { console.log('Demo cancel - Location Form'); },
    loading: false,
    error: ''
  },
  'garden.form.tsx': {
    plant_id: 2,
    library_book: 'fruitbushes.json'
  },
  'library.form.tsx': {
    mode: 'library',
    plant_id: 1,
    library_book: 'fruitbushes.json',
    onClose: () => { console.log('Demo close - Universal Plant Form (Library Mode)'); }
  },
  'timepicker.item.tsx': {
    isVisible: true,
    onTimeSelect: (time: string) => console.log('Time selected:', time),
    onCancel: () => console.log('Time picker cancelled'),
    initialSolarMode: true,
    isModal: true
  },
  'durationpicker.item.tsx': {
    value: '00:20:00',
    onChange: (duration: string) => console.log('Duration changed:', duration),
    onClose: () => console.log('Duration picker closed'),
    onStop: () => console.log('Duration picker stopped'),
    isVisible: true,
    isModal: true,
    zone_id: 1,
    isRunning: false,
    style: {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 1000
    }
  }
};

// Form descriptions with file path details
const FORM_DESCRIPTIONS: Record<string, string> = {
  'zones.form.tsx': 'Form for configuring irrigation zones (in ui/src/forms/zones.form.tsx)',
  'locations.addlocation.tsx': 'Form for adding/editing garden locations (in ui/src/forms/locations.addlocation.tsx)',
  'garden.form.tsx': 'Smart placement form for placing plants from library into garden zones (in ui/src/forms/garden.form.tsx)',
  'library.form.tsx': 'Universal plant viewer/editor - supports library, garden, and edit modes (in ui/src/forms/library.form.tsx)',
  'timepicker.item.tsx': 'Time picker component for selecting watering times (in ui/src/forms/timepicker.item.tsx)',
  'durationpicker.item.tsx': 'Duration picker component for selecting watering duration (in ui/src/forms/durationpicker.item.tsx)'
};

// Form display names
const FORM_NAMES: Record<string, string> = {
  'zones.form.tsx': 'Zone Configuration Form',
  'locations.addlocation.tsx': 'Location Form',
  'garden.form.tsx': 'Smart Placement Form',
  'library.form.tsx': 'Universal Plant Form',
  'timepicker.item.tsx': 'Time Picker',
  'durationpicker.item.tsx': 'Duration Picker'
};

// Available forms and pickers
const FORMS_LIST = [
  {
    name: 'Zone Configuration Form',
    file: 'zones.form.tsx',
    description: 'Form for configuring irrigation zones',
    component: ZoneForm,
    defaultProps: FORM_DEFAULT_PROPS['zones.form.tsx']
  },
  {
    name: 'Location Form',
    file: 'locations.addlocation.tsx',
    description: 'Form for adding/editing garden locations',
    component: LocationForm,
    defaultProps: FORM_DEFAULT_PROPS['locations.addlocation.tsx']
  },
  {
    name: 'Smart Placement Form',
    file: 'garden.form.tsx',
    description: 'Form for placing plants from library into garden zones',
    component: SmartPlacementForm,
    defaultProps: FORM_DEFAULT_PROPS['garden.form.tsx']
  },
  {
    name: 'Universal Plant Form',
    file: 'library.form.tsx',
    description: 'Universal plant viewer/editor - supports library, garden, and edit modes',
    component: LibraryForm,
    defaultProps: FORM_DEFAULT_PROPS['library.form.tsx']
  }
];

const PICKERS_LIST = [
  {
    name: 'Time Picker',
    file: 'timepicker.item.tsx',
    description: 'Time picker component for selecting watering times',
    component: TimePicker,
    defaultProps: FORM_DEFAULT_PROPS['timepicker.item.tsx']
  },
  {
    name: 'Duration Picker',
    file: 'durationpicker.item.tsx',
    description: 'Duration picker component for selecting watering duration',
    component: DurationPicker,
    defaultProps: FORM_DEFAULT_PROPS['durationpicker.item.tsx']
  }
];

export default function FormsUI() {
  const [durationValue, setDurationValue] = useState('00:20:00');
  const { layers, addLayer, removeLayer, activeForms, isTopForm } = useFormLayer();

  const handlePreviewForm = (form: any) => {
    const layerId = `form-${form.file}`;
    const layerType = form.file.includes('.item.tsx') ? 'picker' : 'form';
    
    // Special handling for DurationPicker
    if (form.file === 'durationpicker.item.tsx') {
      addLayer(layerId, layerType, form.component, {
        ...form.defaultProps,
        onChange: handleDurationChange,
        onClose: () => removeLayer(layerId),
        onStop: () => {
          console.log('Duration picker stopped');
          removeLayer(layerId);
        }
      });
    } else {
      addLayer(layerId, layerType, form.component, {
        ...form.defaultProps,
        onCancel: () => removeLayer(layerId),
        onClose: () => removeLayer(layerId)
      });
    }
  };

  const handleDurationChange = (duration: string) => {
    console.log('Duration changed to:', duration);
    setDurationValue(duration);
  };

  const generateFormsList = (): any[] => {
    const allForms = [...FORMS_LIST, ...PICKERS_LIST];
    return allForms.map(form => ({
      name: FORM_NAMES[form.file] || form.name,
      file: form.file,
      description: FORM_DESCRIPTIONS[form.file] || form.description,
      component: FORM_COMPONENTS[form.file]?.component || form.component,
      importPath: FORM_COMPONENTS[form.file]?.importPath || 'Unknown',
      directory: FORM_COMPONENTS[form.file]?.directory || 'Unknown',
      type: FORM_COMPONENTS[form.file]?.type || 'unknown',
      defaultProps: FORM_DEFAULT_PROPS[form.file] || {}
    }));
  };

  const formsList = generateFormsList();

  return (
    <div style={{
      marginLeft: 150,
      padding: '24px',
      minHeight: '100vh',
      background: '#0f1419',
      color: '#f4f4f4',
      position: 'relative'
    }}>
      {/* Layer Stack Visualization */}
      <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: '#232b3b',
        borderRadius: '8px',
        padding: '12px',
        border: '1px solid #1a1f2a',
        zIndex: 9999,
        fontSize: '12px'
      }}>
        <div style={{ color: '#00bcd4', fontWeight: 600, marginBottom: '8px' }}>
          Layer Stack ({layers.length})
        </div>
        {layers.map((layer: any, index: number) => (
          <div key={layer.id} style={{
            padding: '4px 8px',
            margin: '2px 0',
            background: layer.isActive ? '#00bcd4' : '#1a1f2a',
            color: layer.isActive ? '#000' : '#888',
            borderRadius: '4px',
            fontSize: '11px',
            border: layer.isActive ? '1px solid #00bcd4' : '1px solid #333'
          }}>
            {index}: {layer.type} - {layer.id}
            {layer.isActive && ' (ACTIVE)'}
          </div>
        ))}
      </div>

      {/* Base Layer Content */}
      {(
        <>
          {/* Header */}
          <div style={{
            marginBottom: '32px'
          }}>
            <h1 style={{
              color: '#00bcd4',
              fontWeight: 600,
              margin: '0 0 8px 0',
              fontSize: '28px'
            }}>
              📝 Forms & Pickers Manager
            </h1>
            <p style={{
              color: '#bdbdbd',
              margin: 0,
              fontSize: '16px'
            }}>
              View and test all popup forms and picker components used throughout the application
            </p>
          </div>

          {/* Forms & Pickers List */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '20px'
          }}>
            {/* Forms Section */}
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
                fontWeight: 600,
                fontSize: '18px'
              }}>
                📋 Forms
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {formsList.filter(form => form.type === 'form').map((form) => (
                  <button
                    key={form.file}
                    onClick={() => handlePreviewForm(form)}
                    style={{
                      background: '#1a1f2a',
                      border: '1px solid #2d3748',
                      borderRadius: '8px',
                      padding: '16px',
                      color: '#f4f4f4',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2d3748';
                      e.currentTarget.style.borderColor = '#00bcd4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#1a1f2a';
                      e.currentTarget.style.borderColor = '#2d3748';
                    }}
                  >
                    <div style={{
                      fontWeight: 600,
                      marginBottom: '4px',
                      color: '#00bcd4'
                    }}>
                      {form.name}
                    </div>
                    <div style={{
                      color: '#888',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      marginBottom: '6px'
                    }}>
                      📁 {form.directory}{form.file}
                    </div>
                    <div style={{
                      color: '#888',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      marginBottom: '8px'
                    }}>
                      📦 import from '{form.importPath}'
                    </div>
                    <div style={{
                      color: '#bdbdbd',
                      fontSize: '13px'
                    }}>
                      {form.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Pickers Section */}
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
                fontWeight: 600,
                fontSize: '18px'
              }}>
                🎯 Pickers
              </h3>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                {formsList.filter(form => form.type === 'item').map((picker) => (
                  <button
                    key={picker.file}
                    onClick={() => handlePreviewForm(picker)}
                    style={{
                      background: '#1a1f2a',
                      border: '1px solid #2d3748',
                      borderRadius: '8px',
                      padding: '16px',
                      color: '#f4f4f4',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '14px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2d3748';
                      e.currentTarget.style.borderColor = '#00bcd4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#1a1f2a';
                      e.currentTarget.style.borderColor = '#2d3748';
                    }}
                  >
                    <div style={{
                      fontWeight: 600,
                      marginBottom: '4px',
                      color: '#00bcd4'
                    }}>
                      {picker.name}
                    </div>
                    <div style={{
                      color: '#888',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      marginBottom: '6px'
                    }}>
                      📁 {picker.directory}{picker.file}
                    </div>
                    <div style={{
                      color: '#888',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      marginBottom: '8px'
                    }}>
                      📦 import from '{picker.importPath}'
                    </div>
                    <div style={{
                      color: '#bdbdbd',
                      fontSize: '13px'
                    }}>
                      {picker.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Universal Plant Form Special Info */}
          <div style={{
            background: '#232b3b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            border: '1px solid #1a1f2a',
            marginTop: '24px'
          }}>
            <h3 style={{
              color: '#00bcd4',
              margin: '0 0 16px 0',
              fontWeight: 600
            }}>
              🌟 Universal Plant Form Details
            </h3>
            <div style={{
              color: '#bdbdbd',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              <p style={{ margin: '0 0 12px 0' }}>
                The <strong>Universal Plant Form</strong> (<code>library.form.tsx</code>) has been refactored to support <strong>3 modes</strong>:
              </p>
              <ul style={{ margin: '0 0 16px 0', paddingLeft: '20px' }}>
                <li><strong>Library Mode</strong>: <code>mode: 'library', plant_id: number, library_book: string</code></li>
                <li><strong>Garden Mode</strong>: <code>mode: 'garden', instance_id: string</code></li>
                <li><strong>Edit Mode</strong>: <code>mode: 'edit', instance_id?: string, plant_id?: number, library_book?: string</code></li>
              </ul>
              <div style={{ 
                background: '#1a1f2a', 
                padding: '12px', 
                borderRadius: '6px', 
                fontFamily: 'monospace', 
                fontSize: '12px',
                border: '1px solid #2d3748'
              }}>
                <div style={{ color: '#4ade80', marginBottom: '4px' }}>// Library viewing</div>
                <div>&lt;LibraryForm mode="library" plant_id={'{1}'} library_book="fruitbushes.json" /&gt;</div>
                <br/>
                <div style={{ color: '#4ade80', marginBottom: '4px' }}>// Garden instance viewing</div>
                <div>&lt;LibraryForm mode="garden" instance_id="abc-123" /&gt;</div>
                <br/>
                <div style={{ color: '#4ade80', marginBottom: '4px' }}>// Edit garden instance</div>
                <div>&lt;LibraryForm mode="edit" instance_id="abc-123" /&gt;</div>
              </div>
              <p style={{ margin: '12px 0 8px 0', fontSize: '13px', color: '#888' }}>
                ℹ️ <strong>Note</strong>: The old <code>detailedplant.form.tsx</code> has been merged into this universal form.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => {
                    const layerId = 'universal-plant-garden-view';
                    addLayer(layerId, 'form', LibraryForm, {
                      mode: 'garden',
                      instance_id: '1',
                      onClose: () => removeLayer(layerId)
                    });
                  }}
                  style={{
                    padding: '8px 12px',
                    background: '#60a5fa',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  🏡 Garden View
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>instance_id = 1</div>
                </button>
                <button
                  onClick={() => {
                    const layerId = 'universal-plant-garden-edit';
                    addLayer(layerId, 'form', LibraryForm, {
                      mode: 'edit',
                      instance_id: '1',
                      onClose: () => removeLayer(layerId)
                    });
                  }}
                  style={{
                    padding: '8px 12px',
                    background: '#34d399',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  🏡 Garden Edit
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>instance_id = 1</div>
                </button>
                <button
                  onClick={() => {
                    const layerId = 'universal-plant-library-view';
                    addLayer(layerId, 'form', LibraryForm, {
                      mode: 'library',
                      plant_id: 1,
                      library_book: 'fruitbushes.json',
                      onClose: () => removeLayer(layerId)
                    });
                  }}
                  style={{
                    padding: '8px 12px',
                    background: '#a78bfa',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  📚 Library View
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>plant_id = 1, fruitbushes</div>
                </button>
                <button
                  onClick={() => {
                    const layerId = 'universal-plant-library-edit';
                    addLayer(layerId, 'form', LibraryForm, {
                      mode: 'edit',
                      plant_id: 1,
                      library_book: 'fruitbushes.json',
                      onClose: () => removeLayer(layerId)
                    });
                  }}
                  style={{
                    padding: '8px 12px',
                    background: '#f59e0b',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}
                >
                  📚 Library Edit
                  <div style={{ fontSize: '10px', opacity: 0.8 }}>plant_id = 1, fruitbushes</div>
                </button>
              </div>
            </div>
          </div>

          {/* Documentation */}
          <div style={{
            background: '#232b3b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
            border: '1px solid #1a1f2a',
            marginTop: '24px'
          }}>
            <h3 style={{
              color: '#00bcd4',
              margin: '0 0 16px 0',
              fontWeight: 600
            }}>
              📚 Layer System Documentation
            </h3>
            <div style={{
              color: '#bdbdbd',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              <p style={{ margin: '0 0 12px 0' }}>
                This page demonstrates the layer management system:
              </p>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: '20px' }}>
                <li><strong>Base Layer (Layer 0)</strong> - All <code>.ui.tsx</code> files (pages)</li>
                <li><strong>Higher Layers</strong> - All <code>.form.tsx</code> and <code>.item.tsx</code> files (forms/pickers)</li>
                <li><strong>Layer Management</strong> - Only the top layer is active, others are disabled</li>
                <li><strong>Cancel Behavior</strong> - Closes current layer and activates the layer below</li>
              </ul>
              <p style={{ margin: '0 0 12px 0' }}>
                All form components and their file locations:
              </p>
              <div style={{ 
                background: '#1a1f2a', 
                padding: '12px', 
                borderRadius: '6px', 
                fontSize: '12px',
                border: '1px solid #2d3748',
                fontFamily: 'monospace'
              }}>
                {formsList.map(form => (
                  <div 
                    key={form.file} 
                    onClick={() => {
                      const layerId = `form-launcher-${form.file.replace('.tsx', '')}`;
                      addLayer(layerId, form.type, form.component, {
                        ...form.defaultProps,
                        onClose: () => removeLayer(layerId)
                      });
                    }}
                    style={{ 
                      marginBottom: '8px', 
                      color: '#bdbdbd',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '4px',
                      transition: 'all 0.2s',
                      border: '1px solid transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2d3748';
                      e.currentTarget.style.borderColor = '#00bcd4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <span style={{ color: '#00bcd4' }}>{form.name}</span> <span style={{ color: '#4ade80', fontSize: '10px' }}>← Click to launch</span><br/>
                    <span style={{ color: '#888' }}>📁 {form.directory}{form.file}</span><br/>
                    <span style={{ color: '#888' }}>📦 import from '{form.importPath}'</span><br/>
                    <span style={{ color: '#4ade80' }}>   {form.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}


    </div>
  );
} 