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

    // 内部函数：调用 LLM API 进行句子分割
    const callLlmApi = async (prompt: string): Promise<string> => {
      if (!isConfigured || !translationConfig.apiKey) {
        throw new Error('请先配置翻译 API');
      }

      const response = await fetch(`${translationConfig.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${translationConfig.apiKey}`
        },
        body: JSON.stringify({
          model: translationConfig.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
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

      // 切片
      dispatch({
        type: 'UPDATE_FILE',
        payload: { fileId, updates: { transcriptionStatus: 'chunking', duration } }
      });

      const CHUNK_DURATION = 60; // 60秒
      const OVERLAP_DURATION = 5; // 5秒重叠（确保单词不被切断）
      const chunkStep = (CHUNK_DURATION - OVERLAP_DURATION) * 16000;
      const chunkSize = CHUNK_DURATION * 16000;
      const totalChunks = Math.ceil((pcm.length - OVERLAP_DURATION * 16000) / chunkStep);

      await new Promise(r => setTimeout(r, 500)); // 显示分片信息

      toast(`音频时长: ${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}，切分成 ${totalChunks} 个片段`);

      // 转录
      const allWords = [];
      const SAMPLE_RATE = 16000;
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
        // 长音频，切分处理
        for (let i = 0; i < totalChunks; i++) {
          const start = i * chunkStep;
          const end = Math.min(start + chunkSize, pcm.length);
          const chunkPcm = pcm.slice(start, end);
          const timeOffset = start / SAMPLE_RATE;
          const isLastChunk = (end >= pcm.length);

          dispatch({
            type: 'UPDATE_FILE',
            payload: {
              fileId,
              updates: {
                transcriptionStatus: 'transcribing',
                transcriptionProgress: {
                  percent: Math.floor(10 + (i / totalChunks) * 70), // 10%-80%
                  currentChunk: i + 1,
                  totalChunks: totalChunks
                }
              }
            }
          });

          const chunkRes = await model.transcribe(chunkPcm, SAMPLE_RATE, {
            returnTimestamps: true,
            returnConfidences: true,
            frameStride
          });

          // 调整时间偏移并合并 words（去除重叠部分）
          if (chunkRes.words) {
            chunkRes.words.forEach(w => {
              w.start_time += timeOffset;
              w.end_time += timeOffset;
            });

            // 定义有效区域
            // 保留每个分片的完整内容，重叠区域稍后通过文本去重
            const effectiveStart = timeOffset;
            const effectiveEnd = isLastChunk
              ? timeOffset + (end - start) / SAMPLE_RATE
              : timeOffset + CHUNK_DURATION;

            // 保留所有单词
            allWords.push(...chunkRes.words);
          }
        }
      }

      // 去重：重叠区域的单词可能重复
      // 策略：如果两个单词的时间区域重叠，保留较早的（前一个分片的）
      const deduplicatedWords: typeof allWords = [];
      const sortedWords = [...allWords].sort((a, b) => a.start_time - b.start_time);

      for (const word of sortedWords) {
        // 检查这个单词的时间是否与已保留的单词重叠
        const hasOverlap = deduplicatedWords.some(existing =>
          word.start_time < existing.end_time && word.end_time > existing.start_time
        );

        if (!hasOverlap) {
          deduplicatedWords.push(word);
        }
      }

      const finalWords = deduplicatedWords;

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

      // 按 300 词分批，遇到句号切分
      const BATCH_SIZE = 300;
      const batches: Array<{ words: Array<{ text: string; start_time: number; end_time: number; confidence?: number }>; startIdx: number }> = [];
      let currentBatch: typeof allWords = [];
      let lastPeriodIndex = -1;  // 最近一个句号在 currentBatch 中的索引

      for (let i = 0; i < allWords.length; i++) {
        currentBatch.push(allWords[i]);

        // 记录句号位置
        if (allWords[i].text.endsWith('.')) {
          lastPeriodIndex = currentBatch.length - 1;
        }

        // 达到批次大小，用最近句号切分
        if (currentBatch.length >= BATCH_SIZE) {
          if (lastPeriodIndex >= 0) {
            // 有句号，在句号处切分
            batches.push({
              words: currentBatch.slice(0, lastPeriodIndex + 1),
              startIdx: allWords.indexOf(currentBatch[0])
            });
            currentBatch = currentBatch.slice(lastPeriodIndex + 1);
            lastPeriodIndex = -1;
          } else {
            // 没有句号，强制在 300 词处切分
            batches.push({
              words: currentBatch.slice(0, BATCH_SIZE),
              startIdx: allWords.indexOf(currentBatch[0])
            });
            currentBatch = currentBatch.slice(BATCH_SIZE);
            lastPeriodIndex = -1;
          }
        }
      }

      // 处理剩余不足 300 的批次
      if (currentBatch.length > 0) {
        batches.push({
          words: currentBatch,
          startIdx: allWords.indexOf(currentBatch[0])
        });
      }

      // 多线程并行调用 LLM，使用序列匹配映射回原始单词
      const allReconstructedSentences: Array<{ sentence: string; startIdx: number; endIdx: number }> = [];
      let completedBatches = 0;

      await Promise.all(
        batches.map(async (batch, batchIdx) => {
          try {
            const wordsList = batch.words.map(w => w.text);
            const segmentationPrompt = getSentenceSegmentationPrompt(
              wordsList,
              20,
              translationConfig.sourceLanguage
            );

            const llmResponse = await callLlmApi(segmentationPrompt);
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
            console.error(`批次 ${batchIdx + 1} 处理失败:`, error);
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