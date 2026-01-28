import React from 'react';
import { AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface TranscriptionPromptModalProps {
  isOpen: boolean;
  onGoToSettings: () => void;
  onCancel: () => void;
}

export const TranscriptionPromptModal: React.FC<TranscriptionPromptModalProps> = ({
  isOpen,
  onGoToSettings,
  onCancel
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl"
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-orange-600" />
            </div>
          </div>

          <div className="flex-1">
            <h3 className="apple-heading-small mb-2">
              需要先加载转录模型
            </h3>

            <div className="space-y-3 text-gray-700">
              <p>请先在「设置 → 转录设置」中加载转录模型</p>

              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm">
                <p>首次加载需要下载约 2.3 GB</p>
                <p className="mt-1 text-gray-500">模型将缓存在浏览器中，下次无需重新下载</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={onCancel}
                className="apple-button apple-button-ghost"
              >
                取消
              </button>
              <button
                onClick={onGoToSettings}
                className="apple-button"
              >
                前往设置
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
