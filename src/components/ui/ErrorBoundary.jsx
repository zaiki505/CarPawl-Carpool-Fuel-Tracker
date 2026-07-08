import React from "react";

/* Catches render-time exceptions in its subtree so one crashing component
   degrades to a fallback instead of unmounting the whole app. Class component
   because componentDidCatch/getDerivedStateFromError have no hook equivalent. */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
