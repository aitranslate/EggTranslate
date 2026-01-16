import { SubtitleFile } from '@/types';
import type { FileType } from '@/types/transcription';
import { formatFileSize as formatFileSizeUtil } from '@/utils/fileFormat';

// 重新导出，保持组件使用方便
export const formatFileSize = formatFileSizeUtil;

/**
 * 获取状态文本
 */
export const getStatusText = (file: SubtitleFile): string => {
  if (file.fileType === 'srt') {
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
