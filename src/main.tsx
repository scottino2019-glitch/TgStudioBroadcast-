import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class StudioErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Errore imprevisto nello studio.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Errore Studio UI:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 text-center shadow-2xl">
            <h1 className="text-lg font-bold text-rose-400">
              Errore temporaneo nello studio
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed">
              Si è verificato un problema durante il caricamento dell&apos;interfaccia:
              <span className="block mt-2 font-mono text-amber-300 break-words">
                {this.state.errorMessage}
              </span>
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors"
            >
              Ricarica Studio
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StudioErrorBoundary>
    <App />
  </StudioErrorBoundary>
);

