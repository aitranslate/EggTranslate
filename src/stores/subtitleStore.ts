/**
 * 字幕文件管理 Store
 * 替代原 SubtitleContext，使用 Zustand 管理状态
 */

import { create } from 'zustand';
import { SubtitleFile, SubtitleEntry, TranscriptionStatus, TranscriptionProgressInfo, SubtitleFileMetadata } from '@/types';
import { loadFromFile, removeFile as removeFileData, clearAllData as clearAllFileData, restoreFiles, restoreFilesWithEntries, type SubtitleFile as SubtitleFileType } from '@/services/SubtitleFileManager';
import { runTranscriptionPipeline } from '@/services/transcriptionPipeline';
import { executeTranslation } from '@/services/TranslationOrchestrator';
import dataManager from '@/services/dataManager';
import { generateStableFileId } from '@/utils/taskIdGenerator';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { toAppError } from '@/utils/errors';
import { TRANSCRIPTION_PROGRESS } from '@/constants/transcription';
import toast from 'react-hot-toast';
import localforage from 'localforage';

// ============================================
// 循环导入解决
// ============================================

// 注意：这些 store 必须在使用前导入，避免运行时 undefined
// TypeScript 的类型检查允许延迟导入，但运行时需要实际可用的引用
import { useTranscriptionStore } from './transcriptionStore';
import { useTranslationConfigStore } from './translationConfigStore';

// ============================================
// 类型定义
// ============================================

interface SubtitleStore {
  // State
  files: SubtitleFileMetadata[];  // ✅ Phase 3: 改为轻量级元数据数组
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
  updateTranscriptionStatus: (fileId: string, status: TranscriptionStatus) => void;

  // Actions - 翻译
  startTranslation: (fileId: string) => Promise<void>;
  updateTranslationProgress: (fileId: string, completed: number, total: number) => void;

  // ============================================
  // Tokens 管理（新增）
  // ============================================

  /**
   * 添加 tokens（转录或翻译）
   * @param fileId - 文件 ID
   * @param tokens - 新增的 tokens（会累加到现有值）
   */
  addTokens: (fileId: string, tokens: number) => void;

  /**
   * 设置 tokens（用于从 DataManager 恢复）
   * @param fileId - 文件 ID
   * @param tokens - 总 tokens（覆盖现有值）
   */
  setTokens: (fileId: string, tokens: number) => void;

  /**
   * 获取文件的 tokens
   */
  getTokens: (fileId: string) => number;

  // ============================================
  // 元数据管理方法（Phase 1-2）
  // ============================================

  /**
   * 从 DataManager 延迟加载文件的完整字幕条目
   * 用于编辑器等需要完整数据的场景
   */
  getFileEntries: (fileId: string) => SubtitleEntry[];

  /**
   * 从 DataManager 更新文件的统计信息
   * 用于翻译/转录完成后更新缓存的统计数据
   * @param skipTokensUpdate - 跳过 tokens 更新（避免覆盖已更新的值）
   */
  updateFileStatistics: (fileId: string, skipTokensUpdate?: boolean) => void;

  // Getters
  getFile: (fileId: string) => SubtitleFileMetadata | undefined;
  getAllFiles: () => SubtitleFileMetadata[];
  getTranslationProgress: (fileId: string) => { completed: number; total: number };
}

// ============================================
// Phase 3: 持久化由 DataManager 统一管理
// ============================================

