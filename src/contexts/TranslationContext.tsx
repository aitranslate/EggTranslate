import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { TranslationConfig, TranslationProgress, SubtitleEntry } from '@/types';
import { rateLimiter } from '@/utils/rateLimiter';
import { jsonrepair } from 'jsonrepair';
import dataManager from '@/services/dataManager';
import OpenAI from 'openai';

interface TranslationState {
  config: TranslationConfig;
  isTranslating: boolean;
  progress: TranslationProgress;
  tokensUsed: number;
  isConfigured: boolean;
  abortController: AbortController | null; // AbortController 实例
  currentTaskId: string; // 当前任务ID
}

interface TranslationContextValue extends TranslationState {
  updateConfig: (config: Partial<TranslationConfig>) => Promise<void>;
  testConnection: () => Promise<boolean>;
  translateBatch: (texts: string[], signal?: AbortSignal, contextBefore?: string, contextAfter?: string, terms?: string) => Promise<Record<string, any>>;
  updateProgress: (current: number, total: number, phase: 'direct' | 'completed', status: string) => Promise<void>;
  resetProgress: () => Promise<void>;
  clearTask: () => Promise<void>; // 新增清空任务函数
  startTranslation: () => Promise<AbortController>; // 开始翻译
  stopTranslation: () => Promise<void>; // 停止翻译
  completeTranslation: () => Promise<void>; // 完成翻译
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
  rpm: 0
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
  currentTaskId: '' // 初始为空，会在加载时设置
};

