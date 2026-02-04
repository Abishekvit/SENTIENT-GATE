
import { TelemetryState, SYSTEM_TELEMETRY } from '../constants/telemetryData';

class TelemetryStore {
  private state: TelemetryState = { ...SYSTEM_TELEMETRY[1] };
  private listeners: Set<(state: TelemetryState) => void> = new Set();

  public getState(): TelemetryState {
    return this.state;
  }

  public updateState(newState: Partial<TelemetryState>) {
    this.state = { ...this.state, ...newState };
    this.notify();
  }

  // Fix: Ensure the returned cleanup function has an explicit void return type to satisfy React's Destructor type.
  // Set.delete returns a boolean, which causes type errors when implicitly returned as an effect cleanup.
  public subscribe(listener: (state: TelemetryState) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l(this.state));
  }
}

export const telemetryStore = new TelemetryStore();
