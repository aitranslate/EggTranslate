import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { TermsProvider } from '@/contexts/TermsContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { MainApp } from '@/components/MainApp';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useSubtitleStore } from '@/stores/subtitleStore';
import '@/index.css';

/**
 * 应用初始化组件
 * 负责在应用启动时加载数据
 */
const AppInitializer = () => {
  const loadFiles = useSubtitleStore((state) => state.loadFiles);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  return null;
};

function App() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        // 错误已经被 ErrorBoundary 记录
        // 这里可以添加额外的错误上报逻辑
        // 例如发送到 Sentry、LogRocket 等
      }}
    >
      <HistoryProvider>
        <TermsProvider>
          <AppInitializer />
          <MainApp />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#ffffff',
                color: '#1d1d1f',
                border: '1px solid #e8e8ed',
                borderRadius: '12px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                fontSize: '14px',
                fontWeight: '400',
              },
              success: {
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#fff',
                },
              },
              error: {
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </TermsProvider>
      </HistoryProvider>
    </ErrorBoundary>
  );
}

export default App;
