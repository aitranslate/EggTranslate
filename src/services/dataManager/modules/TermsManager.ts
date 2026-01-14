import localforage from 'localforage';
import { Term } from '@/types';
import { toAppError } from '@/utils/errors';

/**
 * 术语管理器 - 负责任务术语列表的 CRUD 操作
 */
class TermsManager {
  private memoryStore: {
    terms_list: Term[];
  };

  private readonly TERMS_KEY = 'terms_list';

  constructor(memoryStore: { terms_list: Term[] }) {
    this.memoryStore = memoryStore;
  }

  /**
   * 获取术语列表
   */
  getTerms(): Term[] {
    return this.memoryStore.terms_list;
  }

  /**
   * 保存术语列表并持久化
   */
  async saveTerms(terms: Term[]): Promise<void> {
    try {
      // 更新内存中的数据
      this.memoryStore.terms_list = terms;

      // 持久化到 localforage
      await localforage.setItem(this.TERMS_KEY, terms);
    } catch (error) {
      const appError = toAppError(error, '保存术语列表失败');
      console.error('[TermsManager]', appError.message, appError);
      throw appError;
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
      await localforage.setItem(this.TERMS_KEY, updatedTerms);
    } catch (error) {
      const appError = toAppError(error, '添加术语失败');
      console.error('[TermsManager]', appError.message, appError);
      throw appError;
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
      await localforage.setItem(this.TERMS_KEY, updatedTerms);
    } catch (error) {
      const appError = toAppError(error, '删除术语失败');
      console.error('[TermsManager]', appError.message, appError);
      throw appError;
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
      await localforage.setItem(this.TERMS_KEY, updatedTerms);
    } catch (error) {
      const appError = toAppError(error, '更新术语失败');
      console.error('[TermsManager]', appError.message, appError);
      throw appError;
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
      await localforage.removeItem(this.TERMS_KEY);
    } catch (error) {
      const appError = toAppError(error, '清空术语列表失败');
      console.error('[TermsManager]', appError.message, appError);
      throw appError;
    }
  }
}

export default TermsManager;
