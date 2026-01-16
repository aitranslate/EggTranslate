# 数据架构重构：单一数据源 + Tokens 统一管理

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构数据架构，建立 Store 作为单一数据源，tokens 统一管理（转录+翻译），解决翻译过程中 tokens 不累加的问题。

**Architecture:**
- Store (Zustand) 作为唯一内存数据源
- DataManager 作为持久化层（IndexedDB）
- Service 层直接修改 Store，Store 异步同步到 DataManager
- 组件订阅 Store，数据变化自动更新 UI

**Tech Stack:** Zustand 5.0, TypeScript, React 18, IndexedDB (localforage)

---

## 问题诊断

### 当前问题
1. **双重数据源**：`SubtitleFileMetadata.transcriptionProgress.tokens` (Store) 和 `SingleTask.translation_progress.tokens` (DataManager) 存储同一数据
2. **翻译 tokens 不累加**：TranslationOrchestrator.processBatch 得到 tokensUsed，但没有传递给 Store
3. **字段语义混乱**：`transcriptionProgress.tokens` 暗示只用于转录，实际包括翻译 tokens

### 解决方案
- ✅ 新增独立字段 `tokensUsed`（不再嵌套在 progress 里）
- ✅ 修改 TranslationCallbacks 接口，增加 `newTokens` 参数
- ✅ Store 新增 `addTokens()` 方法统一管理

---

## Task 1: 类型定义重构

**Files:**
- Modify: `src/types/transcription.ts:60-68`
- Modify: `src/types/transcription.ts:74-90`

**Step 1: 修改 TranscriptionProgressInfo（移除 tokens）**

找到 `TranscriptionProgressInfo` 接口定义，删除 `tokens` 字段：

```typescript
// 转录进度详情（百分比形式）
export interface TranscriptionProgressInfo {
  percent: number;           // 总体进度百分比
  currentChunk?: number;     // 当前转录块 (1/20)
  totalChunks?: number;      // 总块数
  llmBatch?: number;         // LLM 合并批次 (2/10)
  totalLlmBatches?: number;  // LLM 总批次数
  // ❌ 删除: tokens?: number;
}
```

**Step 2: 修改 SubtitleFileMetadata（新增 tokensUsed）**

找到 `SubtitleFileMetadata` 接口定义，添加 `tokensUsed` 字段：

```typescript
export interface SubtitleFileMetadata {
  id: string;
  taskId: string;
  name: string;
  fileType: 'srt' | 'audio-video';
  fileSize: number;
  lastModified: number;
  duration?: number;

  // 缓存的统计信息
  entryCount: number;
  translatedCount: number;

  // 转录状态和进度
  transcriptionStatus: TranscriptionStatus;
  transcriptionProgress?: TranscriptionProgressInfo;

  // ✅ 新增：全局 tokens（转录 + 翻译）
  tokensUsed: number;
}
```

**Step 3: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 类型错误（tokensUsed 未初始化）

**Step 4: 修复初始化代码**

后续任务会修复所有初始化位置，暂时使用 `// @ts-ignore` 标记：

```typescript
// 在 subtitleStore.ts 初始化时添加
tokensUsed: 0  // 后续会从 DataManager 恢复
```

**Step 5: 提交**

```bash
git add src/types/transcription.ts
git commit -m "refactor(types): 新增 tokensUsed 字段，移除 transcriptionProgress.tokens"
```

---

## Task 2: Store 方法重构

**Files:**
- Modify: `src/stores/subtitleStore.ts:32-78` (interface)
- Modify: `src/stores/subtitleStore.ts:95-570` (implementation)

**Step 1: 更新 SubtitleStore 接口**

在 `SubtitleStore` 接口中添加新方法，修改现有方法签名：

