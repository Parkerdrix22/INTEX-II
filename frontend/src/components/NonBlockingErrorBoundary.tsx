import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class NonBlockingErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {
    // Intentionally swallow child errors so core pages keep rendering.
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

