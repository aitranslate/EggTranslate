import localforage from 'localforage';
import { toAppError } from '@/utils/errors';

export async function syncStorage<T>(key: string, data: T): Promise<void> {
  try {
    await localforage.setItem(key, data);
  } catch (error) {
    const appError = toAppError(error, `存储数据失败: ${key}`);
    console.error('[dataSync]', appError.message, appError);
    throw appError;
  }
}

export async function clearStorage(key: string): Promise<void> {
  try {
    await localforage.removeItem(key);
  } catch (error) {
    const appError = toAppError(error, `清除数据失败: ${key}`);
    console.error('[dataSync]', appError.message, appError);
    throw appError;
  }
}
