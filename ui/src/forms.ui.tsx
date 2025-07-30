import React, { useState, useEffect } from 'react';
import { ZoneForm, LocationForm, SmartPlacementForm, LibraryForm } from './forms';
import TimePicker from './forms/timepicker.item';
import DurationPicker from './forms/durationpicker.item';

interface FormInfo {
  name: string;
  file: string;
  description: string;
  component: React.ComponentType<any>;
  defaultProps: any;
}

// Dynamic form list - reads from forms directory
const FORMS_LIST = [
  {
    name: 'Zone Configuration Form',
    file: 'zones.form.tsx',
    description: 'Form for configuring irrigation zones',
    component: ZoneForm,
    defaultProps: { zone_id: 1 }
  },
  {
    name: 'Location Form', 
    file: 'locations.addlocation.tsx',
    description: 'Form for adding/editing garden locations',
    component: LocationForm,
    defaultProps: { availableZones: [1, 2, 3] }
  },
  {
    name: 'Smart Placement Form',
    file: 'garden.form.tsx', 
    description: 'Form for placing plants from library into garden zones',
    component: SmartPlacementForm,
    defaultProps: { plant_id: 2, library_book: 'fruitbushes.json' }
  },
  {
    name: 'Library Plant Form',
    file: 'library.form.tsx',
    description: 'Form for viewing and editing plant details from library',
    component: LibraryForm,
    defaultProps: { plant_id: 1, library_book: 'vegetables' }
  }
];

// Picker components list
const PICKERS_LIST = [
  {
    name: 'Time Picker',
    file: 'timepicker.item.tsx',
    description: 'Time picker component for selecting watering times',
    component: TimePicker,
    defaultProps: { 
      isVisible: true,
      onTimeSelect: (time: string) => console.log('Time selected:', time),
      onCancel: () => console.log('Time picker cancelled'),
      initialSolarMode: true
    }
  },
  {
    name: 'Duration Picker',
    file: 'durationpicker.item.tsx',
    description: 'Duration picker component for selecting watering duration',
    component: DurationPicker,
    defaultProps: { 
      value: '00:20:00',
      onChange: (duration: string) => console.log('Duration changed:', duration),
      onClose: () => console.log('Duration picker closed'),
      isVisible: true
    }
  }
];

// Form component mapping
const FORM_COMPONENTS: Record<string, React.ComponentType<any>> = {
  'zones.form.tsx': ZoneForm,
  'locations.addlocation.tsx': LocationForm,
  'garden.form.tsx': SmartPlacementForm,
  'library.form.tsx': LibraryForm,
  'timepicker.item.tsx': TimePicker,
  'durationpicker.item.tsx': DurationPicker
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
    plant_id: 1,
    library_book: 'fruitbushes.json',
    onClose: () => { console.log('Demo close - Library Form'); }
  },
  'timepicker.item.tsx': {
    isVisible: true,
    onTimeSelect: (time: string) => console.log('Time selected:', time),
    onCancel: () => console.log('Time picker cancelled'),
    initialSolarMode: true
  },
  'durationpicker.item.tsx': {
    value: '00:20:00',
    onChange: (duration: string) => console.log('Duration changed:', duration),
    onClose: () => console.log('Duration picker closed'),
    isVisible: true
  }
};

// Form descriptions
const FORM_DESCRIPTIONS: Record<string, string> = {
      'zones.form.tsx': 'Form for configuring irrigation zones',
  'locations.addlocation.tsx': 'Form for adding/editing garden locations',
  'garden.form.tsx': 'Form for placing plants from library into garden zones',
  'library.form.tsx': 'Form for viewing and editing plant details from library',
  'timepicker.item.tsx': 'Time picker component for selecting watering times',
  'durationpicker.item.tsx': 'Duration picker component for selecting watering duration'
};

// Form display names
const FORM_NAMES: Record<string, string> = {
      'zones.form.tsx': 'Zone Configuration Form',
  'locations.addlocation.tsx': 'Location Form',
  'garden.form.tsx': 'Smart Placement Form',
  'library.form.tsx': 'Library Plant Form',
  'timepicker.item.tsx': 'Time Picker',
  'durationpicker.item.tsx': 'Duration Picker'
};

