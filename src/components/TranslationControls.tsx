import React, { useState, useCallback } from 'react';
import { Play, Download, Settings } from 'lucide-react';
import { useSingleSubtitle } from '@/contexts/SubtitleContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTerms } from '@/contexts/TermsContext';
import { useHistory } from '@/contexts/HistoryContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { downloadSubtitleFile } from '@/utils/fileExport';
import {
  executeTranslation,
  saveTranslationHistory,
  type TranslationConfig
} from '@/services/TranslationOrchestrator';

interface TranslationControlsProps {
  className?: string;
  onOpenSettings?: () => void;
}

export const TranslationControls: React.FC<TranslationControlsProps> = ({
  className,
  onOpenSettings
}) => {
  const {
    entries,
    filename,
    updateEntry,
    exportSRT,
    exportTXT,
    exportBilingual
  } = useSingleSubtitle();

  const {
    config,
    isTranslating,
    progress,
    tokensUsed,
    isConfigured,
    translateBatch,
    updateProgress,
    startTranslation,
    stopTranslation,
    completeTranslation
  } = useTranslation();

  const { getRelevantTerms } = useTerms();
  const { addHistoryEntry } = useHistory();

  const [isExporting, setIsExporting] = useState(false);

  const onStartTranslation = useCallback(async () => {
    if (!entries.length) {
      toast.error('请先上传SRT文件');
      return;
    }

    if (!isConfigured) {
      toast.error('请先配置API设置');
      onOpenSettings?.();
      return;
    }

    try {
      // 初始化翻译状态
      const controller = await startTranslation();

      // 生成任务ID
      const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // 准备翻译配置
      const translationConfig: TranslationConfig = {
        batchSize: config.batchSize,
        contextBefore: config.contextBefore,
        contextAfter: config.contextAfter,
        threadCount: config.threadCount
      };

      // 准备翻译回调
      const callbacks = {
        translateBatch,
        updateEntry,
        updateProgress,
        getRelevantTerms
      };

      // 执行翻译流程
      await executeTranslation(
        {
          entries,
          filename,
          config: translationConfig,
          controller,
          taskId
        },
        callbacks
      );

      // 添加短暂延迟，确保所有tokens更新都已完成
      await new Promise(resolve => setTimeout(resolve, 100));

      await completeTranslation(taskId);

      toast.success('翻译完成！');

      // 保存历史记录
      await saveTranslationHistory(taskId, filename, tokensUsed, addHistoryEntry);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message?.includes('翻译被取消')) {
        toast.success('翻译已取消');
      } else {
        console.error('翻译失败:', error);
        toast.error(`翻译失败: ${error.message}`);
      }
      await stopTranslation();
    }
  }, [
    entries,
    filename,
    isConfigured,
    config,
    tokensUsed,
    updateEntry,
    translateBatch,
    updateProgress,
    startTranslation,
    stopTranslation,
    completeTranslation,
    getRelevantTerms,
    onOpenSettings,
    addHistoryEntry
  ]);

  const onExport = useCallback(
    async (format: 'srt' | 'txt' | 'bilingual') => {
      if (!entries.length) {
        toast.error('没有可导出的字幕');
        return;
      }

      setIsExporting(true);

      try {
        let content = '';
        let extension: 'srt' | 'txt' = 'txt';

        switch (format) {
          case 'srt':
            content = exportSRT(true);
            extension = 'srt';
            break;
          case 'txt':
            content = exportTXT(true);
            extension = 'txt';
            break;
          case 'bilingual':
            content = exportBilingual();
            extension = 'srt';
            break;
        }

        downloadSubtitleFile(content, filename, extension);
        toast.success('导出成功');
      } catch (error) {
        console.error('导出失败:', error);
        toast.error('导出失败');
      } finally {
        setIsExporting(false);
      }
    },
    [entries, filename, exportSRT, exportTXT, exportBilingual]
  );

  if (!entries.length) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`backdrop-blur-sm bg-white/10 rounded-xl p-6 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 翻译控制 */}
        <div className="flex items-center space-x-3">
          {/* 主控制按钮 */}
          {isTranslating ? (
            <button
              disabled
              className="flex items-center space-x-2 px-6 py-3 rounded-lg font-medium bg-orange-500/20 text-orange-200 border border-orange-500/30 cursor-not-allowed"
            >
              <div className="animate-spin h-4 w-4 border-2 border-orange-300 border-t-transparent rounded-full"></div>
              <span>翻译中...</span>
            </button>
          ) : (
            <button
              onClick={onStartTranslation}
              disabled={!isConfigured || isExporting}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-200 ${
                isConfigured
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 hover:scale-105'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30 cursor-not-allowed'
              }`}
            >
              <Play className="h-4 w-4" />
              <span>开始翻译</span>
            </button>
          )}

          {!isConfigured && (
            <button
              onClick={onOpenSettings}
              className="flex items-center space-x-2 px-4 py-3 rounded-lg bg-orange-500/20 hover:bg-orange-500/30 text-orange-200 border border-orange-500/30 transition-all duration-200"
            >
              <Settings className="h-4 w-4" />
              <span>配置API</span>
            </button>
          )}
        </div>

        {/* 导出控制 */}
        <div className="flex items-center space-x-2">
          <div className="relative">
            <button
              onClick={() => setIsExporting(!isExporting)}
              disabled={entries.length === 0 || isTranslating}
              className="flex items-center space-x-2 px-4 py-3 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              <span>导出</span>
            </button>

            {isExporting && (
              <div className="absolute bottom-full mb-2 right-0 z-50">
                <div className="bg-black/90 backdrop-blur-sm rounded-lg p-1 space-y-1 min-w-[140px] shadow-2xl border border-white/20">
                  <button
                    onClick={() => {
                      onExport('srt');
                      setIsExporting(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                  >
                    <span>📄</span>
                    <span>SRT 格式</span>
                  </button>
                  <button
                    onClick={() => {
                      onExport('txt');
                      setIsExporting(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                  >
                    <span>📝</span>
                    <span>TXT 格式</span>
                  </button>
                  <button
                    onClick={() => {
                      onExport('bilingual');
                      setIsExporting(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                  >
                    <span>🔄</span>
                    <span>双语对照</span>
                  </button>
                </div>
              </div>
            )}

            {/* 点击外部区域关闭菜单的遮罩层 */}
            {isExporting && (
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsExporting(false)}
              />
            )}
          </div>
        </div>
      </div>

      {/* 统计信息 */}
      {!isTranslating && progress.total === 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between text-sm text-white/70">
          <div className="flex items-center space-x-4">
            <span>字幕条数: {entries.length}</span>
            <span>Token消耗: {tokensUsed}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
};
