import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import dataManager from './services/dataManager'
import './index.css'
import App from './App.tsx'

// 添加页面关闭前的数据强制持久化
window.addEventListener('beforeunload', () => {
  // 尝试在页面关闭前强制持久化所有数据
  try {
    dataManager.forcePersistAllData();
  } catch (error) {
    console.error('页面关闭前数据持久化失败:', error);
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
  console.error('应用初始化失败:', error)
  // 即使初始化失败也要渲染应用
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
