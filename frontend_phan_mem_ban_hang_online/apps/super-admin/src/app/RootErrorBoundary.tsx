import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorPanel } from "@ai-sales/ui";
import type { TelemetryAdapter } from "@ai-sales/telemetry";

interface RootErrorBoundaryProps {
  telemetry: TelemetryAdapter;
  children: ReactNode;
}

interface RootErrorBoundaryState {
  error: Error | null;
}

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  override state: RootErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.telemetry.captureError(error, { componentStack: info.componentStack });
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <ErrorPanel title="Đã có lỗi không mong muốn xảy ra." detail={this.state.error.message} />;
    }
    return this.props.children;
  }
}
