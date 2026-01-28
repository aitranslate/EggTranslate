import React from 'react';
import { LANGUAGE_OPTIONS } from '@/constants/languages';

interface LanguageSelectorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  label,
  value,
  onChange,
  className = ''
}) => {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
      >
        {LANGUAGE_OPTIONS.map((lang) => (
          <option key={lang.value} value={lang.value}>
            {lang.label} ({lang.nativeName})
          </option>
        ))}
      </select>
    </div>
  );
};
