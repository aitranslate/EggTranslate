import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { SubtitleEntry, FileType } from '@/types';
import dataManager from '@/services/dataManager';
import { parseSRT, toSRT, toTXT, toBilingual } from '@/utils/srtParser';
import toast from 'react-hot-toast';
import { useTranslation } from './TranslationContext';
import { useTranscription } from './TranscriptionContext';
import { getSentenceSegmentationPrompt } from '@/utils/translationPrompts';
import { getLlmWordsAndSplits, mapLlmSplitsToOriginal, reconstructSentences } from '@/utils/sentenceTools';
import { jsonrepair } from 'jsonrepair';
import { callLLM } from '@/utils/llmApi';

const generateTaskId = (): string => {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// 使用稳定的文件ID生成方式
const generateStableFileId = (taskId: string): string => {
  return `file_${taskId}`;
};

interface SubtitleFile {
  id: string;
  name: string;
  size: number;
  lastModified: number;
  entries: SubtitleEntry[];
  filename: string;
  currentTaskId: string;
  type?: FileType;          // 文件类型：srt, audio, video
  fileRef?: File;           // 原始文件引用（用于音视频转录）
  duration?: number;        // 音视频时长（秒）
  transcriptionStatus?: 'idle' | 'loading_model' | 'decoding' | 'chunking' | 'transcribing' | 'llm_merging' | 'completed' | 'failed';
  // 转录进度
  transcriptionProgress?: {
    // 总体进度（各阶段权重：解码10% + 转录50% + LLM合并40%）
    percent: number;
    // 各阶段具体进度
    currentChunk?: number;     // 当前转录块 (1/20)
    totalChunks?: number;       // 总块数
    llmBatch?: number;          // LLM 合并批次 (2/10)
    totalLlmBatches?: number;   // LLM 总批次数
  };
}

interface SubtitleState {
  files: SubtitleFile[];
  isLoading: boolean;
  error: string | null;
}

interface SubtitleContextValue extends SubtitleState {
  loadFromFile: (file: File) => Promise<void>;
  updateEntry: (fileId: string, id: number, text: string, translatedText?: string) => Promise<void>;
  clearFile: (fileId: string) => Promise<void>;
  clearAllData: () => Promise<void>;
  exportSRT: (fileId: string, useTranslation?: boolean) => string;
  exportTXT: (fileId: string, useTranslation?: boolean) => string;
  exportBilingual: (fileId: string) => string;
  getTranslationProgress: (fileId: string) => { completed: number; total: number };
  generateNewTaskId: (fileId: string) => string;
  getCurrentTaskId: (fileId: string) => string;
  getFile: (fileId: string) => SubtitleFile | null;
  getAllFiles: () => SubtitleFile[];
  removeFile: (fileId: string) => Promise<void>;
  simulateTranscription: (fileId: string) => Promise<void>; // 音视频转录
}

type SubtitleAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_FILE'; payload: SubtitleFile }
  | { type: 'UPDATE_FILE'; payload: { fileId: string; updates: Partial<SubtitleFile> } }
  | { type: 'UPDATE_ENTRY'; payload: { fileId: string; id: number; text: string; translatedText?: string } }
  | { type: 'REMOVE_FILE'; payload: string }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'SET_FILES'; payload: SubtitleFile[] }; // 新增：批量设置文件

const initialState: SubtitleState = {
  files: [],
  isLoading: false,
  error: null
};