const translationReducer = (state: TranslationState, action: TranslationAction): TranslationState => {
  switch (action.type) {
    case 'SET_CONFIG':
      const newConfig = { ...state.config, ...action.payload };
      return {
        ...state,
        config: newConfig,
        isConfigured: newConfig.apiKey.length > 0
      };
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

  // API密钥轮询索引（使用useRef保证在多线程下安全）
  const apiKeyIndexRef = useRef(0);

  // 获取下一个API Key的函数
  const getNextApiKey = useCallback((apiKeyStr: string): string => {
    const apiKeys = apiKeyStr.split('|').map(key => key.trim()).filter(key => key.length > 0);
    if (apiKeys.length === 0) {
      throw new Error('未配置有效的API密钥');
    }
    
    // 线程安全的轮询索引更新
    const currentIndex = apiKeyIndexRef.current;
    const nextIndex = (currentIndex + 1) % apiKeys.length;
    apiKeyIndexRef.current = nextIndex;
    
    return apiKeys[currentIndex];
  }, []);

  const updateConfig = useCallback(async (newConfig: Partial<TranslationConfig>) => {
    dispatch({ type: 'SET_CONFIG', payload: newConfig });
    
    // 保存配置到内存并持久化
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
    
    // 获取当前API Key（轮询）
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
      
      const data = await response.json();
      
      if (data.usage) {
        dispatch({ type: 'ADD_TOKENS_USED', payload: data.usage.total_tokens });
      }
      
      return true;
    } catch (error) {
      console.error('连接测试失败:', error);
      throw error;
    }
  }, [state.config]);

  const generateSharedPrompt = useCallback((contextBefore: string, contextAfter: string, terms: string) => {
    return `### Context Information
<previous_content>
${contextBefore}
</previous_content>

<subsequent_content>
${contextAfter}
</subsequent_content>

### Points to Note
${terms}`;
  }, []);

  const generateDirectPrompt = useCallback((lines: string, sharedPrompt: string) => {
    const lineArray = lines.split('\n');
    const jsonDict: Record<string, any> = {};
    
    lineArray.forEach((line, index) => {
      jsonDict[`${index + 1}`] = {
        origin: line,
        direct: "" // 将此处的占位符改为真实的翻译内容
      };
    });
    
    const jsonFormat = JSON.stringify(jsonDict, null, 2);
    
    return `## Role
You are a professional Netflix subtitle translator, fluent in both ${state.config.sourceLanguage} and ${state.config.targetLanguage}, as well as their respective cultures. 
Your expertise lies in accurately understanding the semantics and structure of the original ${state.config.sourceLanguage} text and faithfully translating it into ${state.config.targetLanguage} while preserving the original meaning.

## Task
We have a segment of original ${state.config.sourceLanguage} subtitles that need to be directly translated into ${state.config.targetLanguage}. These subtitles come from a specific context and may contain specific themes and terminology.

1. Translate the original ${state.config.sourceLanguage} subtitles into ${state.config.targetLanguage} line by line
2. Ensure the translation is faithful to the original, accurately conveying the original meaning
3. Consider the context and professional terminology

${sharedPrompt}

<translation_principles>
1. Faithful to the original: Accurately convey the content and meaning of the original text, without arbitrarily changing, adding, or omitting content.
2. Accurate terminology: Use professional terms correctly and maintain consistency in terminology.
3. Understand the context: Fully comprehend and reflect the background and contextual relationships of the text.
</translation_principles>

## INPUT
<subtitles>
${lines}
</subtitles>

## Output in only JSON format and no other text
\`\`\`json
${jsonFormat}
\`\`\`

Note: Start you answer with \`\`\`json and end with \`\`\`, do not add any other text.`;
  }, [state.config.sourceLanguage, state.config.targetLanguage]);

  const translateBatch = useCallback(async (
    texts: string[], 
    signal?: AbortSignal,
    contextBefore = '', 
    contextAfter = '', 
    terms = '', 
    maxRetries = 5
  ): Promise<Record<string, any>> => {
    if (!state.config.apiKey) {
      throw new Error('请先配置API密钥');
    }
    
    // 更新限速器的RPM设置
    rateLimiter.setRPM(state.config.rpm);
    
    const textToTranslate = texts.join('\n');
    const sharedPrompt = generateSharedPrompt(contextBefore, contextAfter, terms);
    const directPrompt = generateDirectPrompt(textToTranslate, sharedPrompt);
    
    // 重试逻辑
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // 检查是否已被取消
      if (signal?.aborted) {
        throw new Error('翻译被取消');
      }
      
      try {
        // 等待直到可以发送请求
        await rateLimiter.waitForAvailability();
        
        // 再次检查取消状态
        if (signal?.aborted) {
          throw new Error('翻译被取消');
        }
        
        // 获取当前API Key（轮询）
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
          signal // 传入AbortSignal
        });
        
        if (!directResponse.ok) {
          const errorData = await directResponse.json();
          throw new Error(errorData.error?.message || `HTTP ${directResponse.status}`);
        }
        
        const directData = await directResponse.json();
        
        if (directData.usage) {
          dispatch({ type: 'ADD_TOKENS_USED', payload: directData.usage.total_tokens });
        }
        
        const directContent = directData.choices[0]?.message?.content || '';
        
        // 使用jsonrepair修复JSON
        const repairedDirectJson = jsonrepair(directContent);
        const directResult = JSON.parse(repairedDirectJson);
        
        return directResult;
      } catch (error) {
        // 如果是取消错误，直接抛出
        if (error.name === 'AbortError' || error.message?.includes('取消')) {
          throw error;
        }
        
        lastError = error;
        console.error(`翻译批次第${attempt}次尝试失败:`, error);
        // 如果不是最后一次尝试，等待一段时间后重试
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    // 如果所有重试都失败了，抛出异常
    console.error('翻译批次失败，已达到最大重试次数:', lastError);
    throw lastError;
  }, [state.config, generateSharedPrompt, generateDirectPrompt]);

  const updateProgress = useCallback(async (current: number, total: number, phase: 'direct' | 'completed', status: string) => {
    const { currentTaskId, tokensUsed } = stateRef.current;
    const newProgress = { current, total, phase, status, taskId: currentTaskId };
    dispatch({ type: 'SET_PROGRESS', payload: newProgress });

    try {
      const currentTask = dataManager.getCurrentTask();
      if (currentTask) {
        const progressStatus = phase === 'completed' ? 'completed' as const : 'translating' as const;
        
        await dataManager.updateTranslationProgress({
          completed: current,
          total: total,
          tokens: tokensUsed,
          status: progressStatus,
        });
      }
    } catch (error) {
      console.error('更新翻译进度失败:', error);
    }
  }, []);

  const resetProgress = useCallback(async () => {
    dispatch({ type: 'RESET_PROGRESS' });
    
    // 清空当前翻译任务（仅重置进度，不清空任务）
    try {
      const currentTask = dataManager.getCurrentTask();
      if (currentTask) {
        await dataManager.updateTranslationProgress({
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
    // 创建新的AbortController
    const controller = new AbortController();
    dispatch({ type: 'SET_ABORT_CONTROLLER', payload: controller });
    dispatch({ type: 'SET_TRANSLATING', payload: true });
    
    return controller;
  }, []);

  const stopTranslation = useCallback(async () => {
    // 取消所有请求
    if (state.abortController) {
      state.abortController.abort();
    }
    
    // 重置状态（只重置控制状态，不清空数据）
    dispatch({ type: 'SET_TRANSLATING', payload: false });
    dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });
    
  }, [state.abortController]);

  // 清空任务的专用函数
  const clearTask = useCallback(async () => {
    // 完全重置所有状态（包括Token）
    dispatch({ type: 'RESET_PROGRESS' });
    dispatch({ type: 'SET_TASK_ID', payload: '' });
    dispatch({ type: 'SET_TRANSLATING', payload: false });
    dispatch({ type: 'SET_TOKENS_USED', payload: 0 });
    
    // 清空内存中的当前任务并持久化
    try {
      await dataManager.clearCurrentTask();
    } catch (error) {
      console.error('清空任务失败:', error);
    }
  }, []);
  const completeTranslation = useCallback(async () => {
    const { abortController, tokensUsed, currentTaskId } = stateRef.current;
    if (abortController) {
      abortController.abort();
    }
    
    dispatch({ type: 'SET_TRANSLATING', payload: false });
    dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });
    
    try {
      await dataManager.completeTranslationTask(tokensUsed);
    } catch (error) {
      console.error('保存完成状态失败:', error);
    }
  }, []);

  // 加载保存的数据
  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        // 从内存中加载配置
        const savedConfig = dataManager.getConfig();
        if (savedConfig) {
          dispatch({ type: 'SET_CONFIG', payload: savedConfig });
        }
        
        // 从内存中加载当前翻译任务信息
        const currentTask = dataManager.getCurrentTask();
        if (currentTask) {
          // 设置任务ID
          if (currentTask.taskId) {
            dispatch({ type: 'SET_TASK_ID', payload: currentTask.taskId });
          }
          
          // 加载翻译进度信息
          if (currentTask.translation_progress) {
            const progress = currentTask.translation_progress;
            const isTranslating = progress.status === 'translating';
            
            dispatch({ type: 'SET_TRANSLATING', payload: isTranslating });
            // 确保正确设置Token值，即使为0也要设置
            const tokensToSet = progress.tokens ?? 0;
            dispatch({ type: 'SET_TOKENS_USED', payload: tokensToSet });
            
            // 构建进度对象
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

  // 监听任务创建事件，同步状态
  React.useEffect(() => {
    const handleTaskCreated = (event: CustomEvent) => {
      const { taskId } = event.detail;
      
      // 更新任务ID
      dispatch({ type: 'SET_TASK_ID', payload: taskId });
      
      // 初始化新任务的翻译状态
      dispatch({ type: 'SET_TRANSLATING', payload: false });
      dispatch({ type: 'SET_ABORT_CONTROLLER', payload: null });
      
      // 初始化进度信息
      const initialProgress = {
        current: 0,
        total: 0,
        phase: 'direct' as const,
        status: '准备中...',
        taskId: taskId
      };
      dispatch({ type: 'SET_PROGRESS', payload: initialProgress });
      
      // ✅ 注意：不重置Token数据，因为重新上传时已经被taskCleared事件清空了
      
      // 重新加载保存的数据以保持同步
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
      // 完全重置所有状态（包括Token）
      dispatch({ type: 'RESET_PROGRESS' });
      dispatch({ type: 'SET_TASK_ID', payload: '' });
      dispatch({ type: 'SET_TRANSLATING', payload: false });
      dispatch({ type: 'SET_TOKENS_USED', payload: 0 });
    };

    // 添加事件监听器
    window.addEventListener('taskCreated', handleTaskCreated as EventListener);
    window.addEventListener('taskCleared', handleTaskCleared as EventListener);

    // 清理函数
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