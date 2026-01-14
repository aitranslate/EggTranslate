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
    const taskId = await dataManager.createNewTask(file.name, entries, index);
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
    // 音视频文件：只存储元数据和文件引用
    const taskId = generateTaskId();
    const fileId = generateStableFileId(taskId);

    return {
      id: fileId,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      entries: [], // 音视频文件初始没有字幕
      filename: file.name,
      currentTaskId: taskId,
      type: fileType,
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
 */
export async function restoreFiles(): Promise<SubtitleFile[]> {
  const batchTasks = dataManager.getBatchTasks();
  if (!batchTasks || batchTasks.tasks.length === 0) {
    return [];
  }

  return batchTasks.tasks.map((task) => ({
    id: generateStableFileId(task.taskId),
    name: task.subtitle_filename,
    size: 0,
    lastModified: Date.now(),
    entries: task.subtitle_entries,
    filename: task.subtitle_filename,
    currentTaskId: task.taskId,
    type: detectFileType(task.subtitle_filename) as FileType,
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
