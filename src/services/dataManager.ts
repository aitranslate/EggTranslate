import localforage from 'localforage';
import { 
  TranslationConfig, 
  SubtitleEntry, 
  Term, 
  TranslationHistoryEntry, 
  CurrentTranslationTask,
  SingleTask,
  BatchTasks
} from '@/types';

/**
 * 数据管理器 - 内存数据存储与异步持久化
 * 
 * 设计原则：
 * 1. 所有数据操作优先在内存中进行，提高性能
 * 2. 在特定时机异步同步到 localforage 进行持久化
 * 3. 持久化时机：
 *    - batch_tasks：导入文件时
 *    - terms_list：术语列表改动时
 *    - translation_config：保存设置时
 *    - translation_history：添加历史记录时
 */
class DataManager {
  // 内存中的数据存储
  private memoryStore: {
    batch_tasks: BatchTasks;
    terms_list: Term[];
    translation_config: TranslationConfig;
    translation_history: TranslationHistoryEntry[];
    current_translation_task?: CurrentTranslationTask;
  };

  // localStorage key 常量
  private readonly KEYS = {
    BATCH_TASKS: 'batch_tasks',
    TERMS: 'terms_list', 
    CONFIG: 'translation_config',
    HISTORY: 'translation_history'
  } as const;

  // 默认配置
  private readonly DEFAULT_CONFIG: TranslationConfig = {
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

  constructor() {
    // 初始化内存存储
    this.memoryStore = {
      batch_tasks: { tasks: [] },
      terms_list: [],
      translation_config: this.DEFAULT_CONFIG,
      translation_history: [],
      current_translation_task: undefined
    };
  }

  /**
   * 初始化数据管理器
   * 从 localforage 加载数据到内存中
   */
  async initialize(): Promise<void> {
    try {
      // 并行加载所有数据
      const [batchTasks, terms, config, history] = await Promise.all([
        localforage.getItem<BatchTasks>(this.KEYS.BATCH_TASKS),
        localforage.getItem<Term[]>(this.KEYS.TERMS),
        localforage.getItem<TranslationConfig>(this.KEYS.CONFIG),
        localforage.getItem<TranslationHistoryEntry[]>(this.KEYS.HISTORY)
      ]);

      // 更新内存存储
      this.memoryStore.batch_tasks = batchTasks || { tasks: [] };
      this.memoryStore.terms_list = terms || [];
      this.memoryStore.translation_config = config || this.DEFAULT_CONFIG;
      this.memoryStore.translation_history = history || [];
    } catch (error) {
      console.error('数据管理器初始化失败:', error);
      throw error;
    }
  }

  // ===== 当前翻译任务模块 =====

  /**
   * 获取当前翻译任务（从内存中）
   */
  getCurrentTask(): CurrentTranslationTask | null {
    return this.memoryStore.current_translation_task || null;
  }

  /**
   * 清空当前翻译任务
   */
  async clearCurrentTask(): Promise<void> {
    try {
      this.memoryStore.current_translation_task = undefined;
    } catch (error) {
      console.error('清空当前翻译任务失败:', error);
      throw error;
    }
  }

  /**
   * 创建新的翻译任务并添加到批处理任务列表中
   */
  async createNewTask(filename: string, entries: SubtitleEntry[], index: number): Promise<string> {
    try {
      const taskId = this.generateTaskId();
      const newTask: SingleTask = {
        taskId,
        subtitle_entries: entries,
        subtitle_filename: filename,
        translation_progress: {
          completed: 0,
          total: entries.length,
          tokens: 0,
          status: 'idle'
        },
        index
      };
      
      // 更新内存中的数据
      this.memoryStore.batch_tasks.tasks.push(newTask);
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.BATCH_TASKS, this.memoryStore.batch_tasks);
      
      return taskId;
    } catch (error) {
      console.error('创建翻译任务失败:', error);
      throw error;
    }
  }

