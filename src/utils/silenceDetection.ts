/**
 * 音频静音检测和智能分片
 * 用于音视频转录中的音频切分
 */

import { SILENCE_DETECTION_CONSTANTS } from '@/constants/transcription';

/**
 * 静音检测配置
 */
export interface SilenceDetectionConfig {
  analysisWindowSize?: number;      // 分析窗口大小（秒），默认 ANALYSIS_WINDOW_SIZE (10ms)
  minSilenceDuration?: number;      // 最小静音持续时间（秒），默认 MIN_SILENCE_DURATION (400ms)
  silenceThresholdRatio?: number;   // 静音阈值比例，默认 SILENCE_THRESHOLD_RATIO (平均RMS的15%)
}

/**
 * 音频分片信息
 */
export interface AudioChunk {
  start: number;    // 起始样本索引
  end: number;      // 结束样本索引
  duration: number; // 时长（秒）
}

/**
 * 静音检测：找到所有可能的静音点
 * @param pcmData - PCM 音频数据
 * @param sampleRate - 采样率
 * @param config - 静音检测配置
 * @returns 静音点的样本索引数组
 */
export const findSilencePoints = (
  pcmData: Float32Array,
  sampleRate: number,
  config: SilenceDetectionConfig = {}
): number[] => {
  const {
    analysisWindowSize = Math.floor(sampleRate * SILENCE_DETECTION_CONSTANTS.ANALYSIS_WINDOW_SIZE),
    minSilenceDuration = SILENCE_DETECTION_CONSTANTS.MIN_SILENCE_DURATION,
    silenceThresholdRatio = SILENCE_DETECTION_CONSTANTS.SILENCE_THRESHOLD_RATIO
  } = config;

  // 计算音频的平均 RMS（均方根）作为基准
  let sumSquares = 0;
  for (let i = 0; i < pcmData.length; i++) {
    sumSquares += pcmData[i] * pcmData[i];
  }
  const avgRms = Math.sqrt(sumSquares / pcmData.length);

  const silenceThreshold = avgRms * silenceThresholdRatio;
  const minSilenceSamples = Math.floor(sampleRate * minSilenceDuration);

  const silencePoints: number[] = [];
  let silenceStart = -1;
  let inSilence = false;

  // 扫描整个音频，找到静音段
  for (let i = 0; i < pcmData.length; i += analysisWindowSize) {
    // 计算当前窗口的 RMS（均方根）
    let sumSquares = 0;
    const windowEnd = Math.min(i + analysisWindowSize, pcmData.length);
    for (let j = i; j < windowEnd; j++) {
      sumSquares += pcmData[j] * pcmData[j];
    }
    const rms = Math.sqrt(sumSquares / (windowEnd - i));

    // 判断是否为静音
    const isSilence = rms < silenceThreshold;

    if (isSilence && !inSilence) {
      // 进入静音区域
      silenceStart = i;
      inSilence = true;
    } else if (!isSilence && inSilence) {
      // 退出静音区域
      if (i - silenceStart >= minSilenceSamples) {
        // 这是一个足够长的静音段，记录其中间位置
        silencePoints.push(Math.floor((silenceStart + i) / 2));
      }
      inSilence = false;
    }
  }

  return silencePoints;
};

/**
 * 分片计划配置
 */
export interface ChunkPlanConfig {
  chunkDuration?: number;   // 目标分片时长（秒），默认 60
  searchWindow?: number;    // 静音点搜索窗口（秒），默认 20
}

/**
 * 基于静音点创建分片计划
 * @param pcmData - PCM 音频数据
 * @param sampleRate - 采样率
 * @param silencePoints - 静音点数组
 * @param config - 分片计划配置
 * @returns 音频分片数组
 */
export const createChunkPlan = (
  pcmData: Float32Array,
  sampleRate: number,
  silencePoints: number[],
  config: ChunkPlanConfig = {}
): AudioChunk[] => {
  const {
    chunkDuration = SILENCE_DETECTION_CONSTANTS.CHUNK_DURATION,
    searchWindow = SILENCE_DETECTION_CONSTANTS.SEARCH_WINDOW
  } = config;

  const chunkSizeSamples = chunkDuration * sampleRate;
  const searchWindowSamples = searchWindow * sampleRate;

  const chunkBoundaries: number[] = [0]; // 分片边界（样本索引）
  let currentPos = 0;

  while (currentPos < pcmData.length) {
    const targetPos = Math.min(currentPos + chunkSizeSamples, pcmData.length);
    let bestSplitPos = targetPos; // 默认在目标位置切分

    if (targetPos < pcmData.length) {
      // 在目标位置附近的静音点中找到最合适的
      const searchStart = targetPos - searchWindowSamples;
      const searchEnd = targetPos + searchWindowSamples;

      // 找到搜索窗口内最接近目标位置的静音点
      let closestSilencePoint: number | null = null;
      let minDistance = Infinity;

      for (const silencePoint of silencePoints) {
        if (silencePoint > searchStart && silencePoint < searchEnd && silencePoint > currentPos) {
          const distance = Math.abs(silencePoint - targetPos);
          if (distance < minDistance) {
            minDistance = distance;
            closestSilencePoint = silencePoint;
          }
        }
      }

      if (closestSilencePoint !== null) {
        bestSplitPos = closestSilencePoint;
      }
    }

    chunkBoundaries.push(bestSplitPos);
    currentPos = bestSplitPos;
  }

  // 生成实际的分片
  const chunks: AudioChunk[] = [];
  for (let i = 0; i < chunkBoundaries.length - 1; i++) {
    const start = chunkBoundaries[i];
    const end = chunkBoundaries[i + 1];
    chunks.push({
      start,
      end,
      duration: (end - start) / sampleRate
    });
  }

  return chunks;
};
