# 字幕编辑器重译按钮 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在字幕编辑器中添加"重译"按钮，允许用户重新翻译单条字幕（用于修复翻译失败的批次）

**Architecture:** 复用现有的 TranslationService.translateBatch 和提示词生成逻辑，只需在 SubtitleEditor 组件中添加重译按钮和状态管理。

**Tech Stack:** React, Zustand, TypeScript, lucide-react 图标

---

## Task 1: 更新图标导入

**Files:**
- Modify: `src/components/SubtitleEditor.tsx:3`

**Step 1: 添加 RefreshCw 图标导入**

```typescript
import { Edit3, Save, X, Search, Filter, FileText, RefreshCw } from 'lucide-react';
```

**Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: 提交**

```bash
git add src/components/SubtitleEditor.tsx
git commit -m "feat(retranslate): add RefreshCw icon import"
```

---

## Task 2: 添加重译状态

**Files:**
- Modify: `src/components/SubtitleEditor.tsx:32-36`

**Step 1: 添加 retranslatingIds 状态**

在现有状态声明后添加：

```typescript
const [retranslatingIds, setRetranslatingIds] = useState<Set<number>>(new Set());
```

**Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: 提交**

```bash
git add src/components/SubtitleEditor.tsx
git commit -m "feat(retranslate): add retranslatingIds state"
```

---

## Task 3: 实现重译处理函数

**Files:**
- Modify: `src/components/SubtitleEditor.tsx:92` (在 onCancelEdit 之后)

**Step 1: 添加 handleRetranslate 函数**

```typescript
const handleRetranslate = useCallback(async (entryId: number) => {
  if (!file?.id) return;

  // 添加到重译集合
  setRetranslatingIds(prev => new Set(prev).add(entryId));

  try {
    // 获取翻译配置
    const { getConfig, translateBatch } = await import('@/stores/translationConfigStore');
    const config = getConfig();

    // 获取当前条目
    const entry = fileEntries.find(e => e.id === entryId);
    if (!entry) {
      throw new Error('条目不存在');
    }

    // 获取索引
    const currentIndex = fileEntries.findIndex(e => e.id === entryId);

    // 构造前后文
    const beforeTexts = fileEntries
      .slice(Math.max(0, currentIndex - config.contextBefore), currentIndex)
      .map(e => e.text)
      .join('\n');

    const afterTexts = fileEntries
      .slice(currentIndex + 1, Math.min(fileEntries.length, currentIndex + 1 + config.contextAfter))
      .map(e => e.text)
      .join('\n');

    // 获取术语
    const dataManager = await import('@/services/dataManager');
    const terms = dataManager.default.getTerms();
    const termsText = terms.map(t => `${t.original} -> ${t.translation}`).join('\n');

    // 调用翻译 API
    const translationConfigStore = await import('@/stores/translationConfigStore');
    const result = await translationConfigStore.useTranslationConfigStore.getState().translateBatch(
      [entry.text],
      undefined,
      beforeTexts,
      afterTexts,
      termsText
    );

    // 解析结果
    const translation = result.translations["1"]?.direct;
    if (!translation) {
      throw new Error('翻译返回空结果');
    }

    // 更新条目
    await updateEntry(file.id, entryId, entry.text, translation);
    // 界面自动更新，无需提示

  } catch (error) {
    handleError(error, {
      context: { operation: '重译字幕', entryId }
    });
  } finally {
    // 从重译集合中移除
    setRetranslatingIds(prev => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
  }
}, [file, fileEntries, updateEntry, handleError]);
```

**Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS（如果有类型错误，修复后继续）

**Step 3: 提交**

```bash
git add src/components/SubtitleEditor.tsx
git commit -m "feat(retranslate): add handleRetranslate function"
```

---

## Task 4: 添加重译按钮 UI

**Files:**
- Modify: `src/components/SubtitleEditor.tsx:210-215`

**Step 1: 修改按钮区域**

将：
```tsx
<button
  onClick={() => onStartEdit(entry)}
  className="p-1 hover:bg-white/20 rounded transition-colors"
>
  <Edit3 className="h-4 w-4 text-white/60" />
</button>
```

改为：
```tsx
<div className="flex items-center space-x-1">
  <button
    onClick={() => onStartEdit(entry)}
    className="p-1 hover:bg-white/20 rounded transition-colors"
  >
    <Edit3 className="h-4 w-4 text-white/60" />
  </button>
  <button
    onClick={() => handleRetranslate(entry.id)}
    disabled={retranslatingIds.has(entry.id)}
    className="p-1 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
  >
    <RefreshCw className={`h-4 w-4 text-blue-400 ${retranslatingIds.has(entry.id) ? 'animate-spin' : ''}`} />
  </button>
</div>
```

**Step 2: 运行类型检查**

Run: `npx tsc --noEmit`
Expected: PASS

**Step 3: 提交**

```bash
git add src/components/SubtitleEditor.tsx
git commit -m "feat(retranslate): add retranslate button UI"
```

---

## Task 5: 类型检查和测试

**Files:**
- All modified files

**Step 1: 运行完整类型检查**

Run: `npx tsc --noEmit`
Expected: PASS（无类型错误）

**Step 2: 功能测试**

手动测试：
1. 打开字幕编辑器
2. 找到一条已翻译的字幕
3. 点击重译按钮
4. 验证：按钮开始旋转，处于 loading 状态
5. 验证：翻译完成后，译文更新
6. 验证：没有成功提示 toast
7. 验证：未翻译字幕也可以重译
8. 验证：同时点击多条重译，都能正常工作

**Step 3: 错误测试**

1. 断开网络后点击重译
2. 验证：显示错误提示
3. 验证：可以重新点击重试

**Step 4: 提交**

```bash
git add .
git commit -m "feat(retranslate): complete retranslate button feature"
```

---

## 总结

**修改的文件：**
- `src/components/SubtitleEditor.tsx` - 添加重译按钮和逻辑

**复用的现有功能：**
- `TranslationService.translateBatch` - API 调用和提示词生成
- `useTranslationConfigStore.getConfig` - 获取配置
- `dataManager.getTerms` - 获取术语
- `subtitleStore.updateEntry` - 更新条目

**关键特性：**
- 支持同时重译多条（Set 状态）
- loading 动画（animate-spin）
- 错误处理和重试
- 界面自动更新
