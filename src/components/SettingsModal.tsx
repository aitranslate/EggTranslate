import React, { useState, useCallback } from 'react';
import { useTranslationConfigStore, useTranslationConfig } from '@/stores/translationConfigStore';
import { useTranscriptionStore, useTranscriptionConfig, useModelStatus, useIsDownloading, useCacheInfo } from '@/stores/transcriptionStore';
import { TranslationSettings } from './SettingsModal/TranslationSettings';
import { TranscriptionSettings } from './TranscriptionSettings';
import { motion } from 'framer-motion';
import { X, Save, TestTube } from 'lucide-react';
import toast from 'react-hot-toast';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'translation' | 'transcription';

interface TestResult {
  success: boolean;
  message: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  // Translation config
  const config = useTranslationConfig();
  const updateConfig = useTranslationConfigStore((state) => state.updateConfig);

  // Transcription config and state
  const transcriptionConfig = useTranscriptionConfig();
  const updateTranscriptionConfig = useTranscriptionStore((state) => state.updateConfig);
  const modelStatus = useModelStatus();
  const isDownloading = useIsDownloading();
  const cacheInfo = useCacheInfo();

  // Get modelProgress and downloadProgress directly from store
  const modelProgress = useTranscriptionStore((state) => state.modelProgress);
  const downloadProgress = useTranscriptionStore((state) => state.downloadProgress);

  // Get action methods
  const downloadModel = useTranscriptionStore((state) => state.downloadModel);
  const loadModel = useTranscriptionStore((state) => state.loadModel);
  const refreshCacheInfo = useTranscriptionStore((state) => state.refreshCacheInfo);
  const clearCache = useTranscriptionStore((state) => state.clearCache);

  // 测试连接相关状态
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // 使用统一错误处理
  const { handleError } = useErrorHandler();

  const [activeTab, setActiveTab] = useState<TabType>('transcription');
  const [formData, setFormData] = useState(config);

  // 在模态框打开时同步最新的配置
  React.useEffect(() => {
    if (isOpen) {
      setFormData(config);
      setActiveTab('transcription');
      setTestResult(null); // 重置测试结果
    }
  }, [isOpen, config]);

  // 测试 API 连接
  const onTestConnection = useCallback(async () => {
    const currentApiKey = formData.apiKey?.trim();

    if (!currentApiKey || currentApiKey === '') {
      setTestResult({ success: false, message: '请先输入API密钥' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 获取第一个 API Key
      const apiKey = currentApiKey.split('|').map(key => key.trim()).filter(key => key.length > 0)[0];

      const response = await fetch(`${formData.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: formData.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      await response.json();
      setTestResult({ success: true, message: '连接成功！API配置正常' });
    } catch (error) {
      handleError(error, {
        context: { operation: 'API 连接测试' },
        showToast: false
      });
      const message = error instanceof Error ? error.message : '连接失败';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  }, [formData, handleError]);

  const onSave = useCallback(async () => {
    try {
      await updateConfig(formData);
      toast.success('设置已保存');
      onClose();
    } catch (error) {
      handleError(error, {
        context: { operation: '保存翻译设置' }
      });
    }
  }, [formData, updateConfig, onClose, handleError]);

  const onInputChange = useCallback(
    (
      field: keyof typeof config,
      value: import('@/types').TranslationConfig[keyof import('@/types').TranslationConfig]
    ) => {
      setFormData(prev => ({ ...prev, [field]: value }));
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white/10 backdrop-blur-md rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">设置</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* 标签页切换 */}
        <div className="flex space-x-2 mb-6">
          <button
            onClick={() => setActiveTab('transcription')}
            className={`px-6 py-2 rounded-lg transition-colors ${
              activeTab === 'transcription'
                ? 'bg-purple-500/30 text-purple-200 border border-purple-500/30'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            转录设置
          </button>
          <button
            onClick={() => setActiveTab('translation')}
            className={`px-6 py-2 rounded-lg transition-colors ${
              activeTab === 'translation'
                ? 'bg-purple-500/30 text-purple-200 border border-purple-500/30'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
            }`}
          >
            翻译设置
          </button>
        </div>

        <div className="space-y-6">
          {activeTab === 'translation' ? (
            <>
              <TranslationSettings
                config={formData}
                onConfigChange={onInputChange}
                testResult={testResult}
              />

              {/* 操作按钮 */}
              <div className="flex justify-between items-center pt-4 border-t border-white/20">
                {/* 左侧：测试连接按钮 */}
                <button
                  onClick={onTestConnection}
                  disabled={isTesting || !formData.apiKey}
                  className="flex items-center space-x-2 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <TestTube className={`h-4 w-4 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? '测试中...' : '测试连接'}</span>
                </button>

                {/* 右侧：取消和保存按钮 */}
                <div className="flex space-x-3">
                  <button
                    onClick={onClose}
                    className="px-6 py-3 bg-gray-500/20 hover:bg-gray-500/30 text-gray-200 border border-gray-500/30 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={onSave}
                    className="flex items-center space-x-2 px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors"
                  >
                    <Save className="h-4 w-4" />
                    <span>保存设置</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <TranscriptionSettings
              config={transcriptionConfig}
              onConfigChange={updateTranscriptionConfig}
              modelStatus={modelStatus}
              modelProgress={modelProgress}
              isDownloading={isDownloading}
              downloadProgress={downloadProgress}
              cacheInfo={cacheInfo}
              onRefreshCacheInfo={refreshCacheInfo}
              onClearCache={clearCache}
              onDownloadModel={downloadModel}
              onLoadModel={loadModel}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};
