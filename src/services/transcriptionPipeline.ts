/**
 * 转录流程服务
 * 封装完整的音视频转录流程：解码 -> 静音检测 -> 分片 -> 转录 -> LLM分割 -> 字幕生成
 */

import { SubtitleEntry, type LLMConfig as BaseLLMConfig } from '@/types';
import type { TranscriptionWord } from '@/types/transcription';
import { DecodedAudio, decodeAudioFile } from './audioDecoder';
import { findSilencePoints, createChunkPlan, type AudioChunk } from '@/utils/silenceDetection';
import { createBatches, logBatchOverview, type BatchInfo } from '@/utils/batchProcessor';
import { formatSRTTime } from '@/utils/timeFormat';
import { getSentenceSegmentationPrompt } from '@/utils/translationPrompts';
import { getLlmWordsAndSplits, mapLlmSplitsToOriginal, reconstructSentences } from '@/utils/sentenceTools';
import { jsonrepair } from 'jsonrepair';
import { callLLM } from '@/utils/llmApi';
import { toast } from 'react-hot-toast';
import { API_CONSTANTS } from '@/constants/api';
import { AUDIO_CONSTANTS, TRANSCRIPTION_BATCH_CONSTANTS, TRANSCRIPTION_PROGRESS } from '@/constants/transcription';
import { toAppError } from '@/utils/errors';

// 重新导出类型
export type { TranscriptionWord };

/**
 * 转录 LLM 配置（继承基础 LLM 配置，增加转录相关字段）
 */
export interface TranscriptionLLMConfig extends BaseLLMConfig {
  sourceLanguage: string;
}

/**
 * 转录模型接口
 */
export interface TranscriptionModel {
  transcribe: (
    pcm: Float32Array,
    sampleRate: number,
    options: {
      returnTimestamps: boolean;
      returnConfidences: boolean;
      frameStride: number;
    }
  ) => Promise<{
    words?: TranscriptionWord[];
  }>;
}

/**
 * 进度更新回调
 */
export interface ProgressCallbacks {
  onDecoding?: () => void;
  onChunking?: (duration: number) => void;
  onTranscribing?: (current: number, total: number, percent: number) => void;
  onLLMMerging?: () => void;
  onLLMProgress?: (completed: number, total: number, percent: number) => void;
}

/**
 * 转录结果
 */
export interface TranscriptionResult {
  entries: SubtitleEntry[];
  duration: number;
  totalChunks: number;
  tokensUsed: number; // LLM 组句消耗的 tokens
}

/**
 * 调用 LLM 进行句子分割
 */
const callLlmApi = async (prompt: string, config: TranscriptionLLMConfig): Promise<{ content: string; tokensUsed: number }> => {
  const result = await callLLM(
    {
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model
    },
    [{ role: 'user', content: prompt }],
    { temperature: API_CONSTANTS.DEFAULT_TEMPERATURE }
  );

  return { content: result.content, tokensUsed: result.tokensUsed };
};

/**
 * 处理单个批次（LLM 句子分割或直接连接）
 */
