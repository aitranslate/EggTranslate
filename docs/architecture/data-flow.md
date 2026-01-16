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

**SubtitleFileMetadata**：
- `tokensUsed: number` - 累计 tokens（转录 + 翻译）
- `transcriptionProgress` - 转录进度（不包括 tokens）

**关键方法**：
```typescript
// 增加 tokens（累积）
addTokens(fileId: string, tokens: number): void

// 设置 tokens（覆盖）
setTokens(fileId: string, tokens: number): void

// 获取 tokens
getTokens(fileId: string): number
```

### DataManager 层

**SingleTask.translation_progress**：
- `tokens: number` - 累计 tokens（与 Store 同步）
- `completed: number` - 完成的批次
- `total: number` - 总批次

**关键方法**：
```typescript
// 转录时更新 tokens
updateTaskWithTranscription(taskId, entries, duration, tokens)

// 翻译时更新 tokens
completeTask(taskId, tokens)
```

## 数据同步策略

### Store → DataManager

**异步持久化**：Store 修改后，DataManager 在后台异步同步到 IndexedDB。

```typescript
// Store 层
set((state) => ({
  files: state.files.map(f =>
    f.id === fileId
      ? { ...f, tokensUsed: newTokens }
      : f
  )
}));

// DataManager 在后台同步（不阻塞 UI）
dataManager.schedulePersist();
```

### DataManager → Store

**启动时恢复**：页面刷新时，从 DataManager 恢复数据到 Store。

```typescript
// 启动时恢复
const tasks = dataManager.getBatchTasks();
const files = tasks.map(convertTaskToMetadata);
set({ files });
```

## 实时更新机制

### 转录进度更新

```typescript
// Service 层
onProgress: (progress) => {
  // 更新进度百分比
  store.updateTranscriptionProgress(fileId, {
    percent: progress.percent,
    currentChunk: progress.currentChunk,
    totalChunks: progress.totalChunks
  });

  // 更新 tokens（实时累积）
  store.addTokens(fileId, progress.tokens);
}
```

### 翻译进度更新

```typescript
// Service 层
onProgress: (progress) => {
  // 更新翻译进度
  store.updateTranslationProgress(fileId, progress);

  // 更新 tokens（实时累积）
  store.addTokens(fileId, progress.tokens);
}
```

## UI 层订阅

### 实时订阅（推荐）

```typescript
// ✅ 使用实时订阅（数据会更新）
const file = useSubtitleStore((state) => state.getFile(fileId));
const tokens = file?.tokensUsed || 0;

// UI 会自动更新
<div>{tokens.toLocaleString()} tokens</div>
```

### 快照（慎用）

```typescript
// ❌ 避免使用快照（数据不会更新）
const [tokens, setTokens] = useState(0);

// 何时可以使用快照：
// - ID、文件名等不会变化的数据
// - 事件触发时的瞬间状态
// - 避免重复计算的场景
```

## 组件数据流示例

### SubtitleFileItem

```typescript
// 订阅 file 对象（实时更新）
const file = useSubtitleStore((state) => state.getFile(fileId));

// 派生状态（自动更新）
const translationStats = useMemo(() => {
  return {
    tokens: file.tokensUsed ?? 0,
    percentage: calculatePercentage(file),
    // ...
  };
}, [file.tokensUsed, file.translatedCount, file.entryCount]);

// 传递给子组件
<TranslationProgress file={file} translationStats={translationStats} />
```

### TranslationProgress

```typescript
// 从 props 读取 tokens（由父组件订阅）
const tokensDisplay = useMemo(() => {
  const tokens = translationStats?.tokens ?? 0;
  return `${tokens.toLocaleString()} tokens`;
}, [translationStats?.tokens]);
```

## 错误处理

### 数据不一致

如果发现 Store 和 DataManager 的 tokens 不一致：

```typescript
// 重新同步
const taskTokens = dataManager.getTaskById(fileId)?.translation_progress?.tokens || 0;
store.setTokens(fileId, taskTokens);
```

### 恢复策略

页面刷新时，优先使用 DataManager 的数据：

```typescript
// Store → DataManager（Store 为主）
// 恢复时：DataManager → Store（DataManager 为主）
```

## 性能优化

### 批量更新

```typescript
// 批量翻译时，累积 tokens 后一次性更新
let batchTokens = 0;
for (const batch of batches) {
  const result = await translate(batch);
  batchTokens += result.tokens;
}
// 一次性更新
store.addTokens(fileId, batchTokens);
```

### 防抖持久化

```typescript
// DataManager 内部实现
schedulePersist() {
  if (this.persistTimer) clearTimeout(this.persistTimer);
  this.persistTimer = setTimeout(() => {
    this.persistToIndexedDB();
  }, 1000); // 1 秒防抖
}
```

## 测试要点

### 单元测试

- Store 的 `addTokens` 正确累积
- Store 的 `setTokens` 正确覆盖
- DataManager 正确保存 `translation_progress.tokens`

### 集成测试

- 转录流程：tokens 从 0 开始累积
- 翻译流程：tokens 从转录值继续累积
- 页面刷新：tokens 正确恢复
- 并发场景：多个文件同时转录/翻译，tokens 不混淆
