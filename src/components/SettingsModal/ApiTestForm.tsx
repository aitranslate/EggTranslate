import React, { useState } from 'react';
import { AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { TranslationConfig } from '@/types';

interface ApiTestFormProps {
  config: TranslationConfig;
  onConfigChange: (field: keyof TranslationConfig, value: any) => void;
  testResult: { success: boolean; message: string } | null;
}

export const ApiTestForm: React.FC<ApiTestFormProps> = ({ config, onConfigChange, testResult }) => {
  const [showApiKey, setShowApiKey] = useState(false);

  return (
    <>
      {/* API 密钥输入 */}
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-white/80 mb-2">
          API 密钥 *
        </label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={config.apiKey}
            onChange={(e) => onConfigChange('apiKey', e.target.value)}
            placeholder="sk-..."
            className="w-full p-3 pr-12 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60 hover:text-white/80"
          >
            {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          Base URL
        </label>
        <input
          type="text"
          value={config.baseURL}
          onChange={(e) => onConfigChange('baseURL', e.target.value)}
          className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
        />
      </div>

      {/* 模型 */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-2">
          模型
        </label>
        <input
          type="text"
          value={config.model}
          onChange={(e) => onConfigChange('model', e.target.value)}
          placeholder="例如: gpt-3.5-turbo, gpt-4, claude-3-sonnet"
          className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 transition-colors"
        />
      </div>

      {/* 测试结果 */}
      {testResult && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`md:col-span-2 p-4 rounded-lg border flex items-center space-x-2 ${
            testResult.success
              ? 'bg-green-500/20 border-green-500/30 text-green-200'
              : 'bg-red-500/20 border-red-500/30 text-red-200'
          }`}
        >
          {testResult.success ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <span>{testResult.message}</span>
        </motion.div>
      )}
    </>
  );
};
