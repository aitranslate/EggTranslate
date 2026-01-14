import localforage from 'localforage';
import { TranslationHistoryEntry } from '@/types';

/**
 * 历史记录管理器 - 负责翻译历史的 CRUD 操作
 */
class HistoryManager {
  private memoryStore: {
    translation_history: TranslationHistoryEntry[];
  };

  private readonly HISTORY_KEY = 'translation_history';

  constructor(memoryStore: { translation_history: TranslationHistoryEntry[] }) {
    this.memoryStore = memoryStore;
  }

  /**
   * 获取翻译历史
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
      await localforage.setItem(this.HISTORY_KEY, history);
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
      const existingIndex = this.memoryStore.translation_history.findIndex(
        h => h.taskId === entry.taskId
      );

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
      await localforage.setItem(this.HISTORY_KEY, updatedHistory);
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
      const updatedHistory = this.memoryStore.translation_history.filter(
        entry => entry.taskId !== taskId
      );
      this.memoryStore.translation_history = updatedHistory;

      // 持久化到 localforage
      await localforage.setItem(this.HISTORY_KEY, updatedHistory);
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
      await localforage.removeItem(this.HISTORY_KEY);
    } catch (error) {
      console.error('清空翻译历史失败:', error);
      throw error;
    }
  }
}

export default HistoryManager;
