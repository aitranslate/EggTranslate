import React, { useCallback, useState } from 'react';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';

interface FileUploadProps {
  className?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ className }) => {
  const { loadFromFile, isLoading, error } = useSubtitle();
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.srt')) {
      toast.error('请选择有效的SRT文件');
      return;
    }

    try {
      await loadFromFile(file);
      toast.success(`成功加载 ${file.name}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '文件加载失败';
      toast.error(errorMessage);
    }
  }, [loadFromFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        {/* 文件上传区域 */}
        <div
          className={`
            relative w-full p-8 border-2 border-dashed rounded-xl transition-all duration-300
            backdrop-blur-sm bg-white/10 hover:bg-white/20
            ${isDragging 
              ? 'border-purple-400 bg-purple-500/20 scale-105' 
              : 'border-white/30 hover:border-white/50'
            }
            ${isLoading ? 'pointer-events-none opacity-50' : ''}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept=".srt"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isLoading}
          />
          
          <div className="flex flex-col items-center justify-center space-y-4">
            {isLoading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            ) : (
              <Upload className="h-12 w-12 text-white/80" />
            )}
            
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">
                {isDragging ? '放开文件即可上传' : '上传SRT字幕文件'}
              </h3>
              <p className="text-white/70">
                {isLoading ? '正在加载...' : '拖拽文件到此处或点击选择文件'}
              </p>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-white/60">
              <FileText className="h-4 w-4" />
              <span>支持 .srt 格式</span>
            </div>
          </div>
        </div>
        
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-lg bg-red-500/20 border border-red-500/30 backdrop-blur-sm"
          >
            <div className="flex items-center space-x-2 text-red-200">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};