```typescript
interface SubtitleStore {
  // State
  files: SubtitleFileMetadata[];
  selectedFileId: string | null;

  // ... 现有方法 ...

  // ==========================================
  // Tokens 管理（新增）
  // ==========================================

  /**
   * 添加 tokens（转录或翻译）
   * @param fileId - 文件 ID
   * @param tokens - 新增的 tokens（会累加到现有值）
   */
  addTokens: (fileId: string, tokens: number) => void;

  /**
   * 设置 tokens（用于从 DataManager 恢复）
   * @param fileId - 文件 ID
   * @param tokens - 总 tokens（覆盖现有值）
   */
  setTokens: (fileId: string, tokens: number) => void;

  /**
   * 获取文件的 tokens
   */
  getTokens: (fileId: string) => number;

  // ==========================================
  // 转录进度（移除 tokens 参数）
  // ==========================================

  /**
   * 更新转录进度（不包括 tokens）
   */
  updateTranscriptionProgress: (
    fileId: string,
    progress: Omit<TranscriptionProgressInfo, 'tokens'>
  ) => void;

  // ==========================================
  // 翻译进度（移除 tokens 参数）
  // ==========================================

  /**
   * 更新翻译进度（不包括 tokens）
   */
  updateTranslationProgress: (
    fileId: string,
    completed: number,
    total: number
  ) => void;
}
```

**Step 2: 实现 addTokens 方法**

在 Store 实现部分（`create<SubtitleStore>((set, get) => ({` 之后）添加：

```typescript
// ========================================
// Tokens 管理
// ========================================

/**
 * 添加 tokens（转录或翻译）
 */
addTokens: (fileId: string, tokens: number) => {
  if (tokens <= 0) return;

  set((state) => ({
    files: state.files.map(f =>
      f.id === fileId
        ? { ...f, tokensUsed: f.tokensUsed + tokens }
        : f
    )
  }));

  // 同步到 DataManager（异步，不阻塞）
  const file = get().getFile(fileId);
  if (file) {
    const newTokens = get().getTokens(fileId);
    dataManager.updateTaskTranslationProgressInMemory(
      file.taskId,
      { tokens: newTokens }
    ).catch((error) => {
      console.error('[subtitleStore] 同步 tokens 到 DataManager 失败:', error);
    });
  }
},

/**
 * 设置 tokens（用于从 DataManager 恢复）
 */
setTokens: (fileId: string, tokens: number) => {
  set((state) => ({
    files: state.files.map(f =>
      f.id === fileId
        ? { ...f, tokensUsed: tokens }
        : f
    )
  }));
},

/**
 * 获取文件的 tokens
 */
getTokens: (fileId: string) => {
  return get().getFile(fileId)?.tokensUsed || 0;
},
```

**Step 3: 修改 updateTranscriptionProgress（移除 tokens）**

找到现有的 `updateTranscriptionProgress` 实现，删除 tokens 相关代码：

```typescript
updateTranscriptionProgress: (fileId: string, progress: TranscriptionProgressInfo) => {
  // ❌ 删除 tokens 处理逻辑
  // 只更新进度信息，不处理 tokens
  set((state) => ({
    files: state.files.map(f =>
      f.id === fileId
        ? { ...f, transcriptionProgress: progress }
        : f
    )
  }));
},
```

**Step 4: 修改 updateTranslationProgress（移除 tokens）**

找到现有的 `updateTranslationProgress` 实现，删除 tokens 参数：

```typescript
updateTranslationProgress: (fileId: string, completed: number, total: number) => {
  // ❌ 删除 tokens 参数
  // 只更新翻译进度统计，不处理 tokens
  set((state) => ({
    files: state.files.map(f =>
      f.id === fileId
        ? {
            ...f,
            translatedCount: completed,
            entryCount: total
          }
        : f
    )
  }));
},
```

**Step 5: 修改 loadFiles（从 DataManager 恢复 tokensUsed）**

找到 `loadFiles` 方法，确保从 DataManager 恢复 tokensUsed：

```typescript
loadFiles: async () => {
  try {
    // ... 现有代码 ...

    const files = restoreFiles(batchTasks.tasks);

    // ✅ 新增：从 DataManager 恢复 tokensUsed
    const filesWithTokens = files.map(file => {
      const task = dataManager.getTaskById(file.taskId);
      return {
        ...file,
        tokensUsed: task?.translation_progress?.tokens || 0
      };
    });

    set({ files: filesWithTokens });
  } catch (error) {
    // ...
  }
},
```

**Step 6: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: 类型错误（调用处 tokens 参数不匹配）

**Step 7: 提交**

```bash
git add src/stores/subtitleStore.ts
git commit -m "refactor(store): 新增 addTokens/setTokens/getTokens 方法，移除进度方法中的 tokens 参数"
```

---

## Task 3: 修改转录流程（使用 addTokens）

**Files:**
- Modify: `src/stores/subtitleStore.ts:263-328` (startTranscription)

**Step 1: 修改转录进度回调**

