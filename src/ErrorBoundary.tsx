import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (this.state.hasError) {
      return <div style={{ padding:24, fontFamily:'system-ui', color:'#fff', background:'#121212', minHeight:'100vh' }}>
        <h1 style={{marginTop:0}}>Unexpected Error</h1>
        <p>Refresh the page to retry.</p>
      </div>;
    }
    return this.props.children;
  }
}
