import localforage from 'localforage';

/**
 * 存储同步工具函数
 * 使用localforage进行数据存储
 */
export async function syncStorage<T>(key: string, data: T): Promise<void> {
  try {
    await localforage.setItem(key, data);
  } catch (error) {
    console.error(`存储数据失败: ${key}`, error);
    throw error;
  }
}

/**
 * 存储清除工具函数
 * 清除localforage中的数据
 */
export async function clearStorage(key: string): Promise<void> {
  try {
    await localforage.removeItem(key);
  } catch (error) {
    console.error(`清除数据失败: ${key}`, error);
    throw error;
  }
}
