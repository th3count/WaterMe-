import { useCallback, useEffect, useRef } from 'react';
import { useFormLayer } from './FormLayerManager';

interface UseFormLayerOptions {
  formId: string;
  onClose?: () => void;
}

export function useFormLayerManager({ formId, onClose }: UseFormLayerOptions) {
  const { registerForm, unregisterForm, isTopForm, getLayerDepth } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);

  // Register this form as a layer when it mounts
  useEffect(() => {
    registerForm(formId);

    return () => {
      unregisterForm(formId);
    };
  }, [formId, registerForm, unregisterForm]);

  const closeForm = useCallback(() => {
    unregisterForm(formId);
    onClose?.();
  }, [unregisterForm, onClose, formId]);

  const isActive = isTopForm(formId);
  const depth = getLayerDepth(formId);

  return {
    formRef,
    closeForm,
    isActive,
    depth,
    zIndex: 1000 + depth
  };
} 