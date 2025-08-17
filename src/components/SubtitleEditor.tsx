import React, { useState, useCallback, useMemo } from 'react';
import { useSingleSubtitle } from '@/contexts/SubtitleContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Save, X, Search, Filter, Trash2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

interface SubtitleEditorProps {
  className?: string;
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({ className }) => {
  // 对于主编辑器，我们仍然使用第一个文件（向后兼容）
  const { entries, updateEntry, clearAllData } = useSingleSubtitle();
  const { resetProgress } = useTranslation();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'translated' | 'untranslated'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // 筛选和搜索
  const filteredEntries = useMemo(() => {
    let filtered = entries;
    
    // 按状态筛选
    if (filterType === 'translated') {
      filtered = filtered.filter(entry => entry.translatedText);
    } else if (filterType === 'untranslated') {
      filtered = filtered.filter(entry => !entry.translatedText);
    }
    
    // 按关键词搜索
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(entry => 
        entry.text.toLowerCase().includes(term) ||
        (entry.translatedText && entry.translatedText.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  }, [entries, filterType, searchTerm]);

  const onStartEdit = useCallback((entry: any) => {
    setEditingId(entry.id);
    setEditText(entry.text);
    setEditTranslation(entry.translatedText || '');
  }, []);

  const onSaveEdit = useCallback(async () => {
    if (editingId === null) return;
    
    try {
      await updateEntry(editingId, editText, editTranslation);
      setEditingId(null);
      setEditText('');
      setEditTranslation('');
      toast.success('保存成功');
    } catch (error) {
      toast.error('保存失败');
    }
  }, [editingId, editText, editTranslation, updateEntry]);

  const onCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
    setEditTranslation('');
  }, []);

  const onClearEntries = useCallback(async () => {
    try {
      // 使用增强的清空功能：清空所有相关数据
      await clearAllData();
      
      // 重置翻译进度和相关状态
      await resetProgress();
      
      // 重置编辑器状态
      setShowClearConfirm(false);
      setEditingId(null);
      setEditText('');
      setEditTranslation('');
      setSearchTerm('');
      setFilterType('all');
      
      // 等待一小段时间确保所有状态都已重置
      setTimeout(() => {
        toast.success('所有数据已清空，可以开始新任务');
      }, 100);
    } catch (error) {
      console.error('清空失败:', error);
      toast.error('清空失败');
    }
  }, [clearAllData, resetProgress]);

  const translationStats = useMemo(() => {
    const translated = entries.filter(entry => entry.translatedText).length;
    return {
      total: entries.length,
      translated,
      untranslated: entries.length - translated,
      percentage: entries.length > 0 ? Math.round((translated / entries.length) * 100) : 0
    };
  }, [entries]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`backdrop-blur-sm bg-white/10 rounded-xl p-6 ${className}`}
    >
      <div className="space-y-4">
        {/* 头部控制 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <h3 className="text-lg font-semibold text-white">
            字幕编辑器
          </h3>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/60" />
              <input
                type="text"
                placeholder="搜索字幕..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/60 focus:outline-none focus:border-purple-400 transition-colors"
              />
            </div>
            
            {/* 筛选器 */}
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-400 transition-colors"
            >
              <option value="all" className="bg-gray-800">全部</option>
              <option value="translated" className="bg-gray-800">已翻译</option>
              <option value="untranslated" className="bg-gray-800">未翻译</option>
            </select>
            
            {/* 清空按钮 */}
            {entries.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center space-x-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-lg transition-colors duration-200"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>清空</span>
                </button>
                
                {/* 确认对话框 */}
                {showClearConfirm && (
                  <>
                    <div className="absolute bottom-full mb-2 right-0 z-50">
                      <div className="bg-black/90 backdrop-blur-sm rounded-lg p-4 space-y-3 min-w-[240px] shadow-2xl border border-white/20">
                        <div className="flex items-start space-x-2">
                          <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-white">
                            <div className="font-medium mb-1">确认清空字幕？</div>
                            <div className="text-white/70">此操作不可恢复，将清除所有字幕内容</div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2 pt-1">
                          <button
                            onClick={onClearEntries}
                            className="flex-1 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-md transition-colors text-sm"
                          >
                            确认清空
                          </button>
                          <button
                            onClick={() => setShowClearConfirm(false)}
                            className="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-md transition-colors text-sm"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* 点击外部区域关闭对话框的遮罩层 */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowClearConfirm(false)}
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* 统计信息 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white/5 rounded-lg">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{translationStats.total}</div>
            <div className="text-xs text-white/60">总数</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-green-400">{translationStats.translated}</div>
            <div className="text-xs text-white/60">已翻译</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-orange-400">{translationStats.untranslated}</div>
            <div className="text-xs text-white/60">未翻译</div>
          </div>
          <div className="text-center">
            <div className="text-xl font-bold text-blue-400">{translationStats.percentage}%</div>
            <div className="text-xs text-white/60">完成率</div>
          </div>
        </div>

        {/* 字幕列表 */}
        <div className="space-y-3 max-h-[800px] overflow-y-auto">
          <AnimatePresence>
            {filteredEntries.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="border border-white/20 rounded-lg p-4 bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="text-sm text-white/60">
                    #{entry.id} | {entry.startTime} {'-->'} {entry.endTime}
                  </div>
                  <button
                    onClick={() => onStartEdit(entry)}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                  >
                    <Edit3 className="h-4 w-4 text-white/60" />
                  </button>
                </div>
                
                {editingId === entry.id ? (
                  <div className="space-y-3">
                    {/* 原文编辑 */}
                    <div>
                      <label className="block text-sm text-white/80 mb-1">原文</label>
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white resize-none focus:outline-none focus:border-purple-400 transition-colors"
                        rows={2}
                      />
                    </div>
                    
                    {/* 译文编辑 */}
                    <div>
                      <label className="block text-sm text-white/80 mb-1">译文</label>
                      <textarea
                        value={editTranslation}
                        onChange={(e) => setEditTranslation(e.target.value)}
                        placeholder="请输入翻译..."
                        className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white resize-none focus:outline-none focus:border-purple-400 transition-colors"
                        rows={2}
                      />
                    </div>
                    
                    {/* 操作按钮 */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={onSaveEdit}
                        className="flex items-center space-x-1 px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-200 border border-green-500/30 rounded transition-colors"
                      >
                        <Save className="h-3 w-3" />
                        <span>保存</span>
                      </button>
                      <button
                        onClick={onCancelEdit}
                        className="flex items-center space-x-1 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded transition-colors"
                      >
                        <X className="h-3 w-3" />
                        <span>取消</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-white">{entry.text}</div>
                    <div className={`${entry.translatedText ? 'text-blue-200' : 'text-white/40 italic'}`}>
                      {entry.translatedText || '未翻译'}
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          
          {filteredEntries.length === 0 && (
            <div className="text-center py-8 text-white/60">
              {searchTerm || filterType !== 'all' ? '没有找到匹配的字幕' : '没有字幕数据'}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};