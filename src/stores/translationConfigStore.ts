/**
 * 翻译配置 Store
 * 替代原 TranslationContext，使用 Zustand 管理翻译配置和状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TranslationConfig, TranslationProgress } from '@/types';
import translationService from '@/services/TranslationService';
import toast from 'react-hot-toast';
import { toAppError } from '@/utils/errors';

// ============================================
// 类型定义
// ============================================

interface TranslationConfigStore {
  // State
  config: TranslationConfig;
  isConfigured: boolean;
  isTranslating: boolean;
  progress: TranslationProgress;
  tokensUsed: number;
  currentTaskId: string;

  // Actions
  updateConfig: (updates: Partial<TranslationConfig>) => Promise<void>;
  testConnection: () => Promise<boolean>;
  startTranslation: () => void;
  stopTranslation: () => void;
  resetProgress: () => Promise<void>;
}

// ============================================
// 默认配置
// ============================================

const DEFAULT_CONFIG: TranslationConfig = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  sourceLanguage: 'en',
  targetLanguage: 'zh',
  batchSize: 10,
  threadCount: 4,
  enableReflection: false
};

const DEFAULT_PROGRESS: TranslationProgress = {
  current: 0,
  total: 0,
  phase: 'direct',
  status: '准备中...'
};

// ============================================
// Store 创建
// ============================================

export const useTranslationConfigStore = create<TranslationConfigStore>()(
  persist(
    (set, get) => ({
      // Initial State
      config: DEFAULT_CONFIG,
      isConfigured: false,
      isTranslating: false,
      progress: DEFAULT_PROGRESS,
      tokensUsed: 0,
      currentTaskId: '',

      // ========================================
      // Actions
      // ========================================

      /**
       * 更新配置
       */
      updateConfig: async (updates: Partial<TranslationConfig>) => {
        const newConfig = { ...get().config, ...updates };

        try {
          await translationService.updateConfig(newConfig);

          set({
            config: newConfig,
            isConfigured: (newConfig.apiKey?.length || 0) > 0
          });
        } catch (error) {
          const appError = toAppError(error, '更新配置失败');
          console.error('[translationConfigStore]', appError.message, appError);
          toast.error(`更新配置失败: ${appError.message}`);
          throw error;
        }
      },

      /**
       * 测试连接
       */
      testConnection: async () => {
        try {
          const result = await translationService.testConnection();
          if (result) {
            toast.success('连接测试成功！');
          } else {
            toast.error('连接测试失败');
          }
          return result;
        } catch (error) {
          const appError = toAppError(error, '连接测试失败');
          console.error('[translationConfigStore]', appError.message, appError);
          toast.error(`连接测试失败: ${appError.message}`);
          return false;
        }
      },

      /**
       * 开始翻译
       */
      startTranslation: () => {
        set({
          isTranslating: true,
          progress: { ...DEFAULT_PROGRESS, status: '翻译中...' }
        });
      },

      /**
       * 停止翻译
       */
      stopTranslation: () => {
        set({
          isTranslating: false,
          progress: DEFAULT_PROGRESS
        });
      },

      /**
       * 重置进度
       */
      resetProgress: async () => {
        set({
          isTranslating: false,
          progress: DEFAULT_PROGRESS,
          tokensUsed: 0,
          currentTaskId: ''
        });

        try {
          await translationService.resetProgress();
        } catch (error) {
          const appError = toAppError(error, '重置进度失败');
          console.error('[translationConfigStore]', appError.message, appError);
        }
      }
    }),
    {
      name: 'translation-config-storage',
      partialize: (state) => ({
        config: state.config,
        isConfigured: state.isConfigured
      })
    }
  )
);

// ============================================
// 导出辅助 hooks
// ============================================

/**
 * 获取翻译配置
 */
export const useTranslationConfig = () => useTranslationConfigStore((state) => state.config);

/**
 * 获取是否已配置
 */
export const useIsTranslationConfigured = () => useTranslationConfigStore((state) => state.isConfigured);

/**
 * 获取是否正在翻译
 */
export const useIsTranslating = () => useTranslationConfigStore((state) => state.isTranslating);

/**
 * 获取翻译进度
 */
export const useTranslationProgress = () => useTranslationConfigStore((state) => state.progress);

/**
 * 获取已使用 tokens
 */
export const useTranslationTokensUsed = () => useTranslationConfigStore((state) => state.tokensUsed);
