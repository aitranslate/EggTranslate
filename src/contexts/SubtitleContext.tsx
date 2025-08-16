import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { SubtitleEntry } from '@/types';
import dataManager from '@/services/dataManager';
import { parseSRT, toSRT, toTXT, toBilingual } from '@/utils/srtParser';

const generateTaskId = (): string => {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

interface SubtitleState {
  entries: SubtitleEntry[];
  filename: string;
  isLoading: boolean;
  error: string | null;
  currentTaskId: string;
}

interface SubtitleContextValue extends SubtitleState {
  loadFromFile: (file: File) => Promise<void>;
  updateEntry: (id: number, text: string, translatedText?: string) => Promise<void>;
  clearEntries: () => Promise<void>;
  clearAllData: () => Promise<void>;
  exportSRT: (useTranslation?: boolean) => string;
  exportTXT: (useTranslation?: boolean) => string;
  exportBilingual: () => string;
  getTranslationProgress: () => { completed: number; total: number };
  generateNewTaskId: () => string;
  getCurrentTaskId: () => string;
}

type SubtitleAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_ENTRIES'; payload: SubtitleEntry[] }
  | { type: 'SET_FILENAME'; payload: string }
  | { type: 'SET_TASK_ID'; payload: string }
  | { type: 'UPDATE_ENTRY'; payload: { id: number; text: string; translatedText?: string } }
  | { type: 'CLEAR_ENTRIES' }
  | { type: 'CLEAR_ALL_DATA' };

const initialState: SubtitleState = {
  entries: [],
  filename: '',
  isLoading: false,
  error: null,
  currentTaskId: generateTaskId()
};

const subtitleReducer = (state: SubtitleState, action: SubtitleAction): SubtitleState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_ENTRIES':
      return { ...state, entries: action.payload };
    case 'SET_FILENAME':
      return { ...state, filename: action.payload };
    case 'SET_TASK_ID':
      return { ...state, currentTaskId: action.payload };
    case 'UPDATE_ENTRY':
      return {
        ...state,
        entries: state.entries.map(entry =>
          entry.id === action.payload.id
            ? {
                ...entry,
                text: action.payload.text,
                translatedText: action.payload.translatedText ?? entry.translatedText
              }
            : entry
        )
      };
    case 'CLEAR_ENTRIES':
      return { ...state, entries: [], filename: '' };
    case 'CLEAR_ALL_DATA':
      return { ...initialState, currentTaskId: generateTaskId() };
    default:
      return state;
  }
};

const SubtitleContext = createContext<SubtitleContextValue | null>(null);

export const SubtitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(subtitleReducer, initialState);

  const loadFromFile = useCallback(async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      await dataManager.clearAllData();
      window.dispatchEvent(new CustomEvent('taskCleared'));
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const content = await file.text();
      const entries = parseSRT(content);
      
      const taskId = await dataManager.createNewTask(file.name, entries);
      
      dispatch({ type: 'SET_ENTRIES', payload: entries });
      dispatch({ type: 'SET_FILENAME', payload: file.name });
      dispatch({ type: 'SET_TASK_ID', payload: taskId });
      
      window.dispatchEvent(new CustomEvent('taskCreated', { 
        detail: { taskId, filename: file.name, entriesCount: entries.length } 
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件加载失败';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const updateEntry = useCallback(async (id: number, text: string, translatedText?: string) => {
    dispatch({ type: 'UPDATE_ENTRY', payload: { id, text, translatedText } });
    await dataManager.updateSubtitleEntry(id, text, translatedText);
  }, []);

  const clearEntries = useCallback(async () => {
    dispatch({ type: 'CLEAR_ENTRIES' });
    await dataManager.clearCurrentTask();
  }, []);

  const clearAllData = useCallback(async () => {
    dispatch({ type: 'CLEAR_ALL_DATA' });
    await dataManager.clearAllData();
    window.dispatchEvent(new CustomEvent('taskCleared'));
  }, []);

  const generateNewTaskId = useCallback((): string => {
    const newTaskId = generateTaskId();
    dispatch({ type: 'SET_TASK_ID', payload: newTaskId });
    return newTaskId;
  }, []);

  const getCurrentTaskId = useCallback((): string => {
    return state.currentTaskId;
  }, [state.currentTaskId]);

  const exportSRT = useCallback((useTranslation = true) => {
    return toSRT(state.entries, useTranslation);
  }, [state.entries]);

  const exportTXT = useCallback((useTranslation = true) => {
    return toTXT(state.entries, useTranslation);
  }, [state.entries]);

  const exportBilingual = useCallback(() => {
    return toBilingual(state.entries);
  }, [state.entries]);

  const getTranslationProgress = useCallback(() => {
    const completed = state.entries.filter(entry => entry.translatedText).length;
    return { completed, total: state.entries.length };
  }, [state.entries]);

  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        const currentTask = dataManager.getCurrentTask();
        if (currentTask) {
          dispatch({ type: 'SET_ENTRIES', payload: currentTask.subtitle_entries });
          dispatch({ type: 'SET_FILENAME', payload: currentTask.subtitle_filename });
          dispatch({ type: 'SET_TASK_ID', payload: currentTask.taskId });
        }
      } catch (error) {
        console.error('加载保存的数据失败:', error);
      }
    };

    loadSavedData();
  }, []);

  const value: SubtitleContextValue = {
    ...state,
    loadFromFile,
    updateEntry,
    clearEntries,
    clearAllData,
    exportSRT,
    exportTXT,
    exportBilingual,
    getTranslationProgress,
    generateNewTaskId,
    getCurrentTaskId
  };

  return <SubtitleContext.Provider value={value}>{children}</SubtitleContext.Provider>;
};

export const useSubtitle = () => {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }
  return context;
};