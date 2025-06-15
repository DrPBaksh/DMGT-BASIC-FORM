import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('Error Boundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // In production, you might want to log this to an error reporting service
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="glass-card">
            <div className="error-boundary-content">
              <div className="error-icon">🚨</div>
              <h2>Oops! Something went wrong</h2>
              <p>
                We apologize for the inconvenience. An unexpected error has occurred 
                in the DMGT Assessment Platform.
              </p>
              
              <div className="error-actions">
                <button 
                  className="btn btn-primary"
                  onClick={() => window.location.reload()}
                >
                  🔄 Reload Application
                </button>
                <button 
                  className="btn btn-secondary"
                  onClick={() => {
                    this.setState({ hasError: false, error: null, errorInfo: null });
                  }}
                >
                  ↩️ Try Again
                </button>
              </div>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="error-details">
                  <summary>Technical Details (Development Only)</summary>
                  <pre className="error-stack">
                    {this.state.error && this.state.error.toString()}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              
              <div className="error-help">
                <p>
                  <strong>If this problem persists:</strong>
                </p>
                <ul>
                  <li>Check your internet connection</li>
                  <li>Try refreshing the page</li>
                  <li>Contact your system administrator</li>
                  <li>Clear your browser cache and cookies</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;