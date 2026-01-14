import { SubtitleFile } from '@/types';
import type { FileType } from '@/types/transcription';

/**
 * 格式化文件大小
 */
export const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

/**
 * 获取状态文本
 */
export const getStatusText = (file: SubtitleFile): string => {
  const type = file.type;

  if (type === 'srt') {
    return 'SRT 字幕';
  }

  // 音视频文件
  switch (file.transcriptionStatus) {
    case 'idle':
      return '等待转录';
    case 'loading_model':
      return '加载模型中';
    case 'decoding':
      return '解码音频中';
    case 'chunking':
      return '分片中';
    case 'transcribing':
      return '转录中';
    case 'llm_merging':
      return 'LLM 合并中';
    case 'completed':
      return '转录完成';
    case 'failed':
      return '转录失败';
    default:
      return '等待转录';
  }
};
