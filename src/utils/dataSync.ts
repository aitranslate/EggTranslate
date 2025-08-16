import localforage from 'localforage';

export async function syncStorage<T>(key: string, data: T): Promise<void> {
  try {
    await localforage.setItem(key, data);
  } catch (error) {
    console.error(`存储数据失败: ${key}`, error);
    throw error;
  }
}

export async function clearStorage(key: string): Promise<void> {
  try {
    await localforage.removeItem(key);
  } catch (error) {
    console.error(`清除数据失败: ${key}`, error);
    throw error;
  }
}
