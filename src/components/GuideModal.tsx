// src/components/GuideModal.tsx
import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { guideSections, GuideSection } from '@/data/guideContent';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState<string>(guideSections[0].id);
  const sectionRefs = useRef<Record<string, HTMLElement>>({});

  // 注册章节引用
  const registerRef = (id: string) => (ref: HTMLElement | null) => {
    if (ref) sectionRefs.current[id] = ref;
  };

  // 点击目录滚动到对应章节
  const scrollToSection = (id: string) => {
    const element = sectionRefs.current[id];
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveSection(id);
    }
  };

  // 监听滚动，自动高亮目录
  useEffect(() => {
    if (!isOpen) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.id;
            setActiveSection(id);
          }
        });
      },
      { threshold: 0.5, rootMargin: '-80px 0px -80px 0px' }
    );

    Object.values(sectionRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative max-w-5xl w-full max-h-[90vh] bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-xl border border-white/20 shadow-2xl flex overflow-hidden"
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-white/20 rounded-lg transition-colors z-10"
          aria-label="关闭"
        >
          <X className="h-5 w-5 text-white/80" />
        </button>

        {/* 左侧目录 */}
        <div className="w-60 bg-white/5 border-r border-white/10 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-xl font-bold text-white mb-4">使用指南</h2>
            <nav className="space-y-1">
              {guideSections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${
                    activeSection === section.id
                      ? 'text-purple-400 bg-purple-500/10 border-l-2 border-purple-400'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {section.title}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl">
            {guideSections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={registerRef(section.id)}
                className="mb-12 scroll-mt-8"
              >
                <h2 className="text-2xl font-bold text-white mb-4">{section.title}</h2>
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
