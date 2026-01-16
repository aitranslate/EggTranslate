/**
 * 翻译编排服务
 * 负责协调整个翻译流程，包括批处理、进度更新、历史记录保存
 */

import type { SubtitleEntry } from '@/types';
import dataManager from '@/services/dataManager';
import toast from 'react-hot-toast';
import { API_CONSTANTS } from '@/constants/api';
import { toAppError } from '@/utils/errors';

export interface BatchInfo {
  batchIndex: number;
  untranslatedEntries: SubtitleEntry[];
  textsToTranslate: string[];
  contextBeforeTexts: string;
  contextAfterTexts: string;
  termsText: string;
}

export interface TranslationConfig {
  batchSize: number;
  contextBefore: number;
  contextAfter: number;
  threadCount: number;
}

export interface TranslationCallbacks {
  translateBatch: (
    texts: string[],
    signal?: AbortSignal,
    contextBefore?: string,
    contextAfter?: string,
    terms?: string
  ) => Promise<{ translations: Record<string, any>; tokensUsed: number }>;
  updateEntry: (id: number, text: string, translatedText: string) => Promise<void>;
  updateProgress: (
    current: number,
    total: number,
    phase: 'direct' | 'completed',
    status: string,
    taskId: string,
    newTokens?: number  // 新增参数：用于传递本次翻译使用的 tokens
  ) => Promise<void>;
  getRelevantTerms: (batchText: string, before: string, after: string) => any[];
}

export interface TranslationOptions {
  entries: SubtitleEntry[];
  filename: string;
  config: TranslationConfig;
  controller: AbortController;
  taskId: string;
}

/**
 * 计算实际翻译进度
 */
export function calculateActualProgress(entries: SubtitleEntry[]): {
  completed: number;
  total: number;
} {
  const completed = entries.filter(
    entry => entry.translatedText && entry.translatedText.trim() !== ''
  ).length;
  return { completed, total: entries.length };
}

/**
 * 创建翻译批次
 */
export function createTranslationBatches(
  entries: SubtitleEntry[],
  config: TranslationConfig,
  callbacks: TranslationCallbacks
): BatchInfo[] {
  const { batchSize, contextBefore, contextAfter } = config;
  const totalBatches = Math.ceil(entries.length / batchSize);
  const allBatches: BatchInfo[] = [];

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const startIdx = batchIndex * batchSize;
    const endIdx = Math.min(startIdx + batchSize, entries.length);
    const batchEntries = entries.slice(startIdx, endIdx);

    const untranslatedEntries = batchEntries.filter(
      entry => !entry.translatedText || !entry.translatedText.trim()
    );

    if (untranslatedEntries.length === 0) {
      continue;
    }

    const contextBeforeTexts = entries
      .slice(Math.max(0, startIdx - contextBefore), startIdx)
      .map(e => e.text)
      .join('\n');

    const contextAfterTexts = entries
      .slice(endIdx, Math.min(entries.length, endIdx + contextAfter))
      .map(e => e.text)
      .join('\n');

    const batchText = untranslatedEntries.map(e => e.text).join(' ');
    const relevantTerms = callbacks.getRelevantTerms(
      batchText,
      contextBeforeTexts,
      contextAfterTexts
    );
    const termsText = relevantTerms
      .map(term => `${term.original} -> ${term.translation}`)
      .join('\n');

    const textsToTranslate = untranslatedEntries.map(e => e.text);

    allBatches.push({
      batchIndex,
      untranslatedEntries,
      textsToTranslate,
      contextBeforeTexts,
      contextAfterTexts,
      termsText
    });
  }

  return allBatches;
}

/**
 * 执行单个翻译批次
 */
