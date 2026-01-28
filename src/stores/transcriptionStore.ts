/**
 * 转录配置 Store
 * 替代原 TranscriptionContext，使用 Zustand 管理转录配置和模型状态
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ParakeetModel, getParakeetModel } from 'parakeet.js';
import { TranscriptionConfig, ModelStatus } from '@/types';
import dataManager from '@/services/dataManager';
import { loadModelFromCache } from '@/utils/loadModelFromCache';
import toast from 'react-hot-toast';
import { toAppError } from '@/utils/errors';
import { AUDIO_CONSTANTS, WEBGPU_CONSTANTS } from '@/constants/transcription';

// ============================================
// 类型定义
// ============================================

interface CacheInfo {
  filename: string;
  size: number;
  date: number;
}

interface TranscriptionStore {
  // State
  config: TranscriptionConfig;
  modelStatus: ModelStatus;
  modelProgress?: {
    percent: number;
    filename?: string;
  };
  isDownloading: boolean;
  downloadProgress?: {
    percent: number;
    filename?: string;
    loaded: number;
    total: number;
    remainingTime?: number;
  };
  cacheInfo: CacheInfo[];

  // Refs (非持久化)
  model: ParakeetModel | null;

  // Actions
  updateConfig: (updates: Partial<TranscriptionConfig>) => Promise<void>;
  downloadModel: () => Promise<void>;
  loadModel: () => Promise<void>;
  getModel: () => ParakeetModel | null;
  refreshCacheInfo: () => Promise<void>;
  clearCache: () => Promise<void>;
}

// ============================================
// IndexedDB 常量
// ============================================

const PARAKEET_CACHE_DB = 'parakeet-cache-db';
const PARAKEET_CACHE_STORE = 'file-store';

// ============================================
// 默认配置
// ============================================

const DEFAULT_CONFIG: TranscriptionConfig = {
  repoId: 'istupakov/parakeet-tdt-0.6b-v2-onnx',
  backend: 'wasm',
  encoderQuant: 'int8',
  decoderQuant: 'int8',
};

// ============================================
// 辅助函数
// ============================================

/**
 * 清理 parakeet 缓存文件名
 */
function cleanCacheFilename(key: string): string {
  return key
    .replace(/^hf-[^/]+\//, '')
    .replace(/^[^/]+\//, '')
    .replace(/^main--/, '')
    .replace(/^[^-]+--/, '');
}

/**
 * 检查数据库是否存在
 */
async function databaseExists(dbName: string): Promise<boolean> {
  try {
    const databases = await indexedDB.databases();
    return databases?.some(db => db.name === dbName) ?? false;
  } catch {
    return false;
  }
}

/**
 * 读取 IndexedDB 缓存信息
 */
async function readCacheInfo(): Promise<CacheInfo[]> {
  try {
    const exists = await databaseExists(PARAKEET_CACHE_DB);
    if (!exists) return [];

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(PARAKEET_CACHE_DB);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }) as IDBDatabase;

    if (!db.objectStoreNames.contains(PARAKEET_CACHE_STORE)) {
      db.close();
      return [];
    }

    const transaction = db.transaction([PARAKEET_CACHE_STORE], 'readonly');
    const store = transaction.objectStore(PARAKEET_CACHE_STORE);
    const request = store.getAllKeys();

    const keys = await new Promise<string[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });

    const cacheEntries = await Promise.all(
      keys.map(async (key) => {
        const getReq = store.get(key);
        return new Promise<CacheInfo>((resolve, reject) => {
          getReq.onsuccess = () => {
            const blob = getReq.result as Blob;
            resolve({
              filename: cleanCacheFilename(key),
              size: blob?.size || 0,
              date: Date.now(),
            });
          };
          getReq.onerror = () => reject(getReq.error);
        });
      })
    );

    db.close();
    return cacheEntries;
  } catch (error) {
    return [];
  }
}

// ============================================
// Store 创建
// ============================================

