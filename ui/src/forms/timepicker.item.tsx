import React, { useState, useRef, useEffect } from 'react';
import './forms.css';

interface TimePickerProps {
  isVisible: boolean;
  onTimeSelect: (time: string) => void;
  onCancel: () => void;
  initialSolarMode?: boolean;
}

const TimePicker: React.FC<TimePickerProps> = ({
  isVisible,
  onTimeSelect,
  onCancel,
  initialSolarMode = true
}) => {
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

  if (!isVisible) return null;

  return (
    <div ref={timePickerRef} className="form-time-picker-modal form-time-picker--compact">
      {/* Time Mode Toggle */}
      <div className="form-time-mode-toggle">
        <div
          className={`form-toggle ${solarMode ? 'form-toggle--solar' : ''}`}
          onClick={() => {
            setSolarMode(!solarMode);
            setSelectedSolarTime(null);
          }}
        >
          <div className="form-toggle-slider"></div>
        </div>
        <span className="form-toggle-label">
          {solarMode ? 'Solar' : 'Clock'}
        </span>
      </div>

      {solarMode ? (
        <>
          {/* Solar Time Selection */}
          <div className="form-text-accent form-text-center form-font-600 form-text-12">
            Select Solar Time
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
                <div className="form-flex form-justify-center">
                  <input
                    type="number"
                    placeholder="Custom ±min"
                    min="-120"
                    max="120"
                    className="form-input form-input--custom"
                    style={{ width: '120px' }}
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
                <div className="form-flex form-justify-center form-gap-4">
                  <button
                    onClick={handleCancel}
                    className="form-btn form-btn--cancel form-btn--small form-btn--equal-width"
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
                    className="form-btn form-btn--outline form-btn--small form-btn--equal-width"
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
          {/* Clock Time Selection */}
          <div className="form-text-accent form-text-center form-font-600 form-text-12">
            Clock Time
          </div>
          
          <div className="form-flex form-gap-4 form-justify-center">
            {/* Hours */}
            <div className="form-flex form-flex-column form-items-center form-gap-2">
              <div className="form-text-muted form-font-600 form-text-12">
                Hour
              </div>
              <select
                value={selectedHour}
                onChange={(e) => setSelectedHour(e.target.value)}
                className="form-select"
                style={{ width: '80px' }}
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i.toString().padStart(2, '0')}>
                    {i.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            {/* Minutes */}
            <div className="form-flex form-flex-column form-items-center form-gap-2">
              <div className="form-text-muted form-font-600 form-text-12">
                Minute
              </div>
              <select
                value={selectedMinute}
                onChange={(e) => setSelectedMinute(e.target.value)}
                className="form-select"
                style={{ width: '80px' }}
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <option key={i} value={i.toString().padStart(2, '0')}>
                    {i.toString().padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="form-flex form-justify-center form-done-button form-gap-4">
            <button
              onClick={handleCancel}
              className="form-btn form-btn--cancel form-btn--small form-btn--equal-width"
            >
              Cancel
            </button>
            <button
              onClick={handleClockDone}
              className="form-btn form-btn--outline form-btn--small form-btn--equal-width"
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