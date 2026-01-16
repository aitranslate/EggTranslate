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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative max-w-2xl w-full max-h-[90vh] bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-xl border border-white/20 shadow-2xl overflow-hidden"
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors z-10"
          aria-label="关闭"
        >
          <X className="h-5 w-5 text-white/80" />
        </button>

        {/* 内容区域 */}
        <div className="overflow-y-auto p-6 md:p-8 max-h-[90vh]">
          <h2 className="text-2xl font-bold text-white mb-6">使用指南</h2>
          <div className="space-y-8">
            {guideSections.map((section) => (
              <section key={section.id} className="pb-6 border-b border-white/10 last:border-0">
                <h3 className="text-xl font-bold text-white mb-3">{section.title}</h3>
                <div className="text-white/80 leading-relaxed whitespace-pre-line">
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
