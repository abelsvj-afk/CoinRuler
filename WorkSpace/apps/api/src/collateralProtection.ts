/**
 * BTC Collateral Protection (Requirement 7)
 * Prevents selling locked BTC and warns on LTV worsening
 */

import type { Db } from 'mongodb';
import { getLogger } from '@coinruler/shared';

const logger = getLogger({ svc: 'collateral' });

export interface CollateralStatus {
  hasCollateral: boolean;
  btcLocked: number;
  btcFree: number;
  ltv: number | null;
  health: number | null;
  canSellBTC: boolean;
  warningMessage?: string;
}

/**
 * Check if BTC can be sold (not locked as collateral)
 */
export async function checkBTCSellAllowed(
  db: Db,
  requestedSellAmount: number
): Promise<{ allowed: boolean; reason?: string; status: CollateralStatus }> {
  try {
    // Get collateral data
    const collateralDocs = await db.collection('collateral').find({}).toArray();
    
    if (collateralDocs.length === 0) {
      // No collateral, can sell freely
      return {
        allowed: true,
        status: {
          hasCollateral: false,
          btcLocked: 0,
          btcFree: 0,
          ltv: null,
          health: null,
          canSellBTC: true,
        },
      };
    }
    
    // Find BTC collateral
    const btcCollateral = collateralDocs.find((c: any) => 
      (c.currency || '').toUpperCase() === 'BTC'
    );
    
    if (!btcCollateral) {
      return {
        allowed: true,
        status: {
          hasCollateral: true,
          btcLocked: 0,
          btcFree: 0,
          ltv: null,
          health: null,
          canSellBTC: true,
        },
      };
    }
    
    const btcLocked = (btcCollateral as any).locked || 0;
    const ltv = (btcCollateral as any).ltv;
    const health = (btcCollateral as any).health;
    
    // Get current BTC balance
    const snapshot = await db.collection('snapshots').findOne({}, { sort: { timestamp: -1 } });
    const btcTotal = (snapshot as any)?.BTC || 0;
    const btcFree = Math.max(0, btcTotal - btcLocked);
    
    logger.info(`BTC collateral check: locked=${btcLocked}, free=${btcFree}, requested=${requestedSellAmount}, LTV=${ltv}`);
    
    // Check if requested amount exceeds free BTC
    if (requestedSellAmount > btcFree) {
      const reason = `Cannot sell ${requestedSellAmount} BTC: only ${btcFree.toFixed(8)} BTC available (${btcLocked.toFixed(8)} BTC locked as collateral). Never sell collateral!`;
      logger.warn(reason);
      
      return {
        allowed: false,
        reason,
        status: {
          hasCollateral: true,
          btcLocked,
          btcFree,
          ltv,
          health,
          canSellBTC: false,
          warningMessage: reason,
        },
      };
    }
    
    // Check if selling would worsen LTV significantly
    if (ltv !== null && ltv > 0.7) {
      const warningMessage = `Warning: LTV is ${(ltv * 100).toFixed(1)}% (high risk). Selling BTC may worsen collateral health.`;
      logger.warn(warningMessage);
      
      return {
        allowed: true,
        status: {
          hasCollateral: true,
          btcLocked,
          btcFree,
          ltv,
          health,
          canSellBTC: true,
          warningMessage,
        },
      };
    }
    
    return {
      allowed: true,
      status: {
        hasCollateral: true,
        btcLocked,
        btcFree,
        ltv,
        health,
        canSellBTC: true,
      },
    };
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to check BTC collateral status');
    throw err;
  }
}

/**
 * Monitor LTV changes and emit warnings
 */
export async function monitorLTV(db: Db, eventEmitter: any): Promise<void> {
  try {
    const collateralDocs = await db.collection('collateral').find({}).toArray();
    
    for (const coll of collateralDocs) {
      const ltv = (coll as any).ltv;
      const currency = (coll as any).currency;
      const health = (coll as any).health;
      
      if (ltv === null || ltv === undefined) continue;
      
      // High LTV warning (>75%)
      if (ltv > 0.75) {
        eventEmitter.emit('alert', {
          type: 'ltv_warning',
          severity: 'high',
          message: `⚠️ High LTV Alert: ${currency} collateral at ${(ltv * 100).toFixed(1)}% LTV (health: ${health?.toFixed(2) || 'unknown'})`,
          data: { currency, ltv, health },
          timestamp: new Date().toISOString(),
        });
        
        logger.warn(`High LTV: ${currency} at ${(ltv * 100).toFixed(1)}%`);
      }
      // Medium LTV warning (>60%)
      else if (ltv > 0.60) {
        eventEmitter.emit('alert', {
          type: 'ltv_warning',
          severity: 'medium',
          message: `⚠️ Elevated LTV: ${currency} collateral at ${(ltv * 100).toFixed(1)}% LTV`,
          data: { currency, ltv, health },
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (err: any) {
    logger.error({ err: err?.message }, 'Failed to monitor LTV');
  }
}
