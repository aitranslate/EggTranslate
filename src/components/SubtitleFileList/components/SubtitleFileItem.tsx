import { useState, useCallback, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { SubtitleFile } from '@/types';
import dataManager from '@/services/dataManager';
import { FileIcon } from './FileIcon';
import { TranslationProgress } from './TranslationProgress';
import { FileActionButtons } from './FileActionButtons';
import { formatFileSize } from '../utils/fileHelpers';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface SubtitleFileItemProps {
  file: SubtitleFile;
  index: number;
  onEdit: (file: SubtitleFile) => void;
  onStartTranslation: (file: SubtitleFile) => Promise<void>;
  onExport: (file: SubtitleFile, format: 'srt' | 'txt' | 'bilingual') => void;
  onDelete: (file: SubtitleFile) => Promise<void>;
  onTranscribe: (fileId: string) => Promise<void>;
  isTranslatingGlobally: boolean;
  currentTranslatingFileId: string | null;
}

export const SubtitleFileItem: React.FC<SubtitleFileItemProps> = ({
  file,
  index,
  onEdit,
  onStartTranslation,
  onExport,
  onDelete,
  onTranscribe,
  isTranslatingGlobally,
  currentTranslatingFileId
}) => {
  const isTranscribing = useMemo(() =>
    file.transcriptionStatus === 'transcribing' ||
    file.transcriptionStatus === 'llm_merging' ||
    file.transcriptionStatus === 'decoding' ||
    file.transcriptionStatus === 'chunking' ||
    file.transcriptionStatus === 'loading_model',
    [file.transcriptionStatus]
  );

  const isTranslating = useMemo(() =>
    currentTranslatingFileId === file.id,
    [currentTranslatingFileId, file.id]
  );

  const { handleError } = useErrorHandler();

  const translationStats = useMemo(() => {
    const entryCount = file.entryCount ?? 0;
    const translatedCount = file.translatedCount ?? 0;
    const tokens = file.tokensUsed ?? 0;

    return {
      total: entryCount,
      translated: translatedCount,
      untranslated: entryCount - translatedCount,
      percentage: entryCount > 0 ? Math.round((translatedCount / entryCount) * 100) : 0,
      tokens: tokens
    };
  }, [file.entryCount, file.translatedCount, file.tokensUsed]);

  const handleExport = useCallback((format: 'srt' | 'txt' | 'bilingual') => {
    onExport(file, format);
  }, [file, onExport]);

  const handleDelete = useCallback(() => {
    onDelete(file);
  }, [file, onDelete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="apple-card p-6"
    >
      {/* 文件头部信息 */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex-shrink-0">
            <FileIcon type={file.fileType} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-medium text-gray-900 truncate" title={file.name}>{file.name}</h4>
            <div className="text-sm text-gray-500 mt-1">
              {file.fileType === 'srt' ? (
                <>{file.entryCount ?? 0} 条字幕</>
              ) : (
                <>{formatFileSize(file.fileSize ?? 0)}</>
              )}
            </div>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full text-xs font-medium flex-shrink-0 ${
          file.fileType === 'srt' ? (
            translationStats.percentage === 100
              ? 'bg-green-100 text-green-700'
              : isTranslating && translationStats.percentage > 0
              ? 'bg-blue-100 text-blue-700'
              : translationStats.percentage > 0
              ? 'bg-orange-100 text-orange-700'
              : 'bg-gray-100 text-gray-600'
          ) : (
            file.transcriptionStatus === 'completed' ? (
              translationStats.percentage === 100
                ? 'bg-green-100 text-green-700'
                : isTranslating && translationStats.percentage > 0
                ? 'bg-blue-100 text-blue-700'
                : translationStats.percentage > 0
                ? 'bg-orange-100 text-orange-700'
                : 'bg-green-100 text-green-700'
            ) : (
              file.transcriptionStatus === 'failed'
                ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
            )
          )
        }`}>
          {file.fileType === 'srt' ? (
            translationStats.percentage === 100 ? '已完成' :
            isTranslating && translationStats.percentage > 0 ? '翻译中' :
            translationStats.percentage > 0 ? '翻译失败' : '等待翻译'
          ) : (
            file.transcriptionStatus === 'completed' ? (
              translationStats.percentage === 100 ? '已完成' :
              isTranslating && translationStats.percentage > 0 ? '翻译中' :
              translationStats.percentage > 0 ? '翻译失败' : '转录完成'
            ) :
            file.transcriptionStatus === 'transcribing' || file.transcriptionStatus === 'llm_merging' || file.transcriptionStatus === 'loading_model' || file.transcriptionStatus === 'decoding' || file.transcriptionStatus === 'chunking' ? '转录中' :
            file.transcriptionStatus === 'failed' ? '转录失败' :
            '等待转录'
          )}
        </div>
      </div>

      {/* 进度条和操作按钮 */}
      <div className="mb-4">
        <div className="flex items-center gap-4">
          {/* 进度显示 */}
          <TranslationProgress file={file} translationStats={translationStats} />

          {/* 操作按钮 */}
          <FileActionButtons
            file={file}
            isTranslating={isTranslating}
            translationStats={translationStats}
            isTranslatingGlobally={isTranslatingGlobally}
            currentTranslatingFileId={currentTranslatingFileId}
            onTranscribe={() => onTranscribe(file.id)}
            onStartTranslation={() => onStartTranslation(file)}
            onEdit={() => onEdit(file)}
            onExport={handleExport}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </motion.div>
  );
};

export const SubtitleFileItemMemo = memo(SubtitleFileItem, (prevProps, nextProps) => {
  const fileKeys: (keyof SubtitleFile)[] = [
    'id',
    'name',
    'type',
    'fileSize',
    'transcriptionStatus',
    'taskId'
  ];

  for (const key of fileKeys) {
    if (prevProps.file[key] !== nextProps.file[key]) {
      return false;
    }
  }

  const prevProgress = prevProps.file.transcriptionProgress;
  const nextProgress = nextProps.file.transcriptionProgress;
  if (prevProgress?.percent !== nextProgress?.percent ||
      prevProgress?.tokens !== nextProgress?.tokens ||
      prevProgress?.llmBatch !== nextProgress?.llmBatch) {
    return false;
  }

  const prevEntryCount = prevProps.file.entryCount ?? 0;
  const nextEntryCount = nextProps.file.entryCount ?? 0;
  if (prevEntryCount !== nextEntryCount) {
    return false;
  }

  const prevTranslated = prevProps.file.translatedCount ?? 0;
  const nextTranslated = nextProps.file.translatedCount ?? 0;
  if (prevTranslated !== nextTranslated) {
    return false;
  }

  if (prevProps.isTranslatingGlobally !== nextProps.isTranslatingGlobally) {
    return false;
  }

  if (prevProps.currentTranslatingFileId !== nextProps.currentTranslatingFileId) {
    return false;
  }

  return true;
});

export default SubtitleFileItemMemo;
