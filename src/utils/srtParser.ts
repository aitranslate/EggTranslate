import SRTParser2 from 'srt-parser-2';
import { SubtitleEntry } from '@/types';

const parser = new SRTParser2();

export const parseSRT = (srtContent: string): SubtitleEntry[] => {
  try {
    const parsed = parser.fromSrt(srtContent);
    return parsed.map((item: any, index: number) => ({
      id: item.id || index + 1,
      startTime: item.startTime,
      endTime: item.endTime,
      text: item.text.trim(),
      translatedText: undefined
    }));
  } catch (error) {
    console.error('SRT解析失败:', error);
    throw new Error('无效的SRT文件格式');
  }
};

export const toSRT = (entries: SubtitleEntry[], useTranslation: boolean = true): string => {
  const srtEntries = entries.map(entry => ({
    id: entry.id.toString(),
    startTime: entry.startTime,
    endTime: entry.endTime,
    text: useTranslation && entry.translatedText ? entry.translatedText : entry.text,
    startSeconds: 0,
    endSeconds: 0
  }));
  
  return parser.toSrt(srtEntries as any);
};

export const toTXT = (entries: SubtitleEntry[], useTranslation: boolean = true): string => {
  return entries
    .map(entry => useTranslation && entry.translatedText ? entry.translatedText : entry.text)
    .join('\n\n');
};

export const toBilingual = (entries: SubtitleEntry[]): string => {
  const bilingualEntries = entries.map(entry => ({
    id: entry.id.toString(),
    startTime: entry.startTime,
    endTime: entry.endTime,
    text: `${entry.text}\n${entry.translatedText || ''}`,
    startSeconds: 0,
    endSeconds: 0
  }));
  
  return parser.toSrt(bilingualEntries as any);
};