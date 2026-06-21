"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="h-40 flex items-center justify-center rounded-lg bg-surface-raised border border-surface-border">
            <p className="text-sm text-neutral-500">Не удалось загрузить блок</p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
