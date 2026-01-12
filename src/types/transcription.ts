// 文件类型
export type FileType = 'srt' | 'audio' | 'video';

// 转录状态
export type TranscriptionStatus =
  | 'idle'           // 未开始
  | 'loading_model'  // 加载模型中
  | 'decoding'       // 解码音频中
  | 'chunking'       // 分片中
  | 'transcribing'   // 转录中（分块转录）
  | 'llm_merging'    // LLM 智能合并中
  | 'completed'      // 已完成
  | 'failed';        // 失败

// 转录进度详情
export interface TranscriptionProgressDetail {
  status: TranscriptionStatus;
  currentChunk?: number;    // 当前转录块 (1/20)
  totalChunks?: number;      // 总块数
  llmBatch?: number;         // LLM 合并批次 (2/10)
  totalLlmBatches?: number;   // LLM 总批次数
}

// 转录配置
export interface TranscriptionConfig {
  repoId: string;              // HuggingFace 模型仓库 ID
  backend: 'webgpu-hybrid' | 'wasm';  // 计算后端
  encoderQuant: 'int8' | 'fp32';      // 编码器量化
  decoderQuant: 'int8' | 'fp32';      // 解码器量化
  llmMergeThreadCount: number;  // LLM 组句线程数
}

// 转录模型状态
export type ModelStatus = 'not_loaded' | 'loading' | 'loaded' | 'error';

// 转录单词（parakeet 输出）
export interface TranscriptionWord {
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

// 转录结果
export interface TranscriptionResult {
  utterance_text: string;
  words: TranscriptionWord[];
  confidence_scores?: {
    overall_log_prob: number;
    word_avg: number;
  };
  metrics?: {
    rtf: number;
    total_ms: number;
  };
}
