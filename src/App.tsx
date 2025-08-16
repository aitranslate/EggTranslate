import React from 'react';
import { Toaster } from 'react-hot-toast';
import { SubtitleProvider } from '@/contexts/SubtitleContext';
import { TranslationProvider } from '@/contexts/TranslationContext';
import { TermsProvider } from '@/contexts/TermsContext';
import { HistoryProvider } from '@/contexts/HistoryContext';
import { MainApp } from '@/components/MainApp';
import '@/index.css';

function App() {
  return (
    <HistoryProvider>
      <TermsProvider>
        <TranslationProvider>
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
        </TranslationProvider>
      </TermsProvider>
    </HistoryProvider>
  );
}

export default App;