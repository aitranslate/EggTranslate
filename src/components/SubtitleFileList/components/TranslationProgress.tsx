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
  // 判断当前状态：转录中/翻译中
  const isTranscribing = file.transcriptionStatus === 'transcribing' ||
                        file.transcriptionStatus === 'llm_merging' ||
                        file.transcriptionStatus === 'loading_model' ||
                        file.transcriptionStatus === 'decoding' ||
                        file.transcriptionStatus === 'chunking';

  const isTranslating = translationStats.percentage > 0 && translationStats.percentage < 100;

  // 进度标题：左上方
  const progressTitle = isTranscribing ? '转录进度' :
                       translationStats.percentage > 0 ? '翻译进度' :
                       file.transcriptionStatus === 'completed' ? '翻译进度' : '转录进度';

  // 进度百分比：右上角
  const progressPercent = isTranscribing
    ? (file.transcriptionProgress?.percent ?? 0)
    : translationStats.percentage;

  // 进度条颜色
  const progressColor = translationStats.percentage === 100
    ? 'from-green-400 to-emerald-400'
    : isTranslating
    ? 'from-purple-400 to-blue-400'
    : isTranscribing
    ? 'from-teal-400 to-cyan-400'
    : 'from-green-400 to-emerald-400';

  // 左下角进度详情
  const progressDetail = isTranscribing
    ? (() => {
        if (file.transcriptionStatus === 'transcribing') {
          return `转录 ${file.transcriptionProgress?.currentChunk || 0} / ${file.transcriptionProgress?.totalChunks || 0}`;
        } else if (file.transcriptionStatus === 'llm_merging') {
          const batch = file.transcriptionProgress?.llmBatch || 0;
          const total = file.transcriptionProgress?.totalLlmBatches || 0;
          return batch > 0 ? `LLM组句 ${batch} / ${total}` : '准备LLM组句...';
        }
        return '处理中...';
      })()
    : `${translationStats.translated} / ${translationStats.total} 已翻译`;

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
