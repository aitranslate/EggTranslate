/**
 * 翻译提示词模板
 * 用于生成翻译API请求的提示词
 */

/**
 * 生成共享提示词
 * @param contextBefore 前文上下文
 * @param contextAfter 后文上下文
 * @param terms 术语表
 * @returns 格式化的共享提示词
 */
export const generateSharedPrompt = (contextBefore: string, contextAfter: string, terms: string): string => {
  return `### Context Information
<previous_content>
${contextBefore}
</previous_content>

<subsequent_content>
${contextAfter}
</subsequent_content>

### Terminology (MUST use the specified translation)
${terms}`;
};

/**
 * 生成直译提示词
 * @param lines 需要翻译的文本行
 * @param sharedPrompt 共享提示词
 * @param sourceLanguage 源语言
 * @param targetLanguage 目标语言
 * @returns 格式化的直译提示词
 */
export const generateDirectPrompt = (
  lines: string,
  sharedPrompt: string,
  sourceLanguage: string,
  targetLanguage: string
): string => {
  const lineArray = lines.split('\n');
  const jsonDict: Record<string, any> = {};

  lineArray.forEach((line, index) => {
    jsonDict[`${index + 1}`] = {
      origin: line,
      direct: ""
    };
  });

  const jsonFormat = JSON.stringify(jsonDict, null, 2);

  return `## Role
You are a professional Netflix subtitle translator, fluent in both ${sourceLanguage} and ${targetLanguage}, as well as their respective cultures.
Your expertise lies in accurately understanding the semantics and structure of the original ${sourceLanguage} text and faithfully translating it into ${targetLanguage} while preserving the original meaning.

## Task
We have a segment of original ${sourceLanguage} subtitles that need to be directly translated into ${targetLanguage}. These subtitles come from a specific context and may contain specific themes and terminology.

1. Translate the original ${sourceLanguage} subtitles into ${targetLanguage} line by line
2. Ensure the translation is faithful to the original, accurately conveying the original meaning
3. Consider the context and professional terminology

${sharedPrompt}

<translation_principles>
1. Faithful to the original: Accurately convey the content and meaning of the original text, without arbitrarily changing, adding, or omitting content.
2. Accurate terminology: Use professional terms correctly and maintain consistency in terminology.
3. Understand the context: Fully comprehend and reflect the background and contextual relationships of the text.
</translation_principles>

## INPUT
<subtitles>
${lines}
</subtitles>

## Output in only JSON format and no other text
\`\`\`json
${jsonFormat}
\`\`\`

Note: Start you answer with \`\`\`json and end with \`\`\`, do not add any other text.`;
};

/**
 * 生成反思提示词
 * @param directTranslations 直译结果
 * @param lines 原始文本行
 * @param sharedPrompt 共享提示词
 * @param sourceLanguage 源语言
 * @param targetLanguage 目标语言
 * @returns 格式化的反思提示词
 */
export const generateReflectionPrompt = (
  directTranslations: Record<string, any>,
  lines: string,
  sharedPrompt: string,
  sourceLanguage: string,
  targetLanguage: string
): string => {
  // 创建包含反思和自由翻译字段的JSON格式
  const jsonDict: Record<string, any> = {};

  Object.keys(directTranslations).forEach(key => {
    jsonDict[key] = {
      origin: directTranslations[key].origin,
      direct: directTranslations[key].direct,
      reflect: "your reflection on direct translation",
      free: "your free translation"
    };
  });

  const jsonFormat = JSON.stringify(jsonDict, null, 2);

  return `## Role
You are a professional Netflix subtitle translator and language consultant.
Your expertise lies not only in accurately understanding the original ${sourceLanguage} but also in optimizing the ${targetLanguage} translation to better suit the target language's expression habits and cultural background.

## Task
We already have a direct translation version of the original ${sourceLanguage} subtitles.
Your task is to reflect on and improve these direct translations to create more natural and fluent ${targetLanguage} subtitles.

1. Analyze the direct translation results line by line, pointing out existing issues
2. Provide detailed modification suggestions
3. Perform free translation based on your analysis
4. Do not add comments or explanations in the translation, as the subtitles are for the audience to read
5. Do not leave empty lines in the free translation, as the subtitles are for the audience to read

${sharedPrompt}

<Translation Analysis Steps>
Please use a two-step thinking process to handle the text line by line:

1. Direct Translation Reflection:
   - Evaluate language fluency
   - Check if the language style is consistent with the original text
   - Check the conciseness of the subtitles, point out where the translation is too wordy

2. ${targetLanguage} Free Translation:
   - Aim for contextual smoothness and naturalness, conforming to ${targetLanguage} expression habits
   - Ensure it's easy for ${targetLanguage} audience to understand and accept
   - Adapt the language style to match the theme (e.g., use casual language for tutorials, professional terminology for technical content, formal language for documentaries)
</Translation Analysis Steps>

## INPUT
<subtitles>
${lines}
</subtitles>

## Output in only JSON format and no other text
\`\`\`json
${jsonFormat}
\`\`\`

Note: Start you answer with \`\`\`json and end with \`\`\`, do not add any other text.`;
};

/**
 * 生成句子分割提示词
 * 将转录的单词列表分割成符合 Netflix 标准的字幕句子
 * @param wordsList 单词数组
 * @param maxLength 最大句子长度（词数），默认 20
 * @param sourceLanguage 源语言
 * @returns 格式化的句子分割提示词
 */
export const getSentenceSegmentationPrompt = (
  wordsList: string[],
  maxLength: number = 20,
  sourceLanguage: string
): string => {
  const wordsText = wordsList.join(' ');

  return `## Role
You are a professional subtitle segmentation expert in **${sourceLanguage}** specializing in Netflix-quality subtitle formatting.

## Task
1. Group the given words into complete sentences based on natural language boundaries
2. Split any sentence longer than ${maxLength} words into shorter, more readable segments
3. Follow Netflix subtitle standards for sentence segmentation

## Segmentation Rules
1. **Sentence Boundaries**: Use natural pausing points (punctuation marks, conjunctions, etc.)
2. **Hyphenated/ellipsis continuation**: If a sentence ends with '-' or '...', merge with the next sentence
3. **Long sentence splitting**: Split sentences >${maxLength} words at semantically appropriate points
4. **Minimum length**: Each sentence should have at least 3 words
5. **Punctuation handling**: Maintain proper punctuation for readability

## Input Words
<words_sequence>
${wordsText}
</words_sequence>

## Output Requirements
Return a JSON object with:
- "sentences": Array of segmented sentences
- "analysis": Brief explanation of segmentation decisions

## Output Format
\`\`\`json
{
    "sentences": [
        "First complete sentence here.",
        "Second sentence here.",
        "Third sentence split from long text..."
    ],
    "analysis": "Brief description of segmentation strategy and any splitting decisions"
}
\`\`\`

Note: Start with \`\`\`json and end with \`\`\`, no other text.`;
};
