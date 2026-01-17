# 翻译可靠性重构设计

> **日期**: 2026-01-17
> **问题**: 翻译卡在 88% 无响应，刷新后续翻不准确

---

## 问题分析

| 问题 | 根因 | 影响 |
|------|------|------|
| 翻译卡在 88% 无响应 | 批次失败后 `Promise.all` 静默失败，状态仍是"翻译中" | 用户不知道出错，无法续翻 |
| 续翻判断不准确 | 仅用 `translatedText` 判断，LLM 合并句子导致空条目误判 | 重复翻译或跳过已完成 |
| 刷新后无法续翻 | 没有状态字段，无法知道哪些条目已完成 | 必须重新翻译 |

### 典型场景

**场景 1**：批次翻译失败
- LLM 调用失败（网络/限流/500）
- `Promise.all` 不抛出错误，流程静默结束
- 界面显示"翻译中"，实际已卡住

**场景 2**：LLM 合并句子
```
原文：["Hello", "How are you?"]
LLM 返回：{ "1": { direct: "你好，最近怎么样？" } }
→ 第二条 translatedText 为空，但翻译实际已完成
```

---

## 设计目标

1. **快速失败**：任何批次失败 → 立即中断翻译 → 显示"翻译失败"
2. **精准续翻**：刷新后点击翻译 → 只处理未完成条目
3. **状态明确**：每个条目有清晰的状态

---

## 数据结构变更

### 1. 类型定义

```typescript
// src/types/subtitle.ts

export type TranslationStatus = 'pending' | 'completed';

export interface SubtitleEntry {
  id: number;
  text: string;
  translatedText: string;
  translationStatus: TranslationStatus;  // 新增
  startTime: string;
  endTime: string;
}
```

### 2. 状态转换

| 场景 | 状态变化 |
|------|----------|
| 初始加载 / 上传 SRT | `translationStatus: 'pending'` |
| 批次翻译成功 | 批次内所有条目 → `'completed'` |
| 批次翻译失败 | 抛出错误，条目保持 `'pending'` |
| 刷新页后续翻 | 过滤 `translationStatus !== 'completed'` |

### 3. 判断逻辑

**批次级别判断**（而非条目级别）：

```typescript
// LLM 返回正常 → 批次内所有条目标记 completed
// LLM 返回异常 → 条目保持 pending，抛出错误中断
```

---

## 流程改造

### 1. 批次处理（快速失败）

**改造前**：
```typescript
// src/services/TranslationOrchestrator.ts:236-251
for (let i = 0; i < batchesToTranslate.length; i += config.threadCount) {
  const batchPromises = currentBatchGroup.map(batch => processBatch(...));
  await Promise.all(batchPromises);  // ❌ 失败不抛出错误
}
```

**改造后**：
```typescript
for (let i = 0; i < batchesToTranslate.length; i += config.threadCount) {
  const batchPromises = currentBatchGroup.map(batch => processBatch(...));
  try {
    await Promise.all(batchPromises);
  } catch (error) {
    // ✅ 任何批次失败 → 立即中断
    throw new Error(`批次翻译失败: ${error.message}`);
  }
}
```

### 2. 续翻过滤

**改造前**：
```typescript
// src/services/TranslationOrchestrator.ts:87-89
const untranslatedEntries = batchEntries.filter(
  entry => !entry.translatedText || !entry.translatedText.trim()  // ❌ 不准确
);
```

**改造后**：
```typescript
const untranslatedEntries = batchEntries.filter(
  entry => entry.translationStatus !== 'completed'  // ✅ 精准
);
```

### 3. 进度计算

```typescript
// src/services/TranslationOrchestrator.ts:60-68
export function calculateActualProgress(entries: SubtitleEntry[]): {
  completed: number;
  total: number;
} {
  const completed = entries.filter(
    entry => entry.translationStatus === 'completed'  // ✅ 用状态判断
  ).length;
  return { completed, total: entries.length };
}
```

---

## 实现计划

### 涉及文件

| 文件 | 改动内容 |
|------|----------|
| `src/types/subtitle.ts` | 增加 `TranslationStatus` 类型，`SubtitleEntry` 增加 `translationStatus` |
| `src/services/TranslationOrchestrator.ts` | 批次失败立即中断、用状态过滤、进度计算 |
| `src/stores/subtitleStore.ts` | `updateEntry` 增加 `status` 参数 |
| `src/services/SubtitleFileManager.ts` | 上传/解析 SRT 时初始化 `translationStatus: 'pending'` |
| `src/services/dataManager/` | 数据库读写支持 `translationStatus` 字段 |

### 核心改动

**1. subtitleStore.ts - updateEntry 签名变更**
```typescript
updateEntry: async (
  fileId: string,
  entryId: number,
  text: string,
  translatedText?: string,
  status?: TranslationStatus  // 新增参数
) => {
  // ...
  dataManager.updateTaskSubtitleEntryInMemory(
    fileId, entryId, text, translatedText, status
  );
}
```

**2. TranslationOrchestrator.ts - processBatch 传递状态**
```typescript
// 更新时标记状态
await callbacks.updateEntry(
  update.id,
  update.text,
  update.translatedText,
  'completed'  // 批次成功后标记
);
```

**3. SubtitleFileManager.ts - 初始化状态**
```typescript
// 解析 SRT 时
entry: {
  id,
  text,
  translatedText: '',
  translationStatus: 'pending',  // 新增
  startTime,
  endTime
}
```

---

## 测试验证

1. **批次失败**：模拟 LLM 失败，验证是否立即中断并显示"翻译失败"
2. **续翻准确性**：刷新后点击翻译，验证只翻译未完成条目
3. **状态持久化**：刷新页面后验证 `translationStatus` 正确恢复

---

## 实施状态

- [x] 类型定义更新（TranslationStatus 类型，SubtitleEntry 字段）
- [x] SubtitleFileManager 初始化（srtParser.ts, transcriptionPipeline.ts）
- [x] DataManager 状态支持（updateTaskSubtitleEntryInMemory, updateTaskSubtitleEntry, batchUpdateTaskSubtitleEntries）
- [x] subtitleStore 更新（updateEntry 方法签名）
- [x] TranslationOrchestrator 批次逻辑（过滤、进度计算）
- [x] 快速失败机制（try-catch, 错误抛出）
- [x] 翻译结果验证（行数匹配、JSON 结构验证）
- [x] LLM 重试次数优化（从 5 次改为 3 次）
- [x] 测试验证通过

**完成日期**: 2026-01-17

**相关 Commits**:
- `9c1bf6b` - feat: add TranslationStatus type to SubtitleEntry
- `6ca94d9` - feat: initialize translationStatus as pending
- `241bfff` - feat: add status parameter to DataManager update methods
- `7b4c304` - feat: add status parameter to subtitleStore.updateEntry
- `ef846fe` - feat: filter entries by translationStatus instead of translatedText
- `b6ac3ad` - feat: add translation result validation and reduce retry count
- `a6a8b56` - feat: implement fast-fail for batch translation failures

---

## 备注

- 不需要兼容性处理（本地开发阶段）
- 批次级别的状态判断，不需要条目级别的失败状态
- LLM 重试次数改为 3 次，验证失败会触发重试
- 只有验证通过（行数匹配 + JSON结构正确）才会标记为 completed
