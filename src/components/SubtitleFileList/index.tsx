import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { downloadSubtitleFile } from '@/utils/fileExport';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { useTranslationConfigStore, useTranslationConfig, useIsTranslating } from '@/stores/translationConfigStore';
import { useTranscriptionStore, useModelStatus } from '@/stores/transcriptionStore';
import { useTerms } from '@/contexts/TermsContext';
import { useHistory } from '@/contexts/HistoryContext';
import { SubtitleFile, SubtitleEntry } from '@/types';
import dataManager from '@/services/dataManager';
import { API_CONSTANTS } from '@/constants/api';
import { SubtitleFileItem } from './components/SubtitleFileItem';
import { ConfirmDialog } from '../ConfirmDialog';
import { TranscriptionPromptModal } from '../TranscriptionPromptModal';
import { SettingsModal } from '../SettingsModal';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface SubtitleFileListProps {
  className?: string;
  onEditFile: (file: SubtitleFile) => void;
  onCloseEditModal: () => void;
}

export const SubtitleFileList: React.FC<SubtitleFileListProps> = ({
  className,
  onEditFile,
  onCloseEditModal
}) => {
  // 从 Store 获取数据和方法
  const files = useSubtitleStore((state) => state.files);
  const updateEntry = useSubtitleStore((state) => state.updateEntry);
  const removeFile = useSubtitleStore((state) => state.removeFile);
  const clearAllData = useSubtitleStore((state) => state.clearAll);
  const getTranslationProgress = useSubtitleStore((state) => state.getTranslationProgress);
  const startTranscription = useSubtitleStore((state) => state.startTranscription);
  const startTranslation = useSubtitleStore((state) => state.startTranslation);

  // 导出方法（需要保留原有逻辑）
  const exportSRT = (fileId: string, useTranslation = true) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return '';
    const entries = useTranslation ? file.entries.map(e => ({
      ...e,
      text: e.translatedText || e.text
    })) : file.entries;
    return entries.map((e, i) => `${i + 1}\n${formatTime(e.start)} --> ${formatTime(e.end)}\n${e.text}\n`).join('\n');
  };

  const exportTXT = (fileId: string, useTranslation = true) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return '';
    const entries = useTranslation ? file.entries.map(e => ({
      ...e,
      text: e.translatedText || e.text
    })) : file.entries;
    return entries.map(e => e.text).join('\n');
  };

  const exportBilingual = (fileId: string) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return '';
    return file.entries.map(e => `${e.text}\n${e.translatedText || ''}`).join('\n\n');
  };

  const config = useTranslationConfig();
  const modelStatus = useModelStatus();
  const { getRelevantTerms } = useTerms();
  const { addHistoryEntry } = useHistory();
  const { handleError } = useErrorHandler();

  const [isTranslatingGloballyState, setIsTranslatingGlobally] = useState(false);
  const [currentTranslatingFileId, setCurrentTranslatingFileId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<SubtitleFile | null>(null);
  const [showTranscriptionPrompt, setShowTranscriptionPrompt] = useState(false);
  const [pendingTranscribeFileId, setPendingTranscribeFileId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 处理转录点击
  const handleTranscribe = useCallback(async (fileId: string) => {
    if (modelStatus !== 'loaded') {
      setPendingTranscribeFileId(fileId);
      setShowTranscriptionPrompt(true);
      return;
    }
    await startTranscription(fileId);
  }, [modelStatus, startTranscription]);

  const handleGoToSettings = useCallback(() => {
    setShowTranscriptionPrompt(false);
    setIsSettingsOpen(true);
  }, []);

  const handleCancelPrompt = useCallback(() => {
    setShowTranscriptionPrompt(false);
    setPendingTranscribeFileId(null);
  }, []);

  const handleSettingsClose = useCallback(() => {
    setIsSettingsOpen(false);
    setPendingTranscribeFileId(null);
  }, []);

  const getPreviousEntries = useCallback((entries: SubtitleEntry[], currentIndex: number) => {
    const contextBefore = config.contextBefore || 2;
    const startIndex = Math.max(0, currentIndex - contextBefore);
    return entries.slice(startIndex, currentIndex).map(entry => entry.text).join('\n');
  }, [config.contextBefore]);

  const getNextEntries = useCallback((entries: SubtitleEntry[], currentIndex: number) => {
    const contextAfter = config.contextAfter || 2;
    const endIndex = Math.min(entries.length, currentIndex + contextAfter);
    return entries.slice(currentIndex, endIndex).map(entry => entry.text).join('\n');
  }, [config.contextAfter]);

  // 单个文件翻译处理
  const handleStartTranslation = useCallback(async (file: SubtitleFile) => {
    setCurrentTranslatingFileId(file.id);

    const batchTasks = dataManager.getBatchTasks();
    const task = batchTasks.tasks.find(t => t.taskId === file.currentTaskId);

    try {
      const batchSize = config.batchSize || 10;
      let tokensUsed = 0;

      for (let i = 0; i < file.entries.length; i += batchSize) {
        const batch = file.entries.slice(i, i + batchSize);
        const texts = batch.map(entry => entry.text);

        const contextBeforeTexts = getPreviousEntries(file.entries, i);
        const contextAfterTexts = getNextEntries(file.entries, i + batch.length);

        const batchText = texts.join(' ');
        const relevantTerms = getRelevantTerms(batchText, contextBeforeTexts, contextAfterTexts);
        const termsString = relevantTerms.map(term => `${term.original} -> ${term.translation}`).join('\n');

        // 调用翻译服务
        const result = await dataManager.config.translation_config?.apiKey ? // 简化检查
          fetch(`${config.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
              model: config.model,
              messages: [{ role: 'user', content: `Translate:\n${texts.join('\n')}` }]
            })
          }).then(r => r.json()) : { translations: {}, tokensUsed: 0 };

        for (let j = 0; j < batch.length; j++) {
          const entry = batch[j];
          const translatedText = result.translations[`${j + 1}`]?.direct || '';

          if (translatedText) {
            await updateEntry(file.id, entry.id, entry.text, translatedText);
          }
        }

        tokensUsed += result.tokensUsed || 0;
      }

      await dataManager.completeTask(file.currentTaskId, tokensUsed);
      setCurrentTranslatingFileId(null);

      // 添加历史记录
      const batchTasks = dataManager.getBatchTasks();
      const completedTask = batchTasks.tasks.find(t => t.taskId === file.currentTaskId);

      if (completedTask) {
        const finalTokens = completedTask.translation_progress?.tokens || 0;
        const actualCompleted = completedTask.subtitle_entries?.filter((entry) =>
          entry.translatedText && entry.translatedText.trim() !== ''
        ).length || 0;

        if (actualCompleted > 0) {
          await addHistoryEntry({
            taskId: file.currentTaskId,
            filename: file.name,
            completedCount: actualCompleted,
            totalTokens: finalTokens,
            current_translation_task: {
              taskId: completedTask.taskId,
              subtitle_entries: completedTask.subtitle_entries,
              subtitle_filename: completedTask.subtitle_filename,
              translation_progress: completedTask.translation_progress
            }
          });
        }
      }

      setTimeout(async () => {
        try {
          await dataManager.forcePersistAllData();
        } catch (error) {
          handleError(error, {
            context: { operation: '翻译完成后持久化数据' },
            showToast: false
          });
        }
      }, 200);

      toast.success(`完成翻译文件: ${file.name}`);
    } catch (error) {
      handleError(error, {
        context: { operation: '翻译', fileName: file.name }
      });
      setCurrentTranslatingFileId(null);
    }
  }, [getRelevantTerms, updateEntry, addHistoryEntry, config, getPreviousEntries, getNextEntries, handleError]);

  // 批量翻译处理
  const handleStartAllTranslation = useCallback(async () => {
    if (files.length === 0 || isTranslatingGloballyState) return;

    const filesToTranslate = files.filter(file => {
      const progress = getTranslationProgress(file.id);
      return progress.completed < progress.total;
    });

    if (filesToTranslate.length === 0) {
      toast.success('所有文件都已翻译完成');
      return;
    }

    setIsTranslatingGlobally(true);
    toast.success(`开始翻译 ${filesToTranslate.length} 个文件`);

    for (const file of filesToTranslate) {
      try {
        await handleStartTranslation(file);
        await new Promise(resolve => setTimeout(resolve, API_CONSTANTS.BATCH_TASK_GAP_MS));
      } catch (error) {
        handleError(error, {
          context: { operation: '批量翻译', fileName: file.name }
        });
      }
    }

    setIsTranslatingGlobally(false);
  }, [files, isTranslatingGloballyState, getTranslationProgress, handleStartTranslation, handleError]);

  const handleClearAll = useCallback(async () => {
    if (files.length === 0) return;
    setShowClearConfirm(true);
  }, [files]);

  const handleConfirmClear = useCallback(async () => {
    try {
      await clearAllData();
      toast.success('所有文件已清空');
    } catch (error) {
      handleError(error, {
        context: { operation: '清空所有数据' }
      });
    } finally {
      setShowClearConfirm(false);
    }
  }, [clearAllData, handleError]);

  const handleDeleteFile = useCallback(async (file: SubtitleFile) => {
    setFileToDelete(file);
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!fileToDelete) return;

    try {
      await removeFile(fileToDelete.id);
    } catch (error) {
      handleError(error, {
        context: { operation: '删除文件', fileName: fileToDelete.name }
      });
    } finally {
      setFileToDelete(null);
    }
  }, [fileToDelete, removeFile, handleError]);

  const handleExport = useCallback((file: SubtitleFile, format: 'srt' | 'txt' | 'bilingual') => {
    let content = '';
    let extension: 'srt' | 'txt' = 'txt';

    switch (format) {
      case 'srt':
        content = exportSRT(file.id, true);
        extension = 'srt';
        break;
      case 'txt':
        content = exportTXT(file.id, true);
        extension = 'txt';
        break;
      case 'bilingual':
        content = exportBilingual(file.id);
        extension = 'srt';
        break;
    }

    downloadSubtitleFile(content, file.name, extension);
    toast.success('导出成功');
  }, [exportSRT, exportTXT, exportBilingual]);

  if (files.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              文件列表
            </h3>
            <div className="flex items-center space-x-3">
              <div className="text-sm text-white/70">
                共 {files.length} 个文件
              </div>
              <button
                onClick={handleStartAllTranslation}
                disabled={files.length === 0 || isTranslatingGloballyState}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-green-500/20 hover:bg-green-500/30 text-green-200 border border-green-500/30 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span>全部开始</span>
              </button>
              <button
                onClick={handleClearAll}
                disabled={files.length === 0}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                <span>清空</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <AnimatePresence>
              {files.map((file, index) => (
                <SubtitleFileItem
                  key={file.id}
                  file={file}
                  index={index}
                  onEdit={onEditFile}
                  onStartTranslation={handleStartTranslation}
                  onExport={handleExport}
                  onDelete={handleDeleteFile}
                  onTranscribe={handleTranscribe}
                  isTranslatingGlobally={isTranslatingGloballyState}
                  currentTranslatingFileId={currentTranslatingFileId}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="确认清空"
        message={`确定要清空所有 ${files.length} 个文件吗？此操作不可恢复。`}
        confirmText="确认清空"
        confirmButtonClass="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
      />

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setFileToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="确认删除"
        message={fileToDelete ? `确定要删除文件 "${fileToDelete.name}" 吗？此操作不可恢复。` : ''}
        confirmText="确认删除"
        confirmButtonClass="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
      />

      <TranscriptionPromptModal
        isOpen={showTranscriptionPrompt}
        onGoToSettings={handleGoToSettings}
        onCancel={handleCancelPrompt}
      />

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={handleSettingsClose}
        />
      )}
    </div>
  );
};

// 辅助函数
function formatTime(ms: number): string {
  const date = new Date(ms);
  const hours = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(date.getUTCMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}
