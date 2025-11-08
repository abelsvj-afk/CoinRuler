import { getCoinbaseApiClient } from './coinbaseApi';
import { getLogger } from './logger';

export type TradeSide = 'buy' | 'sell';
export type PriceMode = 'market' | 'limit';

export interface TradeRequest {
  side: TradeSide;
  symbol: string;      // e.g., BTC
  amount: number;      // base asset quantity (e.g., 0.001 BTC)
  mode?: PriceMode;    // default: market
  limitPrice?: number; // required for limit
  reason?: string;     // optional audit note
}

export interface TradeResult {
  ok: boolean;
  orderId?: string;
  status?: string;
  filledQty?: number;
  avgFillPrice?: number;
  error?: string;
}

// Pre-trade safety checks
function isKillSwitchEnabled(): boolean {
  // In this minimal shared module we cannot query DB; API layer should check kill-switch before calling.
  // Keep placeholder here for future cross-layer wiring.
  return false;
}

export async function executeTrade(req: TradeRequest): Promise<TradeResult> {
  const log = getLogger({ svc: 'trade' });
  const mode = req.mode || 'market';
  const dryRun = (process.env.DRY_RUN || 'true') === 'true';

  if (isKillSwitchEnabled()) {
    return { ok: false, error: 'KILL_SWITCH_ENABLED' };
  }

  if (mode === 'limit' && (typeof req.limitPrice !== 'number' || req.limitPrice! <= 0)) {
    return { ok: false, error: 'INVALID_LIMIT_PRICE' };
  }

  if (!req.amount || req.amount <= 0) {
    return { ok: false, error: 'INVALID_AMOUNT' };
  }

  try {
    const client = getCoinbaseApiClient();
    // Basic balance check on sells
    if (req.side === 'sell') {
      const bal = await client.getBalance(req.symbol);
      if (bal < req.amount) {
        return { ok: false, error: 'INSUFFICIENT_BALANCE' };
      }
    }

    const productId = `${req.symbol}-USD`;
    if (mode === 'market') {
      // Coinbase market IOC: sell uses base_size, buy uses quote_size. We’ll default to base_size for both via placeMarketOrder helper.
      const resp = await client.placeMarketOrder(productId, req.side, String(req.amount), dryRun);
      log.info({ order: resp, dryRun, reason: req.reason }, 'Market order placed');
      return {
        ok: true,
        orderId: resp.id || resp.orderId,
        status: resp.status || 'submitted',
        filledQty: Number(resp.filled_size || 0),
        avgFillPrice: resp.executed_value && resp.filled_size ? Number(resp.executed_value) / Number(resp.filled_size) : undefined,
      };
    } else {
      if (dryRun) {
        log.info({ req }, 'DRY RUN limit order');
        return { ok: true, orderId: 'dry-run-' + Date.now(), status: 'simulated' };
      }
      const order = {
        product_id: productId,
        side: req.side,
        order_configuration: {
          limit_limit_gtc: {
            base_size: String(req.amount),
            limit_price: String(req.limitPrice),
            post_only: false,
          },
        },
      };
      // Use the underlying client request to POST orders
      // @ts-ignore access private method via any (or extend client in future)
      const data = await (client as any).request('POST', '/api/v3/brokerage/orders', order);
      log.info({ order: data }, 'Limit order placed');
      return { ok: true, orderId: data.id, status: data.status };
    }
  } catch (e: any) {
    log.error({ err: e?.message || e }, 'Trade execution failed');
    return { ok: false, error: e?.message || String(e) };
  }
}
