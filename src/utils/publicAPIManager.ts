interface PublicAPIConfig {
  apikey: string;
  url: string;
  model: string;
}

class PublicAPIManager {
  private apis: PublicAPIConfig[] = [];
  private currentIndex: number = 0;
  private loaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  constructor() {
    // 不在构造函数中立即加载，而是在首次使用时加载
  }

  private async loadPublicAPIs(): Promise<void> {
    // 如果已经加载过，直接返回
    if (this.loaded) {
      return;
    }

    // 如果正在加载，返回现有的Promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // 开始加载
    this.loadPromise = this.doLoad();

    try {
      await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async doLoad(): Promise<void> {
    try {
      const response = await fetch('/EggTranslate/public-apis.json');

      if (response.ok) {
        this.apis = await response.json();
        this.loaded = true;
        console.log(`加载了 ${this.apis.length} 个公益API配置`);
      } else {
        console.error('加载公益API配置失败，状态码:', response.status);
        console.error('请确保 public-apis.json 文件在 public 目录中');
        this.apis = [];
        this.loaded = true; // 标记为已加载，即使失败也不重复尝试
      }
    } catch (error) {
      console.error('读取公益API配置文件出错:', error);
      console.error('请确保 public-apis.json 文件存在且可访问');
      this.apis = [];
      this.loaded = true; // 标记为已加载，即使失败也不重复尝试
    }
  }

  public async getNextAPI(): Promise<PublicAPIConfig | null> {
    // 确保配置已加载
    await this.loadPublicAPIs();

    if (this.apis.length === 0) {
      return null;
    }

    const api = this.apis[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.apis.length;
    return api;
  }

  public async hasAPIs(): Promise<boolean> {
    await this.loadPublicAPIs();
    return this.apis.length > 0;
  }

  public async getAPICount(): Promise<number> {
    await this.loadPublicAPIs();
    return this.apis.length;
  }

}

export const publicAPIManager = new PublicAPIManager();