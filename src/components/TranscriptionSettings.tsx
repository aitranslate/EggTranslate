import React, { useState } from 'react';
import { Download, RefreshCw, CheckCircle, Circle, Database, Trash2, HelpCircle } from 'lucide-react';
import { TranscriptionConfig, ModelStatus } from '@/types';
import toast from 'react-hot-toast';

interface TranscriptionSettingsProps {
  config: TranscriptionConfig;
  onConfigChange: (config: Partial<TranscriptionConfig>) => void;
  modelStatus: ModelStatus;
  modelProgress?: {
    percent: number;
    filename?: string;
  };
  isDownloading: boolean;
  downloadProgress?: {
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
  onClearCache: () => Promise<void>;
  onDownloadModel: () => void;
  onLoadModel: () => void;
}

export const TranscriptionSettings: React.FC<TranscriptionSettingsProps> = ({
  config,
  onConfigChange,
  modelStatus,
  modelProgress,
  isDownloading,
  downloadProgress,
  cacheInfo,
  onRefreshCacheInfo,
  onClearCache,
  onDownloadModel,
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

  // 带动画的加载模型处理
  const handleLoadWithAnimation = () => {
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

  // 检测 WebGPU 支持
  const checkWebGPUSupport = async () => {
    toast.loading('正在检测 WebGPU 支持...', { id: 'webgpu-check' });

    try {
      if (!('gpu' in navigator)) {
        toast.dismiss('webgpu-check');
        toast.error('浏览器不支持 WebGPU API', { id: 'webgpu-check' });
        return;
      }

      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) {
        toast.dismiss('webgpu-check');
        toast.error('未找到可用的 GPU 适配器', { id: 'webgpu-check' });
        return;
      }

      // 进一步验证：尝试获取设备
      const device = await adapter.requestDevice();
      device.destroy();

      toast.dismiss('webgpu-check');
      toast.success('当前浏览器支持 WebGPU', { id: 'webgpu-check' });
    } catch (err) {
      toast.dismiss('webgpu-check');
      toast.error(`检测失败: ${(err as Error).message}`, { id: 'webgpu-check' });
    }
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
            <div className="flex gap-4 items-center">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="backend"
                  checked={config.backend === 'wasm'}
                  onChange={() => onConfigChange({ backend: 'wasm' })}
                  className="w-4 h-4 text-purple-500 bg-white/10 border-white/30 focus:ring-purple-500 focus:ring-2"
                />
                <span className="text-white/80">WASM CPU (推荐)</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="backend"
                  checked={config.backend === 'webgpu-hybrid'}
                  onChange={() => onConfigChange({ backend: 'webgpu-hybrid' })}
                  className="w-4 h-4 text-purple-500 bg-white/10 border-white/30 focus:ring-purple-500 focus:ring-2"
                />
                <span className="text-white/80">WebGPU (需浏览器支持)</span>
              </label>
              <button
                onClick={checkWebGPUSupport}
                className="ml-2 p-1.5 text-white/50 hover:text-white/80 transition-colors"
                title="检测当前浏览器是否支持 WebGPU"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
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
                <option value="int8" className="bg-gray-800" disabled={config.backend.startsWith('webgpu')}>int8 (更快，仅 WASM)</option>
                <option value="fp32" className="bg-gray-800">fp32 (更高精度，WebGPU 必需)</option>
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

        {/* 下载进度 */}
        {isDownloading && downloadProgress ? (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/80">📥 正在下载... {downloadProgress.percent}%</span>
              <span className="text-sm text-white/60">
                {formatTime(downloadProgress.remainingTime)}
              </span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-cyan-500 h-full transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            {downloadProgress.filename && (
              <p className="text-sm text-white/60">
                {downloadProgress.total > 0
                  ? `正在下载: ${downloadProgress.filename} (${(downloadProgress.loaded / 1024 / 1024).toFixed(0)}/${(downloadProgress.total / 1024 / 1024).toFixed(0)} MB)`
                  : downloadProgress.filename
                }
              </p>
            )}
          </div>
        ) : null}

        {/* 加载进度 */}
        {modelStatus === 'loading' && modelProgress ? (
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-white/80">⚙️ 正在加载... {modelProgress.percent}%</span>
            </div>
            <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-full transition-all duration-300"
                style={{ width: `${modelProgress.percent}%` }}
              />
            </div>
            <p className="text-sm text-white/60">
              {modelProgress.filename}
            </p>
          </div>
        ) : null}

        {/* 已加载状态 */}
        {modelStatus === 'loaded' && !isDownloading ? (
          <div className="space-y-3">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-green-200">已加载到内存</span>
              </div>
            </div>

            {/* 两个按钮 */}
            <div className="flex gap-3">
              <button
                onClick={onDownloadModel}
                title="需要代理，从 HuggingFace 下载"
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>重新下载</span>
              </button>
              <button
                onClick={handleLoadWithAnimation}
                className={`flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors ${isAnimating ? 'animate-pulse' : ''}`}
              >
                <RefreshCw className={`h-4 w-4 ${isAnimating ? 'animate-spin' : ''}`} />
                <span>重新加载</span>
              </button>
            </div>
          </div>
        ) : (modelStatus === 'not_loaded' || modelStatus === 'error') && !isDownloading ? (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Circle className="h-5 w-5 text-white/40" />
              <span className="text-white/60">● 未加载</span>
            </div>

            {/* 两个按钮 */}
            <div className="flex gap-3">
              <button
                onClick={onDownloadModel}
                title="需要代理，从 HuggingFace 下载"
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>{cacheInfo.length > 0 ? '重新下载' : '下载模型'}</span>
              </button>
              <button
                onClick={handleLoadWithAnimation}
                disabled={cacheInfo.length === 0}
                className="flex-1 flex items-center justify-center space-x-2 px-4 py-3 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 ${isAnimating ? 'animate-spin' : ''}`} />
                <span>加载模型</span>
              </button>
            </div>

            {cacheInfo.length === 0 && (
              <p className="text-sm text-white/60 text-center">
                首次使用请先点击"下载模型"（约 2.3 GB）
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* 缓存信息 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/20 pb-2">
          <h3 className="text-lg font-semibold text-white flex-1">
            缓存信息
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={onRefreshCacheInfo}
              className="text-xs text-white/50 hover:text-white/70 transition-colors flex items-center space-x-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>刷新</span>
            </button>
            <button
              onClick={onClearCache}
              className="text-xs text-white/50 hover:text-red-400 transition-colors flex items-center space-x-1"
            >
              <Trash2 className="h-3 w-3" />
              <span>清空</span>
            </button>
          </div>
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