export async function processBatch(
  batch: BatchInfo,
  controller: AbortController,
  callbacks: TranslationCallbacks,
  taskId: string,
  updateProgressCallback: (completed: number, tokensUsed?: number) => Promise<void>
): Promise<{ batchIndex: number; success: boolean; error?: any }> {
  try {
    const translationResult = await callbacks.translateBatch(
      batch.textsToTranslate,
      controller.signal,
      batch.contextBeforeTexts,
      batch.contextAfterTexts,
      batch.termsText
    );

    const batchUpdates: { id: number; text: string; translatedText: string }[] = [];

    for (const [key, value] of Object.entries(translationResult.translations)) {
      const resultIndex = parseInt(key) - 1;
      const untranslatedEntry = batch.untranslatedEntries[resultIndex];

      if (untranslatedEntry && typeof value === 'object' && value.direct) {
        batchUpdates.push({
          id: untranslatedEntry.id,
          text: untranslatedEntry.text,
          translatedText: value.direct
        });
      }
    }

    if (batchUpdates.length > 0) {
      await dataManager.batchUpdateTaskSubtitleEntries(taskId, batchUpdates);

      for (const update of batchUpdates) {
        await callbacks.updateEntry(update.id, update.text, update.translatedText);
      }

      // 传递本次翻译使用的 tokens
      await updateProgressCallback(batchUpdates.length, translationResult.tokensUsed);
    }

    return { batchIndex: batch.batchIndex, success: true };
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      const appError = toAppError(error);
      console.error(`[TranslationOrchestrator] 批次 ${batch.batchIndex + 1} 翻译失败:`, appError.message);
      toast.error(`批次 ${batch.batchIndex + 1} 翻译失败`);
    }
    return { batchIndex: batch.batchIndex, success: false, error };
  }
}

/**
 * 执行翻译流程
 */
export async function executeTranslation(
  options: TranslationOptions,
  callbacks: TranslationCallbacks
): Promise<void> {
  const { entries, filename, config, controller, taskId } = options;

  // 创建任务
  await dataManager.createNewTask(filename, entries, 0);

  const initialProgress = calculateActualProgress(entries);
  const startBatchIndex = Math.floor(initialProgress.completed / config.batchSize);

  let currentCompletedCount = initialProgress.completed;

  await callbacks.updateProgress(
    currentCompletedCount,
    entries.length,
    'direct',
    `准备翻译... (已完成: ${currentCompletedCount}/${entries.length})`,
    taskId
  );

  // 创建批次
  const allBatches = createTranslationBatches(entries, config, callbacks);

  // 过滤出需要翻译的批次
  const batchesToTranslate = allBatches.filter(
    batch => batch.batchIndex >= startBatchIndex
  );

  // 更新进度的回调
  const updateProgressCallback = async (completedEntries: number, tokensUsed?: number) => {
    currentCompletedCount += completedEntries;
    const percentage = Math.round((currentCompletedCount / entries.length) * 100);
    const statusText = `翻译中... (${currentCompletedCount}/${entries.length}) ${percentage}%`;
    await callbacks.updateProgress(
      currentCompletedCount,
      entries.length,
      'direct',
      statusText,
      taskId,
      tokensUsed  // 传递本次翻译使用的 tokens
    );
  };

  // 按线程数分组处理批次
  for (let i = 0; i < batchesToTranslate.length; i += config.threadCount) {
    const currentBatchGroup = batchesToTranslate.slice(i, i + config.threadCount);

    const batchPromises = currentBatchGroup.map(batch =>
      processBatch(batch, controller, callbacks, taskId, updateProgressCallback)
    );

    await Promise.all(batchPromises);
  }

  // 完成翻译
  const finalProgress = calculateActualProgress(entries);
  const statusText =
    finalProgress.completed === entries.length ? '翻译完成' : '部分翻译';

  await callbacks.updateProgress(
    finalProgress.completed,
    entries.length,
    'completed',
    statusText,
    taskId
  );
}

/**
 * 保存翻译历史记录
 */
export async function saveTranslationHistory(
  taskId: string,
  filename: string,
  tokensUsed: number,
  addHistoryEntry: (entry: any) => Promise<void>
): Promise<void> {
  try {
    await new Promise(resolve => setTimeout(resolve, API_CONSTANTS.HISTORY_SAVE_DELAY_MS));

    const batchTasks = dataManager.getBatchTasks();
    const currentTask = batchTasks.tasks.find(t => t.taskId === taskId);

    if (currentTask) {
      const finalTokens = currentTask.translation_progress?.tokens || tokensUsed || 0;
      const actualCompleted =
        currentTask.subtitle_entries?.filter(
          (entry: SubtitleEntry) =>
            entry.translatedText && entry.translatedText.trim() !== ''
        ).length || 0;

      if (actualCompleted > 0) {
        await addHistoryEntry({
          taskId,
          filename,
          completedCount: actualCompleted,
          totalTokens: finalTokens,
          current_translation_task: {
            taskId: currentTask.taskId,
            subtitle_entries: currentTask.subtitle_entries,
            subtitle_filename: currentTask.subtitle_filename,
            translation_progress: currentTask.translation_progress
          }
        });
      }
    }
  } catch (error) {
    const appError = toAppError(error, '保存历史记录失败');
    console.error('[TranslationOrchestrator]', appError.message, appError);
  }
}
