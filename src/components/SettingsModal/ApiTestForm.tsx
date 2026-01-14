import React, { useState, useCallback } from 'react';
import { TestTube, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { TranslationConfig } from '@/types';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface ApiTestFormProps {
  config: TranslationConfig;
  onConfigChange: (field: keyof TranslationConfig, value: any) => void;
}

interface TestResult {
  success: boolean;
  message: string;
}

export const ApiTestForm: React.FC<ApiTestFormProps> = ({ config, onConfigChange }) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // 使用统一错误处理（但保留测试结果显示）
  const { handleError } = useErrorHandler();

  // 获取下一个API Key的函数
  const getNextApiKey = useCallback((apiKeyStr: string): string => {
    const apiKeys = apiKeyStr.split('|').map(key => key.trim()).filter(key => key.length > 0);
    if (apiKeys.length === 0) {
      throw new Error('未配置有效的API密钥');
    }
    return apiKeys[0];
  }, []);

  const onTest = useCallback(async () => {
    const currentApiKey = config.apiKey?.trim();

    if (!currentApiKey || currentApiKey === '') {
      setTestResult({ success: false, message: '请先输入API密钥' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const apiKey = getNextApiKey(config.apiKey);

      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      await response.json();
      setTestResult({ success: true, message: '连接成功！API配置正常' });
    } catch (error) {
      // 记录错误到统一错误处理系统
      handleError(error, {
        context: { operation: 'API 连接测试' },
        showToast: false // 不显示 toast，因为我们显示测试结果
      });
      const message = error instanceof Error ? error.message : '连接失败';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  }, [config, getNextApiKey, handleError]);

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

      {/* 测试按钮 */}
      <div className="md:col-span-2">
        <button
          onClick={onTest}
          disabled={isTesting || !config.apiKey}
          className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <TestTube className={`h-4 w-4 ${isTesting ? 'animate-spin' : ''}`} />
          <span>{isTesting ? '测试中...' : '测试连接'}</span>
        </button>
      </div>
    </>
  );
};
