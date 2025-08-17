import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { SubtitleEntry } from '@/types';
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

export const SubtitleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(subtitleReducer, initialState);

  const loadFromFile = useCallback(async (file: File) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const content = await file.text();
      const entries = parseSRT(content);
      
      // 在导入文件时创建批处理任务
      const index = state.files.length; // 在列表中的位置
      const taskId = await dataManager.createNewTask(file.name, entries, index);
      
      // 使用稳定的文件ID生成方式
      const fileId = generateStableFileId(taskId);
      
      const newFile: SubtitleFile = {
        id: fileId,
        name: file.name,
        size: 0, // 不再使用文件大小
        lastModified: file.lastModified,
        entries,
        filename: file.name,
        currentTaskId: taskId
      };
      
      dispatch({ type: 'ADD_FILE', payload: newFile });
      
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
      // 我们需要在dataManager中添加一个新的方法
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
              id: generateStableFileId(task.taskId), // 使用稳定的ID生成方式
              name: task.subtitle_filename,
              size: 0, // 大小信息在任务中没有保存
              lastModified: Date.now(), // 修改时间使用当前时间
              entries: task.subtitle_entries,
              filename: task.subtitle_filename,
              currentTaskId: task.taskId
            }));
            
            // 使用 SET_FILES 批量设置文件，避免重复添加检查
            dispatch({ type: 'SET_FILES', payload: filesToLoad });
          }
        }
      } catch (error) {
        console.error('加载保存的数据失败:', error);
      }
    };

    loadSavedData();
  }, []); // 依赖数组保持为空，只在组件挂载时执行一次

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
    removeFile
  };

  return <SubtitleContext.Provider value={value}>{children}</SubtitleContext.Provider>;
};

// 兼容性Hook，为单个文件提供旧的接口
export const useSingleSubtitle = () => {
  const context = useContext(SubtitleContext);
  if (!context) {
    throw new Error('useSubtitle must be used within a SubtitleProvider');
  }

  const currentFile = context.files.length > 0 ? context.files[0] : null;

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