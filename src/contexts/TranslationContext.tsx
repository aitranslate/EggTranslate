import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { TranslationConfig, TranslationProgress } from '@/types';
import { rateLimiter } from '@/utils/rateLimiter';
import { jsonrepair } from 'jsonrepair';
import dataManager from '@/services/dataManager';
import { generateSharedPrompt, generateDirectPrompt, generateReflectionPrompt } from '@/utils/translationPrompts';

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
  contextBefore: 2,
  contextAfter: 2,
  batchSize: 10,
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

  const apiKeyIndexRef = useRef(0);

  const getNextApiKey = useCallback((apiKeyStr: string): string => {
    const apiKeys = apiKeyStr.split('|').map(key => key.trim()).filter(key => key.length > 0);
    if (apiKeys.length === 0) {
      throw new Error('未配置有效的API密钥');
    }
    
    const currentIndex = apiKeyIndexRef.current;
    const nextIndex = (currentIndex + 1) % apiKeys.length;
    apiKeyIndexRef.current = nextIndex;
    
    return apiKeys[currentIndex];
  }, []);

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
    
    const apiKey = getNextApiKey(state.config.apiKey);
    
    try {
      const response = await fetch(`${state.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: state.config.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }          
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
    terms = '', 
    maxRetries = 5
  ): Promise<{translations: Record<string, any>, tokensUsed: number}> => {
    if (!state.config.apiKey) {
      throw new Error('请先配置API密钥');
    }
    
    rateLimiter.setRPM(state.config.rpm);
    
    const textToTranslate = texts.join('\n');
    const sharedPrompt = generateSharedPrompt(contextBefore, contextAfter, terms);
    const directPrompt = generateDirectPrompt(
      textToTranslate, 
      sharedPrompt, 
      state.config.sourceLanguage, 
      state.config.targetLanguage
    );
    
    let lastError: any = null;
    let totalTokensUsed = 0;
    let directResult: Record<string, any> = {};
    
    // 第一步：直译
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) {
        throw new Error('翻译被取消');
      }
      
      try {
        await rateLimiter.waitForAvailability();
        
        if (signal?.aborted) {
          throw new Error('翻译被取消');
        }
        
        const apiKey = getNextApiKey(state.config.apiKey);
        
        const directResponse = await fetch(`${state.config.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: state.config.model,
            messages: [{ role: 'user', content: directPrompt }],
            temperature: 0.3
          }),
          signal
        });
        
        if (!directResponse.ok) {
          const errorData = await directResponse.json();
          throw new Error(errorData.error?.message || `HTTP ${directResponse.status}`);
        }
        
        const directData = await directResponse.json();
        
        const directTokensUsed = directData.usage?.total_tokens || 0;
        totalTokensUsed += directTokensUsed;
        
        const directContent = directData.choices[0]?.message?.content || '';
        
        const repairedDirectJson = jsonrepair(directContent);
        directResult = JSON.parse(repairedDirectJson);
        
        // 成功获取直译结果后，继续进行反思翻译
        break;
      } catch (error) {
        if (error.name === 'AbortError' || error.message?.includes('取消')) {
          throw error;
        }
        
        lastError = error;
        console.error(`直译批次第${attempt}次尝试失败:`, error);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    if (!directResult || Object.keys(directResult).length === 0) {
      console.error('直译批次失败，已达到最大重试次数:', lastError);
      throw lastError || new Error('直译失败');
    }
    
    // 第二步：如果启用了反思翻译，则执行反思翻译
    if (state.config.enableReflection) {
      try {
        if (signal?.aborted) {
          throw new Error('翻译被取消');
        }
        
        // 生成反思提示词
        const reflectionPrompt = generateReflectionPrompt(
          directResult,
          textToTranslate,
          sharedPrompt,
          state.config.sourceLanguage,
          state.config.targetLanguage
        );
        
        await rateLimiter.waitForAvailability();
        
        if (signal?.aborted) {
          throw new Error('翻译被取消');
        }
        
        const apiKey = getNextApiKey(state.config.apiKey);
        
        const reflectionResponse = await fetch(`${state.config.baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: state.config.model,
            messages: [{ role: 'user', content: reflectionPrompt }],
            temperature: 0.3
          }),
          signal
        });
        
        if (!reflectionResponse.ok) {
          const errorData = await reflectionResponse.json();
          console.error('反思翻译请求失败:', errorData);
          // 如果反思失败，仍然返回直译结果
          return {
            translations: directResult,
            tokensUsed: totalTokensUsed
          };
        }
        
        const reflectionData = await reflectionResponse.json();
        
        const reflectionTokensUsed = reflectionData.usage?.total_tokens || 0;
        totalTokensUsed += reflectionTokensUsed;
        
        const reflectionContent = reflectionData.choices[0]?.message?.content || '';
        
        try {
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
        } catch (jsonError) {
          console.error('解析反思翻译结果失败:', jsonError);
          // 如果解析反思结果失败，返回直译结果
          return {
            translations: directResult,
            tokensUsed: totalTokensUsed
          };
        }
      } catch (error) {
        if (error.name === 'AbortError' || error.message?.includes('取消')) {
          throw error;
        }
        
        console.error('反思翻译失败:', error);
        // 如果反思翻译过程中出错，返回直译结果
        return {
          translations: directResult,
          tokensUsed: totalTokensUsed
        };
      }
    } else {
      // 如果未启用反思翻译，直接返回直译结果
      return {
        translations: directResult,
        tokensUsed: totalTokensUsed
      };
    }
  }, [state.config, generateSharedPrompt, generateDirectPrompt, generateReflectionPrompt]);

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

  const value: TranslationContextValue = {
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
  };

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
};

export const useTranslation = () => {
  const context = useContext(TranslationContext);
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return context;
};