找到 `startTranscription` 方法中的 `onLLMProgress` 回调，改为调用 `addTokens`：

```typescript
onLLMProgress: (completed, total, percent, cumulativeTokens) => {
  // ✅ 单独更新 tokens（不再嵌套在 progress 里）
  const previousTokens = get().getTokens(fileId);
  const newTokens = cumulativeTokens - previousTokens;

  if (newTokens > 0) {
    get().addTokens(fileId, newTokens);
  }

  // 更新转录进度（不包括 tokens）
  get().updateTranscriptionProgress(fileId, {
    percent,
    currentChunk: totalChunks,
    totalChunks: totalChunks,
    llmBatch: completed,
    totalLlmBatches: total
  });
}
```

**Step 2: 修改转录完成后的 tokens 设置**

找到转录完成后的代码，使用 `setTokens` 而不是 `updateTranscriptionProgress`：

```typescript
// 持久化转录结果
await dataManager.updateTaskWithTranscription(
  file.taskId,
  result.entries,
  result.duration,
  result.tokensUsed
);

// 完成转录
get().updateTranscriptionStatus(fileId, 'completed');
get().updateTranscriptionProgress(fileId, {
  percent: 100,
  currentChunk: result.totalChunks,
  totalChunks: result.totalChunks
});

// ✅ 设置最终 tokens（覆盖）
get().setTokens(fileId, result.tokensUsed);

// 更新统计信息（跳过 tokens）
get().updateFileStatistics(fileId, true);
```

**Step 3: 提交**

```bash
git add src/stores/subtitleStore.ts
git commit -m "refactor(transcription): 使用 addTokens/setTokens 管理 tokens"
```

---

## Task 4: 修改翻译回调接口

**Files:**
- Modify: `src/services/TranslationOrchestrator.ts:28-44` (TranslationCallbacks)

**Step 1: 修改 TranslationCallbacks.updateProgress 签名**

找到 `TranslationCallbacks` 接口，添加 `newTokens` 参数：

```typescript
export interface TranslationCallbacks {
  translateBatch: (
    texts: string[],
    signal?: AbortSignal,
    contextBefore?: string,
    contextAfter?: string,
    terms?: string
  ) => Promise<{ translations: Record<string, any>; tokensUsed: number }>;

  updateEntry: (id: number, text: string, translatedText: string) => Promise<void>;

  updateProgress: (
    current: number,
    total: number,
    phase: 'direct' | 'completed',
    status: string,
    taskId: string,
    newTokens?: number  // ✅ 新增参数
  ) => Promise<void>;

  getRelevantTerms: (batchText: string, before: string, after: string) => any[];
}
```

**Step 2: 修改 processBatch（传递 tokensUsed）**

找到 `processBatch` 函数，将 `translationResult.tokensUsed` 传递给 `updateProgressCallback`：

```typescript
export async function processBatch(
  batch: BatchInfo,
  controller: AbortController,
  callbacks: TranslationCallbacks,
  taskId: string,
  updateProgressCallback: (completed: number, tokensUsed?: number) => Promise<void>  // ✅ 添加参数
): Promise<{ batchIndex: number; success: boolean; error?: any }> {
  try {
    const translationResult = await callbacks.translateBatch(
      batch.textsToTranslate,
      controller.signal,
      batch.contextBeforeTexts,
      batch.contextAfterTexts,
      batch.termsText
    );

    // ... 现有更新逻辑 ...

    if (batchUpdates.length > 0) {
      await dataManager.batchUpdateTaskSubtitleEntries(taskId, batchUpdates);

      for (const update of batchUpdates) {
        await callbacks.updateEntry(update.id, update.text, update.translatedText);
      }

      // ✅ 传递 tokensUsed
      await updateProgressCallback(batchUpdates.length, translationResult.tokensUsed);
    }

    return { batchIndex: batch.batchIndex, success: true };
  } catch (error: any) {
    // ...
  }
}
```

**Step 3: 修改 executeTranslation（传递 tokens）**

找到 `executeTranslation` 函数中的 `updateProgressCallback`，传递 `tokens`：

```typescript
const updateProgressCallback = async (completedEntries: number, tokensUsed?: number) => {
  currentCompletedCount += completedEntries;
  const percentage = Math.round((currentCompletedCount / entries.length) * 100);
  const statusText = `翻译中... (${currentCompletedCount}/${entries.length}) ${percentage}%`;

  await callbacks.updateProgress(
    currentCompletedCount,
    entries.length,
    'direct',
    statusText,
    taskId,
    tokensUsed  // ✅ 传递 tokens
  );
};
```

