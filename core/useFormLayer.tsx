/**
 * 🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
 * 📖 Primary Reference: /rules/layer-system.md
 * 🏗️ Architecture: /rules/project-structure.md
 * 
 * LAYER SYSTEM HOOK
 * =================
 * Hook for interacting with the universal layer management system.
 * Provides addLayer, removeLayer, and backward compatibility functions.
 */

import { useContext, useCallback } from 'react';
import { FormLayerContext } from './FormLayerManager';

export const useFormLayer = () => {
  const context = useContext(FormLayerContext);
  
  if (!context) {
    throw new Error('useFormLayer must be used within a FormLayerProvider');
  }

  const { layers, addLayer, removeLayer } = context;

  const closeCurrentLayer = useCallback(() => {
    if (layers.length > 1) {
      const currentLayer = layers[layers.length - 1];
      removeLayer(currentLayer.id);
    }
  }, [layers, removeLayer]);

  const closeLayer = useCallback((layerId: string) => {
    removeLayer(layerId);
  }, [removeLayer]);

  // Backward compatibility functions
  const registerForm = useCallback((formId: string) => {
    // This is a no-op in the new system since layers are managed differently
    console.log('🔵 registerForm called for:', formId);
  }, []);

  const unregisterForm = useCallback((formId: string) => {
    removeLayer(formId);
  }, [removeLayer]);

  const isTopForm = useCallback((formId: string) => {
    if (layers.length === 0) return false;
    return layers[layers.length - 1].id === formId;
  }, [layers]);

  const isAnyFormAbove = useCallback(() => {
    return layers.length > 1;
  }, [layers]);

  const getLayerDepth = useCallback((formId: string) => {
    const formIndex = layers.findIndex(layer => layer.id === formId);
    return formIndex === -1 ? -1 : formIndex;
  }, [layers]);

  return {
    layers,
    addLayer,
    removeLayer,
    closeCurrentLayer,
    closeLayer,
    isTopLayer: layers.length <= 1,
    // Backward compatibility
    registerForm,
    unregisterForm,
    isTopForm,
    isAnyFormAbove,
    getLayerDepth,
    activeForms: layers.map(layer => layer.id)
  };
}; 