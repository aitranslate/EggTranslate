import { RateLimiter, rateLimiter } from './rateLimiter';

interface LLMConfig {
  baseURL: string;
  apiKey: string;  // 支持单个或多个 key（用 | 分隔）
  model: string;
  rpm?: number;    // 频率限制（每分钟请求数），0 表示不限制
}

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
 * 1. 失败重试（最多 5 次，指数退避）
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
  const { maxRetries = 5, temperature = 0.3, signal } = options;

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
          messages,
          temperature
        }),
        signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `HTTP ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '';
      const tokensUsed = data.usage?.total_tokens || 0;

      return { content, tokensUsed };
    } catch (error: unknown) {
      // 如果是取消信号，直接抛出
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('请求被取消');
      }

      lastError = error;
      console.error(`LLM 调用第 ${attempt}/${maxRetries} 次失败:`, error instanceof Error ? error.message : error);

      // 如果还有重试机会，等待后重试（指数退避）
      if (attempt < maxRetries) {
        const waitTime = 1000 * attempt; // 1s, 2s, 3s, 4s
        console.log(`等待 ${waitTime / 1000} 秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // 所有重试都失败
  throw lastError || new Error('LLM 调用失败');
}

