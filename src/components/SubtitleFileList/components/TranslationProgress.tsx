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
  return (
    <div className="flex-grow relative">
      {file.type === 'srt' || (file.transcriptionStatus === 'completed' && translationStats.percentage > 0) ? (
        // SRT文件 或 已开始翻译：显示翻译进度条
        <>
          <div className="absolute right-0 -top-6 text-sm text-white/70">{translationStats.percentage}%</div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${
                translationStats.percentage === 100
                  ? 'bg-gradient-to-r from-green-400 to-emerald-400'
                  : 'bg-gradient-to-r from-purple-400 to-blue-400'
              }`}
              initial={{ width: '0%' }}
              animate={{ width: `${translationStats.percentage}%` }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/60 mt-1">
            <span>{translationStats.translated} / {translationStats.total} 已翻译</span>
            <span className="flex items-center space-x-1">
              <Zap className="h-3 w-3" />
              <span>{translationStats.tokens.toLocaleString()} tokens</span>
            </span>
          </div>
        </>
      ) : file.transcriptionStatus === 'completed' ? (
        // 音视频已转录但未开始翻译：显示绿色完成进度条
        <>
          <div className="absolute right-0 -top-6 text-sm text-white/70">100%</div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-400" style={{ width: '100%' }} />
          </div>
          <div className="flex justify-between text-xs text-white/60 mt-1">
            <span></span>
            <span className="text-green-400">✓ 转录完成 • {file.entries.length} 条字幕</span>
          </div>
        </>
      ) : file.transcriptionStatus === 'idle' ? (
        // 未转录：显示空的进度条
        <>
          <div className="absolute right-0 -top-6 text-sm text-white/70">0%</div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-white/10" style={{ width: '0%' }} />
          </div>
          <div className="flex justify-between text-xs text-white/60 mt-1">
            <span></span>
            <span></span>
          </div>
        </>
      ) : (
        // 转录中：显示转录进度条
        <>
          <div className="absolute right-0 -top-6 text-sm text-white/70">
            {file.transcriptionProgress?.percent ?? 0}%
          </div>
          <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-cyan-400"
              initial={{ width: '0%' }}
              animate={{ width: `${file.transcriptionProgress?.percent ?? 0}%` }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            />
          </div>
          <div className="flex justify-between text-xs text-white/60 mt-1">
            {file.transcriptionStatus === 'transcribing' ? (
              <span>转录 {file.transcriptionProgress?.currentChunk} / {file.transcriptionProgress?.totalChunks}</span>
            ) : file.transcriptionStatus === 'llm_merging' && (file.transcriptionProgress?.llmBatch ?? 0) > 0 ? (
              <span>LLM组句 {file.transcriptionProgress?.llmBatch} / {file.transcriptionProgress?.totalLlmBatches}</span>
            ) : file.transcriptionStatus === 'llm_merging' ? (
              <span>准备LLM组句...</span>
            ) : (
              <span></span>
            )}
            <span></span>
          </div>
        </>
      )}
    </div>
  );
};
