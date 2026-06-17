import { Component } from "react";
import type { ReactNode } from "react";

interface State {
  error: Error | null;
  info: string | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    this.setState({ error, info: info.componentStack ?? null });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen p-4 text-sm">
          <div className="font-bold text-rose-400 mb-2">エラーが発生しました</div>
          <div className="bg-neutral-900 border border-neutral-800 rounded p-3 mb-2 font-mono text-xs whitespace-pre-wrap">
            {this.state.error.message}
          </div>
          {this.state.info && (
            <details className="bg-neutral-900 border border-neutral-800 rounded p-3 mb-2">
              <summary className="text-neutral-400 text-xs cursor-pointer">スタック</summary>
              <pre className="font-mono text-[10px] whitespace-pre-wrap mt-2">{this.state.info}</pre>
            </details>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => this.setState({ error: null, info: null })}
              className="flex-1 py-3 bg-blue-500 rounded font-bold"
            >
              再試行
            </button>
            <button
              onClick={() => {
                window.location.hash = "#/";
                this.setState({ error: null, info: null });
              }}
              className="flex-1 py-3 bg-neutral-800 rounded"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
