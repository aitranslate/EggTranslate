// 字幕条目类型
export interface SubtitleEntry {
  id: number;
  startTime: string;
  endTime: string;
  text: string;
  translatedText?: string;
}

// 翻译配置类型
export interface TranslationConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  contextBefore: number;
  contextAfter: number;
  batchSize: number;
  threadCount: number;
  rpm: number; // 每分钟请求数
}

// 翻译进度类型
export interface TranslationProgress {
  current: number;
  total: number;
  phase: 'direct' | 'completed';
  status: string;
  taskId?: string; // 当前任务ID
}

// 术语类型
export interface Term {
  original: string;
  translation: string;
}

// 翻译任务状态类型
export interface TranslationTask {
  taskId: string;
  filename: string;
  status: 'preparing' | 'translating' | 'completed' | 'failed';
  progress: TranslationProgress;
  createdAt: string;
  lastUpdated: string;
}

// 单个翻译任务状态类型 (用于批处理任务列表)
export interface SingleTask {
  taskId: string;
  subtitle_entries: SubtitleEntry[];
  subtitle_filename: string;
  translation_progress: {
    completed: number;
    total: number;
    tokens: number;
    status: 'idle' | 'translating' | 'completed';
    current_index?: number;
  };
  index: number; // 在列表中的位置
}

// 批量任务列表类型
export interface BatchTasks {
  tasks: SingleTask[];
}

// 当前翻译任务状态类型
export interface CurrentTranslationTask {
  taskId: string;
  subtitle_entries: SubtitleEntry[];
  subtitle_filename: string;
  translation_progress: {
    completed: number;
    total: number;
    tokens: number;
    status: 'idle' | 'translating' | 'completed';
    current_index?: number;
  };
}

// 增强的翻译历史记录类型
export interface TranslationHistoryEntry {
  taskId: string; // 唯一标识符
  filename: string;
  completedCount: number; // 完成的字幕数
  totalTokens: number; // 总消耗Token数
  timestamp: number; // 完成时间戳
  current_translation_task: CurrentTranslationTask; // 保存完整任务数据
}