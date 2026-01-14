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
  const [isTranslating, setIsTranslating] = useState(false);

  // 使用统一错误处理
  const { handleError } = useErrorHandler();

  const translationStats = useMemo(() => {
    const translated = file.entries.filter((entry) => entry.translatedText).length;

    const batchTasks = dataManager.getBatchTasks();
    const task = file.currentTaskId ? batchTasks.tasks.find(t => t.taskId === file.currentTaskId) : null;
    const tokens = task?.translation_progress?.tokens || 0;

    return {
      total: file.entries.length,
      translated,
      untranslated: file.entries.length - translated,
      percentage: file.entries.length > 0 ? Math.round((translated / file.entries.length) * 100) : 0,
      tokens: tokens
    };
  }, [file.entries, file.currentTaskId]);

  const handleStartTranslationLocal = useCallback(async () => {
    if (isTranslating) return;

    setIsTranslating(true);
    try {
      await onStartTranslation(file);
    } catch (error) {
      handleError(error, {
        context: { operation: '翻译', fileName: file.name }
      });
    } finally {
      setIsTranslating(false);
    }
  }, [file, onStartTranslation, isTranslating, handleError]);

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
      className="border border-white/20 rounded-xl p-6 bg-white/5 hover:bg-white/10 transition-colors"
    >
      {/* 文件头部信息 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <FileIcon type={file.type} />
          </div>
          <div>
            <h4 className="font-medium text-white truncate max-w-xs" title={file.name}>{file.name}</h4>
            <div className="text-xs text-white/60 mt-1">
              {file.type === 'srt' ? (
                <>{file.entries.length} 条字幕</>
              ) : (
                <>{formatFileSize(file.size)}</>
              )}
            </div>
          </div>
        </div>

        <div className={`px-3 py-1 rounded-full text-xs font-medium ${
          file.type === 'srt' ? (
            translationStats.percentage === 100
              ? 'bg-green-500/30 text-green-200'
              : translationStats.percentage > 0
              ? 'bg-blue-500/30 text-blue-200'
              : 'bg-gray-500/30 text-gray-200'
          ) : (
            file.transcriptionStatus === 'completed'
              ? 'bg-green-500/30 text-green-200'
              : file.transcriptionStatus === 'failed'
              ? 'bg-red-500/30 text-red-200'
              : 'bg-gray-500/30 text-gray-200'
          )
        }`}>
          {file.type === 'srt' ? (
            translationStats.percentage === 100 ? '已完成' :
            translationStats.percentage > 0 ? '翻译中' : '等待翻译'
          ) : (
            file.transcriptionStatus === 'completed' ? (translationStats.percentage > 0 ? '翻译中' : '转录完成') :
            file.transcriptionStatus === 'transcribing' || file.transcriptionStatus === 'llm_merging' || file.transcriptionStatus === 'loading_model' || file.transcriptionStatus === 'decoding' || file.transcriptionStatus === 'chunking' ? '转录中' :
            file.transcriptionStatus === 'failed' ? '转录失败' :
            '等待转录'
          )}
        </div>
      </div>

      {/* 进度条和操作按钮 */}
      <div className="mb-4">
        {/* 进度标题 */}
        <div className="text-sm text-white/70 mb-2">
          {file.type === 'srt' ? '翻译进度' :
           file.transcriptionStatus === 'completed' ? (translationStats.percentage > 0 ? '翻译进度' : '转录完成') :
           '转录进度'}
        </div>

        <div className="flex items-center space-x-3">
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
            onStartTranslation={handleStartTranslationLocal}
            onEdit={() => onEdit(file)}
            onExport={handleExport}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </motion.div>
  );
};

/**
 * 记忆化的 SubtitleFileItem 组件
 * 使用自定义比较函数来避免不必要的重渲染
 */
export const SubtitleFileItemMemo = memo(SubtitleFileItem, (prevProps, nextProps) => {
  // 比较 file 对象的关键属性
  const fileKeys: (keyof SubtitleFile)[] = [
    'id',
    'name',
    'type',
    'size',
    'transcriptionStatus',
    'currentTaskId'
  ];

  // 检查 file 对象的关键属性是否变化
  for (const key of fileKeys) {
    if (prevProps.file[key] !== nextProps.file[key]) {
      return false; // 有变化，需要重渲染
    }
  }

  // 检查 entries 数量是否变化（快速检查）
  if (prevProps.file.entries.length !== nextProps.file.entries.length) {
    return false;
  }

  // 检查已翻译数量是否变化（影响进度显示）
  const prevTranslated = prevProps.file.entries.filter(e => e.translatedText).length;
  const nextTranslated = nextProps.file.entries.filter(e => e.translatedText).length;
  if (prevTranslated !== nextTranslated) {
    return false;
  }

  // 检查全局状态是否变化
  if (prevProps.isTranslatingGlobally !== nextProps.isTranslatingGlobally) {
    return false;
  }

  if (prevProps.currentTranslatingFileId !== nextProps.currentTranslatingFileId) {
    return false;
  }

  // 所有关键属性都未变化，可以跳过重渲染
  return true;
});

// 默认导出记忆化版本，保持向后兼容
export default SubtitleFileItemMemo;
