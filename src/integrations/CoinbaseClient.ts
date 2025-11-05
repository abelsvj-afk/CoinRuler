import { Client } from 'coinbase';

export class CoinbaseClient {
  private client: Client;
  private lastTradeTime: { [key: string]: Date } = {};
  private readonly TRADE_COOLDOWN = 3 * 60 * 60 * 1000; // 3 hours

  constructor(
    apiKey: string,
    apiSecret: string
  ) {
    this.client = new Client({ apiKey, apiSecret });
  }

  async getCurrentPrice(asset: string): Promise<number> {
    const response = await this.client.getSpotPrice({ currencyPair: `${asset}-USD` });
    return parseFloat(response.data.amount);
  }

  async executeTrade(trade: any): Promise<boolean> {
    const now = new Date();
    const lastTrade = this.lastTradeTime[trade.asset];
    
    if (lastTrade && (now.getTime() - lastTrade.getTime()) < this.TRADE_COOLDOWN) {
      throw new Error('Trade cooldown in effect');
    }

    // Execute trade logic here
    this.lastTradeTime[trade.asset] = now;
    return true;
  }

  async getBalance(asset: string): Promise<number> {
    const account = await this.client.getAccount(asset);
    return parseFloat(account.balance.amount);
  }
}