**Step 4: 提交**

```bash
git add src/services/TranslationOrchestrator.ts
git commit -m "refactor(translation): TranslationCallbacks.updateProgress 增加 newTokens 参数"
```

---

## Task 5: 修改 Store 翻译回调（调用 addTokens）

**Files:**
- Modify: `src/stores/subtitleStore.ts:417-431` (startTranslation 中的 updateProgress 回调)

**Step 1: 修改 updateProgress 回调实现**

找到 `startTranslation` 中的 `updateProgress` 回调，调用 `addTokens`：

```typescript
updateProgress: async (
  current: number,
  total: number,
  phase: 'direct' | 'completed',
  status: string,
  taskId: string,
  newTokens?: number  // ✅ 新增参数
) => {
  // 调用 TranslationService.updateProgress（它会更新 DataManager）
  await translationConfigStore.updateProgress(
    current,
    total,
    phase,
    status,
    taskId,
    newTokens  // ✅ 传递给 TranslationService
  );

  // ✅ 调用 addTokens 更新 Store
  if (newTokens !== undefined && newTokens > 0) {
    get().addTokens(fileId, newTokens);
  }
},
```

**Step 2: 移除旧的 tokens 同步代码**

删除以下代码（已被 `addTokens` 替代）：

```typescript
// ❌ 删除这段代码
if (newTokens !== undefined) {
  const task = dataManager.getTaskById(file.taskId);
  const latestTokens = task?.translation_progress?.tokens || 0;
  get().updateTranscriptionProgress(fileId, {
    ...get().getFile(fileId)?.transcriptionProgress,
    tokens: latestTokens
  });
}
```

**Step 3: 提交**

```bash
git add src/stores/subtitleStore.ts
git commit -m "refactor(translation): 翻译回调使用 addTokens 更新 Store"
```

---

## Task 6: 修改 TranslationService（不再重复累加）

**Files:**
- Modify: `src/services/TranslationService.ts:189-213` (updateProgress)

**Step 1: 修改 TranslationService.updateProgress**

找到 `updateProgress` 方法，确保不再累加 tokens（由 Store 层负责）：

```typescript
/**
 * 更新翻译进度
 * @param newTokens - 新增的 tokens（此方法只传递给 Store，不自己累加）
 */
async updateProgress(
  current: number,
  total: number,
  phase: 'direct' | 'completed',
  status: string,
  taskId: string,
  newTokens?: number
): Promise<void> {
  try {
    if (taskId) {
      const task = dataManager.getTaskById(taskId);
      const currentTokens = task?.translation_progress?.tokens || 0;

      const updateObj: Parameters<typeof dataManager.updateTaskTranslationProgressInMemory>[1] = {
        completed: current,
        total: total,
        status: phase === 'completed' ? 'completed' : 'translating',
      };

      // ✅ 只在完成时设置 tokens（中间过程由 Store 管理）
      if (phase === 'completed') {
        // Store 已经累加了所有 tokens，这里只是最终确认
        updateObj.tokens = currentTokens;
      }

      dataManager.updateTaskTranslationProgressInMemory(taskId, updateObj);

      // 触发 UI 更新（如果有订阅者）
      this.notifyProgressUpdate({
        current,
        total,
        phase,
        status
      });
    }
  } catch (error) {
    console.error('[TranslationService] 更新进度失败:', error);
  }
}
```

**Step 2: 提交**

```bash
git add src/services/TranslationService.ts
git commit -m "fix(translation): TranslationService 不再累加 tokens，由 Store 层统一管理"
```

---

## Task 7: 组件层适配（使用 tokensUsed）

**Files:**
- Modify: `src/components/SubtitleFileList/components/SubtitleFileItem.tsx:54-69`
- Modify: `src/components/SubtitleFileList/components/TranslationProgress.tsx:97-108`

**Step 1: 修改 SubtitleFileItem 读取 tokensUsed**

找到 `translationStats` 的计算，改为读取 `tokensUsed`：

