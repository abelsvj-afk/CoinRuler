/**
 * Coinbase Advanced Trade API client for portfolio access
 * Uses REST API (not the old legacy Client SDK)
 */

import axios from 'axios';
import crypto from 'crypto';

export interface CoinbaseBalance {
  currency: string;
  available: string;
  hold: string;
  total: string;
}

export interface CoinbaseAccount {
  uuid: string;
  name: string;
  currency: string;
  available_balance: { value: string; currency: string };
  hold: { value: string; currency: string };
}

export interface CoinbaseCollateral {
  currency: string;
  locked: number;
  ltv: number; // loan-to-value ratio
  health: number; // health factor
}

export class CoinbaseApiClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = 'https://api.coinbase.com';

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || process.env.COINBASE_API_KEY || '';
    // Handle escaped newlines in the private key
    const rawSecret = apiSecret || process.env.COINBASE_API_SECRET || '';
    this.apiSecret = rawSecret.replace(/\\n/g, '\n');
  }

  private sign(timestamp: string, method: string, path: string, body = ''): string {
    const message = timestamp + method + path + body;
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('hex');
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Coinbase API credentials not configured');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bodyStr = body ? JSON.stringify(body) : '';
    const signature = this.sign(timestamp, method, path, bodyStr);

    const headers = {
      'CB-ACCESS-KEY': this.apiKey,
      'CB-ACCESS-SIGN': signature,
      'CB-ACCESS-TIMESTAMP': timestamp,
      'Content-Type': 'application/json',
    };

    const url = `${this.baseUrl}${path}`;
    const response = await axios({ method, url, headers, data: body, timeout: 10000 });
    return response.data;
  }

  /**
   * Get all account balances
   */
  async getAccounts(): Promise<CoinbaseAccount[]> {
    const data = await this.request('GET', '/api/v3/brokerage/accounts');
    return data.accounts || [];
  }

  /**
   * Get balance for specific currency
   */
  async getBalance(currency: string): Promise<number> {
    const accounts = await this.getAccounts();
    const account = accounts.find(a => a.currency === currency);
    return account ? parseFloat(account.available_balance.value) : 0;
  }

  /**
   * Get all balances as a simple map
   */
  async getAllBalances(): Promise<Record<string, number>> {
    const accounts = await this.getAccounts();
    const balances: Record<string, number> = {};
    for (const account of accounts) {
      const available = parseFloat(account.available_balance.value);
      if (available > 0) {
        balances[account.currency] = available;
      }
    }
    return balances;
  }

  /**
   * Get current spot price for a trading pair
   */
  async getSpotPrice(pair: string): Promise<number> {
    // pair format: BTC-USD
    const data = await this.request('GET', `/v2/prices/${pair}/spot`);
    return parseFloat(data.data?.amount || '0');
  }

  /**
   * Get spot prices for multiple assets
   */
  async getSpotPrices(currencies: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};
    for (const currency of currencies) {
      try {
        prices[currency] = await this.getSpotPrice(`${currency}-USD`);
      } catch (err: any) {
        console.warn(`[Coinbase] Failed to get price for ${currency}:`, err.message);
        prices[currency] = 0;
      }
    }
    return prices;
  }

  /**
   * Check if API credentials are valid
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccounts();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get collateral information (for loans/borrowing)
   * Note: This is a placeholder - actual endpoint depends on Coinbase's borrowing API
   */
  async getCollateral(): Promise<CoinbaseCollateral[]> {
    try {
      // This endpoint might not exist yet - adjust based on actual Coinbase API
      const data = await this.request('GET', '/api/v3/brokerage/loans/collateral');
      return data.collateral || [];
    } catch (err: any) {
      console.warn('[Coinbase] Collateral endpoint not available:', err.message);
      return [];
    }
  }

  /**
   * Place a market order (DRY RUN by default)
   */
  async placeMarketOrder(
    productId: string,
    side: 'buy' | 'sell',
    amount: string,
    dryRun = true
  ): Promise<any> {
    if (dryRun) {
      console.log(`[Coinbase DRY RUN] ${side.toUpperCase()} ${amount} ${productId}`);
      return { orderId: 'dry-run-' + Date.now(), status: 'simulated' };
    }

    const order = {
      product_id: productId,
      side,
      order_configuration: {
        market_market_ioc: {
          [side === 'buy' ? 'quote_size' : 'base_size']: amount,
        },
      },
    };

    return await this.request('POST', '/api/v3/brokerage/orders', order);
  }
}

// Singleton instance
let coinbaseApiClient: CoinbaseApiClient | null = null;

export function getCoinbaseApiClient(): CoinbaseApiClient {
  if (!coinbaseApiClient) {
    coinbaseApiClient = new CoinbaseApiClient();
  }
  return coinbaseApiClient;
}
