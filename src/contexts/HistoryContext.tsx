import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { TranslationHistoryEntry } from '@/types';
import dataManager from '@/services/dataManager';

interface HistoryState {
  history: TranslationHistoryEntry[];
  isLoading: boolean;
  error: string | null;
}

interface HistoryContextValue extends HistoryState {
  // 简化的历史记录管理功能
  addHistoryEntry: (entry: Omit<TranslationHistoryEntry, 'timestamp'>) => Promise<void>; // 添加历史记录
  deleteHistoryEntry: (taskId: string) => Promise<void>; // 删除历史记录
  clearHistory: () => Promise<void>; // 清空历史记录
  loadHistoryEntry: (taskId: string) => TranslationHistoryEntry | null; // 查找历史记录
  loadTaskFromHistory: (taskId: string) => Promise<void>; // 从历史记录加载任务
  getHistoryStats: () => { total: number; totalTokens: number }; // 统计信息
  refreshHistory: () => Promise<void>; // 刷新历史记录
}

type HistoryAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_HISTORY'; payload: TranslationHistoryEntry[] }
  | { type: 'ADD_HISTORY_ENTRY'; payload: TranslationHistoryEntry }
  | { type: 'DELETE_HISTORY_ENTRY'; payload: string } // taskId
  | { type: 'CLEAR_HISTORY' };

const initialState: HistoryState = {
  history: [],
  isLoading: false,
  error: null
};

const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_HISTORY':
      return { ...state, history: action.payload };
    case 'ADD_HISTORY_ENTRY':
      return { ...state, history: [action.payload, ...state.history] };
    case 'DELETE_HISTORY_ENTRY':
      return {
        ...state,
        history: state.history.filter(entry => entry.taskId !== action.payload)
      };
    case 'CLEAR_HISTORY':
      return { ...state, history: [] };
    default:
      return state;
  }
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

export const HistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(historyReducer, initialState);

  // 添加历史记录（只在翻译完成时调用）
  const addHistoryEntry = useCallback(async (entry: Omit<TranslationHistoryEntry, 'timestamp'>) => {
    try {
      // 使用数据管理器添加历史记录并持久化
      await dataManager.addHistoryEntry(entry);
      
      // 重新加载历史数据以更新UI
      const updatedHistory = dataManager.getHistory();
      dispatch({ type: 'SET_HISTORY', payload: updatedHistory });
    } catch (error) {
      console.error('保存历史记录失败:', error);
      dispatch({ type: 'SET_ERROR', payload: '保存历史记录失败' });
    }
  }, []);

  // 删除历史记录
  const deleteHistoryEntry = useCallback(async (taskId: string) => {
    dispatch({ type: 'DELETE_HISTORY_ENTRY', payload: taskId });
    
    // 使用数据管理器删除历史记录并持久化
    await dataManager.deleteHistoryEntry(taskId);
  }, []);

  // 清空历史记录
  const clearHistory = useCallback(async () => {
    dispatch({ type: 'CLEAR_HISTORY' });
    
    // 使用数据管理器清空历史记录并持久化
    await dataManager.clearHistory();
  }, []);

  // 查找历史记录
  const loadHistoryEntry = useCallback((taskId: string): TranslationHistoryEntry | null => {
    return state.history.find(entry => entry.taskId === taskId) || null;
  }, [state.history]);

  // 从历史记录加载任务
  const loadTaskFromHistory = useCallback(async (taskId: string): Promise<void> => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // 使用数据管理器加载任务并持久化
      await dataManager.loadTaskFromHistory(taskId);
      
      // 刷新当前页面以显示加载的数据
      window.location.reload();
    } catch (error) {
      console.error('从历史记录加载任务失败:', error);
      dispatch({ type: 'SET_ERROR', payload: '加载任务失败' });
      throw error;
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // 统计信息
  const getHistoryStats = useCallback(() => {
    const total = state.history.length;
    const totalTokens = state.history.reduce((sum, entry) => sum + entry.totalTokens, 0);
    
    return { total, totalTokens };
  }, [state.history]);

  // 刷新历史记录
  const refreshHistory = useCallback(async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      
      // 从内存中获取历史记录
      const savedHistory = dataManager.getHistory();
      dispatch({ type: 'SET_HISTORY', payload: savedHistory });
    } catch (error) {
      console.error('刷新历史记录失败:', error);
      dispatch({ type: 'SET_ERROR', payload: '刷新历史记录失败' });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  // 加载保存的数据
  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        
        // 从内存中获取历史记录
        const savedHistory = dataManager.getHistory();
        dispatch({ type: 'SET_HISTORY', payload: savedHistory });
      } catch (error) {
        console.error('加载保存的历史记录失败:', error);
        dispatch({ type: 'SET_ERROR', payload: '加载历史记录失败' });
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    loadSavedData();
  }, []);

  const value: HistoryContextValue = {
    ...state,
    addHistoryEntry,
    deleteHistoryEntry,
    clearHistory,
    loadHistoryEntry,
    loadTaskFromHistory,
    getHistoryStats,
    refreshHistory
  };

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
};

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) {
    throw new Error('useHistory must be used within a HistoryProvider');
  }
  return context;
};