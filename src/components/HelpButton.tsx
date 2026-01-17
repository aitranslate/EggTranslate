// src/components/HelpButton.tsx
import React from 'react';
import { BookOpen } from 'lucide-react';

interface HelpButtonProps {
  onClick: () => void;
}

export const HelpButton: React.FC<HelpButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      aria-label="帮助指南"
      className="fixed bottom-6 right-6 z-40 w-14 h-14 md:w-16 md:h-16 bg-gradient-to-r from-purple-500/50 to-blue-500/50 rounded-full shadow-lg hover:scale-110 hover:shadow-xl hover:from-purple-500/70 hover:to-blue-500/70 transition-all duration-300 flex items-center justify-center"
    >
      <BookOpen className="w-6 h-6 text-white" />
    </button>
  );
};

export default React.memo(HelpButton);
