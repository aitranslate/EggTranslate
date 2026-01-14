import localforage from 'localforage';
import { TranslationConfig } from '@/types';

/**
 * 配置管理器 - 负责翻译配置的 CRUD 操作
 */
class ConfigManager {
  private memoryStore: {
    translation_config: TranslationConfig;
  };

  private readonly CONFIG_KEY = 'translation_config';

  private readonly DEFAULT_CONFIG: TranslationConfig = {
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

  constructor(memoryStore: { translation_config: TranslationConfig }) {
    this.memoryStore = memoryStore;
  }

  /**
   * 获取默认配置
   */
  getDefaultConfig(): TranslationConfig {
    return { ...this.DEFAULT_CONFIG };
  }

  /**
   * 获取翻译配置
   */
  getConfig(): TranslationConfig {
    return this.memoryStore.translation_config;
  }

  /**
   * 保存翻译配置并持久化
   */
  async saveConfig(config: TranslationConfig): Promise<void> {
    try {
      // 更新内存中的数据
      this.memoryStore.translation_config = config;

      // 持久化到 localforage
      await localforage.setItem(this.CONFIG_KEY, config);
    } catch (error) {
      console.error('保存翻译配置失败:', error);
      throw error;
    }
  }

  /**
   * 更新翻译配置并持久化
   */
  async updateConfig(updates: Partial<TranslationConfig>): Promise<TranslationConfig> {
    try {
      // 更新内存中的数据
      const updatedConfig = { ...this.memoryStore.translation_config, ...updates };
      this.memoryStore.translation_config = updatedConfig;

      // 持久化到 localforage
      await localforage.setItem(this.CONFIG_KEY, updatedConfig);

      return updatedConfig;
    } catch (error) {
      console.error('更新翻译配置失败:', error);
      throw error;
    }
  }
}

export default ConfigManager;
