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

### Terminology
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
      reflect: "",
      free: ""
    };
  });
  
  const jsonFormat = JSON.stringify(jsonDict, null, 2);
  
  return `## Role
You are a professional subtitle editor for ${targetLanguage}.

## Your Task
Critically review and refine the provided translation. Your revision must achieve three key goals:

1.  **Natural Word Order**: Adjust the sentence structure to be fluent and natural for a ${targetLanguage} speaker.
2.  **Strict Terminology**: You MUST use the exact translations provided in the \`### Terminology\` list. This is a mandatory rule.
3.  **Contextual Accuracy**: Use the surrounding subtitles (\`<previous_content>\` and \`<subsequent_content>\`) to correct any logical errors or mistranslations.

## Process
Directly provide the improved translation in the specified JSON format. Do not explain your thought process or add comments in the output. Your focus is the final, clean subtitle.

${sharedPrompt}

## INPUT
<subtitles>
${lines}
</subtitles>

## Output Format
Provide your response strictly in the following JSON format. Do not include any other text.
\`\`\`json
${jsonFormat}
\`\`\`

Note: Start your answer with \`\`\`json and end with \`\`\`.`;
};