// src/components/GuideModal.tsx
import React from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { guideSections } from '@/data/guideContent';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative max-w-2xl w-full max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="apple-heading-medium">使用指南</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="关闭"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="overflow-y-auto p-6 md:p-8 max-h-[calc(90vh-88px)]">
          <div className="space-y-8">
            {guideSections.map((section, index) => (
              <section key={section.id} className={`pb-6 ${index < guideSections.length - 1 ? 'border-b border-gray-200' : ''}`}>
                <h3 className="apple-heading-small mb-3">{section.title}</h3>
                <div className="text-gray-700 leading-relaxed whitespace-pre-line">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
