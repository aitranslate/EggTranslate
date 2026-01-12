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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white/10 backdrop-blur-md rounded-xl p-6 w-full max-w-md"
      >
        <div className="flex items-start space-x-4">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-orange-500/20 border border-orange-500/30 rounded-full flex items-center justify-center">
              <AlertCircle className="h-6 w-6 text-orange-300" />
            </div>
          </div>

          <div className="flex-1">
            <h3 className="text-xl font-semibold text-white mb-2">
              需要先加载转录模型
            </h3>

            <div className="space-y-3 text-white/80">
              <p>请先在「设置 → 转录设置」中加载转录模型</p>

              <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-sm">
                <p>首次加载需要下载约 520 MB</p>
                <p className="mt-1 text-white/60">模型将缓存在浏览器中，下次无需重新下载</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={onCancel}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={onGoToSettings}
                className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 border border-orange-500/30 rounded-lg transition-colors"
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
