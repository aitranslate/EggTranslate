/**
 * 批次处理模块
 * 用于音视频转录中的单词批次切分和 LLM 句子分割
 */

import { TranscriptionWord } from './transcriptionHelpers';
import { hasEndingPunctuation, shouldSkipLLM } from './transcriptionHelpers';
import { TRANSCRIPTION_BATCH_CONSTANTS } from '@/constants/transcription';

/**
 * 批次切分原因
 */
export type SplitReason = 'pause' | 'punctuation' | 'limit';

/**
 * 批次信息
 */
export interface BatchInfo {
  words: TranscriptionWord[];
  startIdx: number;
  skipLLM?: boolean;
  reason: SplitReason;
  pauseGap?: number;
}

/**
 * 批次切分配置
 */
export interface BatchSplitConfig {
  batchSize?: number;       // 批次大小，默认 DEFAULT_BATCH_SIZE
  pauseThreshold?: number;  // 停顿阈值（秒），默认 PAUSE_THRESHOLD
}

/**
 * 句子映射
 */
export interface SentenceMapping {
  sentence: string;
  startIdx: number;
  endIdx: number;
}

/**
 * 基于时间间隔和标点符号的混合切分
 * @param words - 转录单词数组
 * @param config - 切分配置
 * @returns 批次数组
 */
export const createBatches = (
  words: TranscriptionWord[],
  config: BatchSplitConfig = {}
): BatchInfo[] => {
  const {
    batchSize = TRANSCRIPTION_BATCH_CONSTANTS.DEFAULT_BATCH_SIZE,
    pauseThreshold = TRANSCRIPTION_BATCH_CONSTANTS.PAUSE_THRESHOLD
  } = config;

  const batches: BatchInfo[] = [];

  // 按时间排序（确保单词按时间顺序排列）
  const sortedWords = [...words].sort((a, b) => a.start_time - b.start_time);

  let batchIdx = 0;

  while (batchIdx < sortedWords.length) {
    const batchEnd = Math.min(batchIdx + batchSize, sortedWords.length);
    let endPos = batchEnd; // 默认位置
    let pauseGap = 0;
    let pauseFound = false;
    let splitReason: SplitReason = 'limit';

    // 步骤 1: 正向找第一个停顿（在 batchSize 词范围内）
    for (let i = batchIdx; i < batchEnd - 1; i++) {
      const currentWord = sortedWords[i];
      const nextWord = sortedWords[i + 1];
      const timeGap = nextWord.start_time - currentWord.end_time;

      if (timeGap > pauseThreshold) {
        endPos = i + 1;
        pauseGap = timeGap;
        pauseFound = true;
        splitReason = 'pause';
        break;
      }
    }

    // 步骤 2: 如果没找到停顿，往回找最后一个句号
    if (!pauseFound) {
      for (let i = batchEnd - 1; i > batchIdx; i--) {
        if (hasEndingPunctuation(sortedWords[i].text)) {
          endPos = i + 1;
          splitReason = 'punctuation';
          break;
        }
      }
    }

    // 步骤 3: 取出批次
    const wordsInBatch = sortedWords.slice(batchIdx, endPos);

    // 步骤 4: 检查是否可以跳过 LLM
    const skipLLM = shouldSkipLLM(wordsInBatch, pauseFound, pauseGap, batchIdx, sortedWords);

    batches.push({
      words: wordsInBatch,
      startIdx: batchIdx,
      skipLLM,
      reason: splitReason,
      pauseGap: pauseFound ? pauseGap : undefined
    });

    batchIdx = endPos;
  }

  return batches;
};

/**
 * 打印批次概览到控制台
 * @param batches - 批次数组
 */
export const logBatchOverview = (batches: BatchInfo[]): void => {
  console.log(`\n[Transcription] ========== 批次切分概览 ==========`);
  batches.forEach((batch, idx) => {
    const wordCount = batch.words.length;
    const skipMark = batch.skipLLM ? '⚡' : '📦';
    const skipNote = batch.skipLLM ? ' - skipping LLM' : '';
    const reasonText = batch.reason === 'pause'
      ? `pause ${batch.pauseGap?.toFixed(1)}s`
      : batch.reason === 'punctuation' ? 'punctuation' : `limit`;
    console.log(`${skipMark} Batch ${idx + 1} (${wordCount} words, ${reasonText})${skipNote}`);
  });
  const llmBatches = batches.filter(b => !b.skipLLM);
  console.log(`📦 Created ${llmBatches.length} batches for LLM processing`);
  console.log(`⚡ Skipped ${batches.filter(b => b.skipLLM).length} batches (no LLM needed)`);
  console.log(`[Transcription] =====================================\n`);
};

/**
 * 统计批次信息
 * @param batches - 批次数组
 * @returns 统计对象
 */
export const getBatchStats = (batches: BatchInfo[]) => {
  return {
    total: batches.length,
    llmBatches: batches.filter(b => !b.skipLLM).length,
    skippedBatches: batches.filter(b => b.skipLLM).length
  };
};