const subtitleReducer = (state: SubtitleState, action: SubtitleAction): SubtitleState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'ADD_FILE':
      return { ...state, files: [...state.files, action.payload] };
    case 'SET_FILES': // 新增：批量设置文件
      return { ...state, files: action.payload };
    case 'UPDATE_FILE':
      return {
        ...state,
        files: state.files.map(file =>
          file.id === action.payload.fileId
            ? { ...file, ...action.payload.updates }
            : file
        )
      };
    case 'UPDATE_ENTRY':
      return {
        ...state,
        files: state.files.map(file =>
          file.id === action.payload.fileId
            ? {
                ...file,
                entries: file.entries.map(entry =>
                  entry.id === action.payload.id
                    ? {
                        ...entry,
                        text: action.payload.text,
                        translatedText: action.payload.translatedText ?? entry.translatedText
                      }
                    : entry
                )
              }
            : file
        )
      };
    case 'REMOVE_FILE':
      return { ...state, files: state.files.filter(file => file.id !== action.payload) };
    case 'CLEAR_ALL_DATA':
      return { ...initialState };
    default:
      return state;
  }
};

const SubtitleContext = createContext<SubtitleContextValue | null>(null);

// 检测文件类型
const detectFileType = (filename: string): FileType => {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'srt') return 'srt';
  const audioExts = ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'];
  const videoExts = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'wmv', 'flv'];
  if (audioExts.includes(ext || '')) return 'audio';
  if (videoExts.includes(ext || '')) return 'video';
  return 'srt'; // 默认
};

// 格式化文件大小显示
const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// 将秒数转换为 SRT 时间格式 (HH:MM:SS,mmm)
const formatSRTTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  const pad = (num: number, size: number) => String(num).padStart(size, '0');

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
};

