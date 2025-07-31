import React, { useState, useRef, useEffect } from 'react';
import './forms.css';

interface DurationPickerProps {
  value: string;
  onChange: (duration: string) => void;
  onClose: () => void;
  isVisible: boolean;
  isModal?: boolean;
}

const DurationPicker: React.FC<DurationPickerProps> = ({
  value,
  onChange,
  onClose,
  isVisible,
  isModal = false
}) => {
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(20);
  const [seconds, setSeconds] = useState(0);
  const durationPickerRef = useRef<HTMLDivElement>(null);

  // Parse initial value
  useEffect(() => {
    if (value) {
      const parts = value.split(':');
      if (parts.length === 3) {
        setHours(parseInt(parts[0]) || 0);
        setMinutes(parseInt(parts[1]) || 20);
        setSeconds(parseInt(parts[2]) || 0);
      }
    }
  }, [value]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (durationPickerRef.current && !durationPickerRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible, onClose]);

  const formatDuration = (duration: string): string => {
    if (!duration) return '00:20:00';
    const parts = duration.split(':');
    if (parts.length === 3) {
      return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
    }
    return '00:20:00';
  };

  const handleHoursChange = (newHours: number) => {
    setHours(newHours);
  };

  const handleMinutesChange = (newMinutes: number) => {
    setMinutes(newMinutes);
  };

  const handleSecondsChange = (newSeconds: number) => {
    setSeconds(newSeconds);
  };

  const handleDone = () => {
    const newDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    onChange(newDuration);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <div 
      ref={durationPickerRef} 
      className={`form-duration-picker-modal ${isModal ? 'form-duration-picker--modal' : ''}`}
      style={isModal ? {
        position: 'static',
        top: 'auto',
        right: 'auto',
        zIndex: 'auto',
        width: '100%',
        maxWidth: 'none'
      } : {}}
    >
      <div className="form-text-accent form-text-center form-font-600 form-mb-12 form-text-14">
        Set Duration
      </div>
      
      <div className="form-flex form-gap-12 form-justify-center">
        {/* Hours */}
        <div className="form-flex form-flex-column form-items-center form-gap-4">
          <div className="form-text-muted form-font-600 form-text-12">
            Hours
          </div>
          <select
            value={hours}
            onChange={(e) => handleHoursChange(parseInt(e.target.value))}
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
            onChange={(e) => handleMinutesChange(parseInt(e.target.value))}
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
            onChange={(e) => handleSecondsChange(parseInt(e.target.value))}
            className="form-select"
            style={{ width: '80px' }}
          >
            {Array.from({ length: 60 }, (_, i) => (
              <option key={i} value={i}>{i.toString().padStart(2, '0')}</option>
            ))}
          </select>
        </div>
      </div>
      
      <div className="form-flex form-gap-8 form-justify-center form-done-button">
        <button
          onClick={onClose}
          className="btn-cancel"
        >
          Cancel
        </button>
        <button
          onClick={handleDone}
          className="btn-done"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default DurationPicker; 