```typescript
const translationStats = useMemo(() => {
  const entryCount = file.entryCount ?? 0;
  const translatedCount = file.translatedCount ?? 0;

  // ✅ 直接从 tokensUsed 读取
  const tokens = file.tokensUsed ?? 0;

  return {
    total: entryCount,
    translated: translatedCount,
    untranslated: entryCount - translatedCount,
    percentage: entryCount > 0 ? Math.round((translatedCount / entryCount) * 100) : 0,
    tokens: tokens
  };
}, [file.entryCount, file.translatedCount, file.tokensUsed]);  // ✅ 依赖改为 tokensUsed
```

**Step 2: 修改 TranslationProgress 读取 tokensUsed**

找到 `tokensDisplay` 的计算，改为从 `translationStats.tokens` 读取（已经从 `tokensUsed` 来）：

```typescript
// ✅ translationStats.tokens 已经来自 file.tokensUsed，无需修改
const tokensDisplay = useMemo(() => {
  const tokens = translationStats?.tokens ?? 0;
  return `${tokens.toLocaleString()} tokens`;
}, [translationStats?.tokens]);
```

**Step 3: 修改 memo 比较函数**

找到 `SubtitleFileItemMemo` 的比较函数，添加 `tokensUsed` 检查：

```typescript
export const SubtitleFileItemMemo = memo(SubtitleFileItem, (prevProps, nextProps) => {
  const fileKeys: (keyof SubtitleFileMetadata)[] = [
    'id',
    'name',
    'fileType',
    'fileSize',
    'transcriptionStatus',
    'taskId',
    'tokensUsed',  // ✅ 新增
    // ...
  ];

  // ... 现有检查逻辑 ...

  // ❌ 删除 transcriptionProgress.tokens 检查（已被 tokensUsed 替代）
  // if (prevProgress?.tokens !== nextProgress?.tokens) {
  //   return false;
  // }
});
```

**Step 4: 提交**

```bash
git add src/components/SubtitleFileList/components/SubtitleFileItem.tsx src/components/SubtitleFileList/components/TranslationProgress.tsx
git commit -m "refactor(components): 组件使用 tokensUsed 替代 transcriptionProgress.tokens"
```

---

## Task 8: 更新 SubtitleFileManager（tokensUsed 初始化）

**Files:**
- Modify: `src/services/SubtitleFileManager.ts:restoreFiles`

**Step 1: 修改 restoreFiles 返回值包含 tokensUsed**

找到 `restoreFiles` 函数，确保返回的文件包含 `tokensUsed: 0`：

```typescript
export function restoreFiles(tasks: SingleTask[]): SubtitleFileMetadata[] {
  return tasks
    .filter(task => task.subtitle_entries && task.subtitle_entries.length > 0)
    .map(task => {
      const entryCount = task.subtitle_entries.length;
      const translatedCount = task.subtitle_entries.filter(
        entry => entry.translatedText && entry.translatedText.trim() !== ''
      ).length;

      return {
        id: generateFileIdFromTask(task.taskId),
        taskId: task.taskId,
        name: task.subtitle_filename,
        fileType: 'srt',
        fileSize: 0,
        lastModified: Date.now(),
        entryCount,
        translatedCount,
        transcriptionStatus: 'completed',
        tokensUsed: task.translation_progress?.tokens || 0,  // ✅ 新增
      };
    });
}
```

**Step 2: 提交**

```bash
git add src/services/SubtitleFileManager.ts
git commit -m "fix(fileManager): restoreFiles 返回 tokensUsed 字段"
```

---

## Task 9: 运行类型检查和修复

**Files:**
- Test: 所有 TypeScript 文件

**Step 1: 运行完整类型检查**

Run: `npx tsc --noEmit`
Expected: 可能有类型错误（遗留的 tokens 引用）

**Step 2: 修复类型错误**

根据错误提示，逐一修复：
- 将 `file.transcriptionProgress?.tokens` 改为 `file.tokensUsed`
- 将传递 `tokens` 参数的地方改为单独调用 `addTokens`

**Step 3: 再次运行类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

**Step 4: 提交**

```bash
git add -A
git commit -m "fix(types): 修复所有 tokens 引用，类型检查通过"
```

---

## Task 10: 功能测试

**Files:**
- Manual Test: 整个应用

**Step 1: 启动开发服务器**

Run: `pnpm dev`
Expected: 应用正常启动，无控制台错误

**Step 2: 测试音视频转录**

1. 上传一个音视频文件
2. 开始转录
3. 观察右下角 tokens 显示