export const useTranscriptionStore = create<TranscriptionStore>()(
  persist(
    (set, get) => ({
      // Initial State
      config: DEFAULT_CONFIG,
      modelStatus: 'not_loaded',
      isDownloading: false,
      cacheInfo: [],

      // Refs
      model: null,

      // ========================================
      // Actions
      // ========================================

      /**
       * 更新配置
       */
      updateConfig: async (updates: Partial<TranscriptionConfig>) => {
        let updated = { ...get().config, ...updates };

        // 智能调整量化设置
        if (updates.backend) {
          if (updates.backend.startsWith('webgpu')) {
            if (!updates.encoderQuant && !updates.decoderQuant) {
              updated.encoderQuant = 'fp32';
              updated.decoderQuant = 'int8';
            } else if (!updates.encoderQuant) {
              updated.encoderQuant = 'fp32';
            }
          } else {
            if (!updates.encoderQuant && !updates.decoderQuant) {
              updated.encoderQuant = 'int8';
              updated.decoderQuant = 'int8';
            }
          }
        }

        set({ config: updated });
        await dataManager.saveTranscriptionConfig(updated);
      },

      /**
       * 下载模型
       */
      downloadModel: async () => {
        set({
          isDownloading: true,
          downloadProgress: { percent: 0, loaded: 0, total: 0 }
        });

        const progressStartTime = Date.now();

        try {
          const { config } = get();

          const progressCallback = ({ loaded, total, file }: { loaded: number; total: number; file: string }) => {
            const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
            const elapsed = Date.now() - progressStartTime;
            const remainingTime = loaded > 0 ? ((total - loaded) / loaded) * (elapsed / 1000) : undefined;

            set({
              downloadProgress: {
                percent,
                filename: file,
                loaded,
                total,
                remainingTime,
              }
            });
          };

          await getParakeetModel(config.repoId, {
            backend: config.backend,
            encoderQuant: config.encoderQuant,
            decoderQuant: config.decoderQuant,
            preprocessor: 'nemo128',
            progress: progressCallback,
          });

          set({
            isDownloading: false,
            downloadProgress: undefined
          });

          await get().refreshCacheInfo();
          toast.success('模型下载完成！点击"加载模型"按钮使用');
        } catch (error) {
          const appError = toAppError(error, '下载模型失败');
          console.error('[transcriptionStore]', appError.message, appError);
          toast.error(`下载模型失败: ${appError.message}`);

          set({
            isDownloading: false,
            downloadProgress: undefined
          });
        }
      },

      /**
       * 加载模型
       */
      loadModel: async () => {
        const { model, config } = get();

        // 释放旧模型
        if (model) {
          try {
            (model as any).cleanup?.();
          } catch (e) {
            // 忽略清理错误
          }
        }

        set({ modelStatus: 'loading', modelProgress: { percent: 0, filename: '准备加载...' } });

        try {
          const { model: newModel, cleanup } = await loadModelFromCache(config, (progress) => {
            set({ modelProgress: progress });
          });

          // 验证模型
          set({ modelProgress: { percent: 80, filename: '预热验证...' } });
          const warmupPcm = new Float32Array(AUDIO_CONSTANTS.SAMPLE_RATE);
          await newModel.transcribe(warmupPcm, AUDIO_CONSTANTS.SAMPLE_RATE);

          set({
            model: newModel,
            modelStatus: 'loaded',
            modelProgress: undefined
          });

          // 保存 cleanup 函数到 model 对象上
          (newModel as any).cleanup = cleanup;

          toast.success('转录模型加载成功！');
        } catch (error) {
          const appError = toAppError(error, '加载模型失败');
          console.error('[transcriptionStore]', appError.message, appError);
          toast.error(`加载模型失败: ${appError.message}`);

          set({
            modelStatus: 'error',
            modelProgress: undefined,
            model: null
          });
        }
      },

      /**
       * 获取模型实例
       */
      getModel: () => {
        return get().model;
      },

      /**
       * 刷新缓存信息
       */
      refreshCacheInfo: async () => {
        const cacheEntries = await readCacheInfo();
        set({ cacheInfo: cacheEntries });
      },

      /**
       * 清空缓存
       */
      clearCache: async () => {
        try {
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.deleteDatabase(PARAKEET_CACHE_DB);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            request.onblocked = () => {
              setTimeout(() => {
                const retryRequest = indexedDB.deleteDatabase(PARAKEET_CACHE_DB);
                retryRequest.onsuccess = () => resolve();
                retryRequest.onerror = () => reject(retryRequest.error);
              }, 100);
            };
          });

          set({ cacheInfo: [] });
          toast.success('缓存已清空');
        } catch (error) {
          const appError = toAppError(error, '清空缓存失败');
          console.error('[transcriptionStore]', appError.message, appError);
          toast.error(`清空缓存失败: ${appError.message}`);
          throw error;
        }
      }
    }),
    {
      name: 'transcription-config-storage',
      partialize: (state) => ({
        config: state.config
      })
    }
  )
);

// ============================================
// 初始化：加载配置和缓存信息
// ============================================

if (typeof window !== 'undefined') {
  (async () => {
    try {
      // 加载保存的配置
      const savedConfig = await dataManager.getTranscriptionConfig();
      if (savedConfig) {
        useTranscriptionStore.setState({ config: savedConfig });
      }

      // 加载缓存信息
      const cacheInfo = await readCacheInfo();
      useTranscriptionStore.setState({ cacheInfo });
    } catch (error) {
      console.error('[transcriptionStore] 初始化失败:', error);
    }
  })();
}

// ============================================
// 导出辅助 hooks
// ============================================

/**
 * 获取转录配置
 */
export const useTranscriptionConfig = () => useTranscriptionStore((state) => state.config);

/**
 * 获取模型状态
 */
export const useModelStatus = () => useTranscriptionStore((state) => state.modelStatus);

/**
 * 获取下载状态
 */
export const useIsDownloading = () => useTranscriptionStore((state) => state.isDownloading);

/**
 * 获取缓存信息
 */
export const useCacheInfo = () => useTranscriptionStore((state) => state.cacheInfo);
