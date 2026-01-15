import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileText, CheckCircle } from 'lucide-react';
import { useSubtitleStore } from '@/stores/subtitleStore';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { useErrorHandler } from '@/hooks/useErrorHandler';

interface BatchFileUploadProps {
  className?: string;
}

export const BatchFileUpload: React.FC<BatchFileUploadProps> = ({ className }) => {
  const addFile = useSubtitleStore((state) => state.addFile);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 使用统一错误处理
  const { handleError } = useErrorHandler();

  const handleFile = useCallback(async (file: File) => {
    const ext = file.name.toLowerCase().split('.').pop();

    // 支持的文件类型
    const supportedTypes = ['srt', 'mp3', 'wav', 'm4a', 'ogg', 'flac', 'mp4', 'webm', 'mkv', 'avi', 'mov'];

    if (!ext || !supportedTypes.includes(ext)) {
      toast.error(`不支持的文件格式，请选择 .srt 字幕或音视频文件`);
      return;
    }

    try {
      setIsUploading(true);
      await addFile(file);

      // 文件由Store管理，不需要本地状态

      toast.success(`成功加载 ${file.name}`);
    } catch (err) {
      handleError(err, {
        context: { operation: '加载文件', fileName: file.name }
      });
    } finally {
      setIsUploading(false);
    }
  }, [addFile, handleError]);

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
            accept=".srt,.mp3,.wav,.m4a,.ogg,.flac,.mp4,.webm,.mkv,.avi,.mov,audio/*,video/*"
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
                {isDragging ? '放开文件即可上传' : '拖拽上传 SRT 字幕或音视频文件'}
              </h3>
              <p className="text-white/70">
                {isUploading ? '正在加载...' : '拖拽多个文件到此处或点击选择文件'}
              </p>
              <p className="text-sm text-white/60 mt-1">
                支持 .srt .mp3 .wav .m4a .mp4 .webm .ogg 等格式
              </p>
            </div>
            
            <div className="flex items-center space-x-2 text-sm text-white/60">
              <FileText className="h-4 w-4" />
              <span>支持多文件上传</span>
            </div>
          </div>
        </div>

        </motion.div>
    </div>
  );
};