export default function FormsUI() {
  const [selectedForm, setSelectedForm] = useState<FormInfo | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [formsList, setFormsList] = useState<FormInfo[]>([]);

  // Generate forms list dynamically
  useEffect(() => {
    const generateFormsList = (): FormInfo[] => {
      const allForms = [...FORMS_LIST, ...PICKERS_LIST];
      return allForms.map(form => ({
        name: FORM_NAMES[form.file] || form.name,
        file: form.file,
        description: FORM_DESCRIPTIONS[form.file] || form.description,
        component: FORM_COMPONENTS[form.file],
        defaultProps: FORM_DEFAULT_PROPS[form.file] || {}
      }));
    };

    setFormsList(generateFormsList());
  }, []);

  const handlePreviewForm = (form: FormInfo) => {
    console.log('handlePreviewForm called with:', form.name);
    console.log('Setting selectedForm to:', form);
    console.log('Setting showPreview to true');
    setSelectedForm(form);
    setShowPreview(true);
    console.log('State should be updated now');
  };

  const handleClosePreview = () => {
    setShowPreview(false);
    setSelectedForm(null);
  };

  return (
    <div style={{
      marginLeft: 150,
      padding: '24px',
      minHeight: '100vh',
      background: '#0f1419',
      color: '#f4f4f4'
    }}>
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
        gap: '24px',
        marginBottom: '32px'
      }}>
        {formsList.map((form, index) => (
          <div
            key={index}
            style={{
              background: '#232b3b',
              borderRadius: '16px',
              padding: '24px',
              boxShadow: '0 4px 24px rgba(24,31,42,0.18)',
              border: '1px solid #1a1f2a',
              transition: 'all 0.2s ease'
            }}
          >
            {/* Form Header */}
            <div style={{
              marginBottom: '16px'
            }}>
              <h3 style={{
                color: '#00bcd4',
                fontWeight: 600,
                margin: '0 0 8px 0',
                fontSize: '18px'
              }}>
                {form.name}
              </h3>
              <div style={{
                color: '#888',
                fontSize: '12px',
                fontFamily: 'monospace',
                marginBottom: '8px'
              }}>
                📁 /ui/src/forms/{form.file}
              </div>
              <p style={{
                color: '#bdbdbd',
                margin: 0,
                fontSize: '14px',
                lineHeight: '1.4'
              }}>
                {form.description}
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '20px'
            }}>
              <button
                onClick={() => {
                  console.log('Button clicked for form:', form.name);
                  console.log('Form object:', form);
                  handlePreviewForm(form);
                }}
                style={{
                  background: '#00bcd4',
                  color: '#181f2a',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  transition: 'all 0.2s ease',
                  flex: 1
                }}
              >
                👁️ Preview Form
              </button>
              <button
                onClick={() => {
                  // Open in VS Code or preferred editor
                  console.log(`Open file: ui/src/forms/${form.file}`);
                  alert(`File location: ui/src/forms/${form.file}\n\nOpen this file in your editor to modify the form.`);
                }}
                style={{
                  background: 'transparent',
                  color: '#00bcd4',
                  border: '1px solid #00bcd4',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  transition: 'all 0.2s ease'
                }}
              >
                ✏️ Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Form Usage Guide */}
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
          margin: '0 0 16px 0',
          fontSize: '18px'
        }}>
          📚 Forms & Pickers Usage Guide
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px'
        }}>
          <div>
            <h4 style={{
              color: '#f4f4f4',
              margin: '0 0 8px 0',
              fontSize: '14px',
              fontWeight: 600
            }}>
              🎯 Where Forms & Pickers Are Used:
            </h4>
            <ul style={{
              color: '#bdbdbd',
              fontSize: '13px',
              lineHeight: '1.5',
              paddingLeft: '16px'
            }}>
              <li><strong>zones.form.tsx</strong> - Zones page, click on any zone</li>
              <li><strong>locations.addlocation.tsx</strong> - Locations page "Add Location"</li>
              <li><strong>garden.form.tsx</strong> - Garden page, select plant from library</li>
              <li><strong>library.form.tsx</strong> - Library page, click on any plant</li>
              <li><strong>timepicker.item.tsx</strong> - Used in zones and library forms for time selection</li>
              <li><strong>durationpicker.item.tsx</strong> - Used in zones form for duration selection</li>
            </ul>
          </div>
          <div>
            <h4 style={{
              color: '#f4f4f4',
              margin: '0 0 8px 0',
              fontSize: '14px',
              fontWeight: 600
            }}>
              🛠️ How to Modify:
            </h4>
            <ul style={{
              color: '#bdbdbd',
              fontSize: '13px',
              lineHeight: '1.5',
              paddingLeft: '16px'
            }}>
              <li>Click "Edit" to see file location</li>
              <li>Open file in your code editor</li>
              <li>Make changes to form fields/validation</li>
              <li>Changes apply to all pages using that form</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Form Preview Modal */}
      {(() => {
        console.log('Modal render check - showPreview:', showPreview, 'selectedForm:', selectedForm);
        return showPreview && selectedForm && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#181f2a',
            zIndex: 2000
          }}>
            {/* Import Location - Top Left */}
            <div style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              color: '#00bcd4',
              fontSize: '14px',
              fontFamily: 'monospace',
              fontWeight: 600,
              zIndex: 2001
            }}>
              IMPORT {selectedForm.file}
            </div>
            
            {/* Close Button - Top Right */}
            <button
              onClick={handleClosePreview}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                background: '#ff512f',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                cursor: 'pointer',
                fontSize: '20px',
                fontWeight: 'bold',
                zIndex: 2001,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
            
            {/* Raw Form Component - Full Screen */}
            {(() => {
              try {
                console.log('Attempting to render form:', selectedForm.name, selectedForm.component);
                
                // Special handling for picker components
                if (selectedForm.file.includes('picker')) {
                  return (
                    <div style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--form-bg-primary)',
                      padding: '40px'
                    }}>
                      <div style={{
                        position: 'relative',
                        background: 'var(--form-bg-secondary)',
                        border: '1px solid var(--form-border-primary)',
                        borderRadius: '8px',
                        padding: '20px',
                        minWidth: '300px',
                        minHeight: '200px'
                      }}>
                        {React.createElement(selectedForm.component, {
                          ...selectedForm.defaultProps,
                          onCancel: handleClosePreview
                        })}
                      </div>
                    </div>
                  );
                }
                
                // Regular form components
                return React.createElement(selectedForm.component, {
                  ...selectedForm.defaultProps,
                  onCancel: handleClosePreview
                });
              } catch (error) {
                console.error('Error rendering form:', error);
                return (
                  <div style={{
                    background: '#ff512f',
                    color: 'white',
                    padding: '20px',
                    borderRadius: '8px',
                    margin: '20px'
                  }}>
                    <h3>Error rendering form</h3>
                    <p>{error instanceof Error ? error.message : String(error)}</p>
                  </div>
                );
              }
            })()}
          </div>
        );
      })()}
    </div>
  );
} 