export const SubtitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(subtitleReducer, initialState);
  const { isConfigured, config: translationConfig } = useTranslation();
  const { modelStatus, getModel } = useTranscription();

  const loadFromFile = useCallback(async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const fileType = detectFileType(file.name);

      if (fileType === 'srt') {
        // SRT 文件：读取文本内容
        const content = await file.text();
        const entries = parseSRT(content);

        // 在导入文件时创建批处理任务
        const index = state.files.length;
        const taskId = await dataManager.createNewTask(file.name, entries, index);

        const fileId = generateStableFileId(taskId);

        const newFile: SubtitleFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          entries,
          filename: file.name,
          currentTaskId: taskId,
          type: 'srt',
          transcriptionStatus: 'completed'
        };

        dispatch({ type: 'ADD_FILE', payload: newFile });
      } else {
        // 音视频文件：只存储元数据和文件引用，转录时再处理
        const taskId = generateTaskId();
        const fileId = generateStableFileId(taskId);

        // 创建空字幕条目的文件
        const newFile: SubtitleFile = {
          id: fileId,
          name: file.name,
          size: file.size,
          lastModified: file.lastModified,
          entries: [], // 音视频文件初始没有字幕
          filename: file.name,
          currentTaskId: taskId,
          type: fileType,
          fileRef: file, // 保存原始文件引用用于后续转录
          transcriptionStatus: 'idle'
        };

        dispatch({ type: 'ADD_FILE', payload: newFile });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '文件加载失败';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.files.length]);

  const updateEntry = useCallback(async (fileId: string, id: number, text: string, translatedText?: string) => {
    // 更新UI状态
    dispatch({ type: 'UPDATE_ENTRY', payload: { fileId, id, text, translatedText } });
    
    // 获取文件信息
    const file = state.files.find(f => f.id === fileId);
    if (file) {
      // 只在内存中更新，不进行持久化
      dataManager.updateTaskSubtitleEntryInMemory(file.currentTaskId, id, text, translatedText);
    }
  }, [state.files]);

  const clearFile = useCallback(async (fileId: string) => {
    dispatch({ type: 'REMOVE_FILE', payload: fileId });
    const file = state.files.find(f => f.id === fileId);
    if (file) {
      await dataManager.removeTask(file.currentTaskId);
    }
  }, [state.files]);

  const clearAllData = useCallback(async () => {
    dispatch({ type: 'CLEAR_ALL_DATA' });
    await dataManager.clearBatchTasks();
    window.dispatchEvent(new CustomEvent('taskCleared'));
  }, []);

  const generateNewTaskId = useCallback((fileId: string): string => {
    const newTaskId = generateTaskId();
    const newFileId = generateStableFileId(newTaskId);
    dispatch({ 
      type: 'UPDATE_FILE', 
      payload: { fileId, updates: { currentTaskId: newTaskId, id: newFileId } }
    });
    return newTaskId;
  }, []);

  const getCurrentTaskId = useCallback((fileId: string): string => {
    const file = state.files.find(f => f.id === fileId);
    return file?.currentTaskId || '';
  }, [state.files]);

  const getFile = useCallback((fileId: string) => {
    return state.files.find(file => file.id === fileId) || null;
  }, [state.files]);

  const getAllFiles = useCallback(() => {
    return state.files;
  }, [state.files]);

  const removeFile = useCallback(async (fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file) {
      return;
    }

    // 先更新UI
    dispatch({ type: 'REMOVE_FILE', payload: fileId });

    try {
      // 然后删除任务数据
      await dataManager.removeTask(file.currentTaskId);
      toast.success('文件已删除');
    } catch (error) {
      console.error('Failed to remove task from dataManager:', error);
      toast.error('删除文件失败');
    }
  }, [state.files]);

  // 音视频转录实现
  const simulateTranscription = useCallback(async (fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file || file.type === 'srt') return;
    if (!file.fileRef) {
      toast.error('文件引用丢失，请重新上传');
      return;
    }

    // 内部函数：调用 LLM API 进行句子分割（使用统一的 LLM 调用）
    const callLlmApi = async (prompt: string): Promise<string> => {
      if (!isConfigured || !translationConfig.apiKey) {
        throw new Error('请先配置翻译 API');
      }

      const result = await callLLM(
        {
          baseURL: translationConfig.baseURL,
          apiKey: translationConfig.apiKey,
          model: translationConfig.model
        },
        [{ role: 'user', content: prompt }],
        { temperature: 0.3 }
      );

      return result.content;
    };

    // 检查模型是否已加载
    const model = getModel();
    if (!model || modelStatus !== 'loaded') {
      toast.error('请先加载转录模型');
      return;
    }

    // 检查 API 是否已配置（用于句子分割）
    if (!isConfigured) {
      toast.error('转录失败: 请先配置API密钥（用于句子分割）');
      return;
    }

    try {
      // 解码音频
      dispatch({
        type: 'UPDATE_FILE',
        payload: { fileId, updates: { transcriptionStatus: 'decoding' } }
      });

      // 读取文件
      const arrayBuffer = await file.fileRef.arrayBuffer();
      // 解码音频（16kHz 单声道）
      const audioContext = new AudioContext({ sampleRate: 16000 });
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const pcm = audioBuffer.getChannelData(0); // Float32Array
      const duration = pcm.length / 16000; // 时长（秒）

      const SAMPLE_RATE = 16000; // 采样率

      // 切片：基于静音检测智能切分
      dispatch({
        type: 'UPDATE_FILE',
        payload: { fileId, updates: { transcriptionStatus: 'chunking', duration } }
      });

      // 静音检测：找到所有可能的静音点
      const findSilencePoints = (pcmData: Float32Array, sampleRate: number): number[] => {
        const analysisWindowSize = Math.floor(sampleRate * 0.01); // 10ms 窗口
        const minSilenceDuration = 0.4; // 静音持续至少 400ms（过滤词之间的短暂停顿）
        const silenceThresholdRatio = 0.15; // 静音阈值为平均 RMS 的 15%（低于平均音量的 15% 算静音）

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

      // 找到所有静音点
      const silencePoints = findSilencePoints(pcm, SAMPLE_RATE);
      console.log('[Transcription] 检测到', silencePoints.length, '个静音点');

      // 基于静音点生成分片计划
      const CHUNK_DURATION = 60; // 目标每片约 60 秒
      const chunkSizeSamples = CHUNK_DURATION * SAMPLE_RATE;
      const searchWindow = 20 * SAMPLE_RATE; // 在目标位置前后 20 秒内搜索静音点

      const chunkBoundaries: number[] = [0]; // 分片边界（样本索引）
      let currentPos = 0;

      while (currentPos < pcm.length) {
        const targetPos = Math.min(currentPos + chunkSizeSamples, pcm.length);
        let bestSplitPos = targetPos; // 默认在目标位置切分

        if (targetPos < pcm.length) {
          // 在目标位置附近的静音点中找到最合适的
          const searchStart = targetPos - searchWindow;
          const searchEnd = targetPos + searchWindow;

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
            console.log(`[Transcription] 在目标 ${Math.floor(targetPos / SAMPLE_RATE)}s 附近找到静音点: ${Math.floor(bestSplitPos / SAMPLE_RATE)}s`);
          } else {
            console.log(`[Transcription] 在 ${Math.floor(targetPos / SAMPLE_RATE)}s 附近未找到静音点，使用目标位置`);
          }
        }

        chunkBoundaries.push(bestSplitPos);
        currentPos = bestSplitPos;
      }

      // 生成实际的分片
      const chunks = [];
      for (let i = 0; i < chunkBoundaries.length - 1; i++) {
        const start = chunkBoundaries[i];
        const end = chunkBoundaries[i + 1];
        chunks.push({
          start,
          end,
          duration: (end - start) / SAMPLE_RATE
        });
      }

      const totalChunks = chunks.length;
      console.log('[Transcription] 分片计划:', chunks.map(c => `${Math.floor(c.duration)}s`).join(', '));

      await new Promise(r => setTimeout(r, 500)); // 显示分片信息

      toast(`音频时长: ${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}，基于静音检测切分成 ${totalChunks} 个片段`);

      // 转录：使用基于静音检测的分片计划
      const allWords = [];
      const frameStride = 1;

      // 判断是否需要切分
      if (totalChunks === 1) {
        // 短音频，直接处理
        dispatch({
          type: 'UPDATE_FILE',
          payload: {
            fileId,
            updates: {
              transcriptionStatus: 'transcribing',
              transcriptionProgress: { percent: 20, currentChunk: 1, totalChunks: 1 }
            }
          }
        });

        const res = await model.transcribe(pcm, SAMPLE_RATE, {
          returnTimestamps: true,
          returnConfidences: true,
          frameStride
        });

        if (res.words) {
          allWords.push(...res.words);
        }
      } else {
        // 长音频，按静音检测的分片计划处理
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkPcm = pcm.slice(chunk.start, chunk.end);
          const timeOffset = chunk.start / SAMPLE_RATE;

          dispatch({
            type: 'UPDATE_FILE',
            payload: {
              fileId,
              updates: {
                transcriptionStatus: 'transcribing',
                transcriptionProgress: {
                  percent: Math.floor(10 + (i / chunks.length) * 70), // 10%-80%
                  currentChunk: i + 1,
                  totalChunks: chunks.length
                }
              }
            }
          });

          const chunkRes = await model.transcribe(chunkPcm, SAMPLE_RATE, {
            returnTimestamps: true,
            returnConfidences: true,
            frameStride
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

      // LLM 句子分割（分批并行处理）
      dispatch({
        type: 'UPDATE_FILE',
        payload: {
          fileId,
          updates: {
            transcriptionStatus: 'llm_merging',
            transcriptionProgress: { percent: 80, llmBatch: 0, totalLlmBatches: 0 }
          }
        }
      });

      // ========== 辅助函数：判断是否可以跳过 LLM ==========

      /**
       * 检查词是否以句子结束标点结尾
       */
      const hasEndingPunctuation = (word: string): boolean => {
        const endings = ['.', '!', '?', '。', '！', '？', '...', '…'];
        return endings.some(ending => word.endsWith(ending));
      };

      /**
       * 检查批次第一个词前面是否有停顿
       */
      const hasPauseBefore = (firstWord: typeof allWords[0], words: typeof allWords, threshold: number): boolean => {
        const idx = words.indexOf(firstWord);
        if (idx === 0) return true; // 第一个词，前面默认有停顿

        const prevWord = words[idx - 1];
        const gap = firstWord.start_time - prevWord.end_time;
        return gap > threshold;
      };

      /**
       * 判断是否可以跳过 LLM 处理
       * @param wordsInBatch 批次中的单词
       * @param pauseFound 是否找到停顿
       * @param pauseGap 停顿时长
       * @param startIdx 批次在 allWords 中的起始索引
       */
      const shouldSkipLLM = (
        wordsInBatch: typeof allWords,
        pauseFound: boolean,
        pauseGap: number,
        startIdx: number
      ): boolean => {
        const PAUSE_THRESHOLD = 1.0; // 停顿阈值（秒）
        const wordCount = wordsInBatch.length;

        // 场景 1: 极短片段 (1-2 个词) + 前后都有停顿
        if (wordCount <= 2 && pauseFound && pauseGap > PAUSE_THRESHOLD) {
          const hasPause = hasPauseBefore(wordsInBatch[0], allWords, PAUSE_THRESHOLD);
          if (hasPause) {
            return true;
          }
        }

        // 场景 2: 完整句子（以标点结尾）+ 后面有停顿 + 长度不超过 20 词
        const lastWord = wordsInBatch[wordCount - 1];
        if (hasEndingPunctuation(lastWord.text) && pauseFound && wordCount <= 20) {
          return true;
        }

        // 场景 3: 短片段 (3-10 个词) + 前后都有长停顿
        if (wordCount <= 10 && wordCount > 2 && pauseFound && pauseGap > PAUSE_THRESHOLD) {
          const hasPause = hasPauseBefore(wordsInBatch[0], allWords, PAUSE_THRESHOLD);
          if (hasPause) {
            return true;
          }
        }

        return false;
      };

      // ========== 基于时间间隔和句号的混合切分 ==========

      const BATCH_SIZE = 300;
      const PAUSE_THRESHOLD = 1.0; // 停顿阈值（秒）
      type BatchInfo = {
        words: typeof allWords;
        startIdx: number;
        skipLLM?: boolean;
        reason: 'pause' | 'punctuation' | 'limit';
        pauseGap?: number;
      };
      const batches: BatchInfo[] = [];

      // 按时间排序（确保单词按时间顺序排列）
      allWords.sort((a, b) => a.start_time - b.start_time);

      let batchIdx = 0;

      while (batchIdx < allWords.length) {
        const batchEnd = Math.min(batchIdx + BATCH_SIZE, allWords.length);
        let endPos = batchEnd; // 默认位置
        let pauseGap = 0;
        let pauseFound = false;
        let splitReason: 'pause' | 'punctuation' | 'limit' = 'limit';

        // 步骤 1: 正向找第一个停顿（在 300 词范围内）
        for (let i = batchIdx; i < batchEnd - 1; i++) {
          const currentWord = allWords[i];
          const nextWord = allWords[i + 1];
          const timeGap = nextWord.start_time - currentWord.end_time;

          if (timeGap > PAUSE_THRESHOLD) {
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
            if (hasEndingPunctuation(allWords[i].text)) {
              endPos = i + 1;
              splitReason = 'punctuation';
              break;
            }
          }
        }

        // 步骤 3: 取出批次
        const wordsInBatch = allWords.slice(batchIdx, endPos);

        // 步骤 4: 检查是否可以跳过 LLM
        const skipLLM = shouldSkipLLM(wordsInBatch, pauseFound, pauseGap, batchIdx);

        batches.push({
          words: wordsInBatch,
          startIdx: batchIdx,
          skipLLM,
          reason: splitReason,
          pauseGap: pauseFound ? pauseGap : undefined
        });

        batchIdx = endPos;
      }

      // 打印批次概览
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

      // 多线程并行处理批次
      const allReconstructedSentences: Array<{ sentence: string; startIdx: number; endIdx: number }> = [];
      let completedBatches = 0;

      await Promise.all(
        batches.map(async (batch, batchIdx) => {
          let llmResponse = '';  // 移到 try 外面，catch 块才能访问
          try {
            let sentenceMappings: Array<{ sentence: string; startIdx: number; endIdx: number }> = [];

            // 如果标记为跳过 LLM，直接将单词连接成句子
            if (batch.skipLLM) {
              const originalWords = batch.words.map(w => w.text);
              const sentence = originalWords.join(' ');
              const startIdx = batch.startIdx;
              const endIdx = batch.startIdx + batch.words.length - 1;

              sentenceMappings = [{
                sentence,
                startIdx,
                endIdx
              }];
            } else {
              // 调用 LLM 进行句子分割
              const wordsList = batch.words.map(w => w.text);
              const segmentationPrompt = getSentenceSegmentationPrompt(
                wordsList,
                20,
                translationConfig.sourceLanguage
              );

              llmResponse = await callLlmApi(segmentationPrompt);
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
              // 确保最后一个分割点包含到数组末尾
              const completeSplitIndices = [...originalSplitIndices];
              if (completeSplitIndices.length === 0 || completeSplitIndices[completeSplitIndices.length - 1] !== originalWords.length) {
                completeSplitIndices.push(originalWords.length);
              }

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
            }

            // 按批次顺序存储
            allReconstructedSentences[batchIdx] = sentenceMappings;

            // 更新进度
            completedBatches++;
            dispatch({
              type: 'UPDATE_FILE',
              payload: {
                fileId,
                updates: {
                  transcriptionProgress: {
                    percent: Math.floor(80 + (completedBatches / batches.length) * 20),
                    currentChunk: totalChunks,
                    totalChunks: totalChunks,
                    llmBatch: completedBatches,
                    totalLlmBatches: batches.length
                  }
                }
              }
            });
          } catch (error) {
            const reasonText = batch.reason === 'pause'
              ? `pause ${batch.pauseGap?.toFixed(1)}s`
              : batch.reason === 'punctuation' ? 'punctuation' : 'limit';
            console.error(`\n❌ Batch ${batchIdx + 1} (${batch.words.length} words, ${reasonText}) 处理失败`);
            console.error(`--- LLM 返回 ---`);
            console.error(llmResponse);
            console.error(`----------------\n`);
            // 抛出错误，停止转录流程
            throw new Error(`LLM 句子分割失败（批次 ${batchIdx + 1}）: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        })
      );

      // 展平所有句子并生成字幕条目
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

      // TODO: 如果 entries 为空，需要实现基于 parakeet 自带标点符号的组句逻辑
      // parakeet 转录返回的 words 可能包含标点信息（如逗号、句号）
      // 可以利用这些标点符号进行基本的句子分割：
      // 1. 遍历 allWords，查找包含 '.' 的单词
      // 2. 在这些位置进行切分
      // 3. 每个切分段作为一个字幕条目
      if (entries.length === 0) {
        console.error('[Transcription] LLM 句子分割失败，需要实现基于标点符号的回退逻辑');
        throw new Error('LLM 句子分割失败，请检查 API 配置');
      }

      // 完成
      dispatch({
        type: 'UPDATE_FILE',
        payload: {
          fileId,
          updates: {
            transcriptionStatus: 'completed',
            transcriptionProgress: { percent: 100, totalChunks, currentChunk: totalChunks },
            entries,
            duration
          }
        }
      });

      toast.success(`转录完成！生成 ${entries.length} 条字幕`);
    } catch (error) {
      console.error('转录失败:', error);
      dispatch({
        type: 'UPDATE_FILE',
        payload: { fileId, updates: { transcriptionStatus: 'failed' } }
      });
      toast.error(`转录失败: ${error.message}`);
    }
  }, [state.files, isConfigured, getModel, modelStatus, translationConfig]);

  const exportSRT = useCallback((fileId: string, useTranslation = true) => {
    const file = getFile(fileId);
    if (!file) return '';
    return toSRT(file.entries, useTranslation);
  }, [getFile]);

  const exportTXT = useCallback((fileId: string, useTranslation = true) => {
    const file = getFile(fileId);
    if (!file) return '';
    return toTXT(file.entries, useTranslation);
  }, [getFile]);

  const exportBilingual = useCallback((fileId: string) => {
    const file = getFile(fileId);
    if (!file) return '';
    return toBilingual(file.entries);
  }, [getFile]);

  const getTranslationProgress = useCallback((fileId: string) => {
    const file = getFile(fileId);
    if (!file) return { completed: 0, total: 0 };
    const completed = file.entries.filter(entry => entry.translatedText).length;
    return { completed, total: file.entries.length };
  }, [getFile]);

  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        // 只有当当前没有文件时才加载保存的数据
        if (state.files.length === 0) {
          // 从持久化的 batch_tasks 中恢复数据
          const batchTasks = dataManager.getBatchTasks();
          if (batchTasks && batchTasks.tasks.length > 0) {
            // 将 batch_tasks 转换为 files 状态
            const filesToLoad = batchTasks.tasks.map((task) => ({
              id: generateStableFileId(task.taskId),
              name: task.subtitle_filename,
              size: 0,
              lastModified: Date.now(),
              entries: task.subtitle_entries,
              filename: task.subtitle_filename,
              currentTaskId: task.taskId,
              type: detectFileType(task.subtitle_filename) as FileType,
              fileRef: undefined, // File对象无法持久化，恢复时为undefined
              transcriptionStatus: 'completed' as const
            }));

            dispatch({ type: 'SET_FILES', payload: filesToLoad });
          }
        }
      } catch (error) {
        console.error('加载保存的数据失败:', error);
      }
    };

    loadSavedData();
  }, []);

  const value: SubtitleContextValue = {
    ...state,
    loadFromFile,
    updateEntry,
    clearFile,
    clearAllData,
    exportSRT,
    exportTXT,
    exportBilingual,
    getTranslationProgress,
    generateNewTaskId,
    getCurrentTaskId,
    getFile,
    getAllFiles,
    removeFile,
    simulateTranscription
  };

  return <SubtitleContext.Provider value={value}>{children}</SubtitleContext.Provider>;
};

// 兼容性Hook，为单个文件提供旧的接口
// 注意：这个hook现在接受一个可选的fileId参数，以支持多文件场景
export const useSingleSubtitle = (fileId?: string) => {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }

  // 如果提供了fileId，则使用对应的文件，否则使用第一个文件（向后兼容）
  const currentFile = fileId 
    ? context.files.find(file => file.id === fileId) || null
    : context.files.length > 0 ? context.files[0] : null;

  return {
    entries: currentFile?.entries || [],
    filename: currentFile?.name || '',
    isLoading: context.isLoading,
    error: context.error,
    currentTaskId: currentFile?.currentTaskId || '',
    loadFromFile: context.loadFromFile,
    updateEntry: (id: number, text: string, translatedText?: string) => {
      if (currentFile) {
        return context.updateEntry(currentFile.id, id, text, translatedText);
      }
      return Promise.resolve();
    },
    clearEntries: async () => {
      if (currentFile) {
        await context.clearFile(currentFile.id);
      }
    },
    clearAllData: context.clearAllData,
    exportSRT: (useTranslation = true) => currentFile ? context.exportSRT(currentFile.id, useTranslation) : '',
    exportTXT: (useTranslation = true) => currentFile ? context.exportTXT(currentFile.id, useTranslation) : '',
    exportBilingual: () => currentFile ? context.exportBilingual(currentFile.id) : '',
    getTranslationProgress: () => currentFile ? context.getTranslationProgress(currentFile.id) : { completed: 0, total: 0 },
    generateNewTaskId: () => currentFile ? context.generateNewTaskId(currentFile.id) : '',
    getCurrentTaskId: () => currentFile?.currentTaskId || '',
  };
};

export const useSubtitle = () => {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }
  return context;
};