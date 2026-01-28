import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmButtonClass?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  confirmButtonClass = 'bg-red-500 hover:bg-red-600 text-white'
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              {/* 标题和关闭按钮 */}
              <div className="flex items-center justify-between">
                <h3 className="apple-heading-small">{title}</h3>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="关闭"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* 内容 */}
              <div>
                <p className="text-gray-700">
                  {message}
                </p>
              </div>

              {/* 按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="apple-button apple-button-ghost flex-1"
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`apple-button flex-1 ${confirmButtonClass}`}
                >
                  {confirmText}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
