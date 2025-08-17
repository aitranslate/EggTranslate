import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { useSubtitle } from '@/contexts/SubtitleContext';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

interface BatchFileUploadProps {
  className?: string;
}

export const BatchFileUpload: React.FC<BatchFileUploadProps> = ({ className }) => {
  const { loadFromFile, isLoading, error, files } = useSubtitle();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.srt')) {
      toast.error('请选择有效的SRT文件');
      return;
    }

    try {
      setIsUploading(true);
      await loadFromFile(file);
      
      // 文件由Context管理，不需要本地状态
      
      toast.success(`成功加载 ${file.name}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '文件加载失败';
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  }, [loadFromFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => handleFile(file));
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => handleFile(file));
    
    // 重置文件输入框的值，确保可以再次选择同一个文件
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [handleFile]);

  
  return (
    <div className={className}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full"
      >
        {/* 批量上传区域 */}
        <div
          className={`
            relative w-full p-8 border-2 border-dashed rounded-xl transition-all duration-300
            backdrop-blur-sm bg-white/10 hover:bg-white/20
            ${isDragging 
              ? 'border-purple-400 bg-purple-500/20 scale-105' 
              : 'border-white/30 hover:border-white/50'
            }
            ${isUploading ? 'pointer-events-none opacity-50' : ''}
          `}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".srt"
            multiple
            onChange={onFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          
          <div className="flex flex-col items-center justify-center space-y-4">
            {isUploading ? (
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
            ) : (
              <Upload className="h-12 w-12 text-white/80" />
            )}
            
            <div className="text-center">
              <h3 className="text-xl font-semibold text-white mb-2">
                {isDragging ? '放开文件即可上传' : '批量上传SRT字幕文件'}
              </h3>
              <p className="text-white/70">
                {isUploading ? '正在加载...' : '拖拽多个文件到此处或点击选择文件'}
              </p>
              <p className="text-sm text-white/60 mt-1">
                支持多个 .srt 格式文件
              </p>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-white/60">
              <FileText className="h-4 w-4" />
              <span>支持多文件上传</span>
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