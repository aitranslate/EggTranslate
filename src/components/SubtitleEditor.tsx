import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit3, Save, X, Search, Filter, FileText, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { SubtitleFile, SubtitleEntry, Term } from '@/types';
import { useErrorHandler } from '@/hooks/useErrorHandler';
import { useSubtitleStore } from '@/stores/subtitleStore';

interface SubtitleEditorProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;  // 改为传递 ID，从 Store 实时订阅
}

export const SubtitleEditor: React.FC<SubtitleEditorProps> = ({
  isOpen,
  onClose,
  fileId
}) => {
  // ✅ 从 Store 获取文件元数据
  const file = useSubtitleStore((state) => state.getFile(fileId));

  // ✅ 使用 getFileEntries 从 DataManager 延迟加载完整字幕条目
  const getFileEntries = useSubtitleStore((state) => state.getFileEntries);
  const entries = getFileEntries(fileId);

  const updateEntry = useSubtitleStore((state) => state.updateEntry);

  // 使用统一错误处理
  const { handleError } = useErrorHandler();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'translated' | 'untranslated'>('all');
  const [retranslatingIds, setRetranslatingIds] = useState<Set<number>>(new Set());

  // ✅ entries 来自 Store 订阅，会实时更新
  const fileEntries = useMemo(() => {
    return entries || [];
  }, [entries]);

  // 筛选和搜索
  const filteredEntries = useMemo(() => {
    let filtered = fileEntries || [];
    
    // 按状态筛选
    if (filterType === 'translated') {
      filtered = filtered.filter((entry) => entry.translatedText);
    } else if (filterType === 'untranslated') {
      filtered = filtered.filter((entry) => !entry.translatedText);
    }
    
    // 按关键词搜索
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter((entry) =>
        entry.text.toLowerCase().includes(term) ||
        (entry.translatedText && entry.translatedText.toLowerCase().includes(term))
      );
    }
    
    return filtered;
  }, [fileEntries, filterType, searchTerm]);

  const onStartEdit = useCallback((entry: SubtitleEntry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
    setEditTranslation(entry.translatedText || '');
  }, []);

  const onSaveEdit = useCallback(async () => {
    if (editingId === null || !file?.id) return;

    try {
      await updateEntry(file.id, editingId, editText, editTranslation);
      setEditingId(null);
      setEditText('');
      setEditTranslation('');
      toast.success('保存成功');
    } catch (error) {
      handleError(error, {
        context: { operation: '保存字幕编辑' }
      });
    }
  }, [editingId, editText, editTranslation, updateEntry, handleError, file]);

  const onCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText('');
    setEditTranslation('');
  }, []);

  const handleRetranslate = useCallback(async (entryId: number) => {
    if (!file?.id) return;

    // 添加到重译集合
    setRetranslatingIds(prev => new Set(prev).add(entryId));

    try {
      // 获取翻译配置
      const { useTranslationConfigStore } = await import('@/stores/translationConfigStore');
      const config = useTranslationConfigStore.getState().config;

      // 获取当前条目
      const entry = fileEntries.find(e => e.id === entryId);
      if (!entry) {
        throw new Error('条目不存在');
      }

      // 获取索引
      const currentIndex = fileEntries.findIndex(e => e.id === entryId);

      // 构造前后文
      const beforeTexts = fileEntries
        .slice(Math.max(0, currentIndex - config.contextBefore), currentIndex)
        .map(e => e.text)
        .join('\n');

      const afterTexts = fileEntries
        .slice(currentIndex + 1, Math.min(fileEntries.length, currentIndex + 1 + config.contextAfter))
        .map(e => e.text)
        .join('\n');

      // 获取相关术语（使用 getRelevantTerms 逻辑）
      const { default: dataManager } = await import('@/services/dataManager');
      const allTerms = dataManager.getTerms();

      // 合并所有文本
      const fullText = `${beforeTexts} ${entry.text} ${afterTexts}`;
      const cleanedFullText = fullText.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

      // 预处理术语
      const processedTerms = allTerms.map((term: Term) => ({
        ...term,
        cleanedOriginal: term.original.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
      }));

      // 筛选出在清洗后文本中出现的术语
      const relevantTerms = processedTerms
        .filter(term => term.cleanedOriginal && cleanedFullText.includes(term.cleanedOriginal))
        .map(({ original, translation, notes }) => ({ original, translation, notes }));

      // 格式化为提示词格式
      const termsText = relevantTerms.map(term => {
        if (term.notes) {
          return `${term.original} -> ${term.translation} // ${term.notes}`;
        }
        return `${term.original} -> ${term.translation}`;
      }).join('\n');

      // 调用翻译 API
      const result = await useTranslationConfigStore.getState().translateBatch(
        [entry.text],
        undefined,
        beforeTexts,
        afterTexts,
        termsText
      );

      // 解析结果
      const translation = result.translations["1"]?.direct;
      if (!translation) {
        throw new Error('翻译返回空结果');
      }

      // 更新条目
      await updateEntry(file.id, entryId, entry.text, translation);
      // 界面自动更新，无需提示

    } catch (error) {
      handleError(error, {
        context: { operation: '重译字幕', entryId }
      });
    } finally {
      // 从重译集合中移除
      setRetranslatingIds(prev => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  }, [file, fileEntries, updateEntry, handleError]);


  const translationStats = useMemo(() => {
    const entriesArray = fileEntries || [];
    const translated = entriesArray.filter((entry) => entry.translatedText).length;
    return {
      total: entriesArray.length,
      translated,
      untranslated: entriesArray.length - translated,
      percentage: entriesArray.length > 0 ? Math.round((translated / entriesArray.length) * 100) : 0
    };
  }, [fileEntries]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative max-w-4xl w-full max-h-[90vh] bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 rounded-xl border border-white/20 shadow-2xl"
      >
        {/* 模态框头部 */}
        <div className="flex items-center justify-between p-6 border-b border-white/20">
          <div className="flex items-center space-x-3">
            <FileText className="h-6 w-6 text-purple-400" />
            <div>
              <h3 className="text-xl font-semibold text-white">
                字幕编辑器 - {file?.name || '未知文件'}
              </h3>
              <div className="text-sm text-white/60">
                {translationStats.total} 条字幕
              </div>
            </div>
          </div>
          
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white/80" />
          </button>
        </div>

        {/* 模态框内容 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
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
                  onChange={(e) => setFilterType(e.target.value as 'all' | 'translated' | 'untranslated')}
                  className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-purple-400 transition-colors"
                >
                  <option value="all" className="bg-gray-800">全部</option>
                  <option value="translated" className="bg-gray-800">已翻译</option>
                  <option value="untranslated" className="bg-gray-800">未翻译</option>
                </select>
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
            <div className="space-y-3">
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
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => onStartEdit(entry)}
                          className="p-1 hover:bg-white/20 rounded transition-colors"
                          title="编辑"
                        >
                          <Edit3 className="h-4 w-4 text-white/60" />
                        </button>
                        <button
                          onClick={() => handleRetranslate(entry.id)}
                          disabled={retranslatingIds.has(entry.id)}
                          className="p-1 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                          title={retranslatingIds.has(entry.id) ? "翻译中" : "重译"}
                        >
                          <RefreshCw className={`h-4 w-4 text-blue-400 ${retranslatingIds.has(entry.id) ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
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
        </div>
      </motion.div>
    </div>
  );
};