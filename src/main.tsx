import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import dataManager from './services/dataManager'
import './index.css'
import App from './App.tsx'
import { toAppError } from '@/utils/errors'

// 添加页面关闭前的数据强制持久化
window.addEventListener('beforeunload', () => {
  // 尝试在页面关闭前强制持久化所有数据
  try {
    dataManager.forcePersistAllData();
  } catch (error) {
    const appError = toAppError(error, '页面关闭前数据持久化失败');
    console.error('[main]', appError.message);
  }
});

// 初始化数据管理器
dataManager.initialize().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
}).catch(error => {
  const appError = toAppError(error, '应用初始化失败');
  console.error('[main]', appError.message, appError)
  // 即使初始化失败也要渲染应用
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
