import React from 'react';
import { Toaster } from 'react-hot-toast';
import { SubtitleProvider } from '@/contexts/SubtitleContext';
import { TranslationProvider } from '@/contexts/TranslationContext';
import { TermsProvider } from '@/contexts/TermsContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { TranscriptionProvider } from '@/contexts/TranscriptionContext';
import { MainApp } from '@/components/MainApp';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import '@/index.css';

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
          <TranslationProvider>
            <TranscriptionProvider>
              <SubtitleProvider>
                <MainApp />
                <Toaster
                position="top-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    color: '#fff',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '12px',
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
            </SubtitleProvider>
          </TranscriptionProvider>
        </TranslationProvider>
      </TermsProvider>
    </HistoryProvider>
    </ErrorBoundary>
  );
}

export default App;