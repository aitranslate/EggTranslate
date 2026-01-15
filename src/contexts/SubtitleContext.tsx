import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import { useTranscription } from './TranscriptionContext';
import { useTranslation } from './TranslationContext';
import { runTranscriptionPipeline } from '@/services/transcriptionPipeline';
import toast from 'react-hot-toast';
import type { SubtitleEntry } from '@/types';
import {
  loadFromFile,
  updateEntryInMemory,
  removeFile,
  restoreFiles,
  clearAllData as clearAllFileData,
  type SubtitleFile
} from '@/services/SubtitleFileManager';
import { exportSRT, exportTXT, exportBilingual, getTranslationProgress } from '@/services/SubtitleExporter';
import { generateTaskId, generateStableFileId } from '@/utils/taskIdGenerator';
import { useErrorHandler } from '@/hooks/useErrorHandler';

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
  simulateTranscription: (fileId: string) => Promise<void>;
}

type SubtitleAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_FILE'; payload: SubtitleFile }
  | { type: 'UPDATE_FILE'; payload: { fileId: string; updates: Partial<SubtitleFile> } }
  | { type: 'UPDATE_ENTRY'; payload: { fileId: string; id: number; text: string; translatedText?: string } }
  | { type: 'REMOVE_FILE'; payload: string }
  | { type: 'CLEAR_ALL_DATA' }
  | { type: 'SET_FILES'; payload: SubtitleFile[] };

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
    case 'SET_FILES':
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

