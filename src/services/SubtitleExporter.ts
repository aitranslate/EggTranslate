/**
 * 字幕导出服务
 * 提供字幕导出功能（SRT、TXT、双语）
 */

import { toSRT, toTXT, toBilingual } from '@/utils/srtParser';
import type { SubtitleEntry } from '@/types';

/**
 * 导出为 SRT 格式
 * @param entries 字幕条目
 * @param useTranslation 是否使用翻译文本
 * @returns SRT 格式字符串
 */
export function exportSRT(entries: SubtitleEntry[], useTranslation = true): string {
  return toSRT(entries, useTranslation);
}

/**
 * 导出为 TXT 格式
 * @param entries 字幕条目
 * @param useTranslation 是否使用翻译文本
 * @returns TXT 格式字符串
 */
export function exportTXT(entries: SubtitleEntry[], useTranslation = true): string {
  return toTXT(entries, useTranslation);
}

/**
 * 导出为双语格式
 * @param entries 字幕条目
 * @returns 双语格式字符串
 */
export function exportBilingual(entries: SubtitleEntry[]): string {
  return toBilingual(entries);
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
