import {
  applyImmediateSetting,
  type ImmediateChange,
  type ImmediateSettingsClient,
} from "./immediate-settings";
import type { DeviceSnapshot } from "./protocol";
import { clone } from "./workspace";

/** Serialize complete writes and readbacks without locking editable controls. */
export class PerformanceAutosave {
  private client: ImmediateSettingsClient | null = null;
  private baseline: DeviceSnapshot | null = null;
  private generation = 0;
  private queue: { change: ImmediateChange; label: string }[] = [];
  private running = false;
  private reportedPending = false;

  constructor(
    private readonly callbacks: {
      onSaved: (actual: DeviceSnapshot, change: ImmediateChange) => void;
      onError: (error: unknown, label: string) => void;
      onPending: (pending: boolean) => void;
    },
  ) {}

  get pending(): boolean {
    return this.running || this.queue.length > 0;
  }

  reset(
    client: ImmediateSettingsClient | null,
    baseline: DeviceSnapshot | null,
  ): void {
    this.generation++;
    this.queue = [];
    this.client = client;
    this.baseline = baseline ? clone(baseline) : null;
    // An invalidated write still owns its transaction until it settles.
    this.reportPending();
  }

  enqueue(change: ImmediateChange, label: string): boolean {
    if (!this.client || !this.baseline) return false;
    this.queue.push({ change: clone(change), label });
    void this.drain();
    return true;
  }

  private reportPending(): void {
    const pending = this.pending;
    if (pending === this.reportedPending) return;
    this.reportedPending = pending;
    this.callbacks.onPending(pending);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.reportPending();
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        const client = this.client;
        const baseline = this.baseline;
        const generation = this.generation;
        if (!client || !baseline) continue;
        try {
          const actual = await applyImmediateSetting(
            client,
            baseline,
            job.change,
          );
          if (generation !== this.generation) continue;
          this.baseline = clone(actual);
          this.callbacks.onSaved(actual, job.change);
        } catch (error) {
          if (generation !== this.generation) continue;
          this.queue = [];
          this.baseline = null;
          this.callbacks.onError(error, job.label);
        }
      }
    } finally {
      this.running = false;
      this.reportPending();
    }
  }
}