export const SubtitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(subtitleReducer, initialState);
  const { isConfigured, config: translationConfig } = useTranslation();
  const { modelStatus, getModel } = useTranscription();

  // 使用统一错误处理
  const { handleError } = useErrorHandler();

  // 加载文件
  const loadFromFileHandler = useCallback(async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const newFile = await loadFromFile(file, { existingFilesCount: state.files.length });
      dispatch({ type: 'ADD_FILE', payload: newFile });
    } catch (error) {
      handleError(error, {
        context: { operation: '加载文件', fileName: file.name },
        showToast: false // 调用者会显示 toast
      });
      const errorMessage = error instanceof Error ? error.message : '文件加载失败';
      dispatch({ type: 'SET_ERROR', payload: errorMessage });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.files.length, handleError]);

  // 更新字幕条目
  const updateEntryHandler = useCallback(async (
    fileId: string,
    id: number,
    text: string,
    translatedText?: string
  ) => {
    // 更新UI状态
    dispatch({ type: 'UPDATE_ENTRY', payload: { fileId, id, text, translatedText } });

    // 更新内存数据
    updateEntryInMemory(state.files, fileId, id, text, translatedText);
  }, [state.files]);

  // 清空文件
  const clearFileHandler = useCallback(async (fileId: string) => {
    dispatch({ type: 'REMOVE_FILE', payload: fileId });
    const file = state.files.find(f => f.id === fileId);
    if (file) {
      await removeFile(file);
    }
  }, [state.files]);

  // 清空所有数据
  const clearAllDataHandler = useCallback(async () => {
    dispatch({ type: 'CLEAR_ALL_DATA' });
    await clearAllFileData();
    window.dispatchEvent(new CustomEvent('taskCleared'));
  }, []);

  // 生成新任务ID
  const generateNewTaskIdHandler = useCallback((fileId: string): string => {
    const newTaskId = generateTaskId();
    const newFileId = generateStableFileId(newTaskId);
    dispatch({
      type: 'UPDATE_FILE',
      payload: { fileId, updates: { currentTaskId: newTaskId, id: newFileId } }
    });
    return newTaskId;
  }, []);

  // 获取当前任务ID
  const getCurrentTaskIdHandler = useCallback((fileId: string): string => {
    const file = state.files.find(f => f.id === fileId);
    return file?.currentTaskId || '';
  }, [state.files]);

  // 获取文件
  const getFileHandler = useCallback((fileId: string) => {
    return state.files.find(file => file.id === fileId) || null;
  }, [state.files]);

  // 获取所有文件
  const getAllFilesHandler = useCallback(() => {
    return state.files;
  }, [state.files]);

  // 删除文件
  const removeFileHandler = useCallback(async (fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file) {
      return;
    }

    // 先更新UI
    dispatch({ type: 'REMOVE_FILE', payload: fileId });

    try {
      // 然后删除任务数据
      await removeFile(file);
      toast.success('文件已删除');
    } catch (error) {
      handleError(error, {
        context: { operation: '删除文件', fileName: file.name }
      });
    }
  }, [state.files, handleError]);

  // 音视频转录实现
  const simulateTranscriptionHandler = useCallback(async (fileId: string) => {
    const file = state.files.find(f => f.id === fileId);
    if (!file || file.type === 'srt') return;
    if (!file.fileRef) {
      toast.error('文件引用丢失，请重新上传');
      return;
    }

    // 检查模型是否已加载
    const model = getModel();
    if (!model || modelStatus !== 'loaded') {
      toast.error('请先加载转录模型');
      return;
    }

    // 检查 API 是否已配置
    if (!isConfigured) {
      toast.error('转录失败: 请先配置API密钥（用于句子分割）');
      return;
    }

    try {
      let totalChunks = 0;
      const result = await runTranscriptionPipeline(
        file.fileRef,
        model,
        {
          baseURL: translationConfig.baseURL,
          apiKey: translationConfig.apiKey,
          model: translationConfig.model,
          sourceLanguage: translationConfig.sourceLanguage
        },
        {
          onDecoding: () => {
            dispatch({ type: 'UPDATE_FILE', payload: { fileId, updates: { transcriptionStatus: 'decoding' } } });
          },
          onChunking: (duration) => {
            dispatch({ type: 'UPDATE_FILE', payload: { fileId, updates: { transcriptionStatus: 'chunking', duration } } });
          },
          onTranscribing: (current, total, percent) => {
            totalChunks = total;
            dispatch({
              type: 'UPDATE_FILE',
              payload: {
                fileId,
                updates: {
                  transcriptionStatus: 'transcribing',
                  transcriptionProgress: { percent, currentChunk: current, totalChunks: total }
                }
              }
            });
          },
          onLLMMerging: () => {
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
          },
          onLLMProgress: (completed, total, percent) => {
            dispatch({
              type: 'UPDATE_FILE',
              payload: {
                fileId,
                updates: {
                  transcriptionProgress: {
                    percent,
                    currentChunk: totalChunks,
                    totalChunks: totalChunks,
                    llmBatch: completed,
                    totalLlmBatches: total
                  }
                }
              }
            });
          }
        }
      );

      // 完成
      dispatch({
        type: 'UPDATE_FILE',
        payload: {
          fileId,
          updates: {
            transcriptionStatus: 'completed',
            transcriptionProgress: { percent: 100, totalChunks: result.totalChunks, currentChunk: result.totalChunks },
            entries: result.entries,
            duration: result.duration
          }
        }
      });

      // 持久化转录结果到 TaskManager（包含字幕条目和时长）
      try {
        const { default: dataManager } = await import('@/services/dataManager');
        await dataManager.updateTaskWithTranscription(file.currentTaskId, result.entries, result.duration);
      } catch (persistError) {
        console.error('[SubtitleContext] 持久化转录结果失败:', persistError);
        // 不影响用户体验，数据已在内存中
      }

      toast.success(`转录完成！生成 ${result.entries.length} 条字幕`);
    } catch (error) {
      handleError(error, {
        context: { operation: '转录', fileName: file?.name }
      });
      dispatch({
        type: 'UPDATE_FILE',
        payload: { fileId, updates: { transcriptionStatus: 'failed' } }
      });
    }
  }, [state.files, isConfigured, getModel, modelStatus, translationConfig, handleError]);

  // 导出功能
  const exportSRTHandler = useCallback((fileId: string, useTranslation = true) => {
    const file = getFileHandler(fileId);
    if (!file) return '';
    return exportSRT(file.entries, useTranslation);
  }, [getFileHandler]);

  const exportTXTHandler = useCallback((fileId: string, useTranslation = true) => {
    const file = getFileHandler(fileId);
    if (!file) return '';
    return exportTXT(file.entries, useTranslation);
  }, [getFileHandler]);

  const exportBilingualHandler = useCallback((fileId: string) => {
    const file = getFileHandler(fileId);
    if (!file) return '';
    return exportBilingual(file.entries);
  }, [getFileHandler]);

  const getTranslationProgressHandler = useCallback((fileId: string) => {
    const file = getFileHandler(fileId);
    if (!file) return { completed: 0, total: 0 };
    return getTranslationProgress(file.entries);
  }, [getFileHandler]);

  // 加载保存的数据
  React.useEffect(() => {
    const loadSavedData = async () => {
      try {
        if (state.files.length === 0) {
          const filesToLoad = await restoreFiles();
          if (filesToLoad.length > 0) {
            dispatch({ type: 'SET_FILES', payload: filesToLoad });
          }
        }
      } catch (error) {
        handleError(error, {
          context: { operation: '加载保存的数据' },
          showToast: false
        });
      }
    };

    loadSavedData();
  }, [handleError]);

  // 优化 Context value
  const value: SubtitleContextValue = useMemo(() => ({
    ...state,
    loadFromFile: loadFromFileHandler,
    updateEntry: updateEntryHandler,
    clearFile: clearFileHandler,
    clearAllData: clearAllDataHandler,
    exportSRT: exportSRTHandler,
    exportTXT: exportTXTHandler,
    exportBilingual: exportBilingualHandler,
    getTranslationProgress: getTranslationProgressHandler,
    generateNewTaskId: generateNewTaskIdHandler,
    getCurrentTaskId: getCurrentTaskIdHandler,
    getFile: getFileHandler,
    getAllFiles: getAllFilesHandler,
    removeFile: removeFileHandler,
    simulateTranscription: simulateTranscriptionHandler
  }), [
    state,
    loadFromFileHandler,
    updateEntryHandler,
    clearFileHandler,
    clearAllDataHandler,
    exportSRTHandler,
    exportTXTHandler,
    exportBilingualHandler,
    getTranslationProgressHandler,
    generateNewTaskIdHandler,
    getCurrentTaskIdHandler,
    getFileHandler,
    getAllFilesHandler,
    removeFileHandler,
    simulateTranscriptionHandler
  ]);

  return <SubtitleContext.Provider value={value}>{children}</SubtitleContext.Provider>;
};

// 兼容性Hook
export const useSingleSubtitle = (fileId?: string) => {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }

  const currentFile = useMemo(() =>
    fileId
      ? context.files.find(file => file.id === fileId) || null
      : context.files.length > 0 ? context.files[0] : null,
    [fileId, context.files]
  );

  return useMemo(() => ({
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
  }), [currentFile, context]);
};

export const useSubtitle = () => {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }
  return context;
};
