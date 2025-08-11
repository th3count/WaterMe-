/**
 * 🔗 SYSTEM DOCUMENTATION: See /rules/ directory for comprehensive guides
 * 📖 Primary Reference: /rules/layer-system.md
 * 🏗️ Architecture: /rules/project-structure.md
 * 🎨 Styling: /rules/css-conventions.md
 * 
 * UNIVERSAL LAYER MANAGEMENT SYSTEM
 * =================================
 * React Portal-based layer system for consistent modal/form handling.
 * All UI layers render into document.body with automatic z-index management.
 */

import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Layer {
  id: string;
  type: 'page' | 'form' | 'picker';
  component: React.ComponentType<any>;
  props: any;
  depth: number;
  isActive: boolean;
}

interface FormLayerContextType {
  layers: Layer[];
  addLayer: (layerId: string, type: 'page' | 'form' | 'picker', component: React.ComponentType<any>, props: any) => void;
  removeLayer: (layerId: string) => void;
}

export const FormLayerContext = createContext<FormLayerContextType | null>(null);

interface FormLayerProviderProps {
  children: ReactNode;
}

export const FormLayerProvider: React.FC<FormLayerProviderProps> = ({ children }) => {
  const [layers, setLayers] = useState<Layer[]>([]);

  const addLayer = useCallback((layerId: string, type: 'page' | 'form' | 'picker', component: React.ComponentType<any>, props: any) => {
    setLayers(prevLayers => {
      const newLayer = {
        id: layerId,
        type,
        component,
        props,
        depth: prevLayers.length,
        isActive: true
      };
      const updatedLayers = prevLayers.map(layer => ({ ...layer, isActive: false }));
      return [...updatedLayers, newLayer];
    });
  }, []);

  const removeLayer = useCallback((layerId: string) => {
    setLayers(prevLayers => {
      const newLayers = prevLayers.filter(layer => layer.id !== layerId);
      if (newLayers.length > 0) {
        newLayers[newLayers.length - 1].isActive = true;
      }
      return newLayers;
    });
  }, []);

  return (
    <FormLayerContext.Provider value={{ layers, addLayer, removeLayer }}>
      {/* Base layer - always rendered */}
      <div style={{
        opacity: layers.length > 0 ? 0.3 : 1,
        transition: 'opacity 0.3s ease',
        pointerEvents: layers.length > 0 ? 'none' : 'auto'
      }}>
        {children}
      </div>
      
      {/* Render layers using React Portal - completely outside the DOM tree */}
      {layers.length > 0 && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={(e) => {
            console.log('🔵 Portal background clicked:', {
              target: e.target,
              currentTarget: e.currentTarget,
              isBackgroundClick: e.target === e.currentTarget
            });
            // Only close if clicking the background, not the modal content
            if (e.target === e.currentTarget) {
              const topLayer = layers[layers.length - 1];
              console.log('🔵 Closing layer:', topLayer.id);
              removeLayer(topLayer.id);
            }
          }}
        >
          {(() => {
            console.log('🔵 FormLayerManager rendering layers:', layers.map(l => ({id: l.id, type: l.type, isActive: l.isActive})));
            const topLayer = layers[layers.length - 1];
            console.log('🔵 Rendering top layer:', topLayer.id);
            const Component = topLayer.component;
            return <Component {...topLayer.props} />;
          })()}
        </div>,
        document.body
      )}
    </FormLayerContext.Provider>
  );
}; 