# Audio-Video Transcription Cache Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Cache audio-video transcription results (SRT entries + metadata) to IndexedDB so users can refresh the page and still see completed transcriptions with ability to translate/export.

**Architecture:** Extend existing SubtitleFile type with `fileType: 'audio-video'`, save transcription results to IndexedDB on completion, restore on page load with disabled re-transcription button (since audio data is not cached).

**Tech Stack:** TypeScript, React, IndexedDB (via dataManager), existing error handling via useErrorHandler

---

## Task 1: Extend Type Definitions

**Files:**
- Modify: `src/types/index.ts`

**Step 1: Add fileType and audio-specific fields to SubtitleFile**

```typescript
// In src/types/index.ts, modify the SubtitleFile interface
interface SubtitleFile {
  id: string;
  fileType: 'srt' | 'audio-video';  // NEW: distinguish file types
  name: string;
  fileSize?: number;        // NEW: for audio-video files (bytes)
  duration?: number;        // NEW: for audio-video files (seconds)
  entries: SubtitleEntry[];
  status: FileStatus;
  createdAt: number;
}
```

**Step 2: Verify TypeScript compilation**

Run: `pnpm build`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): add fileType and audio metadata fields to SubtitleFile"
```

---

## Task 2: Update DataManager to Save Audio-Video Files

**Files:**
- Modify: `src/services/dataManager/index.ts`

**Step 1: Update saveSubtitleFile to handle audio-video files**

```typescript
// In src/services/dataManager/index.ts
// The saveSubtitleFile method already exists, just ensure it accepts the new fields
// No code changes needed - the method already spreads the entire file object

// But verify it's called from transcription pipeline (Task 3)
```

**Step 2: Verify no changes needed**

The existing `saveSubtitleFile` method already accepts and stores the full SubtitleFile object, so no changes are needed here. The fields will be saved automatically.

**Step 3: No commit needed (no changes)**
---

## Task 3: Modify Transcription Pipeline to Auto-Save Results

**Files:**
- Modify: `src/services/transcriptionPipeline.ts`
- Modify: `src/components/SubtitleFileList/index.tsx` (caller)

**Step 1: Read transcriptionPipeline to find completion callback**

Read: `src/services/transcriptionPipeline.ts`
Identify: Where transcription completes and returns results

**Step 2: Update pipeline to return duration**

```typescript
// In src/services/transcriptionPipeline.ts
// Modify the return type to include duration
export interface TranscriptionResult {
  entries: SubtitleEntry[];
  duration: number;  // NEW: audio duration in seconds
}

// Update the transcribeAudio function to return duration
export async function transcribeAudio(
  file: File,
  config: TranscriptionConfig,
  onProgress?: (progress: TranscriptionProgress) => void
): Promise<TranscriptionResult> {
  // ... existing code ...

  // Get duration from AudioBuffer
  const duration = audioBuffer.duration;

  // Return entries + duration
  return {
    entries: srtEntries,
    duration
  };
}
```

**Step 3: Update SubtitleFileList to save on completion**

```typescript
// In src/components/SubtitleFileList/index.tsx
// Find handleTranscribe callback, update to save result

import dataManager from '@/services/dataManager';
import { useErrorHandler } from '@/hooks/useErrorHandler';

const { handleError } = useErrorHandler();

const handleTranscribe = async (file: File) => {
  try {
    const result = await transcribeAudio(file, translationConfig, (progress) => {
      // Update progress UI
    });

    // NEW: Save to IndexedDB
    const subtitleFile: SubtitleFile = {
      id: crypto.randomUUID(),
      fileType: 'audio-video',
      name: file.name,
      fileSize: file.size,
      duration: result.duration,
      entries: result.entries,
      status: 'completed',
      createdAt: Date.now()
    };

    await dataManager.saveSubtitleFile(subtitleFile);

    // Add to local state
    dispatch({
      type: 'ADD_FILE',
      payload: subtitleFile
    });

    toast.success('转录完成');
  } catch (error) {
    handleError(error, {
      context: { operation: '音视频转录' }
    });
  }
};
```

**Step 4: Test TypeScript compilation**

Run: `pnpm build`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/services/transcriptionPipeline.ts src/components/SubtitleFileList/index.tsx
git commit -m "feat(transcription): auto-save audio-video transcription results to IndexedDB"
```

