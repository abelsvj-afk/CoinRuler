import { Portfolio } from '../models/Portfolio';
import { Trade } from '../models/Trade';
import { CoinbaseClient } from '../integrations/CoinbaseClient';

export class TradingEngine {
  private readonly PROFIT_TIERS = [
    { threshold: 0.50, takeProfit: 0.20 },
    { threshold: 0.30, takeProfit: 0.15 },
    { threshold: 0.20, takeProfit: 0.10 },
    { threshold: 0.10, takeProfit: 0.05 }
  ];

  constructor(
    private coinbase: CoinbaseClient,
    private readonly dryRun: boolean
  ) {}

  async executeTrade(trade: Trade): Promise<boolean> {
    if (this.dryRun) {
      console.log('DRY RUN: Would execute trade:', trade);
      return true;
    }

    try {
      const result = await this.coinbase.executeTrade(trade);
      trade.status = 'EXECUTED';
      trade.executedAt = new Date();
      await trade.save();
      return result;
    } catch (error) {
      trade.status = 'FAILED';
      await trade.save();
      throw error;
    }
  }

  async evaluatePosition(asset: string, currentPrice: number, averagePrice: number): Promise<Trade | null> {
    const percentageGain = (currentPrice - averagePrice) / averagePrice;
    
    for (const tier of this.PROFIT_TIERS) {
      if (percentageGain >= tier.threshold) {
        return this.createTrade(asset, 'SELL', tier.takeProfit);
      }
    }

    return null;
  }

  private async createTrade(asset: string, type: 'BUY' | 'SELL', size: number): Promise<Trade> {
    const trade = new Trade({
      asset,
      type,
      amount: size,
      price: await this.coinbase.getCurrentPrice(asset),
      strategy: 'PROFIT_TAKING',
      status: 'PENDING'
    });
    
    await trade.save();
    return trade;
  }
}
