import { Component, Suspense, type ErrorInfo, type ReactNode } from "react";
import { LoadingState } from "./LoadingState";

interface OptionalFeatureBoundaryProps {
  children: ReactNode;
  name: string;
}

interface OptionalFeatureBoundaryState {
  failed: boolean;
}

class OptionalFeatureErrorBoundary extends Component<OptionalFeatureBoundaryProps, OptionalFeatureBoundaryState> {
  state: OptionalFeatureBoundaryState = { failed: false };

  static getDerivedStateFromError(): OptionalFeatureBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Unable to load ${this.props.name}.`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.failed) {
      return <p className="empty-state bad" role="alert">Unable to load {this.props.name}. Restart Githead and try again.</p>;
    }

    return this.props.children;
  }
}

export function OptionalFeatureBoundary({ children, name }: OptionalFeatureBoundaryProps): ReactNode {
  return (
    <OptionalFeatureErrorBoundary key={name} name={name}>
      <Suspense fallback={<LoadingState label={`Loading ${name}`} className="h-full" />}>
        {children}
      </Suspense>
    </OptionalFeatureErrorBoundary>
  );
}
