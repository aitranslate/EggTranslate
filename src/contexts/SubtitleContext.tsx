import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { SubtitleEntry, FileType } from '@/types';
import dataManager from '@/services/dataManager';
import { parseSRT, toSRT, toTXT, toBilingual } from '@/utils/srtParser';
import toast from 'react-hot-toast';

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
  simulateTranscription: (fileId: string) => Promise<void>; // 模拟转录进度（演示用）
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

export const SubtitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(subtitleReducer, initialState);

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
        // 音视频文件：不读取内容，只存储元数据和文件引用
        // 转录时会使用流式处理：解码 → 分块转录 → 及时释放内存
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

  // 模拟转录进度（仅用于演示UI效果）
  // 真实流程：读取文件 → 解码音频 → 切片
  // 模拟流程：转录（假数据）→ LLM组句（假数据）
  const simulateTranscription = useCallback(async (fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file || file.type === 'srt') return;
    if (!file.fileRef) {
      toast.error('文件引用丢失，请重新上传');
      return;
    }

    try {
      // === 真实流程：解码音频 ===
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

      // === 真实流程：切片 ===
      dispatch({
        type: 'UPDATE_FILE',
        payload: { fileId, updates: { transcriptionStatus: 'chunking', duration } }
      });

      const CHUNK_DURATION = 60; // 60秒
      const OVERLAP_DURATION = 2; // 2秒重叠
      const chunkStep = (CHUNK_DURATION - OVERLAP_DURATION) * 16000;
      const chunkSize = CHUNK_DURATION * 16000;
      const totalChunks = Math.ceil((pcm.length - OVERLAP_DURATION * 16000) / chunkStep);

      await new Promise(r => setTimeout(r, 2000)); // 显示分片信息更久一点

      toast(`音频时长: ${Math.floor(duration / 60)}:${(Math.floor(duration % 60)).toString().padStart(2, '0')}，切分成 ${totalChunks} 个片段`);

      // === 模拟流程：转录（不调用 parakeet，生成假数据）===
      const allWords = [];

      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkStep;
        const end = Math.min(start + chunkSize, pcm.length);
        const timeOffset = start / 16000;

        dispatch({
          type: 'UPDATE_FILE',
          payload: {
            fileId,
            updates: {
              transcriptionStatus: 'transcribing',
              transcriptionProgress: {
                percent: Math.floor(10 + (i / totalChunks) * 50), // 10%-60%
                currentChunk: i + 1,
                totalChunks: totalChunks
              }
            }
          }
        });

        // 模拟转录结果（生成假的单词级数据）
        const chunkDuration = (end - start) / 16000;
        const wordsPerSecond = 2; // 假设每秒2个词
        const numWords = Math.floor(chunkDuration * wordsPerSecond);

        const chunkWords = Array.from({ length: numWords }, (_, j) => ({
          text: `词${i}-${j}`,
          start_time: timeOffset + (j / wordsPerSecond),
          end_time: timeOffset + (j / wordsPerSecond) + 0.4,
          confidence: 0.85 + Math.random() * 0.1
        }));

        // 去除重叠部分
        const validStart = timeOffset + (i === 0 ? 0 : OVERLAP_DURATION);
        const validEnd = timeOffset + CHUNK_DURATION - (i === totalChunks - 1 ? 0 : OVERLAP_DURATION);
        const validWords = chunkWords.filter(w => {
          const wordMid = (w.start_time + w.end_time) / 2;
          return wordMid >= validStart && wordMid <= validEnd;
        });

        allWords.push(...validWords);

        await new Promise(r => setTimeout(r, 1000)); // 每个分片模拟1秒
      }

      // === 模拟流程：LLM 组句（不调用翻译 API）===
      const totalLlmBatches = 10; // 固定10批

      for (let batch = 0; batch < totalLlmBatches; batch++) {
        dispatch({
          type: 'UPDATE_FILE',
          payload: {
            fileId,
            updates: {
              transcriptionStatus: 'llm_merging',
              transcriptionProgress: {
                percent: Math.floor(60 + (batch / totalLlmBatches) * 40), // 60%-100%
                total: totalChunks,
                current: totalChunks,
                totalChunks: totalChunks,
                llmBatch: batch + 1,
                totalLlmBatches: totalLlmBatches
              }
            }
          }
        });

        await new Promise(r => setTimeout(r, 1000)); // 每个批次模拟1秒
      }

      // === 生成字幕条目（模拟 LLM 合并后的句子）===
      const entries = allWords.map((word, index) => ({
        id: index + 1,
        startTime: word.start_time,
        endTime: word.end_time,
        text: `${word.text} `,
        translatedText: ''
      }));

      // 完成
      dispatch({
        type: 'UPDATE_FILE',
        payload: {
          fileId,
          updates: {
            transcriptionStatus: 'completed',
            transcriptionProgress: { percent: 100, total: totalChunks, current: totalChunks },
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
  }, [state.files]);

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