  /**
   * 获取批处理任务列表（从内存中）
   */
  getBatchTasks(): BatchTasks {
    return this.memoryStore.batch_tasks;
  }

  /**
   * 根据任务ID获取单个任务
   */
  getTaskById(taskId: string): SingleTask | undefined {
    return this.memoryStore.batch_tasks.tasks.find(task => task.taskId === taskId);
  }

  /**
   * 更新指定任务的字幕条目（包含持久化）
   */
  async updateTaskSubtitleEntry(taskId: string, entryId: number, text: string, translatedText?: string): Promise<void> {
    try {
      const task = this.memoryStore.batch_tasks.tasks.find(t => t.taskId === taskId);
      if (!task) return;
      
      // 更新内存中的数据
      const updatedEntries = task.subtitle_entries.map(entry =>
        entry.id === entryId
          ? { ...entry, text, translatedText: translatedText ?? entry.translatedText }
          : entry
      );
      
      // 重新计算完成数量（字幕条目数）
      const completed = updatedEntries.filter(entry => entry.translatedText && entry.translatedText.trim() !== '').length;
      
      // 更新内存中的任务数据
      const updatedTask = {
        ...task,
        subtitle_entries: updatedEntries,
        translation_progress: {
          ...task.translation_progress,
          completed,
          total: task.translation_progress.total || updatedEntries.length
        }
      };
      
      // 替换任务列表中的任务
      const taskIndex = this.memoryStore.batch_tasks.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        this.memoryStore.batch_tasks.tasks[taskIndex] = updatedTask;
      }
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.BATCH_TASKS, this.memoryStore.batch_tasks);
    } catch (error) {
      console.error('更新字幕条目失败:', error);
      throw error;
    }
  }
  
  /**
   * 更新指定任务的字幕条目（仅在内存中更新，不持久化）
   */
  updateTaskSubtitleEntryInMemory(taskId: string, entryId: number, text: string, translatedText?: string): void {
    try {
      const task = this.memoryStore.batch_tasks.tasks.find(t => t.taskId === taskId);
      if (!task) return;
      
      // 更新内存中的数据
      const updatedEntries = task.subtitle_entries.map(entry =>
        entry.id === entryId
          ? { ...entry, text, translatedText: translatedText ?? entry.translatedText }
          : entry
      );
      
      // 重新计算完成数量（字幕条目数）
      const completed = updatedEntries.filter(entry => entry.translatedText && entry.translatedText.trim() !== '').length;
      
      // 更新内存中的任务数据
      const updatedTask = {
        ...task,
        subtitle_entries: updatedEntries,
        translation_progress: {
          ...task.translation_progress,
          completed,
          total: task.translation_progress.total || updatedEntries.length
        }
      };
      
      // 替换任务列表中的任务
      const taskIndex = this.memoryStore.batch_tasks.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        this.memoryStore.batch_tasks.tasks[taskIndex] = updatedTask;
      }
    } catch (error) {
      console.error('更新内存中的字幕条目失败:', error);
    }
  }

  /**
   * 批量更新指定任务的字幕条目
   */
  async batchUpdateTaskSubtitleEntries(taskId: string, updates: {id: number, text: string, translatedText?: string}[]): Promise<void> {
    try {
      const task = this.memoryStore.batch_tasks.tasks.find(t => t.taskId === taskId);
      if (!task) return;
      
      // 一次性处理所有更新
      const updatedEntries = task.subtitle_entries.map(entry => {
        const update = updates.find(u => u.id === entry.id);
        return update ? {
          ...entry,
          text: update.text,
          translatedText: update.translatedText ?? entry.translatedText
        } : entry;
      });
      
      // 重新计算完成数量（字幕条目数）
      const completed = updatedEntries.filter(entry => entry.translatedText && entry.translatedText.trim() !== '').length;
      
      // 更新内存中的任务数据
      const updatedTask = {
        ...task,
        subtitle_entries: updatedEntries,
        translation_progress: {
          ...task.translation_progress,
          completed,
          total: task.translation_progress.total || updatedEntries.length
        }
      };
      
      // 替换任务列表中的任务
      const taskIndex = this.memoryStore.batch_tasks.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        this.memoryStore.batch_tasks.tasks[taskIndex] = updatedTask;
      }
    } catch (error) {
      console.error('批量更新字幕条目失败:', error);
      throw error;
    }
  }

  /**
   * 更新指定任务的翻译进度（包含持久化）
   */
  async updateTaskTranslationProgress(
    taskId: string,
    updates: Partial<SingleTask['translation_progress']>
  ): Promise<void> {
    try {
      const task = this.memoryStore.batch_tasks.tasks.find(t => t.taskId === taskId);
      if (!task) return;
      
      // 更新内存中的任务数据
      const updatedTask = {
        ...task,
        translation_progress: {
          ...task.translation_progress,
          ...updates
        }
      };
      
      // 替换任务列表中的任务
      const taskIndex = this.memoryStore.batch_tasks.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        this.memoryStore.batch_tasks.tasks[taskIndex] = updatedTask;
      }
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.BATCH_TASKS, this.memoryStore.batch_tasks);
    } catch (error) {
      console.error('更新翻译进度失败:', error);
      throw error;
    }
  }
  
  /**
   * 更新指定任务的翻译进度（仅在内存中更新，不持久化）
   */
  updateTaskTranslationProgressInMemory(
    taskId: string,
    updates: Partial<SingleTask['translation_progress']>
  ): void {
    try {
      const task = this.memoryStore.batch_tasks.tasks.find(t => t.taskId === taskId);
      if (!task) return;
      
      // 更新内存中的任务数据
      const updatedTask = {
        ...task,
        translation_progress: {
          ...task.translation_progress,
          ...updates
        }
      };
      
      // 替换任务列表中的任务
      const taskIndex = this.memoryStore.batch_tasks.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        this.memoryStore.batch_tasks.tasks[taskIndex] = updatedTask;
      }
    } catch (error) {
      console.error('更新内存中的翻译进度失败:', error);
    }
  }

  /**
   * 完成指定任务并持久化
   */
  async completeTask(taskId: string, finalTokens: number): Promise<void> {
    try {
      const task = this.memoryStore.batch_tasks.tasks.find(t => t.taskId === taskId);
      if (!task) return;
      
      // 获取实际完成的字幕数量
      let completedCount = 0;
      if (task.subtitle_entries && Array.isArray(task.subtitle_entries)) {
        completedCount = task.subtitle_entries.filter((entry: any) => 
          entry.translatedText && entry.translatedText.trim() !== ''
        ).length;
      }
      
      // 确保使用较大的Token值和正确的完成数量
      const oldTokens = task.translation_progress?.tokens || 0;
      const tokensToSave = Math.max(finalTokens, oldTokens);
      const totalEntries = task.translation_progress?.total || 0;
      
      // 更新内存中的任务数据
      const updatedTask = {
        ...task,
        translation_progress: {
          ...task.translation_progress,
          completed: completedCount,
          total: totalEntries,
          tokens: tokensToSave,
          status: 'completed' as const
        }
      };
      
      // 替换任务列表中的任务
      const taskIndex = this.memoryStore.batch_tasks.tasks.findIndex(t => t.taskId === taskId);
      if (taskIndex !== -1) {
        this.memoryStore.batch_tasks.tasks[taskIndex] = updatedTask;
      }
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.BATCH_TASKS, this.memoryStore.batch_tasks);
    } catch (error) {
      console.error('完成翻译任务失败:', error);
      throw error;
    }
  }

  /**
   * 清空所有批处理任务
   */
  async clearBatchTasks(): Promise<void> {
    try {
      // 清空内存中的数据
      this.memoryStore.batch_tasks = { tasks: [] };
      
      // 清空持久化存储
      await localforage.setItem(this.KEYS.BATCH_TASKS, { tasks: [] });
    } catch (error) {
      console.error('清空批处理任务失败:', error);
      throw error;
    }
  }

  /**
   * 移除指定任务
   */
  async removeTask(taskId: string): Promise<void> {
    try {
      // 更新内存中的数据
      this.memoryStore.batch_tasks.tasks = this.memoryStore.batch_tasks.tasks.filter(t => t.taskId !== taskId);
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.BATCH_TASKS, this.memoryStore.batch_tasks);
    } catch (error) {
      console.error('移除任务失败:', error);
      throw error;
    }
  }

  // ===== 术语管理模块 =====
  
  /**
   * 获取术语列表（从内存中）
   */
  getTerms(): Term[] {
    return this.memoryStore.terms_list;
  }

  /**
   * 保存术语列表并持久化
   * 这是持久化 terms_list 的主要时机
   */
  async saveTerms(terms: Term[]): Promise<void> {
    try {
      // 更新内存中的数据
      this.memoryStore.terms_list = terms;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.TERMS, terms);
    } catch (error) {
      console.error('保存术语列表失败:', error);
      throw error;
    }
  }

  /**
   * 添加术语并持久化
   */
  async addTerm(term: Term): Promise<void> {
    try {
      // 更新内存中的数据
      const updatedTerms = [...this.memoryStore.terms_list, term];
      this.memoryStore.terms_list = updatedTerms;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.TERMS, updatedTerms);
    } catch (error) {
      console.error('添加术语失败:', error);
      throw error;
    }
  }

  /**
   * 删除术语并持久化
   */
  async removeTerm(index: number): Promise<void> {
    try {
      // 更新内存中的数据
      const updatedTerms = this.memoryStore.terms_list.filter((_, i) => i !== index);
      this.memoryStore.terms_list = updatedTerms;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.TERMS, updatedTerms);
    } catch (error) {
      console.error('删除术语失败:', error);
      throw error;
    }
  }

  /**
   * 更新术语并持久化
   */
  async updateTerm(index: number, original: string, translation: string): Promise<void> {
    try {
      const updatedTerm = { original, translation };
      
      // 更新内存中的数据
      const updatedTerms = [...this.memoryStore.terms_list];
      updatedTerms[index] = updatedTerm;
      this.memoryStore.terms_list = updatedTerms;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.TERMS, updatedTerms);
    } catch (error) {
      console.error('更新术语失败:', error);
      throw error;
    }
  }

  /**
   * 清空术语列表并持久化
   */
  async clearTerms(): Promise<void> {
    try {
      // 清空内存中的数据
      this.memoryStore.terms_list = [];
      
      // 清空持久化存储
      await localforage.removeItem(this.KEYS.TERMS);
    } catch (error) {
      console.error('清空术语列表失败:', error);
      throw error;
    }
  }

  // ===== 配置管理模块 =====
  
  /**
   * 获取翻译配置（从内存中）
   */
  getConfig(): TranslationConfig {
    return this.memoryStore.translation_config;
  }

  /**
   * 保存翻译配置并持久化
   * 这是持久化 translation_config 的主要时机
   */
  async saveConfig(config: TranslationConfig): Promise<void> {
    try {
      // 更新内存中的数据
      this.memoryStore.translation_config = config;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.CONFIG, config);
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
      await localforage.setItem(this.KEYS.CONFIG, updatedConfig);
      
      return updatedConfig;
    } catch (error) {
      console.error('更新翻译配置失败:', error);
      throw error;
    }
  }

  // ===== 历史记录模块 =====
  
  /**
   * 获取翻译历史（从内存中）
   */
  getHistory(): TranslationHistoryEntry[] {
    return this.memoryStore.translation_history;
  }

  /**
   * 保存翻译历史并持久化
   */
  async saveHistory(history: TranslationHistoryEntry[]): Promise<void> {
    try {
      // 更新内存中的数据
      this.memoryStore.translation_history = history;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.HISTORY, history);
    } catch (error) {
      console.error('保存翻译历史失败:', error);
      throw error;
    }
  }

  /**
   * 添加历史记录并持久化
   */
  async addHistoryEntry(entry: Omit<TranslationHistoryEntry, 'timestamp'>): Promise<void> {
    try {
      // 检查是否已存在相同taskId的记录
      const existingIndex = this.memoryStore.translation_history.findIndex(h => h.taskId === entry.taskId);
      
      const newEntry: TranslationHistoryEntry = {
        ...entry,
        timestamp: Date.now()
      };
      
      let updatedHistory: TranslationHistoryEntry[];
      
      if (existingIndex >= 0) {
        // 更新现有记录
        updatedHistory = [...this.memoryStore.translation_history];
        updatedHistory[existingIndex] = newEntry;
      } else {
        // 添加新记录
        updatedHistory = [newEntry, ...this.memoryStore.translation_history];
      }
      
      // 更新内存中的数据
      this.memoryStore.translation_history = updatedHistory;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.HISTORY, updatedHistory);
    } catch (error) {
      console.error('添加历史记录失败:', error);
      throw error;
    }
  }

  /**
   * 删除历史记录并持久化
   */
  async deleteHistoryEntry(taskId: string): Promise<void> {
    try {
      // 更新内存中的数据
      const updatedHistory = this.memoryStore.translation_history.filter(entry => entry.taskId !== taskId);
      this.memoryStore.translation_history = updatedHistory;
      
      // 持久化到 localforage
      await localforage.setItem(this.KEYS.HISTORY, updatedHistory);
    } catch (error) {
      console.error('删除历史记录失败:', error);
      throw error;
    }
  }

  /**
   * 清空历史记录并持久化
   */
  async clearHistory(): Promise<void> {
    try {
      // 清空内存中的数据
      this.memoryStore.translation_history = [];
      
      // 清空持久化存储
      await localforage.removeItem(this.KEYS.HISTORY);
    } catch (error) {
      console.error('清空翻译历史失败:', error);
      throw error;
    }
  }

  // ===== 全局操作 =====
  
  /**
   * 清空所有数据
   */
  async clearAllData(): Promise<void> {
    try {
      // 只清空批处理任务的内存数据和持久化
      this.memoryStore.batch_tasks = { tasks: [] };
      
      // 只清空批处理任务的持久化存储
      await localforage.setItem(this.KEYS.BATCH_TASKS, { tasks: [] });
    } catch (error) {
      console.error('清空数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据统计信息
   */
  getDataStats(): {
    hasBatchTasks: boolean;
    termsCount: number;
    historyCount: number;
    isConfigured: boolean;
  } {
    return {
      hasBatchTasks: this.memoryStore.batch_tasks.tasks.length > 0,
      termsCount: this.memoryStore.terms_list.length,
      historyCount: this.memoryStore.translation_history.length,
      isConfigured: (this.memoryStore.translation_config.apiKey?.length || 0) > 0
    };
  }

  /**
   * 强制持久化所有数据
   * 用于特殊情况下的数据保存，如页面关闭前
   */
  async forcePersistAllData(): Promise<void> {
    try {
      await Promise.all([
        localforage.setItem(this.KEYS.BATCH_TASKS, this.memoryStore.batch_tasks),
        localforage.setItem(this.KEYS.TERMS, this.memoryStore.terms_list),
        localforage.setItem(this.KEYS.CONFIG, this.memoryStore.translation_config),
        localforage.setItem(this.KEYS.HISTORY, this.memoryStore.translation_history)
      ]);
    } catch (error) {
      console.error('强制持久化数据失败:', error);
      throw error;
    }
  }

  // ===== 工具方法 =====
  
  /**
   * 生成任务ID
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// 创建单例实例
const dataManager = new DataManager();

export default dataManager;