预期：
- ✅ 转录过程中 tokens 实时累加（每批次完成）
- ✅ 完成后显示正确的 tokens 总数

**Step 3: 测试翻译（转录后的文件）**

1. 对刚才转录的文件开始翻译
2. 观察右下角 tokens 显示

预期：
- ✅ tokens 从转录完成时的值开始累加
- ✅ 每翻译一个批次，tokens 增加
- ✅ 最终 tokens = 转录 tokens + 翻译 tokens

**Step 4: 测试直接上传 SRT 翻译**

1. 上传一个 SRT 文件
2. 开始翻译
3. 观察右下角 tokens 显示

预期：
- ✅ 初始 tokens = 0
- ✅ 翻译过程中 tokens 实时累加
- ✅ 不再一直是 0

**Step 5: 测试持久化**

1. 翻译完成后，刷新页面
2. 检查文件的 tokens 是否保留

预期：
- ✅ 刷新后 tokens 数值正确（从 DataManager 恢复）

**Step 6: 提交（如需修复）**

如果测试中发现 bug：

```bash
git add -A
git commit -m "fix: 修复测试中发现的问题"
```

---

## Task 11: 清理遗留代码

**Files:**
- Modify: `src/stores/subtitleStore.ts`
- Modify: `src/services/TranslationService.ts`

**Step 1: 删除 updateFileStatistics 的 skipTokensUpdate 参数**

找到 `updateFileStatistics` 方法，删除 `skipTokensUpdate` 参数和相关逻辑：

```typescript
// ❌ 删除这个参数
updateFileStatistics: (fileId: string, skipTokensUpdate?: boolean) => {

// 改为
updateFileStatistics: (fileId: string) => {
```

删除方法体中的 tokens 处理逻辑（已被 `tokensUsed` 替代）。

**Step 2: 删除调用处的 skipTokensUpdate 参数**

找到所有调用 `updateFileStatistics` 的地方，删除第二个参数：

```typescript
// ❌ 删除
get().updateFileStatistics(fileId, true);

// 改为
get().updateFileStatistics(fileId);
```

**Step 3: 提交**

```bash
git add src/stores/subtitleStore.ts
git commit -m "refactor: 删除 updateFileStatistics 的 skipTokensUpdate 参数"
```

---

## Task 12: 更新文档

**Files:**
- Create: `docs/architecture/data-flow.md`

**Step 1: 创建数据流文档**

```markdown
# 数据流设计

## 单一数据源原则

- **Store (Zustand)**：唯一内存数据源
- **DataManager**：持久化层（IndexedDB）
- **Service**：修改 Store，Store 异步同步到 DataManager

## Tokens 数据流

### 转录流程
```
transcriptionPipeline → Store.addTokens(tokens) → UI 更新
                              ↓
                         DataManager (异步)
```

### 翻译流程
```
TranslationService → Store.addTokens(tokens) → UI 更新
                              ↓
                         DataManager (异步)
```

## 字段说明

### Store 层
- `tokensUsed: number` - 累计 tokens（转录 + 翻译）
- `transcriptionProgress` - 转录进度（不包括 tokens）

### DataManager 层
- `translation_progress.tokens` - 累计 tokens（与 Store 同步）
```

**Step 2: 提交**

```bash
git add docs/architecture/data-flow.md
git commit -m "docs: 添加数据流设计文档"
```

---

## 验收标准

- ✅ 类型检查通过（`npx tsc --noEmit`）
- ✅ 转录过程中 tokens 实时显示并累加
- ✅ 翻译过程中 tokens 从转录值继续累加
- ✅ 直接上传 SRT 翻译时 tokens 正确累加（不再一直是 0）
- ✅ 刷新页面后 tokens 正确恢复
- ✅ 代码中无 `transcriptionProgress.tokens` 引用
- ✅ 所有 tokens 操作通过 `addTokens/setTokens/getTokens`

---

## 回滚计划

如果重构导致严重问题，可以通过以下回滚：

```bash
git revert HEAD~12..HEAD  # 回滚最近 12 个提交
```

或者使用 git reflog 找到重构前的 commit：

```bash
git reflog
git reset --hard <重构前的 commit hash>
```

---

**下一步：** 选择执行方式
1. Subagent-Driven（当前会话，逐任务执行 + 代码审查）
2. Parallel Session（新会话批量执行）
