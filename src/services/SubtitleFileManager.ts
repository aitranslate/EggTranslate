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
    // ✅ 音视频文件：也立即创建任务（空条目），转录完成后更新
    const index = options.existingFilesCount;
    const taskId = await dataManager.createNewTask(file.name, [], index, {
      fileType: 'audio-video',
      fileSize: file.size
    });
    const fileId = generateStableFileId(taskId);

    return {
      id: fileId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      entries: [], // 初始为空，转录完成后更新
      filename: file.name,
      currentTaskId: taskId, // ✅ 直接使用正式 taskId
      type: fileType,
      fileType: 'audio-video',
      fileSize: file.size,
      fileRef: file, // 保存原始文件引用用于后续转录
      transcriptionStatus: 'idle'
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
 * 恢复所有任务（包括已转录和未转录的音视频文件）
 */
export async function restoreFiles(): Promise<SubtitleFile[]> {
  const batchTasks = dataManager.getBatchTasks();
  if (!batchTasks || batchTasks.tasks.length === 0) {
    return [];
  }

  return batchTasks.tasks.map((task) => ({
    id: generateStableFileId(task.taskId),
    name: task.subtitle_filename,
    size: task.fileSize || 0,
    lastModified: Date.now(),
    entries: task.subtitle_entries || [],
    filename: task.subtitle_filename,
    currentTaskId: task.taskId,
    type: task.fileType === 'srt' ? 'srt' : undefined,
    fileType: task.fileType,
    fileSize: task.fileSize,
    duration: task.duration,
    transcriptionStatus: (task.subtitle_entries && task.subtitle_entries.length > 0) ? 'completed' : 'idle' as const
  }));
}

/**
 * 清空所有数据
 */
export async function clearAllData(): Promise<void> {
  await dataManager.clearBatchTasks();
}
