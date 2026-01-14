import React, { useState, useCallback } from 'react';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTranscription } from '@/contexts/TranscriptionContext';
import { TranslationSettings } from './SettingsModal/TranslationSettings';
import { TranscriptionSettings } from './TranscriptionSettings';
import { motion } from 'framer-motion';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'translation' | 'transcription';

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { config, updateConfig } = useTranslation();
  const {
    config: transcriptionConfig,
    updateConfig: updateTranscriptionConfig,
    modelStatus,
    modelProgress,
    cacheInfo,
    refreshCacheInfo,
    clearCache,
    loadModel
  } = useTranscription();

  const [activeTab, setActiveTab] = useState<TabType>('transcription');
  const [formData, setFormData] = useState(config);

  // 在模态框打开时同步最新的配置
  React.useEffect(() => {
    if (isOpen) {
      setFormData(config);
      setActiveTab('transcription');
    }
  }, [isOpen, config]);

  const onSave = useCallback(async () => {
    try {
      await updateConfig(formData);
      toast.success('设置已保存');
      onClose();
    } catch (error) {
      toast.error('保存失败');
    }
  }, [formData, updateConfig, onClose]);

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
              <TranslationSettings config={formData} onConfigChange={onInputChange} />

              {/* 操作按钮 */}
              <div className="flex justify-end space-x-3 pt-4 border-t border-white/20">
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
            </>
          ) : (
            <TranscriptionSettings
              config={transcriptionConfig}
              onConfigChange={updateTranscriptionConfig}
              modelStatus={modelStatus}
              modelProgress={modelProgress}
              cacheInfo={cacheInfo}
              onRefreshCacheInfo={refreshCacheInfo}
              onClearCache={clearCache}
              onLoadModel={loadModel}
            />
          )}
        </div>
      </motion.div>
    </div>
  );
};
