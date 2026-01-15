/**
 * 字幕文件管理 Store
 * 替代原 SubtitleContext，使用 Zustand 管理状态
 */

import { create } from 'zustand';
import { SubtitleFile, SubtitleEntry, TranscriptionStatus, TranscriptionProgressInfo } from '@/types';
import { loadFromFile, removeFile as removeFileData, clearAllData as clearAllFileData, restoreFiles, type SubtitleFile as SubtitleFileType } from '@/services/SubtitleFileManager';
import { runTranscriptionPipeline } from '@/services/transcriptionPipeline';
import { TranslationOrchestrator } from '@/services/TranslationOrchestrator';
import dataManager from '@/services/dataManager';
import { generateStableFileId } from '@/utils/taskIdGenerator';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { toAppError } from '@/utils/errors';
import { TRANSCRIPTION_PROGRESS } from '@/constants/transcription';
import toast from 'react-hot-toast';
import localforage from 'localforage';

// ============================================
// 类型定义
// ============================================

interface SubtitleStore {
  // State
  files: SubtitleFile[];
  selectedFileId: string | null;

  // Actions - 文件操作
  loadFiles: () => Promise<void>;
  addFile: (file: File) => Promise<string>;
  removeFile: (fileId: string) => Promise<void>;
  selectFile: (fileId: string) => void;
  clearAll: () => Promise<void>;

  // Actions - 字幕操作
  updateEntry: (fileId: string, entryId: number, text: string, translatedText?: string) => Promise<void>;
  batchUpdateEntries: (fileId: string, updates: Array<{id: number, text: string, translatedText?: string}>) => Promise<void>;

  // Actions - 转录
  startTranscription: (fileId: string) => Promise<void>;
  updateTranscriptionProgress: (fileId: string, progress: TranscriptionProgressInfo) => void;

  // Actions - 翻译
  startTranslation: (fileId: string) => Promise<void>;
  updateTranslationProgress: (fileId: string, completed: number, total: number, tokens: number) => void;

  // Getters
  getFile: (fileId: string) => SubtitleFile | undefined;
  getAllFiles: () => SubtitleFile[];
  getTranslationProgress: (fileId: string) => { completed: number; total: number };
}

// ============================================
// 持久化工具
// ============================================

let persistTimeout: NodeJS.Timeout | null = null;

/**
 * 调度持久化操作（防抖 5 秒）
 */
const schedulePersist = (files: SubtitleFile[]) => {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
  }

  persistTimeout = setTimeout(async () => {
    try {
      // 转换为 BatchTasks 格式
      const batchTasks = {
        tasks: files.map(file => {
          const task = dataManager.getTaskById(file.currentTaskId);
          return task || {
            taskId: file.currentTaskId,
            subtitle_entries: file.entries,
            subtitle_filename: file.name,
            translation_progress: {
              completed: file.entries.filter(e => e.translatedText).length,
              total: file.entries.length,
              tokens: file.transcriptionProgress?.tokens || 0,
              status: 'idle' as const
            },
            index: files.indexOf(file),
            fileType: file.fileType,
            fileSize: file.fileSize,
            duration: file.duration
          };
        })
      };

      await localforage.setItem('batch_tasks', batchTasks);
    } catch (error) {
      const appError = toAppError(error, '持久化失败');
      console.error('[subtitleStore]', appError.message, appError);
    }
  }, 5000);
};

/**
 * 强制立即持久化
 */
const forcePersist = async (files: SubtitleFile[]) => {
  if (persistTimeout) {
    clearTimeout(persistTimeout);
    persistTimeout = null;
  }
  await schedulePersist(files);
  // 等待 setTimeout 执行
  await new Promise(resolve => setTimeout(resolve, 100));
};

// 页面关闭前强制持久化
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    const files = useSubtitleStore.getState().files;
    localforage.setItem('batch_tasks', {
      tasks: files.map(file => ({
        taskId: file.currentTaskId,
        subtitle_entries: file.entries,
        subtitle_filename: file.name,
        translation_progress: {
          completed: file.entries.filter(e => e.translatedText).length,
          total: file.entries.length,
          tokens: file.transcriptionProgress?.tokens || 0,
          status: 'idle' as const
        },
        index: 0,
        fileType: file.fileType,
        fileSize: file.fileSize,
        duration: file.duration
      }))
    }).catch(console.error);
  });
}

// ============================================
// Store 创建
// ============================================

