/**
 * 句子分割与映射工具
 * 使用序列匹配算法将 LLM 分组结果映射回原始单词
 */

/**
 * 清理单词：转小写，移除标点符号
 */
export function cleanWord(word: string): string {
  const cleaned = word.toLowerCase().replace(/[^a-z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uac00-\ud7af]/g, '');
  return cleaned;
}

/**
 * 判断是否为 CJK 字符
 */
function isCJK(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    (0x4e00 <= code && code <= 0x9fff) ||  // 汉字
    (0x3040 <= code && code <= 0x309f) ||  // 平假名
    (0x30a0 <= code && code <= 0x30ff) ||  // 片假名
    (0xac00 <= code && code <= 0xd7af)      // 韩文
  );
}

/**
 * 分词（支持 CJK 和空格分隔语言）
 */
function tokenizeSentence(sentence: string): string[] {
  // 简化版：只处理空格分隔语言
  return sentence.trim().split(/\s+/).filter(w => w.length > 0);
}

/**
 * 从 LLM 返回的句子中提取单词和分割点
 * @param sentences LLM 返回的句子数组
 * @returns [清理后的单词数组, 分割点索引数组]
 */
export function getLlmWordsAndSplits(sentences: string[]): [string[], number[]] {
  const llmCleanWords: string[] = [];
  const llmSplitIndices: number[] = [];
  let currentWordCount = 0;

  for (const sentence of sentences) {
    const words = tokenizeSentence(sentence);
    const cleanWords = words.map(w => cleanWord(w)).filter(w => w.length > 0);

    if (cleanWords.length > 0) {
      currentWordCount += cleanWords.length;
      llmCleanWords.push(...cleanWords);
      llmSplitIndices.push(currentWordCount);
    }
  }

  return [llmCleanWords, llmSplitIndices];
}

/**
 * 序列匹配块
 */
interface MatchingBlock {
  aStart: number;
  bStart: number;
  length: number;
}

/**
 * 简化版的序列匹配算法
 * 找出两个数组的最长公共子序列（LCS）的匹配块
 */
function findMatchingBlocks(arr1: string[], arr2: string[]): MatchingBlock[] {
  const blocks: MatchingBlock[] = [];
  let i = 0;
  let j = 0;

  while (i < arr1.length && j < arr2.length) {
    // 寻找从当前位置开始的最长匹配
    let maxLength = 0;
    let bestI = -1;
    let bestJ = -1;

    for (let startI = i; startI < arr1.length; startI++) {
      for (let startJ = j; startJ < arr2.length; startJ++) {
        if (arr1[startI] === arr2[startJ]) {
          // 找到匹配，计算长度
          let length = 0;
          let ti = startI;
          let tj = startJ;

          while (ti < arr1.length && tj < arr2.length && arr1[ti] === arr2[tj]) {
            length++;
            ti++;
            tj++;
          }

          if (length > maxLength) {
            maxLength = length;
            bestI = startI;
            bestJ = startJ;
          }
        }
      }

      if (maxLength >= 3) break; // 最小匹配长度
    }

    if (maxLength > 0) {
      blocks.push({
        aStart: bestI,
        bStart: bestJ,
        length: maxLength
      });

      i = bestI + maxLength;
      j = bestJ + maxLength;
    } else {
      i++;
      j++;
    }
  }

  return blocks;
}

/**
 * 将 LLM 的分割点映射回原始单词索引
 * @param originalCleanWords 原始清理后的单词
 * @param llmCleanWords LLM 清理后的单词
 * @param llmSplitIndices LLM 的分割点索引
 * @returns 原始单词中的分割点索引
 */
export function mapLlmSplitsToOriginal(
  originalCleanWords: string[],
  llmCleanWords: string[],
  llmSplitIndices: number[]
): number[] {
  const matchingBlocks = findMatchingBlocks(originalCleanWords, llmCleanWords);
  const originalSplitIndices: number[] = [];

  for (const llmSplitIdx of llmSplitIndices) {
    let mappedIdx = -1;

    // 策略1：分割点在匹配块内部
    for (const block of matchingBlocks) {
      const bEnd = block.bStart + block.length;
      if (block.bStart < llmSplitIdx && llmSplitIdx < bEnd) {
        const bOffset = llmSplitIdx - block.bStart;
        mappedIdx = block.aStart + bOffset;
        break;
      }
    }

    if (mappedIdx !== -1) {
      originalSplitIndices.push(mappedIdx);
      continue;
    }

    // 策略2：找下一个匹配块的开始
    for (const block of matchingBlocks) {
      if (block.length === 0) continue;
      if (block.bStart >= llmSplitIdx) {
        originalSplitIndices.push(block.aStart);
        mappedIdx = block.aStart;
        break;
      }
    }

    if (mappedIdx !== -1) {
      continue;
    }

    // 策略3：分割点在所有匹配之后
    originalSplitIndices.push(originalCleanWords.length);
  }

  // 去重并排序
  const uniqueIndices = Array.from(new Set(originalSplitIndices)).sort((a, b) => a - b);

  // 安全检查：确保包含最后一个分割点
  if (llmSplitIndices.length > 0 && llmSplitIndices[llmSplitIndices.length - 1] === llmCleanWords.length) {
    if (!uniqueIndices.includes(originalCleanWords.length)) {
      uniqueIndices.push(originalCleanWords.length);
    }
  }

  return uniqueIndices;
}

/**
 * 用原始单词和分割点重建句子
 * @param originalWords 原始单词数组
 * @param splitIndices 分割点索引
 * @returns 重建的句子数组
 */
export function reconstructSentences(
  originalWords: string[],
  splitIndices: number[]
): string[] {
  const sentences: string[] = [];
  let lastIdx = 0;

  for (const idx of splitIndices) {
    if (idx > lastIdx) {
      const sentenceWords = originalWords.slice(lastIdx, idx);
      const sentenceText = sentenceWords.join(' ');
      sentences.push(sentenceText);
    }
    lastIdx = idx;
  }

  // 处理最后一个分割点之后剩余的单词
  if (lastIdx < originalWords.length) {
    const remainingWords = originalWords.slice(lastIdx);
    if (remainingWords.length > 0) {
      const sentenceText = remainingWords.join(' ');
      sentences.push(sentenceText);
    }
  }

  return sentences;
}