// 页面关闭前强制持久化所有数据（委托给 DataManager）
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    dataManager.forcePersistAllData().catch(console.error);
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

      // ✅ 从 DataManager 恢复 tokensUsed
      const filesWithTokens = files.map(file => {
        const task = dataManager.getTaskById(file.taskId);
        return {
          ...file,
          tokensUsed: task?.translation_progress?.tokens || 0
        };
      });

      set({ files: filesWithTokens });
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
      // ✅ Phase 3: newFile 现在是 SubtitleFileMetadata
      set((state) => ({
        files: [...state.files, newFile]
      }));
      // ✅ Phase 3: 移除 schedulePersist，DataManager 负责持久化
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

      // ✅ Phase 3: removeFileData 现在接受 SubtitleFileMetadata
      await removeFileData(file);
      // ✅ Phase 3: 移除 schedulePersist，DataManager 负责持久化
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
    const file = get().getFile(fileId);
    if (!file) return;

    // 更新 DataManager 内存
    dataManager.updateTaskSubtitleEntryInMemory(file.taskId, entryId, text, translatedText);

    // ✅ Phase 3: 更新统计信息，而不是 entries 数组
    get().updateFileStatistics(fileId);

    // ✅ Phase 3: 移除 schedulePersist，DataManager 负责持久化
  },

  /**
   * 批量更新字幕
   */
  batchUpdateEntries: async (fileId: string, updates: Array<{id: number, text: string, translatedText?: string}>) => {
    const file = get().getFile(fileId);
    if (!file) return;

    await dataManager.batchUpdateTaskSubtitleEntries(file.taskId, updates);

    // ✅ Phase 3: 更新统计信息，而不是 entries 数组
    get().updateFileStatistics(fileId);

    // ✅ Phase 3: 移除 schedulePersist，DataManager 负责持久化
  },

  // ========================================
  // 转录操作
  // ========================================

  /**
   * 开始转录
   */
  startTranscription: async (fileId: string) => {
    const file = get().getFile(fileId);
    if (!file || file.fileType === 'srt') return;

    // ✅ Phase 3: 从 DataManager 获取 fileRef（因为元数据中没有）
    const task = dataManager.getTaskById(file.taskId);
    // 注意：fileRef 存储在别处，这里需要特殊处理
    // 暂时跳过 fileRef 检查，让转录流程处理

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

      // ✅ Phase 3: 从 DataManager 获取 fileRef
      // 由于 fileRef 不在元数据中，这里暂时使用一个临时方案
      // TODO: 重构 fileRef 的存储方式
      const fileRef = (file as any).fileRef; // 临时访问
      if (!fileRef) {
        toast.error('文件引用丢失，请重新上传');
        return;
      }

      const result = await runTranscriptionPipeline(
        fileRef,
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
            get().updateTranscriptionStatus(fileId, 'decoding');
          },
          onChunking: (duration) => {
            get().updateTranscriptionStatus(fileId, 'chunking');
          },
          onTranscribing: (current, total, percent) => {
            totalChunks = total;
            get().updateTranscriptionStatus(fileId, 'transcribing');
            get().updateTranscriptionProgress(fileId, {
              percent,
              currentChunk: current,
              totalChunks: total
            });
          },
          onLLMMerging: () => {
            get().updateTranscriptionStatus(fileId, 'llm_merging');
            get().updateTranscriptionProgress(fileId, {
              percent: TRANSCRIPTION_PROGRESS.LLM_PROGRESS_START,
              llmBatch: 0,
              totalLlmBatches: 0
            });
          },
          onLLMProgress: (completed, total, percent, cumulativeTokens) => {
            // ✅ Pipeline 层已经计算了累积总量，直接使用
            dataManager.updateTaskTranslationProgressInMemory(file.taskId, { tokens: cumulativeTokens });
            get().updateTranscriptionProgress(fileId, {
              percent,
              currentChunk: totalChunks,
              totalChunks: totalChunks,
              llmBatch: completed,
              totalLlmBatches: total,
              tokens: cumulativeTokens
            });
          }
        }
      );

      // 持久化转录结果
      await dataManager.updateTaskWithTranscription(file.taskId, result.entries, result.duration, result.tokensUsed);

      // 完成转录
      get().updateTranscriptionStatus(fileId, 'completed');
      get().updateTranscriptionProgress(fileId, {
        percent: 100,
        currentChunk: result.totalChunks,
        totalChunks: result.totalChunks,
        tokens: result.tokensUsed
      });

      // ✅ Phase 3: 更新统计信息（不包括 tokens，因为上面已经设置过了）
      get().updateFileStatistics(fileId, true);  // skipTokensUpdate = true

      // ✅ Phase 3: 移除 forcePersist，DataManager 负责持久化
      toast.success(`转录完成！生成 ${result.entries.length} 条字幕`);
    } catch (error) {
      const appError = toAppError(error, '转录失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error(`转录失败: ${appError.message}`);

      get().updateTranscriptionStatus(fileId, 'failed');
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
              transcriptionProgress: {
                ...f.transcriptionProgress,
                ...progress
              }
            }
          : f
      )
    }));
  },

  /**
   * 更新转录状态
   */
  updateTranscriptionStatus: (fileId: string, status: TranscriptionStatus) => {
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              transcriptionStatus: status
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

    const translationConfigStore = useTranslationConfigStore.getState();
    const config = translationConfigStore.config;
    if (!translationConfigStore.isConfigured) {
      toast.error('请先配置翻译 API');
      return;
    }

    // 设置全局翻译状态
    const controller = await translationConfigStore.startTranslation();

    try {
      // ✅ Phase 3: 从 DataManager 获取完整 entries
      const task = dataManager.getTaskById(file.taskId);
      const entries = task?.subtitle_entries || [];

      await executeTranslation(
        {
          entries,
          filename: file.name,
          config: {
            batchSize: config.batchSize,
            contextBefore: config.contextBefore,
            contextAfter: config.contextAfter,
            threadCount: config.threadCount
          },
          controller,
          taskId: file.taskId
        },
        {
          translateBatch: translationConfigStore.translateBatch,
          updateEntry: async (id: number, text: string, translatedText: string) => {
            await get().updateEntry(fileId, id, text, translatedText);
          },
          updateProgress: async (current: number, total: number, phase: 'direct' | 'completed', status: string, taskId: string, newTokens?: number) => {
            // 调用 TranslationService.updateProgress（它会累加 tokens 并更新 DataManager）
            await translationConfigStore.updateProgress(current, total, phase, status, taskId, newTokens);

            // ✅ 同步更新 Store 的 transcriptionProgress.tokens（从 DataManager 读取最新值）
            if (newTokens !== undefined) {
              const task = dataManager.getTaskById(file.taskId);
              const latestTokens = task?.translation_progress?.tokens || 0;

              get().updateTranscriptionProgress(fileId, {
                ...get().getFile(fileId)?.transcriptionProgress,
                tokens: latestTokens
              });
            }
          },
          getRelevantTerms: (batchText: string, before: string, after: string) => {
            // 简化版本 - 实际的术语提取应该在需要时实现
            return [];
          }
        }
      );

      // 完成翻译
      await dataManager.completeTask(file.taskId, translationConfigStore.tokensUsed || 0);

      // ✅ 同步 DataManager 中的 tokens（翻译完成后需要同步，因为 TranslationService 也会更新）
      get().updateFileStatistics(fileId, false);  // 不跳过 tokens 更新

      // ✅ Phase 3: 移除 forcePersist，DataManager 负责持久化
      toast.success('翻译完成！');
    } catch (error) {
      const appError = toAppError(error, '翻译失败');
      console.error('[subtitleStore]', appError.message, appError);
      toast.error(`翻译失败: ${appError.message}`);
    } finally {
      translationConfigStore.stopTranslation();
    }
  },

  /**
   * 更新翻译进度
   */
  updateTranslationProgress: (fileId: string, completed: number, total: number) => {
    // ✅ Phase 3: 不再直接更新 entries 数组
    // 进度通过 DataManager 更新，需要时通过 getFileEntries 获取
    // 这里只更新统计信息的缓存
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              translatedCount: completed,
              entryCount: total
            }
          : f
      )
    }));
  },

  // ========================================
  // Tokens 管理
  // ========================================

  /**
   * 添加 tokens（转录或翻译）
   */
  addTokens: (fileId: string, tokens: number) => {
    if (tokens <= 0) return;

    // 先获取当前 file（此时是旧值）
    const file = get().getFile(fileId);

    // 同步到 DataManager（使用旧值计算）
    if (file) {
      dataManager.updateTaskTranslationProgressInMemory(
        file.taskId,
        { tokens: file.tokensUsed + tokens }
      );
    }

    // 再更新 Store
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? { ...f, tokensUsed: f.tokensUsed + tokens }
          : f
      )
    }));
  },

  /**
   * 设置 tokens（用于从 DataManager 恢复）
   */
  setTokens: (fileId: string, tokens: number) => {
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? { ...f, tokensUsed: tokens }
          : f
      )
    }));
  },

  /**
   * 获取文件的 tokens
   */
  getTokens: (fileId: string) => {
    return get().getFile(fileId)?.tokensUsed || 0;
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

    // ✅ Phase 3: 使用缓存的统计信息
    return {
      completed: file.translatedCount || 0,
      total: file.entryCount || 0
    };
  },

  // ========================================
  // 元数据管理方法实现（Phase 1-3）
  // ========================================

  /**
   * 从 DataManager 延迟加载文件的完整字幕条目
   * 用于编辑器等需要完整数据的场景
   */
  getFileEntries: (fileId: string) => {
    const file = get().getFile(fileId);
    if (!file) return [];

    // 从 DataManager 获取完整的 subtitle_entries
    const task = dataManager.getTaskById(file.taskId);
    return task?.subtitle_entries || [];
  },

  /**
   * 从 DataManager 更新文件的统计信息
   * 用于翻译/转录完成后更新缓存的统计数据
   * @param skipTokensUpdate - 跳过 tokens 更新（避免覆盖已更新的值）
   */
  updateFileStatistics: (fileId: string, skipTokensUpdate = false) => {
    const file = get().getFile(fileId);
    if (!file) return;

    // 从 DataManager 获取最新数据
    const task = dataManager.getTaskById(file.taskId);
    if (!task) return;

    // 重新计算统计信息（从 DataManager 的最新数据）
    const entryCount = task.subtitle_entries?.length || 0;
    const translatedCount = task.subtitle_entries?.filter(e => e.translatedText).length || 0;

    // 更新 Store 中的元数据
    set((state) => ({
      files: state.files.map(f =>
        f.id === fileId
          ? {
              ...f,
              entryCount,
              translatedCount,
              transcriptionProgress: task.translation_progress && !skipTokensUpdate
                ? {
                    ...f.transcriptionProgress,
                    percent: task.translation_progress.total > 0
                      ? Math.round((task.translation_progress.completed / task.translation_progress.total) * 100)
                      : 0,
                    tokens: task.translation_progress.tokens
                  }
                : f.transcriptionProgress
            }
          : f
      )
    }));
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
