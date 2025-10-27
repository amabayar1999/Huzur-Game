"use client";

import React from 'react';

// ✅ Enhanced Error Boundary with better crash recovery
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorCount: 0,
      lastErrorTime: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    const now = Date.now();
    const timeSinceLastError = this.state.lastErrorTime 
      ? now - this.state.lastErrorTime 
      : Infinity;
    
    // Track error frequency (potential crash loop detection)
    const errorCount = timeSinceLastError < 5000 
      ? this.state.errorCount + 1 
      : 1;
    
    console.error('🚨 Game error caught by boundary:', error, errorInfo);
    console.error('Component stack:', errorInfo.componentStack);
    
    // ✅ Send error to server for logging (if available)
    if (typeof window !== 'undefined' && window.fetch) {
      try {
        fetch('http://localhost:4000/api/client-error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            error: error.toString(),
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            url: window.location.href,
            timestamp: new Date().toISOString()
          })
        }).catch(err => console.error('Failed to log error to server:', err));
      } catch (e) {
        // Silently fail if error logging fails
      }
    }
    
    this.setState({ 
      errorInfo,
      errorCount,
      lastErrorTime: now
    });
    
    // ✅ Auto-recovery attempt after 5 seconds if not in crash loop
    if (errorCount < 3) {
      setTimeout(() => {
        if (this.state.hasError) {
          console.log('🔄 Attempting auto-recovery...');
          this.handleReset();
        }
      }, 5000);
    }
  }

  handleReset = () => {
    this.setState({ 
      hasError: false, 
      error: null, 
      errorInfo: null 
    });
    
    // ✅ Call custom reset handler
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      // Default: reload page
      window.location.reload();
    }
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, errorCount } = this.state;
      const isInCrashLoop = errorCount >= 3;
      
      return (
        <div className="font-sans min-h-screen p-6 sm:p-10 flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50">
          <div className="max-w-lg w-full bg-white border-2 border-red-300 rounded-xl shadow-xl p-6 text-center">
            <div className="text-6xl mb-4">💥</div>
            <h2 className="text-2xl font-bold text-red-800 mb-3">
              {isInCrashLoop ? 'Critical Error' : 'Game Error'}
            </h2>
            <p className="text-red-700 mb-4">
              {isInCrashLoop 
                ? 'The game encountered multiple errors. Please go back to the home page.'
                : 'Something went wrong. The game encountered an unexpected error.'
              }
            </p>
            
            {!isInCrashLoop && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
                ℹ️ The game will attempt to auto-recover in 5 seconds...
              </div>
            )}
            
            {error && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-sm text-red-600 hover:text-red-800 font-medium">
                  🔍 Error details (for debugging)
                </summary>
                <div className="mt-2 text-xs bg-red-50 p-3 rounded border border-red-200">
                  <div className="font-semibold text-red-800 mb-1">Error:</div>
                  <pre className="whitespace-pre-wrap mb-2 text-red-700">
                    {error.toString()}
                  </pre>
                  {error.stack && (
                    <>
                      <div className="font-semibold text-red-800 mb-1">Stack:</div>
                      <pre className="whitespace-pre-wrap overflow-auto max-h-32 text-red-600">
                        {error.stack}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}
            
            <div className="flex gap-3 justify-center">
              {!isInCrashLoop && (
                <button
                  onClick={this.handleReset}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium shadow-md hover:shadow-lg"
                >
                  🔄 Try Again
                </button>
              )}
              <button
                onClick={this.handleGoHome}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition font-medium shadow-md hover:shadow-lg"
              >
                🏠 Go Home
              </button>
            </div>
            
            {isInCrashLoop && (
              <div className="mt-4 text-xs text-gray-600">
                Error count: {errorCount} - Please report this issue
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

