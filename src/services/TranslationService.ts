import { TranslationConfig } from '@/types';
import { jsonrepair } from 'jsonrepair';
import dataManager from '@/services/dataManager';
import { generateSharedPrompt, generateDirectPrompt, generateReflectionPrompt } from '@/utils/translationPrompts';
import { callLLM } from '@/utils/llmApi';

/**
 * 翻译服务 - 纯业务逻辑层
 *
 * 职责：
 * - 翻译逻辑（直译 + 反思翻译）
 * - 进度管理
 * - 任务控制
 * - 连接测试
 * - 配置管理
 */
class TranslationService {
  private config: TranslationConfig;

  constructor() {
    this.config = {
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
  }

  /**
   * 初始化服务（加载保存的配置）
   */
  async initialize(): Promise<void> {
    try {
      const savedConfig = dataManager.getConfig();
      if (savedConfig) {
        this.config = savedConfig;
      }
    } catch (error) {
      console.error('加载翻译配置失败:', error);
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): TranslationConfig {
    return this.config;
  }

  /**
   * 更新配置并保存
   */
  async updateConfig(newConfig: Partial<TranslationConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    try {
      await dataManager.saveConfig(this.config);
    } catch (error) {
      console.error('保存翻译配置失败:', error);
      throw error;
    }
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<boolean> {
    if (!this.config.apiKey) {
      throw new Error('请先配置API密钥');
    }

    try {
      await callLLM(
        {
          baseURL: this.config.baseURL,
          apiKey: this.config.apiKey,
          model: this.config.model
        },
        [{ role: 'user', content: 'Hello' }],
        { maxRetries: 1 }
      );
      return true;
    } catch (error) {
      console.error('连接测试失败:', error);
      throw error;
    }
  }

  /**
   * 批量翻译字幕
   */
  async translateBatch(
    texts: string[],
    signal?: AbortSignal,
    contextBefore = '',
    contextAfter = '',
    terms = ''
  ): Promise<{ translations: Record<string, any>; tokensUsed: number }> {
    if (!this.config.apiKey) {
      throw new Error('请先配置API密钥');
    }

    const textToTranslate = texts.join('\n');
    const sharedPrompt = generateSharedPrompt(contextBefore, contextAfter, terms);
    const directPrompt = generateDirectPrompt(
      textToTranslate,
      sharedPrompt,
      this.config.sourceLanguage,
      this.config.targetLanguage
    );

    // 第一步：直译
    const { content: directContent, tokensUsed: directTokensUsed } = await callLLM(
      {
        baseURL: this.config.baseURL,
        apiKey: this.config.apiKey,
        model: this.config.model,
        rpm: this.config.rpm
      },
      [{ role: 'user', content: directPrompt }],
      { signal, temperature: 0.3, maxRetries: 5 }
    );

    const repairedDirectJson = jsonrepair(directContent);
    const directResult = JSON.parse(repairedDirectJson);
    let totalTokensUsed = directTokensUsed;

    // 第二步：反思翻译（如果启用）
    if (this.config.enableReflection) {
      try {
        const reflectionPrompt = generateReflectionPrompt(
          directResult,
          textToTranslate,
          sharedPrompt,
          this.config.sourceLanguage,
          this.config.targetLanguage
        );

        const { content: reflectionContent, tokensUsed: reflectionTokensUsed } = await callLLM(
          {
            baseURL: this.config.baseURL,
            apiKey: this.config.apiKey,
            model: this.config.model,
            rpm: this.config.rpm
          },
          [{ role: 'user', content: reflectionPrompt }],
          { signal, temperature: 0.3, maxRetries: 1 }
        );

        totalTokensUsed += reflectionTokensUsed;

        const repairedReflectionJson = jsonrepair(reflectionContent);
        const reflectionResult = JSON.parse(repairedReflectionJson);

        // 转换为直译格式
        const formattedResult: Record<string, any> = {};
        Object.keys(reflectionResult).forEach(key => {
          formattedResult[key] = {
            origin: reflectionResult[key].origin,
            direct: reflectionResult[key].free || reflectionResult[key].direct
          };
        });

        return {
          translations: formattedResult,
          tokensUsed: totalTokensUsed
        };
      } catch (error) {
        console.error('反思翻译失败，使用直译结果:', error);
        return {
          translations: directResult,
          tokensUsed: totalTokensUsed
        };
      }
    }

    // 未启用反思翻译，返回直译结果
    return {
      translations: directResult,
      tokensUsed: totalTokensUsed
    };
  }

  /**
   * 更新翻译进度
   */
  async updateProgress(
    current: number,
    total: number,
    phase: 'direct' | 'completed',
    status: string,
    taskId?: string,
    newTokens?: number
  ): Promise<void> {
    try {
      if (taskId) {
        const updateObj: Parameters<typeof dataManager.updateTaskTranslationProgressInMemory>[1] = {
          completed: current,
          total: total,
          status: phase === 'completed' ? 'completed' : 'translating',
        };

        if (newTokens !== undefined) {
          updateObj.tokens = newTokens;
        }

        dataManager.updateTaskTranslationProgressInMemory(taskId, updateObj);
      }
    } catch (error) {
      console.error('更新翻译进度失败:', error);
      throw error;
    }
  }

  /**
   * 重置翻译进度
   */
  async resetProgress(): Promise<void> {
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
      throw error;
    }
  }

  /**
   * 完成翻译任务
   */
  async completeTranslation(taskId: string): Promise<void> {
    try {
      const task = dataManager.getTaskById(taskId);
      if (task) {
        const taskTokens = task.translation_progress?.tokens || 0;

        // 先在内存中更新
        dataManager.updateTaskTranslationProgressInMemory(taskId, {
          status: 'completed',
          tokens: taskTokens
        });

        // 延迟持久化
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
      throw error;
    }
  }

  /**
   * 清空当前任务
   */
  async clearTask(): Promise<void> {
    try {
      await dataManager.clearCurrentTask();
    } catch (error) {
      console.error('清空任务失败:', error);
      throw error;
    }
  }
}

// 创建单例实例
const translationService = new TranslationService();

export default translationService;
