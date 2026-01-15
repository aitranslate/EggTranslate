/**
 * 从 IndexedDB 缓存加载转录模型（纯离线，不访问 HuggingFace）
 */

import { ParakeetModel } from 'parakeet.js';
import type { TranscriptionConfig } from '@/types';

// IndexedDB 常量
const PARAKEET_CACHE_DB = 'parakeet-cache-db';
const PARAKEET_CACHE_STORE = 'file-store';

/**
 * 进度回调类型
 */
export interface LoadModelProgress {
  percent: number;
  filename?: string;
}

/**
 * 从 IndexedDB 缓存加载 Parakeet 模型
 * @param config - 转录配置
 * @param onProgress - 可选的进度回调
 * @returns { model: ParakeetModel, cleanup: () => void } 模型和清理函数
 * @throws 如果缓存文件不存在则抛出错误
 */
export async function loadModelFromCache(
  config: TranscriptionConfig,
  onProgress?: (progress: LoadModelProgress) => void
): Promise<{ model: ParakeetModel; cleanup: () => void }> {
  const { repoId, encoderQuant, decoderQuant, backend } = config;

  // WebGPU 要求 encoder 必须是 fp32
  const encoderQ = backend.startsWith('webgpu') ? 'fp32' : encoderQuant;

  const encoderSuffix = encoderQ === 'int8' ? '.int8.onnx' : '.onnx';
  const decoderSuffix = decoderQuant === 'int8' ? '.int8.onnx' : '.onnx';

  const encoderName = `encoder-model${encoderSuffix}`;
  const decoderName = `decoder_joint-model${decoderSuffix}`;

  // IndexedDB key 格式: hf-{repoId}-main--{filename}
  // 注意：repoId 和 main 之间用 - 连接，不是 /
  const getCacheKey = (filename: string) => `hf-${repoId}-main--${filename}`;

  // 存储所有创建的 blob URLs，用于后续清理
  const blobUrls: string[] = [];

  // 从 IndexedDB 获取文件并创建 blob URL
  const getBlobUrl = async (filename: string): Promise<string> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(PARAKEET_CACHE_DB);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });

    try {
      const transaction = db.transaction([PARAKEET_CACHE_STORE], 'readonly');
      const store = transaction.objectStore(PARAKEET_CACHE_STORE);
      const getRequest = store.get(getCacheKey(filename));

      const blob = await new Promise<Blob>((resolve, reject) => {
        getRequest.onsuccess = () => resolve(getRequest.result as Blob);
        getRequest.onerror = () => reject(getRequest.error);
      });

      if (!blob) {
        throw new Error(`缓存文件不存在: ${filename}`);
      }

      const url = URL.createObjectURL(blob);
      blobUrls.push(url); // 记录 URL，用于后续清理
      return url;
    } finally {
      db.close();
    }
  };

  // 加载必需文件（总共 10%，因为读取缓存很快）
  onProgress?.({ percent: 10, filename: '读取缓存文件...' });
  const encoderUrl = await getBlobUrl(encoderName);
  const decoderUrl = await getBlobUrl(decoderName);
  const tokenizerUrl = await getBlobUrl('vocab.txt');
  const preprocessorUrl = await getBlobUrl('nemo128.onnx');

  // 尝试加载可选的 .data 文件
  let encoderDataUrl: string | null = null;
  let decoderDataUrl: string | null = null;

  try {
    encoderDataUrl = await getBlobUrl(`${encoderName}.data`);
  } catch {
    // .data 文件可选，不存在时忽略
  }

  try {
    decoderDataUrl = await getBlobUrl(`${decoderName}.data`);
  } catch {
    // .data 文件可选，不存在时忽略 (empty catch)
  }

  // 编译模型（10% - 80%，这是最耗时的部分）
  onProgress?.({ percent: 10, filename: '编译模型...' });

  const maxCores = navigator.hardwareConcurrency || 8;
  const cpuThreads = Math.max(1, maxCores - 2);

  const model = await ParakeetModel.fromUrls({
    encoderUrl,
    decoderUrl,
    tokenizerUrl,
    preprocessorUrl,
    encoderDataUrl,
    decoderDataUrl,
    filenames: {
      encoder: encoderName,
      decoder: decoderName,
    },
    backend,
    verbose: false,
    cpuThreads,
  });

  // 清理函数：释放 blob URLs 和模型资源
  const cleanup = () => {
    // 辅助函数：安全释放 ONNX Runtime session
    const safeRelease = (session: any) => {
      try {
        session?.release?.();
      } catch (e) {
        // 忽略释放失败 (empty catch)
      }
    };

    // 1. 释放所有 blob URLs（必须在释放 session 之前）
    blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        // 忽略释放失败 (empty catch)
      }
    });

    // 2. 释放 ONNX Runtime sessions（这些持有 GPU 内存）
    safeRelease(model.encoderSession);
    safeRelease(model.joinerSession);

    // 3. 清理 preprocessor session
    safeRelease((model as any).preprocessor?.session);

    // 4. 清空引用（帮助 GC）
    (model as any).encoderSession = null;
    (model as any).joinerSession = null;
    (model as any).preprocessor = null;
    (model as any)._combState1 = null;
    (model as any)._combState2 = null;
  };

  return { model, cleanup };
}
