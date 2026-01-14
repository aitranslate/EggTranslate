import React, { createContext, useContext, useReducer, useCallback, useRef, useMemo, useEffect } from 'react';
import { TranslationConfig, TranslationProgress } from '@/types';
import translationService from '@/services/TranslationService';
import dataManager from '@/services/dataManager';
import { DEFAULT_TRANSLATION_CONFIG } from '@/constants/translationDefaults';

interface TranslationState {
  config: TranslationConfig;
  isTranslating: boolean;
  progress: TranslationProgress;
  tokensUsed: number;
  isConfigured: boolean;
  abortController: AbortController | null;
  currentTaskId: string;
}

interface TranslationContextValue extends TranslationState {
  updateConfig: (config: Partial<TranslationConfig>) => Promise<void>;
  testConnection: () => Promise<boolean>;
  translateBatch: (texts: string[], signal?: AbortSignal, contextBefore?: string, contextAfter?: string, terms?: string) => Promise<{translations: Record<string, any>, tokensUsed: number}>;
  updateProgress: (current: number, total: number, phase: 'direct' | 'completed', status: string, taskId?: string, newTokens?: number) => Promise<void>;
  resetProgress: () => Promise<void>;
  clearTask: () => Promise<void>;
  startTranslation: () => Promise<AbortController>;
  stopTranslation: () => Promise<void>;
  completeTranslation: (taskId: string) => Promise<void>;
}