---

## Task 4: Restore Saved Files on Page Load

**Files:**
- Modify: `src/contexts/SubtitleContext.tsx`

**Step 1: Read existing initialization logic**

Read: `src/contexts/SubtitleContext.tsx:350-370`
Find: Where saved files are loaded on mount

**Step 2: Ensure audio-video files are restored**

```typescript
// In src/contexts/SubtitleContext.tsx
// The loadSavedData function should already handle this
// Verify it's loading all files regardless of fileType

// In the useEffect that loads saved data:
useEffect(() => {
  const loadSavedData = async () => {
    try {
      const savedFiles = await dataManager.getAllSubtitleFiles();

      savedFiles.forEach(file => {
        dispatch({ type: 'ADD_FILE', payload: file });
      });
    } catch (error) {
      handleError(error, {
        context: { operation: '加载保存的数据' },
        showToast: false
      });
    }
  };

  loadSavedData();
}, [handleError]);
```

**Step 3: Verify no changes needed**

The existing code already loads all files. The new `fileType` field will be included automatically.

**Step 4: No commit needed (or just add comment)**
---

## Task 5: Disable Transcription Button for Completed Audio-Video Files

**Files:**
- Modify: `src/components/SubtitleFileList/index.tsx`

**Step 1: Find the transcription button rendering**

Read: `src/components/SubtitleFileList/index.tsx`
Find: Where the "转录" button is rendered

**Step 2: Add conditional disable logic**

```typescript
// In src/components/SubtitleFileList/index.tsx
// Find the button rendering section, add conditional logic

const canRetranscribe = (file: SubtitleFile) => {
  // Can only re-transcribe SRT files or incomplete audio-video files
  return file.fileType === 'srt' ||
         (file.fileType === 'audio-video' && file.status !== 'completed');
};

// In the button JSX:
<button
  onClick={() => handleTranscribe(file.originalFile)}
  disabled={!canRetranscribe(file)}
  className={`px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-500/30 rounded-lg transition-colors ${
    !canRetranscribe(file) ? 'opacity-50 cursor-not-allowed' : ''
  }`}
>
  转录
</button>
```

**Step 3: Test TypeScript compilation**

Run: `pnpm build`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/components/SubtitleFileList/index.tsx
git commit -m "feat(ui): disable transcription button for completed audio-video files"
```

---

## Task 6: Manual Testing

**Files:**
- No file changes, testing only

**Step 1: Start development server**

Run: `pnpm dev`

**Step 2: Test full flow**

1. Upload an audio file (mp3/wav/m4a)
2. Complete transcription
3. Verify SRT entries are generated
4. Refresh the page (F5)
5. Verify file appears in list with "completed" status
6. Verify transcription button is disabled
7. Verify translation still works
8. Verify export still works

**Step 3: Verify IndexedDB storage**

1. Open DevTools → Application → IndexedDB → egg-translate-db → subtitle-files
2. Verify the audio-video file entry exists
3. Verify it has: `fileType: 'audio-video'`, `fileSize`, `duration`, `entries`

**Step 4: Test error scenarios**

1. Try to click disabled transcription button (should not work)
2. Delete the file and verify it's removed from IndexedDB

**Step 5: Test SRT files still work**

1. Upload SRT file
2. Verify transcription button still works
3. Refresh page
4. Verify everything still works

**Step 6: Document any issues found**

If bugs found, fix them and commit with `fix:` prefix.

---

## Implementation Notes

**Key Decisions:**
- No audio data cached (only SRT + metadata)
- No migration needed (development phase)
- Uses existing unified error handling
- No storage quota management (YAGNI)

**Data Structure:**
```typescript
{
  id: "uuid",
  fileType: "audio-video",
  name: "song.mp3",
  fileSize: 5242880,
  duration: 180,
  entries: [...],
  status: "completed",
  createdAt: 1234567890
}
```

**Testing Strategy:**
- Manual testing only (no automated tests per project approach)
- Focus on: save → refresh → restore → disable button flow

**Success Criteria:**
- ✅ Transcription results persist across page refresh
- ✅ Translation and export work on restored files
- ✅ Transcription button disabled for completed audio-video files
- ✅ SRT files unaffected
- ✅ No console errors
