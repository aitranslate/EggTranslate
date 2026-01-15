import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { SubtitleFile } from '@/types';

interface TranslationProgressProps {
  file: SubtitleFile;
  translationStats: {
    total: number;
    translated: number;
    untranslated: number;
    percentage: number;
    tokens: number;
  };
}

export const TranslationProgress: React.FC<TranslationProgressProps> = ({
  file,
  translationStats
}) => {
  // 判断当前状态
  const isTranscribing = file.transcriptionStatus === 'transcribing' ||
                        file.transcriptionStatus === 'llm_merging' ||
                        file.transcriptionStatus === 'loading_model' ||
                        file.transcriptionStatus === 'decoding' ||
                        file.transcriptionStatus === 'chunking';

  // SRT 文件或已开始翻译
  const isTranslationPhase = file.type === 'srt' || translationStats.percentage > 0;

  // 计算进度标题
  let progressTitle: string;
  if (isTranscribing) {
    progressTitle = '转录进度';
  } else if (isTranslationPhase) {
    progressTitle = '翻译进度';
  } else if (file.transcriptionStatus === 'completed') {
    progressTitle = '转录完成';
  } else {
    progressTitle = '转录进度';
  }

  // 计算进度百分比
  let progressPercent: number;
  if (isTranscribing) {
    progressPercent = file.transcriptionProgress?.percent ?? 0;
  } else if (isTranslationPhase) {
    progressPercent = translationStats.percentage;
  } else if (file.transcriptionStatus === 'completed') {
    progressPercent = 100; // 转录完成
  } else {
    progressPercent = 0; // 未开始
  }

  // 进度条颜色
  const progressColor = progressPercent === 100
    ? 'from-green-400 to-emerald-400'
    : isTranscribing
    ? 'from-teal-400 to-cyan-400'
    : 'from-purple-400 to-blue-400';

  // 左下角进度详情
  let progressDetail: string;
  if (isTranscribing) {
    // 转录中
    if (file.transcriptionStatus === 'transcribing') {
      progressDetail = `转录 ${file.transcriptionProgress?.currentChunk || 0} / ${file.transcriptionProgress?.totalChunks || 0}`;
    } else if (file.transcriptionStatus === 'llm_merging') {
      const batch = file.transcriptionProgress?.llmBatch || 0;
      const total = file.transcriptionProgress?.totalLlmBatches || 0;
      progressDetail = batch > 0 ? `LLM组句 ${batch} / ${total}` : '准备LLM组句...';
    } else {
      progressDetail = '处理中...';
    }
  } else if (isTranslationPhase) {
    // 翻译阶段
    progressDetail = `${translationStats.translated} / ${translationStats.total} 已翻译`;
  } else if (file.transcriptionStatus === 'completed') {
    // 转录完成但未翻译
    progressDetail = `转录完成 ${translationStats.total} 条`;
  } else {
    // 未开始
    progressDetail = '等待转录';
  }

  // 右下角 tokens
  const tokensDisplay = `${translationStats.tokens.toLocaleString()} tokens`;

  return (
    <div className="flex-grow relative">
      {/* 左上方：进度标题 | 右上角：百分比 */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-white/70">{progressTitle}</span>
        <span className="text-sm text-white/70">{progressPercent}%</span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${progressColor}`}
          initial={{ width: '0%' }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      </div>

      {/* 左下角：进度详情 | 右下角：tokens */}
      <div className="flex justify-between text-xs text-white/60 mt-1">
        <span>{progressDetail}</span>
        <span className="flex items-center space-x-1">
          <Zap className="h-3 w-3" />
          <span>{tokensDisplay}</span>
        </span>
      </div>
    </div>
  );
};
