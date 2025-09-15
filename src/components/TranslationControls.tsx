import React, { useState, useCallback } from 'react';
import { Play, Download, Settings } from 'lucide-react';
import { useSingleSubtitle } from '@/contexts/SubtitleContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTerms } from '@/contexts/TermsContext';
import { useHistory } from '@/contexts/HistoryContext';
import dataManager from '@/services/dataManager';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

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
    exportBilingual,
    getCurrentTaskId
  } = useSingleSubtitle();
  const {
    config,
    isTranslating,
    progress,
    tokensUsed,
    isConfigured,
    translateBatch,
    updateProgress,
    startTranslation: initTranslation,
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
      const controller = await initTranslation();
      
      // 在开始翻译时才创建任务
      const currentTaskId = await dataManager.createNewTask(filename, entries, 0);
      
      const { batchSize, contextBefore, contextAfter, threadCount } = config;
      const totalBatches = Math.ceil(entries.length / batchSize);
      
      const getActualProgress = () => {
        const completedCount = entries.filter(entry => 
          entry.translatedText && entry.translatedText.trim() !== ''
        ).length;
        return {
          completed: completedCount,
          total: entries.length,
        };
      };
      
      const initialProgress = getActualProgress();
      const startBatchIndex = Math.floor(initialProgress.completed / batchSize);
      
      let currentCompletedCount = initialProgress.completed;
      
      await updateProgress(currentCompletedCount, entries.length, 'direct', `准备翻译... (已完成: ${currentCompletedCount}/${entries.length})`, currentTaskId);

      try {
        const allBatches = [];
        for (let batchIndex = startBatchIndex; batchIndex < totalBatches; batchIndex++) {
          const startIdx = batchIndex * batchSize;
          const endIdx = Math.min(startIdx + batchSize, entries.length);
          const batchEntries = entries.slice(startIdx, endIdx);
          
          const untranslatedEntries = batchEntries.filter(entry => 
            !entry.translatedText || !entry.translatedText.trim()
          );
          
          if (untranslatedEntries.length === 0) {
            continue;
          }
          
          const contextBeforeTexts = entries.slice(Math.max(0, startIdx - contextBefore), startIdx).map(e => e.text).join('\n');
          const contextAfterTexts = entries.slice(endIdx, Math.min(entries.length, endIdx + contextAfter)).map(e => e.text).join('\n');
          const batchText = untranslatedEntries.map(e => e.text).join(' ');
          const relevantTerms = getRelevantTerms(batchText, contextBeforeTexts, contextAfterTexts);
          const termsText = relevantTerms.map(term => `${term.original} -> ${term.translation}`).join('\n');
          const textsToTranslate = untranslatedEntries.map(e => e.text);
          
          allBatches.push({
            batchIndex,
            untranslatedEntries,
            textsToTranslate,
            contextBeforeTexts,
            contextAfterTexts,
            termsText
          });
        }
        
        const updateRealTimeProgress = async (completedEntries: number) => {
          const percentage = Math.round((completedEntries / entries.length) * 100);
          const statusText = `翻译中... (${completedEntries}/${entries.length}) ${percentage}%`;
          await updateProgress(completedEntries, entries.length, 'direct', statusText, currentTaskId);
        };

        for (let i = 0; i < allBatches.length; i += threadCount) {
          const currentBatchGroup = allBatches.slice(i, i + threadCount);
          
          const batchPromises = currentBatchGroup.map(async (batch) => {
            try {
              const translationResult = await translateBatch(
                batch.textsToTranslate,
                controller.signal,
                batch.contextBeforeTexts,
                batch.contextAfterTexts,
                batch.termsText
              );
              
              const batchUpdates = [];
              for (const [key, value] of Object.entries(translationResult.translations)) {
                const resultIndex = parseInt(key) - 1;
                const untranslatedEntry = batch.untranslatedEntries[resultIndex];
                
                if (untranslatedEntry && typeof value === 'object' && value.direct) {
                  batchUpdates.push({
                    id: untranslatedEntry.id,
                    text: untranslatedEntry.text,
                    translatedText: value.direct
                  });
                }
              }
              
              currentCompletedCount += batchUpdates.length;
              
              if (batchUpdates.length > 0) {
                await dataManager.batchUpdateTaskSubtitleEntries(currentTaskId, batchUpdates);
                for (const update of batchUpdates) {
                  await updateEntry(update.id, update.text, update.translatedText);
                }
                await updateRealTimeProgress(currentCompletedCount);
              }
              
              return { batchIndex: batch.batchIndex, success: true };
            } catch (error) {
              if (error.name !== 'AbortError') {
                console.error(`批次 ${batch.batchIndex + 1} 翻译失败:`, error);
                toast.error(`批次 ${batch.batchIndex + 1} 翻译失败`);
              }
              return { batchIndex: batch.batchIndex, success: false, error };
            }
          });
          
          await Promise.all(batchPromises);
        }

        const finalProgress = getActualProgress();
        const statusText = finalProgress.completed === entries.length ? '翻译完成' : '部分翻译';
        
        await updateProgress(finalProgress.completed, entries.length, 'completed', statusText, currentTaskId);
        // 添加短暂延迟，确保所有tokens更新都已完成
        await new Promise(resolve => setTimeout(resolve, 100));
        await completeTranslation(currentTaskId);
        
        toast.success('翻译完成！');

        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 使用新的 batch_tasks 结构获取当前任务
          const batchTasks = dataManager.getBatchTasks();
          const currentTask = batchTasks.tasks.find(t => t.taskId === currentTaskId);
          
          if (currentTask) {
            // 获取最新的tokens值
            const finalTokens = currentTask.translation_progress?.tokens || tokensUsed || 0;
            const actualCompleted = currentTask.subtitle_entries?.filter((entry: any) => 
              entry.translatedText && entry.translatedText.trim() !== ''
            ).length || 0;

            if (actualCompleted > 0) {
              await addHistoryEntry({
                taskId: currentTaskId,
                filename: filename,
                completedCount: actualCompleted,
                totalTokens: finalTokens,
                current_translation_task: {
                  taskId: currentTask.taskId,
                  subtitle_entries: currentTask.subtitle_entries,
                  subtitle_filename: currentTask.subtitle_filename,
                  translation_progress: currentTask.translation_progress
                }
              });
            }
          }
        } catch (historyError) {
          console.error('保存历史记录失败:', historyError);
        }
        
      } catch (error) {
        if (error.name === 'AbortError' || error.message?.includes('翻译被取消')) {
          toast.success('翻译已取消');
        } else {
          console.error('翻译失败:', error);
          toast.error(`翻译失败: ${error.message}`);
        }
        await stopTranslation();
      }
    } catch (error) {
      console.error('初始化翻译失败:', error);
      toast.error(`初始化翻译失败: ${error.message}`);
    }
  }, [
    entries, 
    filename, 
    isConfigured, 
    config, 
    updateEntry, 
    translateBatch, 
    updateProgress, 
    initTranslation,
    stopTranslation,
    completeTranslation,
    getRelevantTerms,
    getCurrentTaskId,
    onOpenSettings,
    addHistoryEntry
  ]);

  const onExport = useCallback(async (format: 'srt' | 'txt' | 'bilingual') => {
    if (!entries.length) {
      toast.error('没有可导出的字幕');
      return;
    }

    setIsExporting(true);
    
    try {
      let content = '';
      let extension = '';
      
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
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      const baseName = filename.replace(/\.srt$/i, '');
      a.href = url;
      a.download = `${baseName}_translated.${extension}`;
      a.click();
      
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    } finally {
      setIsExporting(false);
    }
  }, [entries, filename, exportSRT, exportTXT, exportBilingual]);

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
            // 翻译中：显示翻译中状态（禁用）
            <button
              disabled
              className="flex items-center space-x-2 px-6 py-3 rounded-lg font-medium bg-orange-500/20 text-orange-200 border border-orange-500/30 cursor-not-allowed"
            >
              <div className="animate-spin h-4 w-4 border-2 border-orange-300 border-t-transparent rounded-full"></div>
              <span>翻译中...</span>
            </button>
          ) : (
            // 默认状态：显示开始按钮
            <button
              onClick={onStartTranslation}
              disabled={!isConfigured || isExporting}
              className={`
                flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all duration-200
                ${isConfigured
                  ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 hover:scale-105'
                  : 'bg-gray-500/20 text-gray-400 border border-gray-500/30 cursor-not-allowed'
                }
              `}
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
