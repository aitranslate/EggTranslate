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

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

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
        <h3 className="apple-heading-small">模型选择</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              模型
            </label>
            <select
              value={config.repoId}
              onChange={(e) => onConfigChange({ repoId: e.target.value })}
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            >
              <option value="istupakov/parakeet-tdt-0.6b-v2-onnx">parakeet-tdt-0.6b-v2-onnx（支持英语）</option>
              <option value="istupakov/parakeet-tdt-0.6b-v3-onnx">parakeet-tdt-0.6b-v3-onnx（支持25种欧洲语言）</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              计算后端
            </label>
            <div className="flex gap-4 items-center">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="backend"
                  checked={config.backend === 'wasm'}
                  onChange={() => onConfigChange({ backend: 'wasm' })}
                  className="w-4 h-4 text-blue-600 bg-gray-50 border-gray-300 focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-gray-700">WASM CPU (推荐)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="backend"
                  checked={config.backend === 'webgpu-hybrid'}
                  onChange={() => onConfigChange({ backend: 'webgpu-hybrid' })}
                  className="w-4 h-4 text-blue-600 bg-gray-50 border-gray-300 focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-gray-700">WebGPU (需浏览器支持)</span>
              </label>
              <button
                onClick={checkWebGPUSupport}
                className="ml-2 p-1.5 text-gray-400 hover:text-gray-600 transition-colors"
                title="检测当前浏览器是否支持 WebGPU"
              >
                <HelpCircle className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                编码器量化
              </label>
              <select
                value={config.encoderQuant}
                onChange={(e) => onConfigChange({ encoderQuant: e.target.value as 'int8' | 'fp32' })}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="int8" disabled={config.backend.startsWith('webgpu')}>int8 (更快，仅 WASM)</option>
                <option value="fp32">fp32 (更高精度，WebGPU 必需)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                解码器量化
              </label>
              <select
                value={config.decoderQuant}
                onChange={(e) => onConfigChange({ decoderQuant: e.target.value as 'int8' | 'fp32' })}
                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
              >
                <option value="int8">int8 (更快)</option>
                <option value="fp32">fp32 (更高精度)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 模型状态 */}
      <div className="space-y-4">
        <h3 className="apple-heading-small">模型状态</h3>

        {/* 下载进度 */}
        {isDownloading && downloadProgress ? (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-blue-700 font-medium">📥 正在下载... {downloadProgress.percent}%</span>
              <span className="text-sm text-blue-600">
                {formatTime(downloadProgress.remainingTime)}
              </span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            {downloadProgress.filename && (
              <p className="text-sm text-blue-600">
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
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-blue-700 font-medium">⚙️ 正在加载... {modelProgress.percent}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-500 h-full transition-all duration-300"
                style={{ width: `${modelProgress.percent}%` }}
              />
            </div>
            <p className="text-sm text-blue-600">
              {modelProgress.filename}
            </p>
          </div>
        ) : null}

        {/* 已加载状态 */}
        {modelStatus === 'loaded' && !isDownloading ? (
          <div className="space-y-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">已加载到内存</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onDownloadModel}
                title="需要代理，从 HuggingFace 下载"
                className="apple-button apple-button-secondary flex-1"
              >
                <Download className="h-4 w-4" />
                <span>重新下载</span>
              </button>
              <button
                onClick={handleLoadWithAnimation}
                className={`apple-button apple-button-secondary flex-1 ${isAnimating ? 'animate-pulse' : ''}`}
              >
                <RefreshCw className={`h-4 w-4 ${isAnimating ? 'animate-spin' : ''}`} />
                <span>重新加载</span>
              </button>
            </div>
          </div>
        ) : (modelStatus === 'not_loaded' || modelStatus === 'error') && !isDownloading ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Circle className="h-5 w-5 text-gray-400" />
              <span className="text-gray-600">● 未加载</span>
            </div>

            <div className="flex gap-3">
              <button
                onClick={onDownloadModel}
                title="需要代理，从 HuggingFace 下载"
                className="apple-button apple-button-secondary flex-1"
              >
                <Download className="h-4 w-4" />
                <span>{cacheInfo.length > 0 ? '重新下载' : '下载模型'}</span>
              </button>
              <button
                onClick={handleLoadWithAnimation}
                disabled={cacheInfo.length === 0}
                className="apple-button apple-button-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 ${isAnimating ? 'animate-spin' : ''}`} />
                <span>加载模型</span>
              </button>
            </div>

            {cacheInfo.length === 0 && (
              <p className="text-sm text-gray-500 text-center">
                首次使用请先点击"下载模型"（约 2.3 GB）
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* 缓存信息 */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 pb-2">
          <h3 className="apple-heading-small flex-1">
            缓存信息
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefreshCacheInfo}
              className="text-xs text-gray-500 hover:text-gray-700 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              <span>刷新</span>
            </button>
            <button
              onClick={onClearCache}
              className="text-xs text-gray-500 hover:text-red-600 transition-colors flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              <span>清空</span>
            </button>
          </div>
        </div>

        {cacheInfo.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <Database className="h-8 w-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">暂无缓存</p>
            <p className="text-xs text-gray-500 mt-1">首次加载模型后会自动缓存</p>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-600 mb-3">
              <span>共 {cacheInfo.length} 个文件</span>
              <span>总计: {formatSize(cacheInfo.reduce((sum, item) => sum + item.size, 0))}</span>
            </div>
            {cacheInfo.map((item, index) => (
              <div key={index} className="flex items-center justify-between text-sm py-2 px-3 bg-white rounded-lg">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Database className="h-4 w-4 text-blue-500 flex-shrink-0" />
                  <span className="text-gray-700 truncate">{item.filename}</span>
                </div>
                <span className="text-gray-500 text-xs ml-2">{formatSize(item.size)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
