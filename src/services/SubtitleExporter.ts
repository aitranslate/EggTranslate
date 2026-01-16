/**
 * 字幕导出服务
 * 提供基于 taskId 的统一导出功能（SRT、TXT、双语）
 */

import { toSRT, toTXT, toBilingual } from '@/utils/srtParser';
import type { SubtitleEntry } from '@/types';
import dataManager from './dataManager';

/**
 * 导出为 SRT 格式
 * @param entries 字幕条目
 * @param useTranslation 是否使用翻译文本
 * @returns SRT 格式字符串
 * @deprecated 使用 exportTaskSRT(taskId) 代替
 */
export function exportSRT(entries: SubtitleEntry[], useTranslation = true): string {
  return toSRT(entries, useTranslation);
}

/**
 * 导出为 TXT 格式
 * @param entries 字幕条目
 * @param useTranslation 是否使用翻译文本
 * @returns TXT 格式字符串
 * @deprecated 使用 exportTaskTXT(taskId) 代替
 */
export function exportTXT(entries: SubtitleEntry[], useTranslation = true): string {
  return toTXT(entries, useTranslation);
}

/**
 * 导出为双语格式
 * @param entries 字幕条目
 * @returns 双语格式字符串
 * @deprecated 使用 exportTaskBilingual(taskId) 代替
 */
export function exportBilingual(entries: SubtitleEntry[]): string {
  return toBilingual(entries);
}

/**
 * 基于 taskId 导出为 SRT 格式
 * @param taskId 任务 ID
 * @param useTranslation 是否使用翻译文本
 * @returns SRT 格式字符串
 */
export function exportTaskSRT(taskId: string, useTranslation = true): string {
  const task = dataManager.getTaskById(taskId);
  if (!task || !task.subtitle_entries) {
    return '';
  }
  return toSRT(task.subtitle_entries, useTranslation);
}

/**
 * 基于 taskId 导出为 TXT 格式
 * @param taskId 任务 ID
 * @param useTranslation 是否使用翻译文本
 * @returns TXT 格式字符串
 */
export function exportTaskTXT(taskId: string, useTranslation = true): string {
  const task = dataManager.getTaskById(taskId);
  if (!task || !task.subtitle_entries) {
    return '';
  }
  return toTXT(task.subtitle_entries, useTranslation);
}

/**
 * 基于 taskId 导出为双语格式
 * @param taskId 任务 ID
 * @returns 双语格式字符串
 */
export function exportTaskBilingual(taskId: string): string {
  const task = dataManager.getTaskById(taskId);
  if (!task || !task.subtitle_entries) {
    return '';
  }
  return toBilingual(task.subtitle_entries);
}

/**
 * 计算翻译进度
 * @param entries 字幕条目
 * @returns 翻译进度统计
 */
export function getTranslationProgress(entries: SubtitleEntry[]): {
  completed: number;
  total: number;
} {
  const completed = entries.filter(entry => entry.translatedText).length;
  return { completed, total: entries.length };
}
