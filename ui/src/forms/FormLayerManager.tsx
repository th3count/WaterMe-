import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

// FormLayer interface removed as it was unused

interface FormLayerContextType {
  activeForms: string[];
  registerForm: (formId: string) => void;
  unregisterForm: (formId: string) => void;
  isTopForm: (formId: string) => boolean;
  isAnyFormAbove: (formId: string) => boolean;
  // Add missing properties that other components expect
  isTopLayer: boolean;
  pushLayer: (formId: string) => void;
  popLayer: (formId: string) => void;
  getLayerDepth: (formId: string) => number;
}

const FormLayerContext = createContext<FormLayerContextType | null>(null);

export function useFormLayer() {
  const context = useContext(FormLayerContext);
  if (!context) {
    throw new Error('useFormLayer must be used within a FormLayerProvider');
  }
  return context;
}

interface FormLayerProviderProps {
  children: ReactNode;
}

export function FormLayerProvider({ children }: FormLayerProviderProps) {
  const [activeForms, setActiveForms] = useState<string[]>([]);

  const registerForm = useCallback((formId: string) => {
    console.log('🔵 Registering form:', formId);
    setActiveForms(prev => {
      // If form is already registered, don't add it again
      if (prev.includes(formId)) {
        console.log('🔵 Form already registered:', formId);
        return prev;
      }
      // Add new form to the top of the stack
      const newStack = [...prev, formId];
      console.log('🔵 New form stack:', newStack);
      return newStack;
    });
  }, []);

  const unregisterForm = useCallback((formId: string) => {
    console.log('🔵 Unregistering form:', formId);
    setActiveForms(prev => prev.filter(id => id !== formId));
  }, []);

  const isTopForm = useCallback((formId: string) => {
    if (activeForms.length === 0) return false;
    return activeForms[activeForms.length - 1] === formId;
  }, [activeForms]);

  const isAnyFormAbove = useCallback((formId: string) => {
    const formIndex = activeForms.indexOf(formId);
    if (formIndex === -1) return false;
    // Check if there are any forms after this one in the stack
    const hasFormsAbove = formIndex < activeForms.length - 1;
    console.log('🔵 isAnyFormAbove check:', { formId, formIndex, activeForms, hasFormsAbove });
    return hasFormsAbove;
  }, [activeForms]);

  // Add missing functionality
  const pushLayer = useCallback((formId: string) => {
    registerForm(formId);
  }, [registerForm]);

  const popLayer = useCallback((formId: string) => {
    unregisterForm(formId);
  }, [unregisterForm]);

  const getLayerDepth = useCallback((formId: string) => {
    const formIndex = activeForms.indexOf(formId);
    return formIndex === -1 ? -1 : formIndex;
  }, [activeForms]);

  // Calculate if current context is top layer
  const isTopLayer = activeForms.length > 0;

  const value: FormLayerContextType = {
    activeForms,
    registerForm,
    unregisterForm,
    isTopForm,
    isAnyFormAbove,
    isTopLayer,
    pushLayer,
    popLayer,
    getLayerDepth
  };

  return (
    <FormLayerContext.Provider value={value}>
      {children}
    </FormLayerContext.Provider>
  );
} 