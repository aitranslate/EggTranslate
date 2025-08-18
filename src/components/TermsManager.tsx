import React, { useState, useCallback } from 'react';
import { useTerms } from '@/contexts/TermsContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit3, Save, X, Upload, Download, BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import { ConfirmDialog } from './ConfirmDialog';

interface TermsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TermsManager: React.FC<TermsManagerProps> = ({ isOpen, onClose }) => {
  const { 
    terms, 
    addTerm, 
    removeTerm, 
    updateTerm, 
    clearTerms, 
    importTerms, 
    exportTerms 
  } = useTerms();
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editOriginal, setEditOriginal] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [newOriginal, setNewOriginal] = useState('');
  const [newTranslation, setNewTranslation] = useState('');
  const [importText, setImportText] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const onAddTerm = useCallback(async () => {
    if (!newOriginal.trim() || !newTranslation.trim()) {
      toast.error('请输入原文和译文');
      return;
    }

    try {
      await addTerm(newOriginal.trim(), newTranslation.trim());
      setNewOriginal('');
      setNewTranslation('');
      toast.success('术语添加成功');
    } catch (error) {
      toast.error('添加术语失败');
    }
  }, [newOriginal, newTranslation, addTerm]);

  const onRemoveTerm = useCallback(async (index: number) => {
    try {
      await removeTerm(index);
      toast.success('术语已删除');
    } catch (error) {
      toast.error('删除术语失败');
    }
  }, [removeTerm]);

  const onStartEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditOriginal(terms[index].original);
    setEditTranslation(terms[index].translation);
  }, [terms]);

  const onSaveEdit = useCallback(async () => {
    if (editingIndex === null) return;
    
    if (!editOriginal.trim() || !editTranslation.trim()) {
      toast.error('请输入原文和译文');
      return;
    }

    try {
      await updateTerm(editingIndex, editOriginal.trim(), editTranslation.trim());
      setEditingIndex(null);
      setEditOriginal('');
      setEditTranslation('');
      toast.success('术语更新成功');
    } catch (error) {
      toast.error('更新术语失败');
    }
  }, [editingIndex, editOriginal, editTranslation, updateTerm]);

  const onCancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditOriginal('');
    setEditTranslation('');
  }, []);

  const onImport = useCallback(async () => {
    if (!importText.trim()) {
      toast.error('请输入要导入的术语');
      return;
    }

    try {
      await importTerms(importText.trim());
      setImportText('');
      setShowImport(false);
      toast.success('术语导入成功');
    } catch (error) {
      toast.error('导入术语失败');
    }
  }, [importText, importTerms]);

  const onExport = useCallback(() => {
    const content = exportTerms();
    if (!content) {
      toast.error('没有可导出的术语');
      return;
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'terms.txt';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('术语导出成功');
  }, [exportTerms]);

  const onClearAll = useCallback(async () => {
    if (terms.length === 0) return;
    
    // 显示自定义确认对话框
    setShowClearConfirm(true);
  }, [terms.length]);

  const handleConfirmClear = useCallback(async () => {
    try {
      await clearTerms();
      toast.success('已清空所有术语');
    } catch (error) {
      toast.error('清空术语失败');
    } finally {
      setShowClearConfirm(false);
    }
  }, [clearTerms]);

  if (!isOpen) return null;

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
            <BookOpen className="h-6 w-6 text-white" />
            <h2 className="text-2xl font-bold text-white">术语管理</h2>
            <span className="px-2 py-1 bg-purple-500/30 text-purple-200 text-sm rounded-full">
              {terms.length} 个术语
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        <div className="space-y-6">
          {/* 添加术语 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
              添加新术语
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="原文"
                value={newOriginal}
                onChange={(e) => setNewOriginal(e.target.value)}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 transition-colors"
                onKeyPress={(e) => e.key === 'Enter' && onAddTerm()}
              />
              <input
                type="text"
                placeholder="译文"
                value={newTranslation}
                onChange={(e) => setNewTranslation(e.target.value)}
                className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 transition-colors"
                onKeyPress={(e) => e.key === 'Enter' && onAddTerm()}
              />
            </div>
            <button
              onClick={onAddTerm}
              className="flex items-center space-x-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-200 border border-green-500/30 rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>添加术语</span>
            </button>
          </div>

          {/* 导入/导出 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
              导入/导出
            </h3>
            <div className="flex flex-wrap items-center space-x-3">
              <button
                onClick={() => setShowImport(!showImport)}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors"
              >
                <Upload className="h-4 w-4" />
                <span>导入术语</span>
              </button>
              <button
                onClick={onExport}
                disabled={terms.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="h-4 w-4" />
                <span>导出术语</span>
              </button>
              <button
                onClick={onClearAll}
                disabled={terms.length === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                <span>清空全部</span>
              </button>
            </div>

            {/* 导入文本框 */}
            <AnimatePresence>
              {showImport && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <textarea
                    placeholder="请输入术语，每行一个，原文和译文用冒号(:)分隔，例如：原文:译文..."
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    rows={6}
                    className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-purple-400 transition-colors resize-none"
                  />
                  <div className="flex space-x-3">
                    <button
                      onClick={onImport}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 rounded-lg transition-colors"
                    >
                      确认导入
                    </button>
                    <button
                      onClick={() => setShowImport(false)}
                      className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 text-gray-200 border border-gray-500/30 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* 术语列表 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white border-b border-white/20 pb-2">
              术语列表
            </h3>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              <AnimatePresence>
                {terms.length === 0 ? (
                  <div className="text-center py-8 text-white/60">
                    暂无术语，请添加术语或导入术语列表
                  </div>
                ) : (
                  terms.map((term, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="border border-white/20 rounded-lg p-4 bg-white/5 hover:bg-white/10 transition-colors"
                    >
                      {editingIndex === index ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <input
                              type="text"
                              value={editOriginal}
                              onChange={(e) => setEditOriginal(e.target.value)}
                              className="w-full p-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400 transition-colors"
                              placeholder="原文"
                            />
                            <input
                              type="text"
                              value={editTranslation}
                              onChange={(e) => setEditTranslation(e.target.value)}
                              className="w-full p-2 bg-white/10 border border-white/20 rounded text-white focus:outline-none focus:border-purple-400 transition-colors"
                              placeholder="译文"
                            />
                          </div>
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
                        <div className="flex items-center justify-between">
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm text-white/60 mb-1">原文</div>
                              <div className="text-white">{term.original}</div>
                            </div>
                            <div>
                              <div className="text-sm text-white/60 mb-1">译文</div>
                              <div className="text-blue-200">{term.translation}</div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1 ml-4">
                            <button
                              onClick={() => onStartEdit(index)}
                              className="p-2 hover:bg-white/20 rounded transition-colors"
                            >
                              <Edit3 className="h-4 w-4 text-white/60" />
                            </button>
                            <button
                              onClick={() => onRemoveTerm(index)}
                              className="p-2 hover:bg-red-500/20 rounded transition-colors"
                            >
                              <Trash2 className="h-4 w-4 text-red-400" />
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 清空术语确认对话框 */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleConfirmClear}
        title="确认清空"
        message={`确定要清空所有 ${terms.length} 个术语吗？此操作不可恢复。`}
        confirmText="确认清空"
        confirmButtonClass="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30"
      />
    </div>
  );
};