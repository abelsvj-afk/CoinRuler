/**
 * Coinbase Advanced Trade API client for portfolio access
 * Uses REST API (not the old legacy Client SDK)
 */

import axios from 'axios';
import crypto from 'crypto';
// Optional CDP SDK (wallet operations / extended APIs)
let CdpClient: any = null;
try {
  // Lazy require so build doesn't break if dependency missing in some deployment slice
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  CdpClient = require('@coinbase/cdp-sdk').CdpClient;
} catch {}

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

// Paginated accounts response shape per /api/v3/brokerage/accounts
export interface GetAccountsResponse {
  accounts: CoinbaseAccount[];
  has_next: boolean;
  cursor?: string;
  size?: number;
}

export class CoinbaseApiClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = 'https://api.coinbase.com';
  private cdp: any = null;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || process.env.COINBASE_API_KEY || '';
    // Handle escaped newlines in the private key
    const rawSecret = apiSecret || process.env.COINBASE_API_SECRET || '';
    this.apiSecret = rawSecret.replace(/\\n/g, '\n');
    // Initialize CDP client if SDK and credentials present
    if (CdpClient && this.apiKey && this.apiSecret) {
      try {
        this.cdp = new CdpClient({ apiKey: this.apiKey, apiSecret: this.apiSecret });
      } catch (e) {
        console.warn('[CoinbaseAPI] CDP client init failed:', (e as any)?.message);
      }
    }
  }

  private sign(timestamp: string, method: string, path: string, body = ''): string {
    // Coinbase expects base64-encoded HMAC-SHA256 (for Advanced Trade HMAC keys)
    const message = timestamp + method + path + body;
    return crypto.createHmac('sha256', this.apiSecret).update(message).digest('base64');
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
    try {
      const response = await axios({ method, url, headers, data: body, timeout: 10000 });
      return response.data;
    } catch (err: any) {
      const code = err?.response?.status;
      const msg = err?.response?.data || err?.message;
      console.warn(`[CoinbaseAPI] ${method} ${path} failed (${code}) ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      throw err;
    }
  }

  /**
   * Get all account balances (simple convenience wrapper)
   */
  async getAccounts(): Promise<CoinbaseAccount[]> {
    const page = await this.getAccountsPage();
    return page.accounts || [];
  }

  /**
   * Get a paginated accounts page from Advanced Trade brokerage API.
   * Supports limit (default 49, max 250) and cursor for pagination.
   * Returns the raw response including has_next + cursor so callers can iterate.
   * NOTE: This uses HMAC key auth (CB-ACCESS-* headers). If user supplies a CDP key (ECDSA),
   * this endpoint will 401; caller should surface heuristic warning elsewhere.
   */
  async getAccountsPage(params: { limit?: number; cursor?: string } = {}): Promise<GetAccountsResponse> {
    const { limit, cursor } = params;
    const qs = new URLSearchParams();
    if (limit && limit > 0) qs.set('limit', String(limit));
    if (cursor) qs.set('cursor', cursor);
    const path = '/api/v3/brokerage/accounts' + (qs.toString() ? `?${qs.toString()}` : '');
    const data = await this.request('GET', path);
    return {
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      has_next: Boolean(data.has_next),
      cursor: data.cursor,
      size: data.size,
    };
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
    const balances: Record<string, number> = {};
    // Attempt brokerage accounts first, but don't fail hard
    try {
      const accounts = await this.getAccounts();
      for (const account of accounts) {
        const available = parseFloat(account.available_balance.value);
        if (available > 0) balances[account.currency] = available;
      }
    } catch (e) {
      console.warn('[CoinbaseAPI] Brokerage accounts unavailable:', (e as any)?.message);
    }

    // Always attempt CDP wallet augmentation if SDK is available
    if (this.cdp) {
      try {
        const wallets = await this.cdp.listWallets?.();
        if (Array.isArray(wallets)) {
          for (const w of wallets) {
            const assets = w?.assets || [];
            for (const a of assets) {
              const cur = a?.asset?.symbol || a?.symbol;
              const amt = parseFloat(a?.quantity || a?.amount || '0');
              if (cur && amt > 0) {
                balances[cur] = (balances[cur] || 0) + amt;
              }
            }
          }
        }
      } catch (e) {
        console.warn('[CoinbaseAPI] CDP wallet retrieval failed:', (e as any)?.message);
      }
    }

    return balances;
  }

  /**
   * Get current spot price for a trading pair
   */
  async getSpotPrice(pair: string): Promise<number> {
    // Public endpoint: no auth required
    // pair format: BTC-USD
    const url = `${this.baseUrl}/v2/prices/${pair}/spot`;
    const response = await axios.get(url, { timeout: 10000 });
    return parseFloat(response.data?.data?.amount || '0');
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
      // Optionally verify CDP client
      if (this.cdp) {
        try { await this.cdp.listWallets?.(); } catch {}
      }
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

  // CDP wallet creation helper (experimental)
  async createWallet(label: string): Promise<any> {
    if (!this.cdp) throw new Error('CDP SDK not initialized');
    return await this.cdp.createWallet?.({ label });
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
