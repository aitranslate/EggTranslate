import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { SubtitleFile } from '@/types';
import { useMemo } from 'react';

interface TranslationProgressProps {
  file: SubtitleFile;
  translationStats?: {
    total: number;
    translated: number;
    untranslated: number;
    percentage: number;
    tokens: number;
  };
}

export const TranslationProgress: React.FC<TranslationProgressProps> = ({
  file,
  translationStats = { total: 0, translated: 0, untranslated: 0, percentage: 0, tokens: 0 }
}) => {
  // 判断当前状态（使用 useMemo 优化性能）
  const isTranscribing = useMemo(() =>
    file.transcriptionStatus === 'transcribing' ||
    file.transcriptionStatus === 'llm_merging' ||
    file.transcriptionStatus === 'loading_model' ||
    file.transcriptionStatus === 'decoding' ||
    file.transcriptionStatus === 'chunking',
    [file.transcriptionStatus]
  );

  // SRT 文件或已开始翻译（使用 useMemo 优化性能）
  const isTranslationPhase = useMemo(() =>
    file.type === 'srt' || (translationStats?.percentage ?? 0) > 0,
    [file.type, translationStats?.percentage]
  );

  // 计算进度信息（使用 useMemo 避免重复计算）
  const progressInfo = useMemo(() => {
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
      progressPercent = translationStats?.percentage ?? 0;
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
      progressDetail = `${translationStats?.translated ?? 0} / ${translationStats?.total ?? 0} 已翻译`;
    } else if (file.transcriptionStatus === 'completed') {
      // 转录完成但未翻译
      progressDetail = `转录完成 ${translationStats?.total ?? 0} 条`;
    } else {
      // 未开始
      progressDetail = '等待转录';
    }

    return { progressTitle, progressPercent, progressColor, progressDetail };
  }, [isTranscribing, isTranslationPhase, file.transcriptionStatus, file.transcriptionProgress, translationStats]);

  // 右下角 tokens（统一从 translationStats 读取，由 dataManager 实时更新）
  const tokensDisplay = useMemo(() => {
    const tokens = translationStats?.tokens ?? 0;

    // 调试日志
    if (tokens > 0) {
      console.log('[TranslationProgress] tokens:', tokens, 'from dataManager');
    }

    return `${tokens.toLocaleString()} tokens`;
  }, [translationStats?.tokens]);

  return (
    <div className="flex-grow relative">
      {/* 左上方：进度标题 | 右上角：百分比 */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm text-white/70">{progressInfo.progressTitle}</span>
        <span className="text-sm text-white/70">{progressInfo.progressPercent}%</span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${progressInfo.progressColor}`}
          initial={{ width: '0%' }}
          animate={{ width: `${progressInfo.progressPercent}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      </div>

      {/* 左下角：进度详情 | 右下角：tokens */}
      <div className="flex justify-between text-xs text-white/60 mt-1">
        <span>{progressInfo.progressDetail}</span>
        <span className="flex items-center space-x-1">
          <Zap className="h-3 w-3" />
          <span>{tokensDisplay}</span>
        </span>
      </div>
    </div>
  );
};
