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
      className="fixed bottom-6 right-6 z-40 w-14 h-14 md:w-16 md:h-16 bg-blue-500 rounded-full shadow-lg hover:bg-blue-600 hover:scale-105 hover:shadow-xl transition-all duration-300 flex items-center justify-center"
    >
      <BookOpen className="w-6 h-6 text-white" />
    </button>
  );
};

export default React.memo(HelpButton);
