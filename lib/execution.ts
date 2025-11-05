/**
 * Execution module - TypeScript migration
 * Execute approved trades via CCXT exchange integration
 */

import type { Db, ObjectId } from 'mongodb';

export interface Approval {
  _id: ObjectId | string;
  title: string;
  type: 'sell' | 'buy' | 'hold' | string;
  coin?: string;
  amount?: number;
  status?: string;
  createdAt?: Date;
  approvedAt?: Date;
  executedAt?: Date;
  failedAt?: Date;
  simulatedAt?: Date;
  lastError?: string;
  orderResult?: any;
  note?: string;
}

export interface ExecutionOptions {
  db?: Db | null;
  logToMemory?: (entry: MemoryEntry) => Promise<void>;
  sendAdvisoryMessage?: (message: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

export interface MemoryEntry {
  type: string;
  approvalId?: ObjectId | string;
  approval?: Approval;
  result?: string;
  error?: string;
  orderResult?: any;
  timestamp: Date;
  executionEnabled?: boolean;
}

export interface ExecutionResult {
  status: 'dryrun' | 'simulated' | 'executed' | 'failed';
  orderResult?: any;
  error?: string;
  note?: string;
}

const DEFAULT_THRESHOLD = 0;

/**
 * Execute an approved trade
 */
export async function executeApproval(
  approval: Approval,
  opts: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const {
    db = null,
    logToMemory = async () => {},
    sendAdvisoryMessage = async () => {},
    env = process.env,
  } = opts;

  try {
    if (!db) {
      // Dry-run/no-db: log and return
      await logToMemory({
        type: 'execution_attempt',
        approvalId: approval?._id,
        approval,
        timestamp: new Date(),
        executionEnabled: false,
      });
      return { status: 'dryrun' };
    }

    const ORDER_EXECUTION_ENABLED =
      (env.ORDER_EXECUTION_ENABLED || 'false').toLowerCase() === 'true';
    const EXCHANGE_ID = (env.EXCHANGE_ID || 'coinbasepro').toLowerCase();
    const API_KEY = env.EXCHANGE_API_KEY || env.COINBASE_API_KEY || null;
    const API_SECRET = env.EXCHANGE_SECRET || env.COINBASE_API_SECRET || null;
    const API_PASSWORD =
      env.EXCHANGE_PASSWORD || env.COINBASE_API_PASSPHRASE || undefined;
    const SANDBOX = (env.EXCHANGE_SANDBOX || 'false').toLowerCase() === 'true';

    // Record initial execution attempt state
    await db
      .collection('approvals')
      .updateOne(
        { _id: approval._id } as any,
        {
          $set: {
            status: ORDER_EXECUTION_ENABLED ? 'executing' : 'simulated',
            executedAt: new Date(),
          },
        }
      );

    await logToMemory({
      type: 'execution_attempt',
      approvalId: approval._id,
      approval,
      timestamp: new Date(),
      executionEnabled: ORDER_EXECUTION_ENABLED,
    });

    if (!ORDER_EXECUTION_ENABLED) {
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          { $set: { status: 'simulated', simulatedAt: new Date() } }
        );
      await sendAdvisoryMessage(
        `Approval simulated (ORDER_EXECUTION_ENABLED=false): ${approval.title} (#${approval._id})`
      );
      return { status: 'simulated' };
    }

    if (!approval.type || approval.type !== 'sell') {
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          {
            $set: {
              status: 'executed',
              executedAt: new Date(),
              note: 'Non-sell approvals auto-marked executed - implement custom handlers for other types',
            },
          }
        );
      await logToMemory({
        type: 'execution',
        approvalId: approval._id,
        approval,
        result: 'noop-non-sell',
        timestamp: new Date(),
      });
      await sendAdvisoryMessage(
        `Approval auto-executed (non-sell): ${approval.title} (#${approval._id})`
      );
      return { status: 'executed', note: 'non-sell' };
    }

    if (!API_KEY || !API_SECRET) {
      const msg =
        'Exchange API credentials not configured — cannot execute orders.';
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          { $set: { status: 'failed', failedAt: new Date(), lastError: msg } }
        );
      return { status: 'failed', error: msg };
    }

    let ccxt: any;
    try {
      ccxt = require('ccxt');
    } catch (e) {
      const msg = 'ccxt library not available';
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          { $set: { status: 'failed', failedAt: new Date(), lastError: msg } }
        );
      return { status: 'failed', error: msg };
    }

    const exchangeClass =
      ccxt[EXCHANGE_ID] ||
      ccxt[EXCHANGE_ID.charAt(0).toUpperCase() + EXCHANGE_ID.slice(1)];
    if (!exchangeClass) {
      const msg = `Exchange ${EXCHANGE_ID} not found in ccxt`;
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          { $set: { status: 'failed', failedAt: new Date(), lastError: msg } }
        );
      return { status: 'failed', error: msg };
    }

    const exchange = new exchangeClass({
      apiKey: API_KEY,
      secret: API_SECRET,
      password: API_PASSWORD,
      enableRateLimit: true,
    });

    if (SANDBOX && typeof exchange.setSandboxMode === 'function') {
      try {
        exchange.setSandboxMode(true);
      } catch (e) {
        /* ignore */
      }
    }

    const base = (approval.coin || 'UNKNOWN').toUpperCase();
    const symbol = `${base}/USD`;
    const amount = Number(approval.amount) || 0;

    if (!amount || amount <= 0) {
      const msg = 'Invalid amount for execution';
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          { $set: { status: 'failed', failedAt: new Date(), lastError: msg } }
        );
      return { status: 'failed', error: msg };
    }

    let orderResult: any = null;
    try {
      if (typeof exchange.loadMarkets === 'function') {
        await exchange.loadMarkets();
      }

      if (typeof exchange.createMarketSellOrder === 'function') {
        orderResult = await exchange.createMarketSellOrder(symbol, amount);
      } else if (typeof exchange.createOrder === 'function') {
        orderResult = await exchange.createOrder(symbol, 'market', 'sell', amount);
      } else {
        throw new Error('exchange does not support programmatic market orders');
      }
    } catch (e: any) {
      const error = String(e);
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          { $set: { status: 'failed', failedAt: new Date(), lastError: error } }
        );
      await logToMemory({
        type: 'execution',
        approvalId: approval._id,
        approval,
        result: 'failed',
        error,
        timestamp: new Date(),
      });
      await sendAdvisoryMessage(
        `Order placement failed for approval #${approval._id}: ${error}`
      );
      return { status: 'failed', error };
    }

    await db
      .collection('approvals')
      .updateOne(
        { _id: approval._id } as any,
        { $set: { status: 'executed', executedAt: new Date(), orderResult } }
      );
    await logToMemory({
      type: 'execution',
      approvalId: approval._id,
      approval,
      result: 'executed',
      orderResult,
      timestamp: new Date(),
    });
    await sendAdvisoryMessage(
      `Order executed for approval #${approval._id}: ${JSON.stringify(
        orderResult
      )}`
    );
    return { status: 'executed', orderResult };
  } catch (err: any) {
    if (db && approval?._id) {
      await db
        .collection('approvals')
        .updateOne(
          { _id: approval._id } as any,
          {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              lastError: String(err),
            },
          }
        );
    }
    return { status: 'failed', error: String(err) };
  }
}

/**
 * Batch execute multiple approvals
 */
export async function executeBatch(
  approvals: Approval[],
  opts: ExecutionOptions = {}
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const approval of approvals) {
    const result = await executeApproval(approval, opts);
    results.push(result);
  }

  return results;
}
