import React, { useState, useCallback } from 'react';
import { useHistory } from '@/contexts/HistoryContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Trash2,
  Calendar,
  FileText,
  BarChart3,
  Search,
  RefreshCw,
  Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import { exportTaskSRT, exportTaskTXT, exportTaskBilingual } from '@/services/SubtitleExporter';
import { downloadSubtitleFile } from '@/utils/fileExport';
import { TranslationHistoryEntry } from '@/types';
import { ConfirmDialog } from './ConfirmDialog';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const {
    history,
    deleteHistoryEntry,
    clearHistory,
    getHistoryStats
  } = useHistory();

  const { handleError } = useErrorHandler();

  const [searchTerm, setSearchTerm] = useState('');
  const [exportingTaskId, setExportingTaskId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const stats = getHistoryStats();

  const filteredHistory = React.useMemo(() => {
    if (!searchTerm) return history;

    const term = searchTerm.toLowerCase();
    return history.filter(entry =>
      entry.filename.toLowerCase().includes(term)
    );
  }, [history, searchTerm]);

  const onDelete = useCallback(async (taskId: string) => {
    const entry = history.find(e => e.taskId === taskId);
    if (!entry) return;

    setDeletingTaskId(taskId);
    setShowDeleteConfirm(true);
  }, [history]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTaskId) return;

    try {
      await deleteHistoryEntry(deletingTaskId);
      toast.success('历史记录已删除');
    } catch (error) {
      handleError(error, {
        context: { operation: '删除历史记录' }
      });
    } finally {
      setShowDeleteConfirm(false);
      setDeletingTaskId(null);
    }
  }, [deleteHistoryEntry, deletingTaskId, handleError]);

  const onClear = useCallback(async () => {
    if (history.length === 0) return;
    setShowClearConfirm(true);
  }, [history.length]);

  const handleConfirmClear = useCallback(async () => {
    try {
      await clearHistory();
      toast.success('已清空所有历史记录');
    } catch (error) {
      handleError(error, {
        context: { operation: '清空历史记录' }
      });
    } finally {
      setShowClearConfirm(false);
    }
  }, [clearHistory, handleError]);

  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  }, []);

  const onExport = useCallback(async (entry: TranslationHistoryEntry, format: 'srt' | 'txt' | 'bilingual') => {
    try {
      setExportingTaskId(entry.taskId);

      let content = '';
      let extension: 'srt' | 'txt' = 'txt';

      switch (format) {
        case 'srt':
          content = exportTaskSRT(entry.taskId, true);
          extension = 'srt';
          break;
        case 'txt':
          content = exportTaskTXT(entry.taskId, true);
          extension = 'txt';
          break;
        case 'bilingual':
          content = exportTaskBilingual(entry.taskId);
          extension = 'srt';
          break;
      }

      if (!content) {
        toast.error('该历史记录没有可导出的字幕数据');
        return;
      }

      downloadSubtitleFile(content, entry.filename, extension);
      toast.success('导出成功');
    } catch (error) {
      handleError(error, {
        context: { operation: '导出历史记录', fileName: entry.filename }
      });
    } finally {
      setExportingTaskId(null);
    }
  }, [handleError]);

  if (!isOpen) return null;

  const deletingEntry = deletingTaskId
    ? history.find(e => e.taskId === deletingTaskId)
    : null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="apple-heading-medium">翻译历史</h2>
            <span className="px-2.5 py-1 bg-purple-100 text-purple-700 text-sm rounded-full font-medium">
              {history.length} 条记录
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* 统计信息 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-sm text-gray-600">总记录数</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalTokens.toLocaleString()}</div>
            <div className="text-sm text-gray-600">总Token数</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {history.length > 0 ? Math.round(stats.totalTokens / stats.total).toLocaleString() : 0}
            </div>
            <div className="text-sm text-gray-600">平均Token</div>
          </div>
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">
              {history.reduce((sum, entry) => sum + entry.completedCount, 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">总字幕数</div>
          </div>
        </div>

        {/* 搜索和操作 */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索历史记录..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          </div>

          <button
            onClick={onClear}
            disabled={history.length === 0}
            className="apple-button apple-button-ghost text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            <span>清空历史</span>
          </button>
        </div>

        {/* 历史记录列表 */}
        <div className="space-y-3">
          <AnimatePresence>
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchTerm ? '没有找到匹配的记录' : '暂无历史记录'}
              </div>
            ) : (
              filteredHistory.map((entry) => (
                <motion.div
                  key={entry.taskId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="border border-gray-200 rounded-xl p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* 文件名 */}
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-blue-500 flex-shrink-0" />
                        <span className="text-gray-900 font-medium truncate max-w-[200px] sm:max-w-[300px]" title={entry.filename}>
                          {entry.filename}
                        </span>
                        <span className="px-2 py-1 text-xs rounded-full text-emerald-700 bg-emerald-100 flex-shrink-0">
                          已完成
                        </span>
                      </div>

                      {/* 统计信息 */}
                      <div className="flex flex-wrap items-center text-sm text-gray-600 gap-4">
                        <div className="flex items-center gap-1">
                          <BarChart3 className="h-3 w-3" />
                          <span>{entry.completedCount} 条字幕</span>
                        </div>
                        <span>{entry.totalTokens.toLocaleString()} tokens</span>
                      </div>

                      {/* 完成时间 */}
                      <div className="flex items-center text-sm text-gray-500 gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>完成时间: {formatDate(entry.timestamp)}</span>
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      {/* 导出按钮 */}
                      <div className="relative">
                        <button
                          onClick={() => setExportingTaskId(exportingTaskId === entry.taskId ? null : entry.taskId)}
                          disabled={!entry.current_translation_task?.subtitle_entries?.length}
                          className="apple-button apple-button-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="h-3 w-3" />
                          <span>导出</span>
                        </button>

                        {/* 导出菜单 */}
                        {exportingTaskId === entry.taskId && (
                          <>
                            <div className="absolute bottom-full mb-2 right-0 z-50">
                              <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-1 min-w-[160px]">
                                <button
                                  onClick={() => {
                                    onExport(entry, 'srt');
                                    setExportingTaskId(null);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-3"
                                >
                                  <span>📄</span>
                                  <span>SRT 格式</span>
                                </button>
                                <button
                                  onClick={() => {
                                    onExport(entry, 'txt');
                                    setExportingTaskId(null);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-3"
                                >
                                  <span>📝</span>
                                  <span>TXT 格式</span>
                                </button>
                                <button
                                  onClick={() => {
                                    onExport(entry, 'bilingual');
                                    setExportingTaskId(null);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-3"
                                >
                                  <span>🔄</span>
                                  <span>双语对照</span>
                                </button>
                              </div>
                            </div>

                            {/* 点击外部区域关闭菜单的遮罩层 */}
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setExportingTaskId(null)}
                            />
                          </>
                        )}
                      </div>

                      {/* 删除按钮 */}
                      <button
                        onClick={() => onDelete(entry.taskId)}
                        className="apple-button apple-button-ghost text-red-600 hover:bg-red-50 text-sm"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>删除</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* 清空历史确认对话框 */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="确认清空"
        message={`确定要清空所有 ${history.length} 条历史记录吗？此操作不可恢复。`}
        confirmText="确认清空"
        confirmButtonClass="bg-red-500 hover:bg-red-600 text-white"
      />

      {/* 删除历史记录确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeletingTaskId(null);
        }}
        onConfirm={handleConfirmDelete}
        title="确认删除"
        message={deletingEntry ? `确定要删除历史记录 "${deletingEntry.filename}" 吗？此操作不可恢复。` : ''}
        confirmText="确认删除"
        confirmButtonClass="bg-red-500 hover:bg-red-600 text-white"
      />
    </div>
  );
};
