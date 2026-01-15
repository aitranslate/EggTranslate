import { RateLimiter, rateLimiter } from './rateLimiter';
import { API_CONSTANTS } from '@/constants/api';

// 导入类型并重新导出，保持向后兼容
import type { LLMConfig } from '@/types';
export type { LLMConfig };

interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface CallLLMOptions {
  maxRetries?: number;
  temperature?: number;
  signal?: AbortSignal;
}

interface CallLLMResult {
  content: string;
  tokensUsed: number;
}

// 模块级的 API Key 轮询索引（避免依赖 React 的 useRef）
let apiKeyIndex = 0;

/**
 * 从多个 API Key 中轮询获取一个
 */
function getNextApiKey(apiKeyStr: string): string {
  const apiKeys = apiKeyStr.split('|').map(key => key.trim()).filter(key => key.length > 0);
  if (apiKeys.length === 0) {
    throw new Error('未配置有效的API密钥');
  }

  const currentIndex = apiKeyIndex % apiKeys.length;
  apiKeyIndex = (apiKeyIndex + 1) % apiKeys.length;

  return apiKeys[currentIndex];
}

/**
 * 重置 API Key 轮询索引（用于测试或重置状态）
 */
export function resetApiKeyIndex(): void {
  apiKeyIndex = 0;
}

/**
 * 统一的 LLM API 调用函数
 *
 * 自动具备以下能力：
 * 1. 失败重试（最多 MAX_RETRIES 次，指数退避）
 * 2. 多 API Key 轮询（支持用 | 分隔多个 key）
 * 3. 频率限制（通过 RPM 配置）
 * 4. Token 统计（自动返回消耗的 tokens）
 *
 * @param config LLM 配置
 * @param messages 消息数组
 * @param options 选项
 * @returns LLM 响应内容和 Token 消耗
 */
export async function callLLM(
  config: LLMConfig,
  messages: LLMMessage[],
  options: CallLLMOptions = {}
): Promise<CallLLMResult> {
  const { maxRetries = API_CONSTANTS.MAX_RETRIES, temperature = API_CONSTANTS.DEFAULT_TEMPERATURE, signal } = options;

  // 设置频率限制
  if (config.rpm !== undefined) {
    rateLimiter.setRPM(config.rpm);
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new Error('请求被取消');
    }

    try {
      // 频率限制：等待可用
      await rateLimiter.waitForAvailability();

      if (signal?.aborted) {
        throw new Error('请求被取消');
      }

      // 多 key 轮询：获取下一个可用的 API key
      const apiKey = getNextApiKey(config.apiKey);

      const response = await fetch(`${config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          temperature,
          max_tokens: 2048
        }),
        signal
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();

      // 🔍 调试日志：记录 API 原始响应
      console.log('[LLM API] Raw response:', {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length,
        firstChoice: data.choices?.[0],
        usage: data.usage
      });

      const content = data.choices[0]?.message?.content || '';

      // 🔍 调试日志：记录提取的内容
      if (!content) {
        console.error('[LLM API] ⚠️ Empty content detected!', {
          fullResponse: data,
          choices: data.choices,
          hasMessage: !!data.choices?.[0]?.message
        });
      } else {
        console.log('[LLM API] ✅ Content extracted:', {
          length: content.length,
          preview: content.substring(0, 200),
          isJson: content.trim().startsWith('{')
        });
      }

      // 计算 token 消耗（粗略估计，实际应该使用 usage.total_tokens）
      const tokensUsed = data.usage?.total_tokens || 0;

      return { content, tokensUsed };
    } catch (error) {
      lastError = error;

      // 如果是取消错误，直接抛出
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      // 最后一次尝试失败，抛出错误
      if (attempt === maxRetries) {
        throw error;
      }

      // 指数退避
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), API_CONSTANTS.RETRY_DELAY_MS);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