export const useSubtitleStore = create<SubtitleStore>((set, get) => ({
  // Initial State
  files: [],
  selectedFileId: null,

  // ========================================
  // 文件操作
  // ========================================

  /**
   * 从 IndexedDB 加载文件列表
   */
  loadFiles: async () => {
    try {
      const files = await restoreFiles();
      set({ files });
    } catch (error) {
      const appError = toAppError(error, '加载文件失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error('加载文件失败');
    }
  },

  /**
   * 添加新文件
   */
  addFile: async (file: File) => {
    try {
      const newFile = await loadFromFile(file, { existingFilesCount: get().files.length });
      set((state) => ({
        files: [...state.files, newFile]
      }));
      schedulePersist(get().files);
      return newFile.id;
    } catch (error) {
      const appError = toAppError(error, '文件加载失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error(`文件加载失败: ${appError.message}`);
      throw error;
    }
  },

  /**
   * 删除文件
   */
  removeFile: async (fileId: string) => {
    const file = get().getFile(fileId);
    if (!file) return;

    try {
      set((state) => ({
        files: state.files.filter(f => f.id !== fileId),
        selectedFileId: state.selectedFileId === fileId ? null : state.selectedFileId
      }));

      await removeFileData(file);
      schedulePersist(get().files);
      toast.success('文件已删除');
    } catch (error) {
      const appError = toAppError(error, '删除文件失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error('删除文件失败');
    }
  },

  /**
   * 选择文件
   */
  selectFile: (fileId: string) => {
    set({ selectedFileId: fileId });
  },

  /**
   * 清空所有数据
   */
  clearAll: async () => {
    try {
      set({ files: [], selectedFileId: null });
      await clearAllFileData();
      window.dispatchEvent(new CustomEvent('taskCleared'));
    } catch (error) {
      const appError = toAppError(error, '清空数据失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error('清空数据失败');
    }
  },

  // ========================================
  // 字幕操作
  // ========================================

  /**
   * 更新单条字幕
   */
  updateEntry: async (fileId: string, entryId: number, text: string, translatedText?: string) => {
    // 更新 dataManager 内存
    const file = get().getFile(fileId);
    if (file) {
      dataManager.updateTaskSubtitleEntryInMemory(file.currentTaskId, entryId, text, translatedText);
    }

    // 更新 store
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              entries: f.entries.map(e =>
                e.id === entryId
                  ? { ...e, text, translatedText: translatedText ?? e.translatedText }
                  : e
              )
            }
          : f
      )
    }));

    schedulePersist(get().files);
  },

  /**
   * 批量更新字幕
   */
  batchUpdateEntries: async (fileId: string, updates: Array<{id: number, text: string, translatedText?: string}>) => {
    const file = get().getFile(fileId);
    if (file) {
      await dataManager.batchUpdateTaskSubtitleEntries(file.currentTaskId, updates);
    }

    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              entries: f.entries.map(e => {
                const update = updates.find(u => u.id === e.id);
                return update ? { ...e, text: update.text, translatedText: update.translatedText ?? e.translatedText } : e;
              })
            }
          : f
      )
    }));

    schedulePersist(get().files);
  },

  // ========================================
  // 转录操作
  // ========================================

  /**
   * 开始转录
   */
  startTranscription: async (fileId: string) => {
    const file = get().getFile(fileId);
    if (!file || file.type === 'srt') return;
    if (!file.fileRef) {
      toast.error('文件引用丢失，请重新上传');
      return;
    }

    // 获取转录配置
    const transcriptionConfig = useTranscriptionStore.getState().config;
    const model = useTranscriptionStore.getState().getModel();

    if (!model || useTranscriptionStore.getState().modelStatus !== 'loaded') {
      toast.error('请先加载转录模型');
      return;
    }

    // 获取翻译配置（用于 LLM 组句）
    const translationConfig = useTranslationConfigStore.getState().config;
    if (!useTranslationConfigStore.getState().isConfigured) {
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
          sourceLanguage: translationConfig.sourceLanguage,
          threadCount: translationConfig.threadCount
        },
        {
          onDecoding: () => {
            get().updateTranscriptionProgress(fileId, { status: 'decoding' } as TranscriptionStatus);
          },
          onChunking: (duration) => {
            get().updateTranscriptionProgress(fileId, {
              status: 'chunking',
              duration
            } as TranscriptionProgressInfo);
          },
          onTranscribing: (current, total, percent) => {
            totalChunks = total;
            get().updateTranscriptionProgress(fileId, {
              percent,
              currentChunk: current,
              totalChunks: total
            });
          },
          onLLMMerging: () => {
            get().updateTranscriptionProgress(fileId, {
              percent: TRANSCRIPTION_PROGRESS.LLM_PROGRESS_START,
              llmBatch: 0,
              totalLlmBatches: 0
            });
          },
          onLLMProgress: (completed, total, percent, tokens) => {
            dataManager.updateTaskTranslationProgressInMemory(file.currentTaskId, { tokens });
            get().updateTranscriptionProgress(fileId, {
              percent,
              currentChunk: totalChunks,
              totalChunks: totalChunks,
              llmBatch: completed,
              totalLlmBatches: total,
              tokens
            });
          }
        }
      );

      // 持久化转录结果
      await dataManager.updateTaskWithTranscription(file.currentTaskId, result.entries, result.duration, result.tokensUsed);

      // 完成转录
      get().updateTranscriptionProgress(fileId, {
        status: 'completed',
        percent: 100,
        currentChunk: result.totalChunks,
        totalChunks: result.totalChunks,
        tokens: result.tokensUsed
      });

      // 更新文件数据
      set((state) => ({
        files: state.files.map(f =>
          f.id === fileId
            ? { ...f, entries: result.entries, duration: result.duration }
            : f
        )
      }));

      await forcePersist(get().files);
      toast.success(`转录完成！生成 ${result.entries.length} 条字幕`);
    } catch (error) {
      const appError = toAppError(error, '转录失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error(`转录失败: ${appError.message}`);

      get().updateTranscriptionProgress(fileId, { status: 'failed' } as TranscriptionStatus);
    }
  },

  /**
   * 更新转录进度
   */
  updateTranscriptionProgress: (fileId: string, progress: TranscriptionProgressInfo) => {
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              transcriptionStatus: (progress.status as TranscriptionStatus) || f.transcriptionStatus,
              transcriptionProgress: {
                ...f.transcriptionProgress,
                ...progress
              }
            }
          : f
      )
    }));
  },

  // ========================================
  // 翻译操作
  // ========================================

  /**
   * 开始翻译
   */
  startTranslation: async (fileId: string) => {
    const file = get().getFile(fileId);
    if (!file) return;

    const config = useTranslationConfigStore.getState().config;
    if (!useTranslationConfigStore.getState().isConfigured) {
      toast.error('请先配置翻译 API');
      return;
    }

    // 设置全局翻译状态
    useTranslationConfigStore.getState().startTranslation();

    try {
      const orchestrator = new TranslationOrchestrator(config, {
        onProgress: async (current, total, tokens) => {
          get().updateTranslationProgress(fileId, current, total, tokens);
        }
      });

      const { entries: translatedEntries, totalTokens } = await orchestrator.translate(file.entries);

      // 更新文件
      set((state) => ({
        files: state.files.map(f =>
          f.id === fileId
            ? { ...f, entries: translatedEntries }
            : f
        )
      }));

      // 完成翻译
      await dataManager.completeTask(file.currentTaskId, totalTokens);
      await forcePersist(get().files);
      toast.success('翻译完成！');
    } catch (error) {
      const appError = toAppError(error, '翻译失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error(`翻译失败: ${appError.message}`);
    } finally {
      useTranslationConfigStore.getState().stopTranslation();
    }
  },

  /**
   * 更新翻译进度
   */
  updateTranslationProgress: (fileId: string, completed: number, total: number, tokens: number) => {
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              entries: f.entries.map((e, i) =>
                i < completed
                  ? { ...e, translatedText: e.translatedText || '翻译中...' }
                  : e
              )
            }
          : f
      )
    }));
  },

  // ========================================
  // Getters
  // ========================================

  /**
   * 获取单个文件
   */
  getFile: (fileId: string) => {
    return get().files.find(f => f.id === fileId);
  },

  /**
   * 获取所有文件
   */
  getAllFiles: () => {
    return get().files;
  },

  /**
   * 获取翻译进度
   */
  getTranslationProgress: (fileId: string) => {
    const file = get().getFile(fileId);
    if (!file) return { completed: 0, total: 0 };

    const translated = file.entries.filter(e => e.translatedText).length;
    return {
      completed: translated,
      total: file.entries.length
    };
  }
}));

// ============================================
// 导出辅助 hooks
// ============================================

/**
 * 获取文件列表
 */
export const useFiles = () => useSubtitleStore((state) => state.files);

/**
 * 获取选中文件
 */
export const useSelectedFile = () => {
  const selectedFileId = useSubtitleStore((state) => state.selectedFileId);
  const files = useSubtitleStore((state) => state.files);
  return selectedFileId ? files.find(f => f.id === selectedFileId) : null;
};

/**
 * 获取单个文件
 */
export const useFile = (fileId: string) => {
  return useSubtitleStore((state) => state.files.find(f => f.id === fileId));
};

// ============================================
// 循环导入解决（延迟导入）
// ============================================

// 为了避免循环导入，在文件底部导入其他 store
import { useTranscriptionStore } from './transcriptionStore';
import { useTranslationConfigStore } from './translationConfigStore';
