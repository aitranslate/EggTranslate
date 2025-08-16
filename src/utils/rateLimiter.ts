// 多线程安全的限流器类，用于控制API请求频率
export class RateLimiter {
  private rpm: number;
  private requests: number[];
  private maxQueueSize: number;
  private mutex: Promise<void>; // 用于确保并发安全

  constructor(rpm: number = 0) { // 默认改为0，表示不限制
    this.rpm = rpm;
    this.requests = [];
    this.maxQueueSize = 1000;
    this.mutex = Promise.resolve();
  }

  // 检查是否可以发送请求
  canMakeRequest(): boolean {
    // RPM=0表示不限制
    if (this.rpm === 0) {
      return true;
    }

    const now = Date.now();
    const windowStart = now - 60 * 1000; // 一分钟前

    // 清理过期的请求记录
    this.requests = this.requests.filter(time => time > windowStart);

    // 如果队列过大，清理最旧的记录
    if (this.requests.length > this.maxQueueSize) {
      this.requests = this.requests.slice(-this.maxQueueSize / 2);
    }

    return this.requests.length < this.rpm;
  }

  // 线程安全的等待方法
  async waitForAvailability(): Promise<void> {
    // RPM=0表示不限制，直接返回
    if (this.rpm === 0) {
      return;
    }

    // 使用mutex确保并发安全
    this.mutex = this.mutex.then(async () => {
      while (!this.canMakeRequest()) {
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      // 记录请求时间
      this.requests.push(Date.now());
    });

    await this.mutex;
  }

  // 设置RPM
  setRPM(rpm: number): void {
    this.rpm = rpm;
  }

  // 获取当前RPM
  getRPM(): number {
    return this.rpm;
  }

  // 获取当前窗口内的请求数
  getCurrentRequests(): number {
    // RPM=0表示不限制
    if (this.rpm === 0) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - 60 * 1000;
    this.requests = this.requests.filter(time => time > windowStart);
    return this.requests.length;
  }

  // 重置请求计数器（用于清理状态）
  reset(): void {
    this.requests = [];
  }
}

// 导出单例实例
export const rateLimiter = new RateLimiter();