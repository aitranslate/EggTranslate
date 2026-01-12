import React, { useState } from 'react';
import { Download, RefreshCw, CheckCircle, Circle } from 'lucide-react';
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
  onLoadModel: () => void;
}

export const TranscriptionSettings: React.FC<TranscriptionSettingsProps> = ({
  config,
  onConfigChange,
  modelStatus,
  modelProgress,
  onLoadModel
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

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
              模型仓库 ID
            </label>
            <input
              type="text"
              value={config.repoId}
              onChange={(e) => onConfigChange({ repoId: e.target.value })}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
            />
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

      {/* LLM 组句设置 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
          LLM 组句设置
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              线程数
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={config.llmMergeThreadCount}
              onChange={(e) => onConfigChange({ llmMergeThreadCount: parseInt(e.target.value) })}
              className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-400 transition-colors"
            />
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
                正在下载: {modelProgress.filename} ({(modelProgress.loaded / 1024 / 1024).toFixed(0)}/{(modelProgress.total / 1024 / 1024).toFixed(0)} MB)
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
              首次加载需要下载约 520 MB
            </p>
            <button
              onClick={handleLoadModel}
              className="flex items-center justify-center space-x-2 w-full px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors"
            >
              <Download className="h-4 w-4" />
              <span>加载转录模型</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
