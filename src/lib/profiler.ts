export interface ProfilerMetrics {
  totalDurationMs: number;
  stages: Record<string, number>;
}

export class RequestProfiler {
  private readonly start = performance.now();
  private readonly checkpoints: Record<string, number> = {};

  async time<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now();
    try {
      return await fn();
    } finally {
      const elapsed = Number((performance.now() - t0).toFixed(2));
      this.checkpoints[stage] = Number(((this.checkpoints[stage] ?? 0) + elapsed).toFixed(2));
    }
  }

  timeSync<T>(stage: string, fn: () => T): T {
    const t0 = performance.now();
    try {
      return fn();
    } finally {
      const elapsed = Number((performance.now() - t0).toFixed(2));
      this.checkpoints[stage] = Number(((this.checkpoints[stage] ?? 0) + elapsed).toFixed(2));
    }
  }

  record(stage: string, durationMs: number): void {
    const rounded = Number(durationMs.toFixed(2));
    this.checkpoints[stage] = Number(((this.checkpoints[stage] ?? 0) + rounded).toFixed(2));
  }

  getMetrics(): ProfilerMetrics {
    return {
      totalDurationMs: Number((performance.now() - this.start).toFixed(2)),
      stages: { ...this.checkpoints },
    };
  }
}
