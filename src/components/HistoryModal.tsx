import React, { useState, useCallback } from 'react';
import { useHistory } from '@/contexts/HistoryContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  History, 
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
import { toSRT, toTXT, toBilingual } from '@/utils/srtParser';
import { ConfirmDialog } from './ConfirmDialog';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, onClose }) => {
  const { 
    history, 
    deleteHistoryEntry, 
    clearHistory,
    loadTaskFromHistory,
    getHistoryStats 
  } = useHistory();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingTaskId, setExportingTaskId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  
  const stats = getHistoryStats();
  
  // 筛选历史记录
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
    
    // 显示自定义确认对话框
    setDeletingTaskId(taskId);
    setShowDeleteConfirm(true);
  }, [history]);
  
  const handleConfirmDelete = useCallback(async () => {
    if (!deletingTaskId) return;
    
    try {
      await deleteHistoryEntry(deletingTaskId);
      toast.success('历史记录已删除');
    } catch (error) {
      toast.error('删除失败');
    } finally {
      setShowDeleteConfirm(false);
      setDeletingTaskId(null);
    }
  }, [deleteHistoryEntry, deletingTaskId]);
  
  const onClear = useCallback(async () => {
    if (history.length === 0) return;
    
    // 显示自定义确认对话框
    setShowClearConfirm(true);
  }, [history.length]);
  
  const handleConfirmClear = useCallback(async () => {
    try {
      await clearHistory();
      toast.success('已清空所有历史记录');
    } catch (error) {
      toast.error('清空失败');
    } finally {
      setShowClearConfirm(false);
    }
  }, [clearHistory]);
  
  const formatDate = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN');
  }, []);

  // 导出历史任务
  const onExport = useCallback(async (entry: any, format: 'srt' | 'txt' | 'bilingual') => {
    try {
      setExportingTaskId(entry.taskId);
      
      const subtitleEntries = entry.current_translation_task?.subtitle_entries || [];
      
      if (subtitleEntries.length === 0) {
        toast.error('该历史记录没有可导出的字幕数据');
        return;
      }
      
      let content = '';
      let extension = '';
      
      switch (format) {
        case 'srt':
          content = toSRT(subtitleEntries, true);
          extension = 'srt';
          break;
        case 'txt':
          content = toTXT(subtitleEntries, true);
          extension = 'txt';
          break;
        case 'bilingual':
          content = toBilingual(subtitleEntries);
          extension = 'srt';
          break;
      }
      
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      
      const baseName = entry.filename.replace(/\.srt$/i, '');
      a.href = url;
      a.download = `${baseName}_translated.${extension}`;
      a.click();
      
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      toast.error('导出失败');
    } finally {
      setExportingTaskId(null);
    }
  }, []);
  
  if (!isOpen) return null;
  
  // 获取当前要删除的历史记录条目
  const deletingEntry = deletingTaskId 
    ? history.find(e => e.taskId === deletingTaskId) 
    : null;
  
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="bg-white/10 backdrop-blur-md rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-2">
            <History className="h-6 w-6 text-white" />
            <h2 className="text-2xl font-bold text-white">翻译历史</h2>
            <span className="px-2 py-1 bg-purple-500/30 text-purple-200 text-sm rounded-full">
              {history.length} 条记录
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
        
        {/* 统计信息 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white/5 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-white">{stats.total}</div>
            <div className="text-sm text-white/60">总记录数</div>
          </div>
          <div className="bg-white/5 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-400">{stats.totalTokens.toLocaleString()}</div>
            <div className="text-sm text-white/60">总Token数</div>
          </div>
          <div className="bg-white/5 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-400">
              {history.length > 0 ? Math.round(stats.totalTokens / stats.total).toLocaleString() : 0}
            </div>
            <div className="text-sm text-white/60">平均Token</div>
          </div>
          <div className="bg-white/5 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-400">
              {history.reduce((sum, entry) => sum + entry.completedCount, 0).toLocaleString()}
            </div>
            <div className="text-sm text-white/60">总字幕数</div>
          </div>
        </div>
        
        {/* 搜索和操作 */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center space-y-4 sm:space-y-0 sm:space-x-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
            <input
              type="text"
              placeholder="搜索历史记录..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 w-full bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:border-purple-400 transition-colors"
            />
          </div>
          
          <button
            onClick={onClear}
            disabled={history.length === 0}
            className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Trash2 className="h-4 w-4" />
            <span>清空历史</span>
          </button>
        </div>
        
        {/* 历史记录列表 */}
        <div className="space-y-3">
          <AnimatePresence>
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12 text-white/60">
                {searchTerm ? '没有找到匹配的记录' : '暂无历史记录'}
              </div>
            ) : (
              filteredHistory.map((entry) => (
                <motion.div
                  key={entry.taskId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="border border-white/20 rounded-lg p-4 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between space-y-4 lg:space-y-0">
                    <div className="flex-1 space-y-2">
                      {/* 文件名 */}
                      <div className="flex items-center space-x-3">
                        <FileText className="h-5 w-5 text-blue-400" />
                        <span className="text-white font-medium">{entry.filename}</span>
                        <span className="px-2 py-1 text-xs rounded-full text-green-400 bg-green-500/20">
                          已完成
                        </span>
                      </div>
                      
                      {/* 统计信息 */}
                      <div className="flex flex-wrap items-center text-sm text-white/70 space-x-4">
                        <div className="flex items-center space-x-1">
                          <BarChart3 className="h-3 w-3" />
                          <span>{entry.completedCount} 条字幕</span>
                        </div>
                        <span>{entry.totalTokens.toLocaleString()} tokens</span>
                      </div>
                      
                      {/* 完成时间 */}
                      <div className="flex items-center text-sm text-white/60 space-x-1">
                        <Calendar className="h-3 w-3" />
                        <span>完成时间: {formatDate(entry.timestamp)}</span>
                      </div>
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex items-center space-x-2">
                      {/* 导出按钮 */}
                      <div className="relative">
                        <button
                          onClick={() => setExportingTaskId(exportingTaskId === entry.taskId ? null : entry.taskId)}
                          disabled={!entry.current_translation_task?.subtitle_entries?.length}
                          className="flex items-center space-x-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-200 border border-green-500/30 rounded-lg transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Download className="h-3 w-3" />
                          <span>导出</span>
                        </button>
                        
                        {/* 导出菜单 */}
                        {exportingTaskId === entry.taskId && (
                          <>
                            <div className="absolute bottom-full mb-2 right-0 z-50">
                              <div className="bg-black/90 backdrop-blur-sm rounded-lg p-1 space-y-1 min-w-[140px] shadow-2xl border border-white/20">
                                <button
                                  onClick={() => {
                                    onExport(entry, 'srt');
                                    setExportingTaskId(null);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                                >
                                  <span>📄</span>
                                  <span>SRT 格式</span>
                                </button>
                                <button
                                  onClick={() => {
                                    onExport(entry, 'txt');
                                    setExportingTaskId(null);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
                                >
                                  <span>📝</span>
                                  <span>TXT 格式</span>
                                </button>
                                <button
                                  onClick={() => {
                                    onExport(entry, 'bilingual');
                                    setExportingTaskId(null);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/20 rounded-md transition-colors duration-150 flex items-center space-x-2"
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
                        className="flex items-center space-x-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-lg transition-colors text-sm"
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
        confirmButtonClass="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
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
        confirmButtonClass="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
      />
    </div>
  );
};