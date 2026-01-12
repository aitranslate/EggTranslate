import React, { useState, useCallback, useMemo } from 'react';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useTerms } from '@/contexts/TermsContext';
import { useHistory } from '@/contexts/HistoryContext';
import { FileType } from '@/types';
import dataManager from '@/services/dataManager';
import {
  Languages,
  Download,
  Settings,
  Edit3,
  Trash2,
  Eye,
  FileText,
  CheckCircle,
  Clock,
  Zap,
  AlertTriangle,
  X,
  Mic,
  Music,
  Video,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { ConfirmDialog } from './ConfirmDialog';

interface SubtitleFileItemProps {
  file: any;
  index: number;
  onEdit: (file: any) => void;
  onStartTranslation: (file: any) => Promise<void>;
  onExport: (file: any, format: 'srt' | 'txt' | 'bilingual') => void;
  onDelete: (file: any) => Promise<void>;
  onTranscribe: (fileId: string) => Promise<void>;
  isTranslatingGlobally: boolean;
  currentTranslatingFileId: string | null;
}

// 辅助函数：格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

// 辅助函数：获取文件图标
const getFileIcon = (type?: FileType) => {
  switch (type) {
    case 'audio':
      return Music;
    case 'video':
      return Video;
    case 'srt':
    default:
      return FileText;
  }
};

// 辅助函数：获取状态文本
const getStatusText = (file: any): string => {
  const type = file.type as FileType;
  const transcriptionStatus = file.transcriptionStatus;

  if (type === 'srt') {
    return 'SRT 字幕';
  }

  // 音视频文件
  switch (transcriptionStatus) {
    case 'idle':
      return '等待转录';
    case 'loading_model':
      return '加载模型中';
    case 'decoding':
      return '解码音频中';
    case 'chunking':
      return '分片中';
    case 'transcribing':
      return '转录中';
    case 'llm_merging':
      return 'LLM 合并中';
    case 'completed':
      return '转录完成';
    case 'failed':
      return '转录失败';
    default:
      return '等待转录';
  }
};

const SubtitleFileItem: React.FC<SubtitleFileItemProps> = ({
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
  const [isExporting, setIsExporting] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  
  const translationStats = useMemo(() => {
    const translated = file.entries.filter((entry: any) => entry.translatedText).length;

    // 直接从批处理任务中获取tokens - 简单有效！
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

  // 获取文件图标组件
  const FileIcon = getFileIcon(file.type);

  const handleStartTranslationLocal = useCallback(async () => {
    if (isTranslating) return;
    
    setIsTranslating(true);
    try {
      await onStartTranslation(file);
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('翻译被取消')) {
        toast.success('翻译已取消');
      } else {
        toast.error(`翻译失败: ${error.message}`);
      }
    } finally {
      setIsTranslating(false);
    }
  }, [file, onStartTranslation, isTranslating]);

  const handleExport = useCallback((format: 'srt' | 'txt' | 'bilingual') => {
    onExport(file, format);
    setIsExporting(false);
  }, [file, onExport]);

  const handleDeleteClick = useCallback(() => {
    onDelete(file);
  }, [file, onDelete]);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-white/20 rounded-xl p-6 bg-white/5 hover:bg-white/10 transition-colors"
      >
        {/* 文件头部信息 */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <FileIcon className={`h-5 w-5 ${
                file.type === 'audio' ? 'text-green-400' :
                file.type === 'video' ? 'text-purple-400' :
                'text-blue-400'
              }`} />
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
              getStatusText(file)
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
            {/* 进度显示区域 */}
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
                    ) : file.transcriptionStatus === 'llm_merging' ? (
                      <span>LLM组句 {file.transcriptionProgress?.llmBatch} / {file.transcriptionProgress?.totalLlmBatches}</span>
                    ) : (
                      <span></span>
                    )}
                    <span></span>
                  </div>
                </>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center space-x-2">
              {/* 转录按钮 - SRT文件禁用 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTranscribe(file.id);
                }}
                disabled={file.type === 'srt'}
                className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ${
                  file.type === 'srt'
                    ? 'bg-gray-500/10 text-gray-500/30 border border-gray-500/20 cursor-not-allowed'
                    : 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 hover:scale-110'
                }`}
                title={file.type === 'srt' ? 'SRT文件无需转录' : '转录'}
              >
                <Mic className="h-4 w-4" />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleStartTranslationLocal();
                }}
                disabled={
                  isTranslating ||
                  translationStats.percentage === 100 ||
                  (isTranslatingGlobally && !isTranslating) ||
                  (file.type !== 'srt' && file.transcriptionStatus !== 'completed')
                }
                className={`
                  flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200
                  ${translationStats.percentage === 100
                    ? 'bg-green-500/20 text-green-200 border border-green-500/30'
                    : isTranslating || currentTranslatingFileId === file.id
                    ? 'bg-orange-500/20 text-orange-200 border border-orange-500/30 cursor-not-allowed'
                    : (isTranslatingGlobally && !isTranslating) || (file.type !== 'srt' && file.transcriptionStatus !== 'completed')
                    ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30 cursor-not-allowed'
                    : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 hover:scale-110'
                  }
                `}
                title={
                  file.type !== 'srt' && file.transcriptionStatus !== 'completed'
                    ? '请先完成转录'
                    : translationStats.percentage === 100 ? '已完成'
                    : isTranslating || currentTranslatingFileId === file.id ? '翻译中...'
                    : (isTranslatingGlobally && !isTranslating) ? '待处理' : '开始翻译'
                }
              >
                {isTranslating || currentTranslatingFileId === file.id ? (
                  <div className="animate-spin h-4 w-4 border-2 border-orange-300 border-t-transparent rounded-full" />
                ) : (
                  <Languages className="h-4 w-4" />
                )}
              </button>
              
              <button
                onClick={() => onEdit(file)}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 transition-all duration-200 hover:scale-110"
                title="编辑"
              >
                <Edit3 className="h-4 w-4" />
              </button>
              
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExporting(!isExporting);
                  }}
                  disabled={file.entries.length === 0 || isTranslating}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 border border-indigo-500/30 transition-all duration-200 hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="导出"
                >
                  <Download className="h-4 w-4" />
                </button>
              
                {isExporting && (
                  <div className="absolute bottom-full mb-2 right-0 z-50">
                    <div className="bg-black/90 backdrop-blur-sm rounded-lg p-1 space-y-1 min-w-[140px] shadow-2xl border border-white/20">
                      <button
                        onClick={() => handleExport('srt')}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                      >
                        <span>📄</span>
                        <span>SRT 格式</span>
                      </button>
                      <button
                        onClick={() => handleExport('txt')}
                        className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                      >
                        <span>📝</span>
                        <span>TXT 格式</span>
                      </button>
                      <button
                        onClick={() => handleExport('bilingual')}
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
              
              {/* 删除按钮 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteClick();
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 transition-all duration-200 hover:scale-110"
                title="删除"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

interface SubtitleFileListProps {
  className?: string;
  onEditFile: (file: any) => void;
  onCloseEditModal: () => void;
}

export const SubtitleFileList: React.FC<SubtitleFileListProps> = ({ 
  className, 
  onEditFile, 
  onCloseEditModal 
}) => {
  const { files, updateEntry, exportSRT, exportTXT, exportBilingual, clearAllData, removeFile, getTranslationProgress, simulateTranscription } = useSubtitle();
  const {
    config,
    isTranslating: isTranslatingGlobally,
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
  const { addHistoryEntry, history } = useHistory();
  
  const [editingFile, setEditingFile] = useState<any>(null);
  const [isTranslatingGloballyState, setIsTranslatingGlobally] = useState(false);
  const [currentTranslatingFileId, setCurrentTranslatingFileId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<any>(null);

  const handleEdit = useCallback((file: any) => {
    setEditingFile(file);
  }, []);

  const handleStartTranslation = useCallback(async (file: any) => {
    const controller = await startTranslation();
    
    // 设置当前正在翻译的文件ID
    setCurrentTranslatingFileId(file.id);
    
    // 获取当前任务的索引
    const batchTasks = dataManager.getBatchTasks();
    const task = batchTasks.tasks.find(t => t.taskId === file.currentTaskId);
    const taskIndex = task?.index ?? 0;

    try {
      // 使用配置的批处理大小
      const batchSize = config.batchSize || 10;
      
      // 开始翻译，使用真实的API调用
      for (let i = 0; i < file.entries.length; i += batchSize) {
        const batch = file.entries.slice(i, i + batchSize);
        const texts = batch.map(entry => entry.text);
        
        // 获取上下文
        const contextBeforeTexts = getPreviousEntries(file.entries, i);
        const contextAfterTexts = getNextEntries(file.entries, i + batch.length);
        
        // 获取相关术语
        const batchText = texts.join(' ');
        const relevantTerms = getRelevantTerms(batchText, contextBeforeTexts, contextAfterTexts);
        const termsString = relevantTerms.map(term => `${term.original} -> ${term.translation}`).join(`
`);
        
        // 使用真实的翻译API
        const result = await translateBatch(
          texts, 
          controller.signal, 
          contextBeforeTexts,
          contextAfterTexts,
          termsString
        );
        
        // 更新这个批次的翻译结果
        for (let j = 0; j < batch.length; j++) {
          const entry = batch[j];
          const translatedText = result.translations[`${j + 1}`]?.direct || '';
          
          if (translatedText) {
            await updateEntry(file.id, entry.id, entry.text, translatedText);
          }
        }
        
        // 获取当前任务
        const task = dataManager.getTaskById(file.currentTaskId);
        const currentTokens = task?.translation_progress?.tokens || 0;
        const newTokens = currentTokens + result.tokensUsed;
        
        // 更新进度，包括tokens
        const completed = Math.min(i + batch.length, file.entries.length);
        await updateProgress(completed, file.entries.length, 'direct', 'translating', file.currentTaskId, newTokens);
        
        // 进度更新已经通过 updateProgress 完成，无需额外更新历史记录
      }
      
      // 完成翻译
      await completeTranslation(file.currentTaskId);
      
      // 清除当前翻译文件ID
      setCurrentTranslatingFileId(null);
      
      // 添加历史记录
      try {
        // 使用新的 batch_tasks 结构获取当前任务
        const batchTasks = dataManager.getBatchTasks();
        const completedTask = batchTasks.tasks.find(t => t.taskId === file.currentTaskId);
        
        if (completedTask) {
          // 获取最新的tokens值
          const finalTokens = completedTask.translation_progress?.tokens || 0;
          const actualCompleted = completedTask.subtitle_entries?.filter((entry: any) => 
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
        
        // 翻译完成后，延迟200ms进行一次完整的持久化
        setTimeout(async () => {
          try {
            await dataManager.forcePersistAllData();
            console.log('翻译完成后持久化数据成功');
          } catch (error) {
            console.error('翻译完成后持久化数据失败:', error);
          }
        }, 200);
      } catch (historyError) {
        console.error('保存历史记录失败:', historyError);
      }
      
      toast.success(`完成翻译文件: ${file.name}`);
    } catch (error) {
      if (error.name === 'AbortError' || error.message?.includes('翻译被取消')) {
        toast.success('翻译已取消');
      } else {
        toast.error(`翻译失败: ${error.message}`);
      }
      // 清除当前翻译文件ID
      setCurrentTranslatingFileId(null);
      
      // 不调用全局的 stopTranslation，避免影响其他任务
      // await stopTranslation();
    }
  }, [getRelevantTerms, startTranslation, translateBatch, updateEntry, addHistoryEntry, completeTranslation, updateProgress, stopTranslation, config, history]);

  // 获取前面的条目作为上下文
  const getPreviousEntries = useCallback((entries: any[], currentIndex: number) => {
    const contextBefore = config.contextBefore || 2;
    const startIndex = Math.max(0, currentIndex - contextBefore);
    return entries.slice(startIndex, currentIndex).map(entry => entry.text).join(`
`);
  }, [config.contextBefore]);

  // 获取后面的条目作为上下文
  const getNextEntries = useCallback((entries: any[], currentIndex: number) => {
    const contextAfter = config.contextAfter || 2;
    const endIndex = Math.min(entries.length, currentIndex + contextAfter);
    return entries.slice(currentIndex, endIndex).map(entry => entry.text).join(`
`);
  }, [config.contextAfter]);

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
    
    // 设置全局翻译状态
    setIsTranslatingGlobally(true);
    toast.success(`开始翻译 ${filesToTranslate.length} 个文件`);
    
    // 依次处理每个文件
    for (const file of filesToTranslate) {
      try {
        await handleStartTranslation(file);
        // 等待当前文件翻译完成后再开始下一个
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`翻译文件 ${file.name} 失败:`, error);
        toast.error(`翻译文件 ${file.name} 失败: ${error.message}`);
        // 继续下一个文件
      }
    }
    
    // 重置全局翻译状态
    setIsTranslatingGlobally(false);
  }, [files, isTranslatingGloballyState, getTranslationProgress, handleStartTranslation]);

  const handleClearAll = useCallback(async () => {
    if (files.length === 0) return;
    
    // 显示自定义确认对话框
    setShowClearConfirm(true);
  }, [files]);

  const handleConfirmClear = useCallback(async () => {
    try {
      // 清空所有文件数据
      await clearAllData();
      toast.success('所有文件已清空');
    } catch (error) {
      console.error('清空所有数据失败:', error);
      toast.error(`清空失败: ${error.message}`);
    } finally {
      setShowClearConfirm(false);
    }
  }, [clearAllData]);

  const handleDeleteFile = useCallback(async (file: any) => {
    setFileToDelete(file);
    setShowDeleteConfirm(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!fileToDelete) return;
    
    try {
      // 删除文件
      await removeFile(fileToDelete.id);
    } catch (error) {
      console.error('删除文件失败:', error);
      toast.error(`删除失败: ${error.message}`);
    } finally {
      setFileToDelete(null);
    }
  }, [fileToDelete, removeFile]);

  const handleExport = useCallback((file: any, format: 'srt' | 'txt' | 'bilingual') => {
    let content = '';
    let extension = '';
    
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
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const baseName = file.name.replace(/\.srt$/i, '');
    a.href = url;
    a.download = `${baseName}_translated.${extension}`;
    a.click();
    
    URL.revokeObjectURL(url);
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
          {/* 列表标题 */}
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

          {/* 文件列表 */}
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
                  onTranscribe={simulateTranscription}
                  isTranslatingGlobally={isTranslatingGloballyState}
                  currentTranslatingFileId={currentTranslatingFileId}
                />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* 清空确认对话框 */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="确认清空"
        message={`确定要清空所有 ${files.length} 个文件吗？此操作不可恢复。`}
        confirmText="确认清空"
        confirmButtonClass="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
      />

      {/* 删除文件确认对话框 */}
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
    </div>
  );
};