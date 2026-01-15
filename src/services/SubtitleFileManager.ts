/**
 * 字幕文件管理服务
 * 负责文件加载、更新、删除等CRUD操作
 */

import { SubtitleEntry, FileType } from '@/types';
import type { SubtitleFile } from '@/types/transcription';
import { parseSRT } from '@/utils/srtParser';
import { detectFileType } from '@/utils/fileFormat';
import dataManager from '@/services/dataManager';
import { generateTaskId, generateStableFileId } from '@/utils/taskIdGenerator';

// 重新导出类型，保持向后兼容
export type { SubtitleFile };

export interface LoadFileOptions {
  existingFilesCount: number;
}

/**
 * 从 File 对象加载字幕文件
 */
export async function loadFromFile(
  file: File,
  options: LoadFileOptions
): Promise<SubtitleFile> {
  const fileType = detectFileType(file.name);

  if (fileType === 'srt') {
    // SRT 文件：读取文本内容
    const content = await file.text();
    const entries = parseSRT(content);

    // 创建批处理任务
    const index = options.existingFilesCount;
    const taskId = await dataManager.createNewTask(file.name, entries, index, {
      fileType: 'srt',
      fileSize: file.size
    });
    const fileId = generateStableFileId(taskId);

    return {
      id: fileId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      entries,
      filename: file.name,
      currentTaskId: taskId,
      type: 'srt',
      transcriptionStatus: 'completed'
    };
  } else {
    // 音视频文件：只存储在内存中，不创建数据库任务
    // 转录完成后才会创建任务并保存到数据库
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return {
      id: tempId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      entries: [], // 音视频文件初始没有字幕
      filename: file.name,
      currentTaskId: tempId, // 临时 ID，转录后会替换为真正的 taskId
      type: fileType,
      fileType: 'audio-video',
      fileSize: file.size,
      fileRef: file, // 保存原始文件引用用于后续转录
      transcriptionStatus: 'idle',
      isTemp: true // 标记为临时文件，不持久化
    };
  }
}

/**
 * 更新字幕条目（内存更新，不持久化）
 */
export function updateEntryInMemory(
  files: SubtitleFile[],
  fileId: string,
  entryId: number,
  text: string,
  translatedText?: string
): SubtitleFile | null {
  const file = files.find(f => f.id === fileId);
  if (!file) return null;

  // 更新内存中的数据
  dataManager.updateTaskSubtitleEntryInMemory(
    file.currentTaskId,
    entryId,
    text,
    translatedText
  );

  return file;
}

/**
 * 删除文件
 */
export async function removeFile(file: SubtitleFile): Promise<void> {
  await dataManager.removeTask(file.currentTaskId);
}

/**
 * 从 dataManager 恢复文件列表
 * 只恢复已完成的 SRT 字幕文件，不恢复未转录的音视频文件
 */
export async function restoreFiles(): Promise<SubtitleFile[]> {
  const batchTasks = dataManager.getBatchTasks();
  if (!batchTasks || batchTasks.tasks.length === 0) {
    return [];
  }

  return batchTasks.tasks
    .filter(task => {
      // 只恢复有字幕条目的文件（已转录完成的 SRT 文件）
      return task.subtitle_entries && task.subtitle_entries.length > 0;
    })
    .map((task) => ({
      id: generateStableFileId(task.taskId),
      name: task.subtitle_filename,
      size: task.fileSize || 0,
      lastModified: Date.now(),
      entries: task.subtitle_entries,
      filename: task.subtitle_filename,
      currentTaskId: task.taskId,
      type: 'srt', // 从数据库恢复的都是已完成的 SRT 文件
      fileType: 'srt',
      fileSize: task.fileSize,
      duration: task.duration,
      fileRef: undefined, // File对象无法持久化，恢复时为undefined
      transcriptionStatus: 'completed' as const
    }));
}

/**
 * 清空所有数据
 */
export async function clearAllData(): Promise<void> {
  await dataManager.clearBatchTasks();
}
