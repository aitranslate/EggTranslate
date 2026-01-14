import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { ParakeetModel, getParakeetModel } from 'parakeet.js';
import { TranscriptionConfig, ModelStatus } from '@/types';
import dataManager from '@/services/dataManager';
import toast from 'react-hot-toast';
import { TRANSCRIPTION_PROGRESS_CONSTANTS, AUDIO_CONSTANTS } from '@/constants/transcription';

interface TranscriptionContextValue {
  // 配置
  config: TranscriptionConfig;
  updateConfig: (config: Partial<TranscriptionConfig>) => Promise<void>;

  // 模型状态
  modelStatus: ModelStatus;
  modelProgress?: {
    percent: number;
    filename?: string;
    loaded: number;
    total: number;
    remainingTime?: number;
  };

  // 缓存信息
  cacheInfo: Array<{
    filename: string;
    size: number;
    date: number;
  }>;
  refreshCacheInfo: () => Promise<void>;
  clearCache: () => Promise<void>;

  // 操作
  loadModel: () => Promise<void>;
  getModel: () => ParakeetModel | null;
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(null);

// IndexedDB 常量
const PARAKEET_CACHE_DB = 'parakeet-cache-db';
const PARAKEET_CACHE_STORE = 'file-store';

// 默认配置
const DEFAULT_CONFIG: TranscriptionConfig = {
  repoId: 'istupakov/parakeet-tdt-0.6b-v2-onnx',
  backend: 'webgpu-hybrid',
  encoderQuant: 'fp32',  // webgpu-hybrid 要求 encoder 必须是 fp32
  decoderQuant: 'int8',
};

/**
 * 清理 parakeet 缓存文件名
 * 移除前缀: hf-{repoId}-{revision}--{subfolder}-
 * @example
 * cleanCacheFilename('hf-istupakov/parakeet-tdt-0.6b-v2-onnx/main--decoder_model.int8.onnx')
 * // => 'decoder_model.int8.onnx'
 */
function cleanCacheFilename(key: string): string {
  return key
    .replace(/^hf-[^/]+\//, '')   // 移除 "hf-istupakov/"
    .replace(/^[^/]+\//, '')        // 移除 "parakeet-tdt-0.6b-v2-onnx/"
    .replace(/^main--/, '')          // 移除 "main--"
    .replace(/^[^-]+--/, '');        // 移除任何其他 {revision}--
}

/**
 * 读取 IndexedDB 缓存信息
 */
async function readCacheInfo(): Promise<Array<{ filename: string; size: number; date: number }>> {
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // 不指定版本号，打开当前存在的版本
      const request = indexedDB.open(PARAKEET_CACHE_DB);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }) as IDBDatabase;

    // 检查 object store 是否存在
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
        return new Promise<{ filename: string; size: number; date: number }>((resolve, reject) => {
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
    console.warn('[Transcription] Failed to read cache info:', error);
    return [];
  }
}

export const TranscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<TranscriptionConfig>(DEFAULT_CONFIG);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('not_loaded');
  const [modelProgress, setModelProgress] = useState<{
    percent: number;
    filename?: string;
    loaded: number;
    total: number;
    remainingTime?: number;
  }>();
  const [cacheInfo, setCacheInfo] = useState<Array<{
    filename: string;
    size: number;
    date: number;
  }>>([]);

  // 模型实例引用（使用 ref 避免触发重渲染）
  const modelRef = useRef<ParakeetModel | null>(null);

  // 进度计算辅助变量
  const progressStartTime = useRef<number>(0);

  // 读取 IndexedDB 缓存信息
  const refreshCacheInfo = useCallback(async () => {
    const cacheEntries = await readCacheInfo();
    setCacheInfo(cacheEntries);
  }, []);

  // 清空 IndexedDB 缓存
  const clearCache = useCallback(async () => {
    try {
      // 删除整个数据库
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(PARAKEET_CACHE_DB);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => {
          console.warn('[Transcription] Delete database blocked, trying again...');
          // 如果被阻塞，稍后重试
          setTimeout(() => {
            const retryRequest = indexedDB.deleteDatabase(PARAKEET_CACHE_DB);
            retryRequest.onsuccess = () => resolve();
            retryRequest.onerror = () => reject(retryRequest.error);
          }, 100);
        };
      });

      // 清空状态
      setCacheInfo([]);
      toast.success('缓存已清空');
    } catch (error) {
      console.error('[Transcription] Failed to clear cache:', error);
      toast.error('清空缓存失败');
      throw error;
    }
  }, []);

  // 从本地存储加载配置
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedConfig = await dataManager.getTranscriptionConfig();
        if (savedConfig) {
          setConfig(savedConfig);
        }
      } catch (error) {
        console.error('加载转录配置失败:', error);
      }
    };
    loadConfig();
  }, []);

  // 初始化时加载缓存信息
  useEffect(() => {
    refreshCacheInfo();
  }, [refreshCacheInfo]);

  const updateConfig = useCallback(async (newConfig: Partial<TranscriptionConfig>) => {
    let updated = { ...config, ...newConfig };

    // 智能调整：根据 backend 自动调整量化设置
    if (newConfig.backend) {
      if (newConfig.backend.startsWith('webgpu')) {
        // webgpu-hybrid: encoder 必须是 fp32，decoder 可选 int8/fp32
        if (!newConfig.encoderQuant && !newConfig.decoderQuant) {
          // 用户只改了 backend，自动调整两个量化设置
          updated.encoderQuant = 'fp32';
          updated.decoderQuant = 'int8';
        } else if (!newConfig.encoderQuant) {
          // 用户只改了 backend 和 decoder，自动调整 encoder
          updated.encoderQuant = 'fp32';
        }
        // 如果用户同时指定了 encoderQuant='int8'，不覆盖（允许手动修改）
      } else {
        // wasm: 两个都用 int8 速度优先
        if (!newConfig.encoderQuant && !newConfig.decoderQuant) {
          updated.encoderQuant = 'int8';
          updated.decoderQuant = 'int8';
        }
      }
    }

    setConfig(updated);
    await dataManager.saveTranscriptionConfig(updated);
  }, [config]);

  // 清理函数：释放模型资源
  const disposeModel = useCallback(() => {
    if (modelRef.current) {
      try {
        if (typeof (modelRef.current as any).dispose === 'function') {
          (modelRef.current as any).dispose();
        }
      } catch (e) {
        console.warn('[Transcription] 释放模型资源时出错:', e);
      }
      modelRef.current = null;
    }
  }, []);

  const loadModel = useCallback(async () => {
    // 如果已有模型，先释放
    disposeModel();

    setModelStatus('loading');
    setModelProgress({ percent: 0, loaded: 0, total: 0 });
    progressStartTime.current = Date.now();

    try {
      // 进度回调
      const progressCallback = ({ loaded, total, file }: { loaded: number; total: number; file: string }) => {
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;

        // 计算剩余时间
        const elapsed = Date.now() - progressStartTime.current;
        const remainingTime = loaded > 0 ? ((total - loaded) / loaded) * (elapsed / 1000) : undefined;

        setModelProgress({
          percent: Math.min(percent, TRANSCRIPTION_PROGRESS_CONSTANTS.DOWNLOAD_CAP),
          filename: file,
          loaded,
          total,
          remainingTime,
        });
      };

      // 使用 parakeet.js 自带的下载功能
      const modelUrls = await getParakeetModel(config.repoId, {
        encoderQuant: config.encoderQuant,
        decoderQuant: config.decoderQuant,
        preprocessor: 'nemo128',
        progress: progressCallback,
      });

      // 创建编译会话
      setModelProgress(prev => prev ? { ...prev, percent: 95, filename: '编译模型...', loaded: 0, total: 0 } : { percent: 95, filename: '编译模型...', loaded: 0, total: 0 });

      const maxCores = navigator.hardwareConcurrency || 8;
      const cpuThreads = Math.max(1, maxCores - 2);

      modelRef.current = await ParakeetModel.fromUrls({
        ...modelUrls.urls,
        filenames: modelUrls.filenames,
        backend: config.backend,
        verbose: false,
        cpuThreads,
      });

      // 验证模型
      setModelProgress(prev => prev ? { ...prev, percent: 98, filename: '预热验证...', loaded: 0, total: 0 } : { percent: 98, filename: '预热验证...', loaded: 0, total: 0 });

      const warmupPcm = new Float32Array(AUDIO_CONSTANTS.SAMPLE_RATE);
      await modelRef.current.transcribe(warmupPcm, AUDIO_CONSTANTS.SAMPLE_RATE);

      setModelStatus('loaded');
      setModelProgress(undefined);
      refreshCacheInfo(); // 刷新缓存信息
      toast.success('转录模型加载成功！');
    } catch (error) {
      console.error('[Transcription] Failed to load model:', error);
      setModelStatus('error');
      setModelProgress(undefined);

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      toast.error(`模型加载失败: ${errorMessage}`);
    }
  }, [config, refreshCacheInfo, disposeModel]);

  const getModel = useCallback(() => {
    return modelRef.current;
  }, []);

  // 组件卸载时释放模型资源，防止内存泄漏
  useEffect(() => {
    return () => {
      disposeModel();
    };
  }, [disposeModel]);

  // 使用 useMemo 优化 Context value，避免不必要的重渲染
  const value: TranscriptionContextValue = useMemo(() => ({
    config,
    updateConfig,
    modelStatus,
    modelProgress,
    cacheInfo,
    refreshCacheInfo,
    clearCache,
    loadModel,
    getModel,
  }), [
    config,
    updateConfig,
    modelStatus,
    modelProgress,
    cacheInfo,
    refreshCacheInfo,
    clearCache,
    loadModel,
    getModel,
  ]);

  return (
    <TranscriptionContext.Provider value={value}>
      {children}
    </TranscriptionContext.Provider>
  );
};

export const useTranscription = () => {
  const context = useContext(TranscriptionContext);
  if (!context) {
    throw new Error('useTranscription must be used within a TranscriptionProvider');
  }
  return context;
};
