import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { Term } from '@/types';
import dataManager from '@/services/dataManager';

interface TermsState {
  terms: Term[];
  isLoading: boolean;
  error: string | null;
}

interface TermsContextValue extends TermsState {
  addTerm: (original: string, translation: string) => Promise<void>;
  removeTerm: (index: number) => Promise<void>;
  updateTerm: (index: number, original: string, translation: string) => Promise<void>;
  clearTerms: () => Promise<void>;
  importTerms: (termsText: string) => Promise<void>;
  exportTerms: () => string;
  getRelevantTerms: (text: string) => Term[];
}

type TermsAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_TERMS'; payload: Term[] }
  | { type: 'ADD_TERM'; payload: Term }
  | { type: 'REMOVE_TERM'; payload: number }
  | { type: 'UPDATE_TERM'; payload: { index: number; term: Term } }
  | { type: 'CLEAR_TERMS' };

const initialState: TermsState = {
  terms: [],
  isLoading: false,
  error: null
};

const termsReducer = (state: TermsState, action: TermsAction): TermsState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_TERMS':
      return { ...state, terms: action.payload };
    case 'ADD_TERM':
      return { ...state, terms: [...state.terms, action.payload] };
    case 'REMOVE_TERM':
      return { ...state, terms: state.terms.filter((_, index) => index !== action.payload) };
    case 'UPDATE_TERM':
      return {
        ...state,
        terms: state.terms.map((term, index) =>
          index === action.payload.index ? action.payload.term : term
        )
      };
    case 'CLEAR_TERMS':
      return { ...state, terms: [] };
    default:
      return state;
  }
};

const TermsContext = createContext<TermsContextValue | null>(null);

export const TermsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(termsReducer, initialState);

  const addTerm = useCallback(async (original: string, translation: string) => {
    const newTerm = { original, translation };
    dispatch({ type: 'ADD_TERM', payload: newTerm });
    await dataManager.addTerm(newTerm);
  }, []);

  const removeTerm = useCallback(async (index: number) => {
    dispatch({ type: 'REMOVE_TERM', payload: index });
    await dataManager.removeTerm(index);
  }, []);

  const updateTerm = useCallback(async (index: number, original: string, translation: string) => {
    const updatedTerm = { original, translation };
    dispatch({ type: 'UPDATE_TERM', payload: { index, term: updatedTerm } });
    await dataManager.updateTerm(index, original, translation);
  }, []);

  const clearTerms = useCallback(async () => {
    dispatch({ type: 'CLEAR_TERMS' });
    await dataManager.clearTerms();
  }, []);

  const importTerms = useCallback(async (termsText: string) => {
    try {
      const lines = termsText.split('\n').filter(line => line.trim());
      const newTerms: Term[] = [];

      for (const line of lines) {
        const parts = line.split(':').map(part => part.trim());
        if (parts.length >= 2) {
          newTerms.push({
            original: parts[0],
            translation: parts[1]
          });
        }
      }

      dispatch({ type: 'SET_TERMS', payload: newTerms });
      await dataManager.saveTerms(newTerms);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '导入术语失败';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    }
  }, []);

  const exportTerms = useCallback(() => {
    return state.terms.map(term => `${term.original}: ${term.translation}`).join('\n');
  }, [state.terms]);

  /**
   * 清洗文本，移除所有空格和符号，转为小写
   * @param text 需要清洗的文本
   * @returns 清洗后的文本
   */
  const cleanText = (text: string): string => {
    return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  };

  const getRelevantTerms = useCallback((text: string, contextBefore: string = '', contextAfter: string = ''): Term[] => {
    if (state.terms.length === 0) return [];
    
    // 合并所有文本（主文本、前文上下文、后文上下文）
    const fullText = `${contextBefore} ${text} ${contextAfter}`;
    
    // 清洗合并后的文本
    const cleanedFullText = cleanText(fullText);
    
    // 预处理术语，为每个术语创建一个清洗后的版本
    const processedTerms = state.terms.map(term => ({
      ...term,
      cleanedOriginal: cleanText(term.original)
    }));
    
    // 筛选出在清洗后文本中出现的术语
    return processedTerms
      .filter(term => term.cleanedOriginal && cleanedFullText.includes(term.cleanedOriginal))
      .map(({ original, translation }) => ({ original, translation })); // 返回原始术语格式
  }, [state.terms]);

  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedTerms = dataManager.getTerms();
        if (savedTerms && savedTerms.length > 0) {
          dispatch({ type: 'SET_TERMS', payload: savedTerms });
        }
      } catch (error) {
        console.error('加载保存的术语失败:', error);
      }
    };

    loadSavedData();
  }, []);

  const value: TermsContextValue = {
    ...state,
    addTerm,
    removeTerm,
    updateTerm,
    clearTerms,
    importTerms,
    exportTerms,
    getRelevantTerms
  };

  return <TermsContext.Provider value={value}>{children}</TermsContext.Provider>;
};

export const useTerms = () => {
  const context = useContext(TermsContext);
  if (!context) {
    throw new Error('useTerms must be used within a TermsProvider');
  }
  return context;
};