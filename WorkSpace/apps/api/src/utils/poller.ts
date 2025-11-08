/**
 * Resilient Poller with Exponential Backoff + Jitter
 * Generic polling utility for any async function
 */

type PollerOptions<T> = {
  fn: () => Promise<T>;
  // Base interval on success
  intervalMs?: number; // default 60_000
  // Backoff on failure
  minBackoffMs?: number; // default 5_000
  maxBackoffMs?: number; // default 300_000
  factor?: number; // default 1.8
  jitterPct?: number; // default 0.2 (±20%)
  onUpdate?: (data: T) => void;
  onError?: (err: unknown) => void;
};

export function createPoller<T>(opts: PollerOptions<T>) {
  const {
    fn,
    intervalMs = 60_000,
    minBackoffMs = 5_000,
    maxBackoffMs = 300_000,
    factor = 1.8,
    jitterPct = 0.2,
    onUpdate,
    onError,
  } = opts;

  let timer: NodeJS.Timeout | null = null;
  let stopped = true;
  let currentDelay = intervalMs;

  const jitter = (ms: number) => {
    const delta = ms * jitterPct;
    const rnd = (Math.random() * 2 - 1) * delta;
    return Math.max(0, Math.floor(ms + rnd));
  };

  const schedule = (delay: number) => {
    if (stopped) return;
    timer = setTimeout(tick, jitter(delay));
  };

  const tick = async () => {
    try {
      const data = await fn();
      currentDelay = intervalMs; // reset on success
      onUpdate?.(data);
      schedule(currentDelay);
    } catch (err) {
      onError?.(err);
      currentDelay = Math.min(
        Math.max(minBackoffMs, Math.floor(currentDelay * factor)),
        maxBackoffMs
      );
      schedule(currentDelay);
    }
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      currentDelay = intervalMs;
      schedule(0); // Start immediately
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    isRunning() {
      return !stopped;
    },
  };
}
