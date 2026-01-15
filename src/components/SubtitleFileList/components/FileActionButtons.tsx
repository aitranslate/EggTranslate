import { useState, useMemo } from 'react';
import { Languages, Mic, Edit3, Download, Trash2 } from 'lucide-react';
import { SubtitleFile } from '@/types';
import { canRetranscribe } from '@/utils/fileUtils';

interface FileActionButtonsProps {
  file: SubtitleFile;
  isTranslating: boolean;
  translationStats: {
    percentage: number;
  };
  isTranslatingGlobally: boolean;
  currentTranslatingFileId: string | null;
  onTranscribe: () => void;
  onStartTranslation: () => void;
  onEdit: () => void;
  onExport: (format: 'srt' | 'txt' | 'bilingual') => void;
  onDelete: () => void;
}

export const FileActionButtons: React.FC<FileActionButtonsProps> = ({
  file,
  isTranslating,
  translationStats,
  isTranslatingGlobally,
  currentTranslatingFileId,
  onTranscribe,
  onStartTranslation,
  onEdit,
  onExport,
  onDelete,
}) => {
  const [isExporting, setIsExporting] = useState(false);

  // ✅ 派生状态：从 file.transcriptionStatus 计算
  const isTranscribing = useMemo(() =>
    file.transcriptionStatus === 'transcribing' ||
    file.transcriptionStatus === 'llm_merging' ||
    file.transcriptionStatus === 'decoding' ||
    file.transcriptionStatus === 'chunking' ||
    file.transcriptionStatus === 'loading_model',
    [file.transcriptionStatus]
  );

  const handleExport = (format: 'srt' | 'txt' | 'bilingual') => {
    onExport(format);
    setIsExporting(false);
  };

  return (
    <div className="flex items-center space-x-2">
      {/* 转录按钮 - SRT文件禁用, 已完成的音视频文件禁用 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTranscribe();
        }}
        disabled={!canRetranscribe(file) || isTranscribing}
        className={`flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 ${
          !canRetranscribe(file) || isTranscribing
            ? 'bg-gray-500/10 text-gray-500/30 border border-gray-500/20 cursor-not-allowed opacity-50'
            : 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 hover:scale-110'
        }`}
        title={
          isTranscribing
            ? '转录中...'
            : !canRetranscribe(file)
            ? file.transcriptionStatus === 'completed' && (file.fileType === 'audio-video' || file.type === 'audio' || file.type === 'video')
              ? '音频数据未缓存，需重新上传'
              : 'SRT文件无需转录'
            : '转录'
        }
      >
        {isTranscribing ? (
          <div className="animate-spin h-4 w-4 border-2 border-teal-300 border-t-transparent rounded-full" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>

      {/* 翻译按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onStartTranslation();
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

      {/* 编辑按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/30 transition-all duration-200 hover:scale-110"
        title="编辑"
      >
        <Edit3 className="h-4 w-4" />
      </button>

      {/* 导出按钮 */}
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
          onDelete();
        }}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 transition-all duration-200 hover:scale-110"
        title="删除"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
};
