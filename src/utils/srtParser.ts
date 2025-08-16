import SRTParser2 from 'srt-parser-2';
import { SubtitleEntry } from '@/types';

// SRT解析工具
const parser = new SRTParser2();

// 将SRT文本解析为字幕条目数组
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

// 将字幕条目数组转换为SRT格式
export const toSRT = (entries: SubtitleEntry[], useTranslation: boolean = true): string => {
  const srtEntries = entries.map(entry => ({
    id: entry.id.toString(),
    startTime: entry.startTime,
    endTime: entry.endTime,
    text: useTranslation && entry.translatedText ? entry.translatedText : entry.text,
    startSeconds: 0, // srt-parser-2 需要这些属性
    endSeconds: 0
  }));
  
  return parser.toSrt(srtEntries as any);
};

// 将字幕条目数组转换为TXT格式
export const toTXT = (entries: SubtitleEntry[], useTranslation: boolean = true): string => {
  return entries
    .map(entry => useTranslation && entry.translatedText ? entry.translatedText : entry.text)
    .join('\n\n');
};

// 将字幕条目数组转换为双语格式
export const toBilingual = (entries: SubtitleEntry[]): string => {
  const bilingualEntries = entries.map(entry => ({
    id: entry.id.toString(),
    startTime: entry.startTime,
    endTime: entry.endTime,
    text: `${entry.text}\n${entry.translatedText || ''}`,
    startSeconds: 0, // srt-parser-2 需要这些属性
    endSeconds: 0
  }));
  
  return parser.toSrt(bilingualEntries as any);
};