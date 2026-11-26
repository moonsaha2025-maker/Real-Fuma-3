import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#07080b] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#0d1017] border border-rose-500/40 p-6 space-y-4 shadow-2xl">
            <div className="text-[11px] font-display tracking-[0.26em] text-rose-400 uppercase">
              REAL FUMA 3
            </div>
            <h1 className="font-display text-xl font-bold text-white">
              Something went wrong
            </h1>
            <p className="text-xs text-slate-300 break-words max-h-36 overflow-y-auto">
              {this.state.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-rose-600 hover:bg-rose-500 text-white font-display font-bold tracking-wider text-xs py-3 cursor-pointer"
            >
              RELOAD GAME
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
