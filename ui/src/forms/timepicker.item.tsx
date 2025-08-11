/**
 * 🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
 * 📖 Primary Reference: /rules/form-system.md
 * 🏗️ Architecture: /rules/project-structure.md
 * 
 * COMPONENT PURPOSE
 * =================
 * Time picker component for selecting solar times or clock times.
 * Designed as a small picker item that integrates with the layer system.
 */

import React, { useState, useRef, useEffect } from 'react';
import './forms.css';

// Custom dropdown component for centered text
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  width?: string;
  label?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, width = '80px', label }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          height: '36px',
          background: 'var(--form-bg-primary)',
          border: '1px solid var(--form-border-primary)',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: '14px',
          color: 'var(--form-text-primary)',
          fontFamily: 'monospace',
          fontWeight: 'bold'
        }}
      >
        {value}
        <span style={{ 
          position: 'absolute', 
          right: '8px',
          fontSize: '12px',
          color: '#00bcd4'
        }}>▼</span>
      </div>
      
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          background: 'var(--form-bg-primary)',
          border: '1px solid var(--form-border-primary)',
          borderRadius: '6px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 10000,
          marginTop: '2px'
        }}>
          {options.map((option) => (
            <div
              key={option}
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                textAlign: 'center',
                fontSize: '14px',
                color: 'var(--form-text-primary)',
                fontFamily: 'monospace',
                fontWeight: 'bold',
                background: option === value ? 'var(--form-text-accent)' : 'transparent',
                color: option === value ? '#000' : 'var(--form-text-primary)'
              }}
              onMouseEnter={(e) => {
                if (option !== value) {
                  e.currentTarget.style.background = 'var(--form-hover-bg)';
                }
              }}
              onMouseLeave={(e) => {
                if (option !== value) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {option}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface TimePickerProps {
  isVisible: boolean;
  onTimeSelect: (time: string) => void;
  onCancel: () => void;
  initialSolarMode?: boolean;
  isModal?: boolean;
}

const TimePicker: React.FC<TimePickerProps> = ({
  isVisible,
  onTimeSelect,
  onCancel,
  initialSolarMode = true,
  isModal = false
}) => {
  console.log('🔵 TimePicker rendered with props:', { isVisible, initialSolarMode, isModal });
  const [solarMode, setSolarMode] = useState(initialSolarMode);
  const [selectedSolarTime, setSelectedSolarTime] = useState<string | null>(null);
  const [selectedHour, setSelectedHour] = useState('06');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const timePickerRef = useRef<HTMLDivElement>(null);

  // Reset state when picker becomes visible
  useEffect(() => {
    if (isVisible) {
      setSolarMode(initialSolarMode);
      setSelectedSolarTime(null);
      setSelectedHour('06');
      setSelectedMinute('00');
    }
  }, [isVisible, initialSolarMode]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isVisible, onCancel]);

  const handleSolarTimeSelection = (solarTime: string) => {
    setSelectedSolarTime(solarTime);
  };

  const handleSolarDone = (offset?: string) => {
    if (selectedSolarTime) {
      const timeString = offset ? `${selectedSolarTime}${offset}` : selectedSolarTime;
      onTimeSelect(timeString);
    }
  };

  const handleClockDone = () => {
    onTimeSelect(`${selectedHour}:${selectedMinute}`);
  };

  const handleCancel = () => {
    setSelectedSolarTime(null);
    setSelectedHour('06');
    setSelectedMinute('00');
    onCancel();
  };

  if (!isVisible) {
    console.log('🔵 TimePicker returning null because isVisible is false');
    return null;
  }
  console.log('🔵 TimePicker rendering UI because isVisible is true');

  // Choose the appropriate container class based on context
  // Always use form-container for layer system rendering
  const containerClass = "form-container form-container--small";

  return (
    <div 
      ref={timePickerRef} 
      className={containerClass}
      style={{
        minWidth: '320px',
        maxWidth: '400px',
        minHeight: '300px',
        overflow: 'visible'
      }}
    >
      {solarMode ? (
        <>
          {/* Solar Time Selection Header */}
          <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-12">
            <p className="unified-section-title">
              Select Solar Time
            </p>
            <div className="form-flex form-gap-8 form-items-center">
              <div
                className={`unified-toggle-slider ${solarMode ? 'form-toggle--solar' : ''}`}
                onClick={() => {
                  setSolarMode(!solarMode);
                  setSelectedSolarTime(null);
                }}
              >
                <div className={`form-toggle-handle ${solarMode ? 'form-toggle-handle--active' : 'form-toggle-handle--inactive'}`} />
              </div>
              <span className="form-toggle-label">
                {solarMode ? 'Solar' : 'Clock'}
              </span>
            </div>
          </div>
          
          <div className="form-solar-time-container">
            {['SUNRISE', 'SUNSET', 'ZENITH'].map((time) => (
              <button
                key={time}
                onClick={() => handleSolarTimeSelection(time)}
                className={`form-select-button ${selectedSolarTime === time ? 'form-select-button--active' : ''}`}
              >
                {time === 'SUNRISE' ? '🌅 SUNRISE' : 
                 time === 'SUNSET' ? '🌇 SUNSET' : 
                 '☀️ ZENITH'}
              </button>
            ))}
          </div>

          {selectedSolarTime && (
            <>
              {/* Exact Time Option */}
              <div className="form-flex form-justify-center">
                <button
                  onClick={() => handleSolarDone()}
                  className="form-select-button form-select-button--exact"
                >
                  Exact {selectedSolarTime}
                </button>
              </div>

              {/* Offset Section */}
              <div className="form-offset-section">
                <div className="form-text-muted form-text-center form-font-600 form-text-10">
                  Offset Options
                </div>
                
                {/* Offset Presets */}
                <div className="form-button-grid">
                  {[-60, -30, -15, -5, 5, 15, 30, 60].map(offset => (
                    <button
                      key={offset}
                      onClick={() => {
                        const sign = offset > 0 ? '+' : '';
                        handleSolarDone(`${sign}${offset}`);
                      }}
                      className="form-select-button form-select-button--offset form-select-button--small"
                    >
                      {offset > 0 ? '+' : ''}{offset}m
                    </button>
                  ))}
                </div>

                {/* Custom Offset Input */}
                <div className="form-data-field">
                  <label className="unified-section-title">Custom Offset (minutes)</label>
                  <input
                    type="number"
                    placeholder="±120"
                    min="-120"
                    max="120"
                    className="form-data-input"
                    style={{ width: '80px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const offset = e.currentTarget.value;
                        if (offset && offset !== '0') {
                          const sign = parseInt(offset) > 0 ? '+' : '';
                          handleSolarDone(`${sign}${offset}`);
                        }
                      }
                    }}
                  />
                </div>
                
                {/* Action Buttons */}
                <div className="form-time-picker-buttons">
                  <button
                    onClick={handleCancel}
                    className="btn-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={(e) => {
                      const offsetInput = e.currentTarget.parentElement?.previousElementSibling?.querySelector('input') as HTMLInputElement;
                      const offset = offsetInput?.value;
                      if (offset && offset !== '0') {
                        const sign = parseInt(offset) > 0 ? '+' : '';
                        handleSolarDone(`${sign}${offset}`);
                      }
                    }}
                    className="btn-done"
                  >
                    Done
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Clock Time Selection Header */}
          <div className="form-flex form-gap-12 form-justify-between form-items-center form-mb-12">
            <p className="unified-section-title">
              Clock Time
            </p>
            <div className="form-flex form-gap-8 form-items-center">
              <div
                className={`unified-toggle-slider ${solarMode ? 'form-toggle--solar' : ''}`}
                onClick={() => {
                  setSolarMode(!solarMode);
                  setSelectedSolarTime(null);
                }}
              >
                <div className={`form-toggle-handle ${solarMode ? 'form-toggle-handle--active' : 'form-toggle-handle--inactive'}`} />
              </div>
              <span className="form-toggle-label">
                {solarMode ? 'Solar' : 'Clock'}
              </span>
            </div>
          </div>
          
          <div className="form-center-row form-gap-8">
            {/* Hours */}
            <div className="form-flex form-flex-column form-items-center form-gap-2">
              <div className="form-text-muted form-font-600 form-text-12">
                Hour
              </div>
              <CustomSelect
                value={selectedHour}
                onChange={setSelectedHour}
                options={Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))}
                width="80px"
              />
            </div>

            {/* Minutes */}
            <div className="form-flex form-flex-column form-items-center form-gap-2">
              <div className="form-text-muted form-font-600 form-text-12">
                Minute
              </div>
              <CustomSelect
                value={selectedMinute}
                onChange={setSelectedMinute}
                options={Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))}
                width="80px"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="form-time-picker-buttons">
            <button
              onClick={handleCancel}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button
              onClick={handleClockDone}
              className="btn-done"
            >
              Done
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default TimePicker; 