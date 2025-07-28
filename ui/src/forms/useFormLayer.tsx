import { useCallback, useEffect, useRef } from 'react';
import { useFormLayer } from './FormLayerManager';

interface UseFormLayerOptions {
  formId: string;
  onClose?: () => void;
}

export function useFormLayerManager({ formId, onClose }: UseFormLayerOptions) {
  const { pushLayer, popLayer, isTopLayer, getLayerDepth } = useFormLayer();
  const formRef = useRef<HTMLDivElement>(null);

  // Register this form as a layer when it mounts
  useEffect(() => {
    pushLayer(formId);

    return () => {
      popLayer(formId);
    };
  }, [formId, pushLayer, popLayer]);

  const closeForm = useCallback(() => {
    popLayer(formId);
    onClose?.();
  }, [popLayer, onClose, formId]);

  const isActive = isTopLayer ? isTopLayer : false;
  const depth = getLayerDepth(formId);

  return {
    formRef,
    closeForm,
    isActive,
    depth,
    zIndex: 1000 + depth
  };
} 