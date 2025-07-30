import React, { useState, useRef, useEffect } from 'react';
import './forms.css';

interface DurationPickerProps {
  value: string;
  onChange: (duration: string) => void;
  onClose: () => void;
  isVisible: boolean;
}

const DurationPicker: React.FC<DurationPickerProps> = ({
  value,
  onChange,
  onClose,
  isVisible
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
    const newDuration = `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    onChange(newDuration);
  };

  const handleMinutesChange = (newMinutes: number) => {
    setMinutes(newMinutes);
    const newDuration = `${hours.toString().padStart(2, '0')}:${newMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    onChange(newDuration);
  };

  const handleSecondsChange = (newSeconds: number) => {
    setSeconds(newSeconds);
    const newDuration = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${newSeconds.toString().padStart(2, '0')}`;
    onChange(newDuration);
  };

  if (!isVisible) return null;

  return (
    <div ref={durationPickerRef} className="form-duration-picker-modal">
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
      
      <div className="form-flex form-justify-center form-done-button">
        <button
          onClick={onClose}
          className="form-btn form-btn--outline form-btn--small"
        >
          Done
        </button>
      </div>
    </div>
  );
};

export default DurationPicker; 