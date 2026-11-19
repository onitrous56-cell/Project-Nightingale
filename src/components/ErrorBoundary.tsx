import React from 'react';
import {AlertTriangle, RotateCcw} from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  {children: React.ReactNode},
  ErrorBoundaryState
> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = {hasError: false, errorMessage: ''};
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('AbleBridge ErrorBoundary caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage) as {
          error?: string;
          operationType?: string;
          path?: string;
        };
        if (parsed?.error) {
          friendly = `${parsed.error} (Operation: ${parsed.operationType ?? 'unknown'}, Path: ${parsed.path ?? 'n/a'})`;
        }
      } catch {
        // Use raw message
      }

      return (
        <div className="min-h-screen surface-canvas flex items-center justify-center p-6">
          <div className="surface-card max-w-xl w-full rounded-3xl p-8 space-y-5 text-center">
            <div className="surface-elevated w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-red-400">
              <AlertTriangle className="w-8 h-8" aria-hidden="true" />
            </div>
            <h1 className="font-display text-2xl font-extrabold">
              Something went wrong in AbleBridge
            </h1>
            <p className="text-sm text-muted break-words">{friendly}</p>
            <button
              type="button"
              onClick={() => this.setState({hasError: false, errorMessage: ''})}
              className="btn-accent min-h-[56px] px-6 rounded-xl font-extrabold inline-flex items-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-5 h-5" aria-hidden="true" />
              <span>Recover Safe View</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
