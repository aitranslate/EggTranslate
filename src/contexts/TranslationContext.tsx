import React, { createContext, useContext, useReducer, useCallback, useRef, useMemo } from 'react';
import { TranslationConfig, TranslationProgress } from '@/types';
import { jsonrepair } from 'jsonrepair';
import dataManager from '@/services/dataManager';
import { generateSharedPrompt, generateDirectPrompt, generateReflectionPrompt } from '@/utils/translationPrompts';
import { callLLM } from '@/utils/llmApi';

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

const initialConfig: TranslationConfig = {
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  sourceLanguage: 'English',
  targetLanguage: '简体中文',
  contextBefore: 5,
  contextAfter: 3,
  batchSize: 20,
  threadCount: 4,
  rpm: 0,
  enableReflection: false
};

const initialState: TranslationState = {
  config: initialConfig,
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

  const updateConfig = useCallback(async (newConfig: Partial<TranslationConfig>) => {
    dispatch({ type: 'SET_CONFIG', payload: newConfig });
    const configToSave = { ...state.config, ...newConfig };
    try {
      await dataManager.saveConfig(configToSave);
    } catch (error) {
      console.error('保存翻译配置失败:', error);
    }
  }, [state.config]);

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!state.config.apiKey) {
      throw new Error('请先配置API密钥');
    }

    try {
      await callLLM(
        {
          baseURL: state.config.baseURL,
          apiKey: state.config.apiKey,
          model: state.config.model
        },
        [{ role: 'user', content: 'Hello' }],
        { maxRetries: 1 }
      );
      return true;
    } catch (error) {
      console.error('连接测试失败:', error);
      throw error;
    }
  }, [state.config]);

  // 使用导入的提示词生成函数

  const translateBatch = useCallback(async (
    texts: string[],
    signal?: AbortSignal,
    contextBefore = '',
    contextAfter = '',
    terms = ''
  ): Promise<{translations: Record<string, any>, tokensUsed: number}> => {
    if (!state.config.apiKey) {
      throw new Error('请先配置API密钥');
    }

    const textToTranslate = texts.join('\n');
    const sharedPrompt = generateSharedPrompt(contextBefore, contextAfter, terms);
    const directPrompt = generateDirectPrompt(
      textToTranslate,
      sharedPrompt,
      state.config.sourceLanguage,
      state.config.targetLanguage
    );

    // 第一步：直译（使用统一的 callLLM，自动重试、多 key 轮询、频率限制）
    const { content: directContent, tokensUsed: directTokensUsed } = await callLLM(
      {
        baseURL: state.config.baseURL,
        apiKey: state.config.apiKey,
        model: state.config.model,
        rpm: state.config.rpm
      },
      [{ role: 'user', content: directPrompt }],
      { signal, temperature: 0.3, maxRetries: 5 }
    );

    const repairedDirectJson = jsonrepair(directContent);
    const directResult = JSON.parse(repairedDirectJson);
    let totalTokensUsed = directTokensUsed;

    // 第二步：如果启用了反思翻译，则执行反思翻译
    if (state.config.enableReflection) {
      try {
        // 生成反思提示词
        const reflectionPrompt = generateReflectionPrompt(
          directResult,
          textToTranslate,
          sharedPrompt,
          state.config.sourceLanguage,
          state.config.targetLanguage
        );

        const { content: reflectionContent, tokensUsed: reflectionTokensUsed } = await callLLM(
          {
            baseURL: state.config.baseURL,
            apiKey: state.config.apiKey,
            model: state.config.model,
            rpm: state.config.rpm
          },
          [{ role: 'user', content: reflectionPrompt }],
          { signal, temperature: 0.3, maxRetries: 1 }  // 反思翻译只重试 1 次
        );

        totalTokensUsed += reflectionTokensUsed;

        const repairedReflectionJson = jsonrepair(reflectionContent);
        const reflectionResult = JSON.parse(repairedReflectionJson);

        // 将反思结果转换为直译格式
        const formattedResult: Record<string, any> = {};

        // 遍历反思结果，提取需要的字段并保持直译格式
        Object.keys(reflectionResult).forEach(key => {
          formattedResult[key] = {
            origin: reflectionResult[key].origin,
            direct: reflectionResult[key].free || reflectionResult[key].direct // 优先使用自由翻译，如果没有则使用直译
          };
        });

        return {
          translations: formattedResult,
          tokensUsed: totalTokensUsed
        };
      } catch (error) {
        // 如果反思翻译失败，返回直译结果
        console.error('反思翻译失败，使用直译结果:', error);
        return {
          translations: directResult,
          tokensUsed: totalTokensUsed
        };
      }
    }

    // 如果未启用反思翻译，直接返回直译结果
    return {
      translations: directResult,
      tokensUsed: totalTokensUsed
    };
  }, [state.config]);

  const updateProgress = useCallback(async (
    current: number, 
    total: number, 
    phase: 'direct' | 'completed', 
    status: string, 
    taskId?: string,
    newTokens?: number  // 可选参数，用于更新tokens
  ) => {
    const { currentTaskId } = stateRef.current;
    const actualTaskId = taskId || currentTaskId;
    const newProgress = { current, total, phase, status, taskId: actualTaskId };
    dispatch({ type: 'SET_PROGRESS', payload: newProgress });

    try {
      if (actualTaskId) {
        // 准备更新对象
        const updateObj: any = {
          completed: current,
          total: total,
          status: phase === 'completed' ? 'completed' : 'translating',
        };
        
        // 如果提供了新的tokens值，则更新tokens
        if (newTokens !== undefined) {
          updateObj.tokens = newTokens;
        }
        
        // 只在内存中更新，不进行持久化
        // 使用不带持久化的方法
        dataManager.updateTaskTranslationProgressInMemory(actualTaskId, updateObj);
      }
    } catch (error) {
      console.error('更新翻译进度失败:', error);
    }
  }, []);

  const resetProgress = useCallback(async () => {
    dispatch({ type: 'RESET_PROGRESS' });
    
    try {
      const currentTask = dataManager.getCurrentTask();
      if (currentTask) {
      await dataManager.updateTaskTranslationProgress(currentTask.taskId, {
        completed: 0,
        tokens: 0,
        status: 'idle'
      });
      }
    } catch (error) {
      console.error('重置翻译进度失败:', error);
    }
  }, []);

  const startTranslation = useCallback(async () => {
    const controller = new AbortController();
    dispatch({ type: 'SET_ABORT_CONTROLLER', payload: controller });
    dispatch({ type: 'SET_TRANSLATING', payload: true });
    
    return controller;
  }, []);

  const stopTranslation = useCallback(async (controller?: AbortController) => {
    // 如果传入了特定的控制器，使用它；否则使用全局的
    const ctrl = controller || state.abortController;
    if (ctrl) {
      ctrl.abort();
    }
    
    // 只有在没有特定控制器时才更新全局状态
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
    
    try {
      await dataManager.clearCurrentTask();
    } catch (error) {
      console.error('清空任务失败:', error);
    }
  }, []);
  const completeTranslation = useCallback(async (taskId: string) => {
    // 不要中止全局的 abortController，因为可能有其他任务在运行
    // 只更新状态和完成任务
    
    dispatch({ type: 'SET_TRANSLATING', payload: false });
    // 不要清空 abortController，让其他任务继续运行
    
    try {
      // 获取当前任务
      const task = dataManager.getTaskById(taskId);
      if (task) {
        // 获取任务特定的tokens
        const taskTokens = task.translation_progress?.tokens || 0;
        
        // 先在内存中更新状态
        dataManager.updateTaskTranslationProgressInMemory(taskId, {
          status: 'completed',
          tokens: taskTokens
        });
        
        // 延迟200ms后进行持久化
        setTimeout(async () => {
          try {
            await dataManager.updateTaskTranslationProgress(taskId, {
              status: 'completed',
              tokens: taskTokens
            });
            console.log('翻译任务持久化完成:', taskId);
          } catch (error) {
            console.error('延迟持久化失败:', error);
          }
        }, 200);
      }
    } catch (error) {
      console.error('保存完成状态失败:', error);
    }
  }, []);

  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        const savedConfig = dataManager.getConfig();
        if (savedConfig) {
          dispatch({ type: 'SET_CONFIG', payload: savedConfig });
        }
        
        const currentTask = dataManager.getCurrentTask();
        if (currentTask) {
          if (currentTask.taskId) {
            dispatch({ type: 'SET_TASK_ID', payload: currentTask.taskId });
          }
          
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
        console.error('加载保存的数据失败:', error);
      }
    };

    loadSavedData();
  }, []);

  React.useEffect(() => {
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
  }, [state.tokensUsed]);

  // 使用 useMemo 优化 Context value，避免不必要的重渲染
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