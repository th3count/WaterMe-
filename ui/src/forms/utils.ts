/**
 * forms/utils.ts - Form utilities and validation functions
 * 
 * 🤖 AI ASSISTANT: For complete system understanding, reference ~/rules/ documentation:
 * 📖 System Overview: ~/rules/system-overview.md
 * 🏗️ Project Structure: ~/rules/project-structure.md
 * 🎨 Form System: ~/rules/form-system.md
 * 🌐 API Patterns: ~/rules/api-patterns.md
 * 💻 Coding Standards: ~/rules/coding-standards.md
 */

import type { FormValidationErrors } from './types';
import { useEffect } from 'react';

// Time validation utilities
export function validateTimeFormat(time: string): boolean {
  if (!time) return false;
  
  // Allow formats like HH:mm, SUNRISE+30, SUNSET-60, etc.
  const timeRegex = /^(\d{1,2}:\d{2}|SUNRISE[+-]\d+|SUNSET[+-]\d+|SUNRISE|SUNSET)$/;
  return timeRegex.test(time);
}

export function isValidTimeInput(val: string): boolean {
  if (!val) return false;
  
  // Check if it matches HH:mm format
  if (/^\d{1,2}:\d{2}$/.test(val)) {
    const [hours, minutes] = val.split(':').map(Number);
    return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
  }
  
  // Check if it matches sunrise/sunset format
  return /^(SUNRISE|SUNSET)([+-]\d+)?$/.test(val);
}

export function isValidDurationInput(val: string): boolean {
  if (!val) return false;
  return /^\d{1,2}:\d{2}:\d{2}$/.test(val);
}

// Duration formatting utilities
export function formatDuration(duration: string): string {
  if (!duration) return '00:20:00';
  
  // Handle HH:mm:ss format
  if (duration.includes(':')) {
    const parts = duration.split(':');
    if (parts.length === 3) {
      return duration; // Already in correct format
    }
    if (parts.length === 2) {
      return `${parts[0]}:${parts[1]}:00`; // Add seconds
    }
  }
  
  // Handle legacy HHmm format (4 digits)
  if (duration.length === 4 && !duration.includes(':')) {
    const hours = duration.substring(0, 2);
    const minutes = duration.substring(2, 4);
    return `${hours}:${minutes}:00`;
  }
  
  // Handle legacy HHmmss format (6 digits)
  if (duration.length === 6 && !duration.includes(':')) {
    const hours = duration.substring(0, 2);
    const minutes = duration.substring(2, 4);
    const seconds = duration.substring(4, 6);
    return `${hours}:${minutes}:${seconds}`;
  }
  
  // Default fallback
  return '00:20:00';
}

// Date utilities
export function getTomorrow(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

export function defaultTime(): { start_time: string; duration: string; value?: string } {
  return {
    start_time: '06:00',
    duration: '00:20:00',
    value: '06:00'
  };
}

// Form validation utilities
export function validateRequired(value: any, fieldName: string): string | null {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    return `${fieldName} is required`;
  }
  return null;
}

export function validateNumber(value: any, fieldName: string, min?: number, max?: number): string | null {
  if (value === undefined || value === null || value === '') {
    return null; // Let validateRequired handle empty values
  }
  
  const num = Number(value);
  if (isNaN(num)) {
    return `${fieldName} must be a valid number`;
  }
  
  if (min !== undefined && num < min) {
    return `${fieldName} must be at least ${min}`;
  }
  
  if (max !== undefined && num > max) {
    return `${fieldName} must be at most ${max}`;
  }
  
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email) return null;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return 'Please enter a valid email address';
  }
  
  return null;
}

// Array utilities for form fields
export function parseCommaSeparatedArray(input: string): string[] {
  if (!input) return [];
  return input.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

export function arrayToCommaSeparatedString(array: string[]): string {
  if (!array || array.length === 0) return '';
  return array.join(', ');
}

// Form state utilities
export function hasValidationErrors(errors: FormValidationErrors): boolean {
  return Object.values(errors).some(error => error !== '');
}

export function clearValidationErrors(): FormValidationErrors {
  return {};
}

// Modal utilities
export function handleClickOutside(
  event: MouseEvent,
  modalSelector: string,
  buttonSelector?: string,
  onClose?: () => void
): boolean {
  const target = event.target as Element;
  const modal = document.querySelector(modalSelector);
  const button = buttonSelector ? document.querySelector(buttonSelector) : null;
  
  if (modal && !modal.contains(target) && (!button || !button.contains(target))) {
    onClose?.();
    return true;
  }
  return false;
}

// Enhanced click-outside handler for React forms
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Check if the click target is within any form overlay
      const formOverlays = document.querySelectorAll('.form-overlay');
      let isClickInAnyForm = false;
      
      formOverlays.forEach(overlay => {
        if (overlay.contains(target)) {
          isClickInAnyForm = true;
        }
      });
      
      // Only trigger onClose if:
      // 1. The click is outside our specific form
      // 2. AND the click is not inside any other form overlay
      if (ref.current && !ref.current.contains(target) && !isClickInAnyForm) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ref, onClose, enabled]);
}

// Form Layer Management Utilities
export function isFormTopLayer(formId: string, activeFormId: string | null): boolean {
  return activeFormId === formId;
}

export function shouldShowForm(isTopLayer: boolean | undefined): boolean {
  return isTopLayer !== false; // Default to true if not specified
}

export function getFormLayerStyle(isTopLayer: boolean | undefined): React.CSSProperties {
  if (shouldShowForm(isTopLayer)) {
    return {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: isTopLayer ? 1001 : 1000 // Top layer forms get higher z-index
    };
  } else {
    return {
      display: 'none',
      zIndex: -1
    };
  }
}

export function getFormOverlayClassName(isTopLayer: boolean | undefined): string {
  const baseClass = 'form-overlay';
  return isTopLayer ? baseClass : `${baseClass} form-overlay--background`;
} 