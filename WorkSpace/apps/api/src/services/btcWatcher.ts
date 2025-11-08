/**
 * BTC Watcher Service
 * Polls Coinbase balances every 90s and caches results
 */

import { fetchBtcBalances, BtcBalance } from '../integrations/coinbaseBalances';
import { createPoller } from '../utils/poller';
import { getBtcHealth } from '../logic/btcHealth';
import { getLogger } from '@coinruler/shared';

const logger = getLogger({ svc: 'btc-watcher' });

export type BtcSnapshot = {
  ts: number;
  balance: BtcBalance;
  health: ReturnType<typeof getBtcHealth>;
};

let latest: BtcSnapshot | null = null;

export const btcWatcher = createPoller<BtcSnapshot>({
  intervalMs: 90_000, // 90s on success
  minBackoffMs: 7_500,
  maxBackoffMs: 5 * 60_000, // 5 minutes
  factor: 2.0,
  jitterPct: 0.15,

  async fn() {
    const b = await fetchBtcBalances();
    const health = getBtcHealth(b);
    return {
      ts: Date.now(),
      balance: b,
      health,
    };
  },

  onUpdate(snap) {
    latest = snap;
    logger.info(
      {
        available: snap.balance.available,
        locked: snap.balance.locked,
        total: snap.balance.total,
        health: snap.health.label,
      },
      'BTC snapshot updated'
    );
    // Optional: emit to event bus
    // liveEvents.emit('btc:update', snap);
  },

  onError(err) {
    logger.error({ err }, 'BTC watcher error');
  },
});

export function getLatestBtcSnapshot(): BtcSnapshot | null {
  return latest;
}

export function startBtcWatcher() {
  logger.info('Starting BTC watcher...');
  btcWatcher.start();
}

export function stopBtcWatcher() {
  logger.info('Stopping BTC watcher...');
  btcWatcher.stop();
}
