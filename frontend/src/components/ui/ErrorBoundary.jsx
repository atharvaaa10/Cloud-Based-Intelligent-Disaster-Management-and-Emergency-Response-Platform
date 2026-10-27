import { Component } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return typeof this.props.fallback === 'function'
          ? this.props.fallback({
              error: this.state.error,
              reset: this.handleReset,
              reload: this.handleReload,
            })
          : this.props.fallback;
      }

      return (
        <div
          role="alert"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px 24px',
            textAlign: 'center',
            background: 'var(--bg-surface, #0F1830)',
            border: '1px solid var(--border-default, rgba(255, 255, 255, 0.08))',
            borderRadius: '12px',
            margin: '20px auto',
            maxWidth: this.props.compact ? '100%' : '560px',
            width: '100%',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#EF4444',
              marginBottom: '16px',
            }}
          >
            <AlertTriangle size={24} />
          </div>
          <h2
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--text-primary, #F8FAFC)',
              marginBottom: '8px',
            }}
          >
            {this.props.title || 'Something went wrong'}
          </h2>
          <p
            style={{
              fontSize: '13.5px',
              color: 'var(--text-secondary, #94A3B8)',
              marginBottom: '20px',
              maxWidth: '420px',
              lineHeight: 1.5,
            }}
          >
            {this.props.description ||
              'An unexpected error occurred while rendering this component. You can reload the page or try again.'}
          </p>

          {process.env.NODE_ENV !== 'production' && this.state.error && (
            <div
              style={{
                width: '100%',
                maxHeight: '120px',
                overflowY: 'auto',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '11px',
                fontFamily: 'monospace',
                color: '#FCA5A5',
                textAlign: 'left',
                marginBottom: '20px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {this.state.error.toString()}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={this.handleReset}
              className="ui-btn ui-btn-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                background: 'var(--bg-surface-subdued, rgba(255, 255, 255, 0.05))',
                border: '1px solid var(--border-default, rgba(255, 255, 255, 0.1))',
                color: 'var(--text-primary, #F8FAFC)',
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="ui-btn ui-btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                background: 'var(--primary-accent, #0EA5F5)',
                border: 'none',
                color: '#FFFFFF',
              }}
            >
              <RotateCcw size={14} />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
