import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { 
  Settings, 
  BookOpen, 
  History, 
  Zap
} from 'lucide-react';
import { FileUpload } from './FileUpload';
import { BatchFileUpload } from './BatchFileUpload';
import { SubtitleFileList } from './SubtitleFileList';
import { TranslationControls } from './TranslationControls';
import { SubtitleEditor } from './SubtitleEditor';
import { SubtitleEditorModal } from './SubtitleEditorModal';
import { ProgressDisplay } from './ProgressDisplay';
import { SettingsModal } from './SettingsModal';
import { TermsManager } from './TermsManager';
import { HistoryModal } from './HistoryModal';
import { useSubtitle, useSingleSubtitle } from '@/contexts/SubtitleContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useHistory } from '@/contexts/HistoryContext';
import { useTerms } from '@/contexts/TermsContext';
import dataManager from '@/services/dataManager';

export const MainApp: React.FC = () => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<any>(null);
  const [isEditingModalOpen, setIsEditingModalOpen] = useState(false);
  const { files, getAllFiles } = useSubtitle();
  const singleSubtitle = useSingleSubtitle();
  const { entries, filename } = singleSubtitle;
  const { isTranslating, isConfigured } = useTranslation();
  const { history } = useHistory();
  const { terms } = useTerms();

  const handleEditFile = useCallback((file: any) => {
    setEditingFile(file);
    setIsEditingModalOpen(true);
  }, []);

  const handleCloseEditModal = useCallback(async () => {
    try {
      // 在关闭前强制持久化所有数据
      await dataManager.forcePersistAllData();
      console.log('数据已持久化到localforage');
    } catch (error) {
      console.error('数据持久化失败:', error);
    } finally {
      setIsEditingModalOpen(false);
      setEditingFile(null);
    }
  }, []);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 overflow-x-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 opacity-20 overflow-hidden">
        <div className="absolute top-0 left-0 w-72 h-72 bg-purple-500 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute top-1/2 right-0 w-96 h-96 bg-blue-500 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-indigo-500 rounded-full blur-3xl transform translate-y-1/2"></div>
      </div>

      <div className="relative z-10 w-full">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-lg border-b border-white/20 shadow-lg">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                AI字幕翻译
              </h1>
              
              {/* Navigation buttons - evenly spaced */}
              <div className="flex items-center space-x-8">
                <button
                  onClick={() => setIsTermsOpen(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg transition-colors"
                >
                  <BookOpen className="h-4 w-4" />
                  <span>术语</span>
                  {terms.length > 0 && (
                    <span className="px-1 py-0.5 text-xs bg-blue-400 text-blue-900 rounded">{terms.length}</span>
                  )}
                </button>
                
                <button
                  onClick={() => setIsHistoryOpen(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-lg transition-colors"
                >
                  <History className="h-4 w-4" />
                  <span>历史</span>
                  {history.length > 0 && (
                    <span className="px-1 py-0.5 text-xs bg-purple-400 text-purple-900 rounded">{history.length}</span>
                  )}
                </button>
                
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    isConfigured
                      ? 'bg-green-500/20 text-green-200 border border-green-500/30'
                      : 'bg-orange-500/20 text-orange-200 border border-orange-500/30'
                  }`}
                >
                  <Settings className="h-4 w-4" />
                  <span>设置</span>
                  {!isConfigured && (
                    <span className="px-1 py-0.5 text-xs bg-orange-400 text-orange-900 rounded">必须</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 主内容区域 */}
        <div className="w-full px-4 pb-8">
          <div className="max-w-6xl mx-auto space-y-6 py-6">
            {/* 批量文件上传 */}
            <BatchFileUpload />

            {/* 字幕文件列表 */}
            {files.length > 0 && (
              <SubtitleFileList 
                onEditFile={handleEditFile}
                onCloseEditModal={handleCloseEditModal}
              />
            )}

            </div>
        </div>

        {/* 底部信息 */}
        <footer className="w-full px-4 py-8">
          <div className="text-center text-white/60 space-y-2">
            <p>由 MiniMax Agent 开发</p>
            <p className="text-sm">支持多种格式导出，本地存储，隐私安全</p>
          </div>
        </footer>
      </div>

      {/* 模态框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <TermsManager
        isOpen={isTermsOpen}
        onClose={() => setIsTermsOpen(false)}
      />
      <HistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
      />
      <SubtitleEditorModal
        isOpen={isEditingModalOpen}
        onClose={handleCloseEditModal}
        file={editingFile}
      />
    </div>
  );
};