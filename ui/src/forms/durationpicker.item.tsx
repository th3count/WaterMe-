/**
 * 🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
 * 📖 Layer System: /rules/layer-system.md
 * 🎨 CSS Conventions: /rules/css-conventions.md
 * 
 * DURATION PICKER COMPONENT
 * =========================
 * Reusable time duration selector for irrigation timers.
 * Integrates with universal layer system - no manual positioning required.
 */

import React, { useState, useEffect, useRef } from 'react';

import { useFormLayer } from '../../../core/useFormLayer';
import './forms.css';

interface DurationPickerProps {
  value?: string;
  onChange?: (value: string) => void;
  onClose?: () => void;
  onStop?: () => void;
  isVisible?: boolean;
  isModal?: boolean;
  style?: React.CSSProperties;
  zone_id?: number;
  isRunning?: boolean;
}

const DurationPicker: React.FC<DurationPickerProps> = ({
  value = "00:20:00",
  onChange,
  onClose,
  onStop,
  isVisible = true,
  isModal = false,
  style = {},
  zone_id = 1,
  isRunning = false
}) => {
  const { removeLayer } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);
  const formId = `duration-picker-${zone_id}`;
  
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(20);
  const [seconds, setSeconds] = useState(0);



  useEffect(() => {
    if (value) {
      const parts = value.split(':');
      if (parts.length === 3) {
        setHours(parseInt(parts[0]) || 0);
        setMinutes(parseInt(parts[1]) || 0);
        setSeconds(parseInt(parts[2]) || 0);
      }
    }
  }, [value]);

  const handleDone = () => {
    const duration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    if (onChange) {
      onChange(duration);
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  const handleCancel = () => {
    if (onClose) {
      onClose();
    }
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div 
      ref={formRef}
      className="form-container form-container--small"
      style={{
        minWidth: '320px',
        maxWidth: '400px',
        minHeight: '200px'
      }}
    >
          {/* Header */}
          <div className="form-text-center form-mb-20">
            <h2 className="form-header form-header--h2" style={{ textAlign: 'center', justifyContent: 'center' }}>
              {isRunning ? `Zone ${zone_id} - Timer Running` : `Set Duration for Zone ${zone_id}`}
            </h2>
          </div>
      
          {isRunning ? (
            <div className="form-section">
              <div className="form-text-center">
                <p className="form-text-accent form-mb-16">
                  ⏱️ Manual timer is currently running for Zone {zone_id}
                </p>
                <div className="form-actions form-actions--end">
                  <button onClick={handleCancel} className="form-btn form-btn--secondary form-btn--flex">
                    Cancel
                  </button>
                  <button onClick={handleStop} className="form-btn form-btn--danger form-btn--flex">
                    Stop Timer
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="form-section">
              {/* Time Selection */}
              <div className="form-flex form-gap-12 form-justify-center form-items-center">
                {/* Hours */}
                <div className="form-flex form-flex-column form-items-center form-gap-4">
                  <div className="form-text-muted form-font-600 form-text-12">
                    Hours
                  </div>
                  <select
                    value={hours}
                    onChange={(e) => setHours(parseInt(e.target.value))}
                    className="form-select"
                    style={{ width: '80px' }}
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
                
                {/* Minutes */}
                <div className="form-flex form-flex-column form-items-center form-gap-4">
                  <div className="form-text-muted form-font-600 form-text-12">
                    Minutes
                  </div>
                  <select
                    value={minutes}
                    onChange={(e) => setMinutes(parseInt(e.target.value))}
                    className="form-select"
                    style={{ width: '80px' }}
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
                
                {/* Seconds */}
                <div className="form-flex form-flex-column form-items-center form-gap-4">
                  <div className="form-text-muted form-font-600 form-text-12">
                    Seconds
                  </div>
                  <select
                    value={seconds}
                    onChange={(e) => setSeconds(parseInt(e.target.value))}
                    className="form-select"
                    style={{ width: '80px' }}
                  >
                    {Array.from({ length: 60 }, (_, i) => (
                      <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="form-actions form-actions--end">
                <button onClick={handleCancel} className="form-btn form-btn--secondary form-btn--flex">
                  Cancel
                </button>
                <button onClick={handleDone} className="form-btn form-btn--primary form-btn--flex">
                  Start Timer
                </button>
              </div>
            </div>
          )}
    </div>
  );
};

export default DurationPicker;