const processBatch = async (
  batch: BatchInfo,
  llmConfig: TranscriptionLLMConfig
): Promise<{
  sentences: Array<{ sentence: string; startIdx: number; endIdx: number }>;
  tokensUsed: number;
}> => {
  // 如果标记为跳过 LLM，直接将单词连接成句子
  if (batch.skipLLM) {
    const originalWords = batch.words.map(w => w.text);
    const sentence = originalWords.join(' ');
    const startIdx = batch.startIdx;
    const endIdx = batch.startIdx + batch.words.length - 1;

    return {
      sentences: [{
        sentence,
        startIdx,
        endIdx
      }],
      tokensUsed: 0
    };
  }

  // 调用 LLM 进行句子分割
  const wordsList = batch.words.map(w => w.text);
  const segmentationPrompt = getSentenceSegmentationPrompt(
    wordsList,
    TRANSCRIPTION_BATCH_CONSTANTS.LLM_MAX_WORDS,
    llmConfig.sourceLanguage
  );

  const { content: llmResponse, tokensUsed } = await callLlmApi(segmentationPrompt, llmConfig);

  // 使用 jsonrepair 清理 markdown 代码块等格式问题
  const repairedJson = jsonrepair(llmResponse);
  const parsed = JSON.parse(repairedJson);
  const llmSentences = parsed.sentences || [];

  // 核心逻辑：用序列匹配将 LLM 分组映射回原始单词
  const originalCleanWords = batch.words.map(w => w.text.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // 提取 LLM 的清理后单词和分割点
  const [llmCleanWords, llmSplitIndices] = getLlmWordsAndSplits(llmSentences);

  // 用序列匹配将分割点映射回原始单词
  const originalSplitIndices = mapLlmSplitsToOriginal(originalCleanWords, llmCleanWords, llmSplitIndices);

  // 用原始单词重建句子（保留原始文本，包括大小写和标点）
  const originalWords = batch.words.map(w => w.text);
  const reconstructedSentences = reconstructSentences(originalWords, originalSplitIndices);

  // 直接使用 originalSplitIndices 计算每个句子的索引范围
  const completeSplitIndices = [...originalSplitIndices];
  if (completeSplitIndices.length === 0 || completeSplitIndices[completeSplitIndices.length - 1] !== originalWords.length) {
    completeSplitIndices.push(originalWords.length);
  }

  const sentenceMappings: Array<{ sentence: string; startIdx: number; endIdx: number }> = [];
  let lastSplitIdx = 0;
  for (let i = 0; i < completeSplitIndices.length; i++) {
    const splitIdx = completeSplitIndices[i];
    if (splitIdx > lastSplitIdx) {
      const startIdx = batch.startIdx + lastSplitIdx;
      const endIdx = batch.startIdx + splitIdx - 1;
      sentenceMappings.push({
        sentence: reconstructedSentences[i] || originalWords.slice(lastSplitIdx, splitIdx).join(' '),
        startIdx,
        endIdx
      });
    }
    lastSplitIdx = splitIdx;
  }

  return {
    sentences: sentenceMappings,
    tokensUsed
  };
};

/**
 * 执行转录流程
 * @param fileRef - 音视频文件引用
 * @param model - 转录模型
 * @param llmConfig - LLM 配置
 * @param callbacks - 进度回调
 * @returns 转录结果
 */
export const runTranscriptionPipeline = async (
  fileRef: File,
  model: TranscriptionModel,
  llmConfig: TranscriptionLLMConfig,
  callbacks: ProgressCallbacks = {}
): Promise<TranscriptionResult> => {
  // 1. 解码音频
  callbacks.onDecoding?.();
  const { pcm, duration } = await decodeAudioFile(fileRef, AUDIO_CONSTANTS.SAMPLE_RATE);

  // 2. 静音检测和分片
  callbacks.onChunking?.(duration);
  const silencePoints = findSilencePoints(pcm, AUDIO_CONSTANTS.SAMPLE_RATE);
  console.log('[Transcription] 检测到', silencePoints.length, '个静音点');

  const chunks = createChunkPlan(pcm, AUDIO_CONSTANTS.SAMPLE_RATE, silencePoints);
  const totalChunks = chunks.length;
  console.log('[Transcription] 分片计划:', chunks.map(c => `${Math.floor(c.duration)}s`).join(', '));

  await new Promise(r => setTimeout(r, API_CONSTANTS.STATE_UPDATE_DELAY_MS));
  toast(`音频时长: ${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}，基于静音检测切分成 ${totalChunks} 个片段`);

  // 3. 模型转录
  const allWords: TranscriptionWord[] = [];

  if (totalChunks === 1) {
    // 短音频，直接处理
    callbacks.onTranscribing?.(1, 1, TRANSCRIPTION_PROGRESS.SHORT_AUDIO_PROGRESS);
    const res = await model.transcribe(pcm, AUDIO_CONSTANTS.SAMPLE_RATE, {
      returnTimestamps: true,
      returnConfidences: true,
      frameStride: AUDIO_CONSTANTS.FRAME_STRIDE
    });

    if (res.words) {
      allWords.push(...res.words);
    }
  } else {
    // 长音频，按分片处理
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkPcm = pcm.slice(chunk.start, chunk.end);
      const timeOffset = chunk.start / AUDIO_CONSTANTS.SAMPLE_RATE;

      callbacks.onTranscribing?.(
        i + 1,
        chunks.length,
        Math.floor(TRANSCRIPTION_PROGRESS.LONG_AUDIO_PROGRESS_START + (i / chunks.length) * TRANSCRIPTION_PROGRESS.LONG_AUDIO_PROGRESS_RANGE)
      );

      const chunkRes = await model.transcribe(chunkPcm, AUDIO_CONSTANTS.SAMPLE_RATE, {
        returnTimestamps: true,
        returnConfidences: true,
        frameStride: AUDIO_CONSTANTS.FRAME_STRIDE
      });

      // 调整时间偏移
      if (chunkRes.words) {
        chunkRes.words.forEach(w => {
          w.start_time += timeOffset;
          w.end_time += timeOffset;
        });
        allWords.push(...chunkRes.words);
      }
    }
  }

  // 4. LLM 句子分割
  callbacks.onLLMMerging?.();

  // 批次切分
  const batches = createBatches(allWords);
  logBatchOverview(batches);

  // 并行处理批次
  const allReconstructedSentences: Array<Array<{ sentence: string; startIdx: number; endIdx: number }>> = [];
  let completedBatches = 0;
  let totalTokensUsed = 0;

  await Promise.all(
    batches.map(async (batch, batchIdx) => {
      try {
        const { sentences, tokensUsed } = await processBatch(batch, llmConfig);
        allReconstructedSentences[batchIdx] = sentences;
        totalTokensUsed += tokensUsed;

        // 更新进度
        completedBatches++;
        callbacks.onLLMProgress?.(
          completedBatches,
          batches.length,
          Math.floor(TRANSCRIPTION_PROGRESS.LLM_PROGRESS_START + (completedBatches / batches.length) * TRANSCRIPTION_PROGRESS.LLM_PROGRESS_RANGE)
        );
      } catch (error) {
        const reasonText = batch.reason === 'pause'
          ? `pause ${batch.pauseGap?.toFixed(1)}s`
          : batch.reason === 'punctuation' ? 'punctuation' : 'limit';
        const appError = toAppError(error);
        console.error(`[TranscriptionPipeline] Batch ${batchIdx + 1} (${batch.words.length} words, ${reasonText}) 处理失败:`, appError.message);
        // 抛出错误，停止转录流程
        throw new Error(`LLM 句子分割失败（批次 ${batchIdx + 1}）: ${appError.message}`);
      }
    })
  );

  // 5. 生成字幕条目
  const entries: SubtitleEntry[] = [];
  let entryId = 1;

  for (const batchSentences of allReconstructedSentences) {
    for (const { sentence, startIdx, endIdx } of batchSentences) {
      if (startIdx >= allWords.length || endIdx >= allWords.length) {
        continue;
      }

      entries.push({
        id: entryId++,
        startTime: formatSRTTime(allWords[startIdx].start_time),
        endTime: formatSRTTime(allWords[endIdx].end_time),
        text: sentence,
        translatedText: ''
      });
    }
  }

  if (entries.length === 0) {
    throw new Error('LLM 句子分割失败，请检查 API 配置');
  }

  return {
    entries,
    duration,
    totalChunks,
    tokensUsed: totalTokensUsed
  };
};
