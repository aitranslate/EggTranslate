import React, { useState, useCallback } from 'react';
import { useTranslation } from '@/contexts/TranslationContext';
import { motion } from 'framer-motion';
import { X, TestTube, Save, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { config, updateConfig, testConnection } = useTranslation();
  const [formData, setFormData] = useState(config);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // 在模态框打开时同步最新的配置
  React.useEffect(() => {
    if (isOpen) {
      setFormData(config);
      setTestResult(null);
    }
  }, [isOpen, config]);

  const onSave = useCallback(async () => {
    try {
      await updateConfig(formData);
      toast.success('设置已保存');
      onClose();
    } catch (error) {
      toast.error('保存失败');
    }
  }, [formData, updateConfig, onClose]);

  // 获取下一个API Key的函数（与TranslationContext.tsx中保持一致）
  const getNextApiKey = useCallback((apiKeyStr: string): string => {
    const apiKeys = apiKeyStr.split('|').map(key => key.trim()).filter(key => key.length > 0);
    if (apiKeys.length === 0) {
      throw new Error('未配置有效的API密钥');
    }
    
    // 使用简单的轮询索引（每次测试都使用第一个API Key）
    return apiKeys[0];
  }, []);

  const onTest = useCallback(async () => {
    // 使用当前的 formData 状态
    const currentApiKey = formData.apiKey?.trim();
    
    if (!currentApiKey || currentApiKey === '') {
      setTestResult({ success: false, message: '请先输入API密钥' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      // 使用当前 formData 直接测试连接，无需先保存
      const testConfig = { ...formData };
      
      // 获取下一个API Key（轮询）
      const apiKey = getNextApiKey(testConfig.apiKey);
      
      const response = await fetch(`${testConfig.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: testConfig.model,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }
      
      const data = await response.json();
      setTestResult({ success: true, message: '连接成功！API配置正常' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败';
      setTestResult({ success: false, message });
    } finally {
      setIsTesting(false);
    }
  }, [formData]);

  const onInputChange = useCallback((field: keyof typeof config, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setTestResult(null); // 清空测试结果
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white/10 backdrop-blur-md rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">翻译设置</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="space-y-6">
          {/* API 配置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
API 配置
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-2">
                  API 密钥 *
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={formData.apiKey}
                    onChange={(e) => onInputChange('apiKey', e.target.value)}
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
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Base URL
                </label>
                <input
                  type="text"
                  value={formData.baseURL}
                  onChange={(e) => onInputChange('baseURL', e.target.value)}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  模型
                </label>
                <input
                  type="text"
                  value={formData.model}
                  onChange={(e) => onInputChange('model', e.target.value)}
                  placeholder="例如: gpt-3.5-turbo, gpt-4, claude-3-sonnet"
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* 语言配置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
              语言配置
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  原语言
                </label>
                <select
                  value={formData.sourceLanguage}
                  onChange={(e) => onInputChange('sourceLanguage', e.target.value)}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                >
                  <option value="English" className="bg-gray-800">英语 (English)</option>
                  <option value="简体中文" className="bg-gray-800">中文（简体） (Simplified Chinese)</option>
                  <option value="繁体中文" className="bg-gray-800">中文（繁体） (Traditional Chinese)</option>
                  <option value="Japanese" className="bg-gray-800">日语 (Japanese)</option>
                  <option value="Korean" className="bg-gray-800">韩语 (Korean)</option>
                  <option value="French" className="bg-gray-800">法语 (French)</option>
                  <option value="German" className="bg-gray-800">德语 (German)</option>
                  <option value="Spanish" className="bg-gray-800">西班牙语 (Spanish)</option>
                  <option value="Italian" className="bg-gray-800">意大利语 (Italian)</option>
                  <option value="Portuguese" className="bg-gray-800">葡萄牙语 (Portuguese)</option>
                  <option value="Russian" className="bg-gray-800">俄语 (Russian)</option>
                  <option value="Arabic" className="bg-gray-800">阿拉伯语 (Arabic)</option>
                  <option value="Thai" className="bg-gray-800">泰语 (Thai)</option>
                  <option value="Vietnamese" className="bg-gray-800">越南语 (Vietnamese)</option>
                  <option value="Indonesian" className="bg-gray-800">印尼语 (Indonesian)</option>
                  <option value="Hindi" className="bg-gray-800">印地语 (Hindi)</option>
                  <option value="Dutch" className="bg-gray-800">荷兰语 (Dutch)</option>
                  <option value="Swedish" className="bg-gray-800">瑞典语 (Swedish)</option>
                  <option value="Norwegian" className="bg-gray-800">挪威语 (Norwegian)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  目标语言
                </label>
                <select
                  value={formData.targetLanguage}
                  onChange={(e) => onInputChange('targetLanguage', e.target.value)}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                >
                  <option value="English" className="bg-gray-800">英语 (English)</option>
                  <option value="简体中文" className="bg-gray-800">中文（简体） (Simplified Chinese)</option>
                  <option value="繁体中文" className="bg-gray-800">中文（繁体） (Traditional Chinese)</option>
                  <option value="Japanese" className="bg-gray-800">日语 (Japanese)</option>
                  <option value="Korean" className="bg-gray-800">韩语 (Korean)</option>
                  <option value="French" className="bg-gray-800">法语 (French)</option>
                  <option value="German" className="bg-gray-800">德语 (German)</option>
                  <option value="Spanish" className="bg-gray-800">西班牙语 (Spanish)</option>
                  <option value="Italian" className="bg-gray-800">意大利语 (Italian)</option>
                  <option value="Portuguese" className="bg-gray-800">葡萄牙语 (Portuguese)</option>
                  <option value="Russian" className="bg-gray-800">俄语 (Russian)</option>
                  <option value="Arabic" className="bg-gray-800">阿拉伯语 (Arabic)</option>
                  <option value="Thai" className="bg-gray-800">泰语 (Thai)</option>
                  <option value="Vietnamese" className="bg-gray-800">越南语 (Vietnamese)</option>
                  <option value="Indonesian" className="bg-gray-800">印尼语 (Indonesian)</option>
                  <option value="Hindi" className="bg-gray-800">印地语 (Hindi)</option>
                  <option value="Dutch" className="bg-gray-800">荷兰语 (Dutch)</option>
                  <option value="Swedish" className="bg-gray-800">瑞典语 (Swedish)</option>
                  <option value="Norwegian" className="bg-gray-800">挪威语 (Norwegian)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 翻译参数 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
              翻译参数
            </h3>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  前置上下文
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.contextBefore}
                  onChange={(e) => onInputChange('contextBefore', parseInt(e.target.value))}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  后置上下文
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.contextAfter}
                  onChange={(e) => onInputChange('contextAfter', parseInt(e.target.value))}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  批次大小
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.batchSize}
                  onChange={(e) => onInputChange('batchSize', parseInt(e.target.value))}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  线程数
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formData.threadCount}
                  onChange={(e) => onInputChange('threadCount', parseInt(e.target.value))}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  RPM 限制 (每分钟请求数)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={formData.rpm}
                  onChange={(e) => onInputChange('rpm', parseInt(e.target.value))}
                  className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              
              <div className="flex items-center mt-4">
                <div className="flex items-center">
                  <div className="relative cursor-pointer" onClick={() => onInputChange('enableReflection', !formData.enableReflection)}>
                    <input
                      type="checkbox"
                      checked={formData.enableReflection || false}
                      onChange={(e) => e.stopPropagation()} // 防止事件冒泡
                      className="sr-only"
                    />
                    <div className={`block w-14 h-8 rounded-full transition-colors ${
                      formData.enableReflection ? 'bg-purple-500' : 'bg-white/10'
                    }`}></div>
                    <div className={`absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${
                      formData.enableReflection ? 'transform translate-x-6' : ''
                    }`}></div>
                  </div>
                  <div className="ml-3 text-white/80">
                    反思翻译
                    <p className="text-xs text-white/60 mt-1">
                      提高翻译质量，但会消耗更多tokens
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 测试连接 */}
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-lg border flex items-center space-x-2 ${
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

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row justify-between space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t border-white/20">
            <button
              onClick={onTest}
              disabled={isTesting || !formData.apiKey}
              className="flex items-center justify-center space-x-2 px-6 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TestTube className={`h-4 w-4 ${isTesting ? 'animate-spin' : ''}`} />
              <span>{isTesting ? '测试中...' : '测试连接'}</span>
            </button>
            
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-3 bg-gray-500/20 hover:bg-gray-500/30 text-gray-200 border border-gray-500/30 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={onSave}
                className="flex items-center space-x-2 px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors"
              >
                <Save className="h-4 w-4" />
                <span>保存设置</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};