type TranslationAction =
  | { type: 'SET_CONFIG'; payload: Partial<TranslationConfig> }
  | { type: 'SET_TRANSLATING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: TranslationProgress }
  | { type: 'SET_TOKENS_USED'; payload: number }
  | { type: 'ADD_TOKENS_USED'; payload: number }
  | { type: 'SET_ABORT_CONTROLLER'; payload: AbortController | null }
  | { type: 'SET_TASK_ID'; payload: string }
  | { type: 'RESET_PROGRESS' };

const initialState: TranslationState = {
  config: DEFAULT_TRANSLATION_CONFIG,
  isTranslating: false,
  progress: {
    current: 0,
    total: 0,
    phase: 'direct',
    status: '准备中...'
  },
  tokensUsed: 0,
  isConfigured: false,
  abortController: null,
  currentTaskId: ''
};

const translationReducer = (state: TranslationState, action: TranslationAction): TranslationState => {
  switch (action.type) {
    case 'SET_CONFIG': {
      const newConfig = { ...state.config, ...action.payload };
      return {
        ...state,
        config: newConfig,
        isConfigured: newConfig.apiKey.length > 0
      };
    }
    case 'SET_TRANSLATING':
      return { ...state, isTranslating: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SET_TOKENS_USED':
      return { ...state, tokensUsed: action.payload };
    case 'ADD_TOKENS_USED':
      return { ...state, tokensUsed: state.tokensUsed + action.payload };
    case 'SET_ABORT_CONTROLLER':
      return { ...state, abortController: action.payload };
    case 'SET_TASK_ID':
      return { ...state, currentTaskId: action.payload };
    case 'RESET_PROGRESS':
      return {
        ...state,
        progress: {
          current: 0,
          total: 0,
          phase: 'direct',
          status: '准备中...'
        },
        tokensUsed: 0,
        abortController: null
      };
    default:
      return state;
  }
};

const TranslationContext = createContext<TranslationContextValue | null>(null);

export const TranslationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(translationReducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // 初始化服务
  useEffect(() => {
    const initializeService = async () => {
      try {
        await translationService.initialize();
        const savedConfig = translationService.getConfig();
        dispatch({ type: 'SET_CONFIG', payload: savedConfig });
      } catch (error) {
        console.error('初始化翻译服务失败:', error);
      }
    };

    initializeService();
  }, []);

  // 加载保存的任务状态
  useEffect(() => {
    const loadSavedTaskState = async () => {
      try {
        const currentTask = dataManager.getCurrentTask();

        if (currentTask && currentTask.taskId) {
          dispatch({ type: 'SET_TASK_ID', payload: currentTask.taskId });

          if (currentTask.translation_progress) {
            const progress = currentTask.translation_progress;
            const isTranslating = progress.status === 'translating';

            dispatch({ type: 'SET_TRANSLATING', payload: isTranslating });
            const tokensToSet = progress.tokens ?? 0;
            dispatch({ type: 'SET_TOKENS_USED', payload: tokensToSet });

            const progressObj = {
              current: progress.completed || 0,
              total: progress.total || 0,
              phase: progress.status === 'completed' ? 'completed' as const : 'direct' as const,
              status: progress.status === 'completed' ? '翻译完成' : '准备中...',
              taskId: currentTask.taskId
            };

            dispatch({ type: 'SET_PROGRESS', payload: progressObj });
          }
        }
      } catch (error) {
        console.error('加载保存的任务状态失败:', error);
      }
    };

    loadSavedTaskState();
  }, []);

  const updateConfig = useCallback(async (newConfig: Partial<TranslationConfig>) => {
    await translationService.updateConfig(newConfig);
    dispatch({ type: 'SET_CONFIG', payload: newConfig });
  }, []);

  const testConnection = useCallback(async (): Promise<boolean> => {
    return translationService.testConnection();
  }, []);

  const translateBatch = useCallback(async (
    texts: string[],
    signal?: AbortSignal,
    contextBefore = '',
    contextAfter = '',
    terms = ''
  ): Promise<{ translations: Record<string, any>; tokensUsed: number }> => {
    const result = await translationService.translateBatch(
      texts,
      signal,
      contextBefore,
      contextAfter,
      terms
    );

    // 累加 tokens
    dispatch({ type: 'ADD_TOKENS_USED', payload: result.tokensUsed });

    return result;
  }, []);

  const updateProgress = useCallback(async (
    current: number,
    total: number,
    phase: 'direct' | 'completed',
    status: string,
    taskId?: string,
    newTokens?: number
  ) => {
    const { currentTaskId } = stateRef.current;
    const actualTaskId = taskId || currentTaskId;

    const newProgress = { current, total, phase, status, taskId: actualTaskId };
    dispatch({ type: 'SET_PROGRESS', payload: newProgress });

    await translationService.updateProgress(current, total, phase, status, actualTaskId, newTokens);
  }, []);

  const resetProgress = useCallback(async () => {
    dispatch({ type: 'RESET_PROGRESS' });
    await translationService.resetProgress();
  }, []);

  const startTranslation = useCallback(async () => {
    const controller = new AbortController();
    dispatch({ type: 'SET_ABORT_CONTROLLER', payload: controller });
    dispatch({ type: 'SET_TRANSLATING', payload: true });

    return controller;
  }, []);

  const stopTranslation = useCallback(async (controller?: AbortController) => {
    const ctrl = controller || state.abortController;
    if (ctrl) {
      ctrl.abort();
    }

    if (!controller) {
      dispatch({ type: 'SET_TRANSLATING', payload: false });
      dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });
    }
  }, [state.abortController]);

  const clearTask = useCallback(async () => {
    dispatch({ type: 'RESET_PROGRESS' });
    dispatch({ type: 'SET_TASK_ID', payload: '' });
    dispatch({ type: 'SET_TRANSLATING', payload: false });
    dispatch({ type: 'SET_TOKENS_USED', payload: 0 });

    await translationService.clearTask();
  }, []);

  const completeTranslation = useCallback(async (taskId: string) => {
    dispatch({ type: 'SET_TRANSLATING', payload: false });

    await translationService.completeTranslation(taskId);
  }, []);

  // 监听任务创建事件
  useEffect(() => {
    const handleTaskCreated = (event: CustomEvent) => {
      const { taskId } = event.detail;

      dispatch({ type: 'SET_TASK_ID', payload: taskId });
      dispatch({ type: 'SET_TRANSLATING', payload: false });
      dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });

      const initialProgress = {
        current: 0,
        total: 0,
        phase: 'direct' as const,
        status: '准备中...',
        taskId: taskId
      };
      dispatch({ type: 'SET_PROGRESS', payload: initialProgress });

      setTimeout(async () => {
        try {
          const currentTask = dataManager.getCurrentTask();

          if (currentTask && currentTask.taskId === taskId) {
            dispatch({ type: 'SET_TASK_ID', payload: currentTask.taskId });
          }
        } catch (error) {
          console.error('同步任务状态失败:', error);
        }
      }, 50);
    };

    const handleTaskCleared = () => {
      dispatch({ type: 'RESET_PROGRESS' });
      dispatch({ type: 'SET_TASK_ID', payload: '' });
      dispatch({ type: 'SET_TRANSLATING', payload: false });
      dispatch({ type: 'SET_TOKENS_USED', payload: 0 });
    };

    window.addEventListener('taskCreated', handleTaskCreated as EventListener);
    window.addEventListener('taskCleared', handleTaskCleared as EventListener);

    return () => {
      window.removeEventListener('taskCreated', handleTaskCreated as EventListener);
      window.removeEventListener('taskCleared', handleTaskCleared as EventListener);
    };
  }, []);

  const value: TranslationContextValue = useMemo(() => ({
    ...state,
    updateConfig,
    testConnection,
    translateBatch,
    updateProgress,
    resetProgress,
    clearTask,
    startTranslation,
    stopTranslation,
    completeTranslation
  }), [
    state,
    updateConfig,
    testConnection,
    translateBatch,
    updateProgress,
    resetProgress,
    clearTask,
    startTranslation,
    stopTranslation,
    completeTranslation
  ]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};
