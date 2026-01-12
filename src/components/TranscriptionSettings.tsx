import React, { useState } from 'react';
import { Download, RefreshCw, CheckCircle, Circle, Database } from 'lucide-react';
import { TranscriptionConfig, ModelStatus } from '@/types';

interface TranscriptionSettingsProps {
  config: TranscriptionConfig;
  onConfigChange: (config: Partial<TranscriptionConfig>) => void;
  modelStatus: ModelStatus;
  modelProgress?: {
    percent: number;
    filename?: string;
    loaded: number;
    total: number;
    remainingTime?: number;
  };
  cacheInfo: Array<{
    filename: string;
    size: number;
    date: number;
  }>;
  onRefreshCacheInfo: () => Promise<void>;
  onLoadModel: () => void;
}

export const TranscriptionSettings: React.FC<TranscriptionSettingsProps> = ({
  config,
  onConfigChange,
  modelStatus,
  modelProgress,
  cacheInfo,
  onRefreshCacheInfo,
  onLoadModel
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  // 格式化文件大小
  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleLoadModel = () => {
    setIsAnimating(true);
    onLoadModel();
    setTimeout(() => setIsAnimating(false), 1000);
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    if (seconds < 60) return `约 ${Math.round(seconds)} 秒`;
    const minutes = Math.floor(seconds / 60);
    return `约 ${minutes} 分钟`;
  };

  return (
    <div className="space-y-6">
      {/* 模型选择 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
          模型选择
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              模型
            </label>
            <select
              value={config.repoId}
              onChange={(e) => onConfigChange({ repoId: e.target.value })}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
            >
              <option value="istupakov/parakeet-tdt-0.6b-v2-onnx" className="bg-gray-800">parakeet-tdt-0.6b-v2-onnx（支持英语）</option>
              <option value="istupakov/parakeet-tdt-0.6b-v3-onnx" className="bg-gray-800">parakeet-tdt-0.6b-v3-onnx（支持25种欧洲语言）</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              计算后端
            </label>
            <div className="flex gap-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="backend"
                  checked={config.backend === 'webgpu-hybrid'}
                  onChange={() => onConfigChange({ backend: 'webgpu-hybrid' })}
                  className="w-4 h-4 text-purple-500 bg-white/10 border-white/30 focus:ring-purple-500 focus:ring-2"
                />
                <span className="text-white/80">WebGPU (推荐，GPU加速)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="backend"
                  checked={config.backend === 'wasm'}
                  onChange={() => onConfigChange({ backend: 'wasm' })}
                  className="w-4 h-4 text-purple-500 bg-white/10 border-white/30 focus:ring-purple-500 focus:ring-2"
                />
                <span className="text-white/80">WASM CPU</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                编码器量化
              </label>
              <select
                value={config.encoderQuant}
                onChange={(e) => onConfigChange({ encoderQuant: e.target.value as 'int8' | 'fp32' })}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
              >
                <option value="int8" className="bg-gray-800">int8 (更快)</option>
                <option value="fp32" className="bg-gray-800">fp32 (更高精度)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                解码器量化
              </label>
              <select
                value={config.decoderQuant}
                onChange={(e) => onConfigChange({ decoderQuant: e.target.value as 'int8' | 'fp32' })}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
              >
                <option value="int8" className="bg-gray-800">int8 (更快)</option>
                <option value="fp32" className="bg-gray-800">fp32 (更高精度)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 模型状态 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
          模型状态
        </h3>

        {modelStatus === 'loading' && modelProgress ? (
          <div className="bg-white/10 border border-white/20 rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/80">📥 正在加载... {modelProgress.percent}%</span>
              <span className="text-sm text-white/60">
                {formatTime(modelProgress.remainingTime)}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-full transition-all duration-300"
                style={{ width: `${modelProgress.percent}%` }}
              />
            </div>
            {modelProgress.filename && (
              <p className="text-sm text-white/60">
                {modelProgress.total > 0
                  ? `正在下载: ${modelProgress.filename} (${(modelProgress.loaded / 1024 / 1024).toFixed(0)}/${(modelProgress.total / 1024 / 1024).toFixed(0)} MB)`
                  : modelProgress.filename
                }
              </p>
            )}
          </div>
        ) : modelStatus === 'loaded' ? (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-400" />
              <span className="text-green-200">✅ 已加载</span>
            </div>
            <button
              onClick={handleLoadModel}
              className={`flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg transition-colors ${isAnimating ? 'animate-pulse' : ''}`}
            >
              <RefreshCw className={`h-4 w-4 ${isAnimating ? 'animate-spin' : ''}`} />
              <span>重新加载</span>
            </button>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-4">
            <div className="flex items-center space-x-2">
              <Circle className="h-5 w-5 text-white/40" />
              <span className="text-white/60">● 未加载</span>
            </div>
            <p className="text-sm text-white/60">
              首次加载需要下载约 3.2 GB
            </p>
            <button
              onClick={handleLoadModel}
              className="flex items-center justify-center space-x-2 w-full px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>加载模型</span>
            </button>
          </div>
        )}
      </div>

      {/* 缓存信息 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2 flex-1">
            缓存信息
          </h3>
          <button
            onClick={onRefreshCacheInfo}
            className="text-xs text-white/50 hover:text-white/70 transition-colors flex items-center space-x-1"
          >
            <RefreshCw className="h-3 w-3" />
            <span>刷新</span>
          </button>
        </div>

        {cacheInfo.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
            <Database className="h-8 w-8 text-white/30 mx-auto mb-2" />
            <p className="text-sm text-white/60">暂无缓存</p>
            <p className="text-xs text-white/50 mt-1">首次加载模型后会自动缓存</p>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-white/60 mb-3">
              <span>共 {cacheInfo.length} 个文件</span>
              <span>总计: {formatSize(cacheInfo.reduce((sum, item) => sum + item.size, 0))}</span>
            </div>
            {cacheInfo.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm py-2 px-3 bg-white/5 rounded-lg">
                <div className="flex items-center space-x-2 flex-1 min-w-0">
                  <Database className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <span className="text-white/80 truncate">{item.filename}</span>
                </div>
                <span className="text-white/60 text-xs ml-2">{formatSize(item.size)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
