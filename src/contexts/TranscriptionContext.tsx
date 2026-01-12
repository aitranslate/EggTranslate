import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { TranscriptionConfig, ModelStatus } from '@/types';
import dataManager from '@/services/dataManager';

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

  // 操作
  loadModel: () => Promise<void>;
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(null);

// 默认配置
const DEFAULT_CONFIG: TranscriptionConfig = {
  repoId: 'istupakov/parakeet-tdt-0.6b-v2-onnx',
  backend: 'webgpu-hybrid',
  encoderQuant: 'int8',
  decoderQuant: 'int8',
  llmMergeThreadCount: 4,
};

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

  const updateConfig = useCallback(async (newConfig: Partial<TranscriptionConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    await dataManager.saveTranscriptionConfig(updated);
  }, [config]);

  const loadModel = useCallback(async () => {
    // TODO: 实际加载模型的逻辑
    setModelStatus('loading');
    setModelProgress({ percent: 0, loaded: 0, total: 520 * 1024 * 1024 });

    // 模拟加载进度
    for (let i = 0; i <= 100; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      setModelProgress({
        percent: i,
        filename: i < 50 ? 'encoder_model.int8.onnx' : 'decoder_model.int8.onnx',
        loaded: (520 * 1024 * 1024) * (i / 100),
        total: 520 * 1024 * 1024,
        remainingTime: (100 - i) * 0.5,
      });
    }

    setModelStatus('loaded');
    setModelProgress(undefined);
  }, []);

  const value: TranscriptionContextValue = {
    config,
    updateConfig,
    modelStatus,
    modelProgress,
    loadModel,
  };

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
