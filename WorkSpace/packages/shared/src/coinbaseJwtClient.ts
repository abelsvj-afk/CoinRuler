/**
 * Coinbase Advanced Trade JWT-based client
 * Implements CDP API key authentication matching the official Python SDK
 * Uses ES256 (ECDSA) JWT tokens instead of HMAC signatures
 */

import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';

export interface CoinbaseAccount {
  uuid: string;
  name: string;
  currency: string;
  available_balance: { value: string; currency: string };
  hold: { value: string; currency: string };
}

export interface ListAccountsResponse {
  accounts: CoinbaseAccount[];
  has_next: boolean;
  cursor?: string;
  size?: number;
}

export class CoinbaseJwtClient {
  private apiKey: string;
  private apiSecret: string; // PEM-formatted EC private key
  private baseUrl = 'https://api.coinbase.com';

  constructor(config?: { apiKey?: string; apiSecret?: string; keyFile?: string }) {
    if (config?.keyFile) {
      // Load from CDP key file (JSON with name/privateKey or id/privateKey)
      const keyData = JSON.parse(fs.readFileSync(config.keyFile, 'utf-8'));
      this.apiKey = keyData.name || keyData.id || '';
      this.apiSecret = keyData.privateKey || '';
    } else {
      this.apiKey = config?.apiKey || process.env.COINBASE_API_KEY || '';
      this.apiSecret = config?.apiSecret || process.env.COINBASE_API_SECRET || '';
    }

    // Handle escaped newlines in PEM keys
    this.apiSecret = this.apiSecret.replace(/\\n/g, '\n');
  }

  /**
   * Build JWT token for REST API authentication (ES256 algorithm)
   * Matches official SDK: https://github.com/coinbase/coinbase-advanced-py
   */
  private buildJwt(uri?: string): string {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('CDP API credentials not configured');
    }

    // Verify this is a PEM-formatted EC private key
    if (!this.apiSecret.includes('BEGIN') || !this.apiSecret.includes('PRIVATE KEY')) {
      throw new Error(
        'Invalid CDP private key format. Expected PEM format (-----BEGIN EC PRIVATE KEY-----). ' +
        'Generate keys at https://cloud.coinbase.com/access/api or https://portal.cdp.coinbase.com/access/api'
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const payload: any = {
      sub: this.apiKey,
      iss: 'cdp',
      nbf: now,
      exp: now + 120, // 2 minute expiry
    };

    if (uri) {
      payload.uri = uri;
    }

    // Generate random nonce (hex string)
    const nonce = crypto.randomBytes(16).toString('hex');

    // Debug logging
    if (process.env.DEBUG_JWT) {
      console.log('[JWT Debug] Payload:', JSON.stringify(payload, null, 2));
      console.log('[JWT Debug] Header kid:', this.apiKey);
      console.log('[JWT Debug] Header nonce:', nonce);
    }

    // Cast to any to allow custom header fields (nonce is required by Coinbase CDP)
    const token = jwt.sign(payload, this.apiSecret, {
      algorithm: 'ES256',
      header: {
        kid: this.apiKey,
        nonce,
      },
    } as any);

    return token;
  }

  /**
   * Format URI for JWT signing (matches official SDK format)
   */
  private formatJwtUri(method: string, path: string): string {
    // Match official SDK: method + host (no scheme) + path
    return `${method} api.coinbase.com${path}`;
  }

  /**
   * Make authenticated request using JWT Bearer token
   */
  private async request(method: string, path: string, body?: any, params?: any): Promise<any> {
    const uri = this.formatJwtUri(method, path);
    const token = this.buildJwt(uri);

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Optional: mirror official SDK user agent to aid debugging
      'User-Agent': 'coinbase-advanced-py/1.8.2',
    };

    const url = `${this.baseUrl}${path}`;
    const config: any = {
      method,
      url,
      headers,
      timeout: 10000,
    };

    if (params) {
      config.params = params;
    }

    if (body) {
      config.data = body;
    }

    try {
      const response = await axios(config);
      return response.data;
    } catch (err: any) {
      const code = err?.response?.status;
      const msg = err?.response?.data || err?.message;
      console.warn(`[CoinbaseJWT] ${method} ${path} failed (${code}) ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      if (code === 401) {
        console.warn(`[CoinbaseJWT] Auth failed. API key: ${this.apiKey?.substring(0, 40)}...`);
        console.warn(`[CoinbaseJWT] Secret format: ${this.apiSecret?.substring(0, 30)}...`);
      }
      throw err;
    }
  }

  /**
   * List accounts (paginated)
   */
  async getAccounts(params: { limit?: number; cursor?: string; retail_portfolio_id?: string } = {}): Promise<ListAccountsResponse> {
    const path = '/api/v3/brokerage/accounts';
    const data = await this.request('GET', path, undefined, params);
    return {
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      has_next: Boolean(data.has_next),
      cursor: data.cursor,
      size: data.size,
    };
  }

  /**
   * Get single account by UUID
   */
  async getAccount(accountUuid: string): Promise<CoinbaseAccount> {
    const path = `/api/v3/brokerage/accounts/${accountUuid}`;
    const data = await this.request('GET', path);
    return data.account;
  }

  /**
   * Get API key permissions
   */
  async getKeyPermissions(): Promise<any> {
    const path = '/api/v3/brokerage/key_permissions';
    return await this.request('GET', path);
  }

  /**
   * Get best bid/ask for products
   */
  async getBestBidAsk(productIds: string[]): Promise<any> {
    const ids = (productIds || []).filter(Boolean);
    if (!ids.length) throw new Error('productIds required');
    const path = '/api/v3/brokerage/best_bid_ask';
    return await this.request('GET', path, undefined, { product_ids: ids.join(',') });
  }

  /**
   * Get historical fills
   */
  async getFills(params: { product_id?: string; order_id?: string; limit?: number; cursor?: string } = {}): Promise<any> {
    const path = '/api/v3/brokerage/orders/historical/fills';
    return await this.request('GET', path, undefined, params);
  }

  /**
   * Get candles for a product
   */
  async getCandles(params: {
    product_id: string;
    granularity: string;
    start?: string;
    end?: string;
    lastMinutes?: number;
  }): Promise<any> {
    const { product_id, granularity } = params;
    if (!product_id) throw new Error('product_id required');
    if (!granularity) throw new Error('granularity required');

    let start = params.start;
    let end = params.end;
    if (!start || !end) {
      const mins = Math.max(1, Math.min(24 * 60, params.lastMinutes || 120));
      const now = new Date();
      const from = new Date(now.getTime() - mins * 60 * 1000);
      start = from.toISOString();
      end = now.toISOString();
    }

    const path = `/api/v3/brokerage/market/products/${encodeURIComponent(product_id)}/candles`;
    return await this.request('GET', path, undefined, { start, end, granularity });
  }

  /**
   * Preview an order
   */
  async previewOrder(body: any): Promise<any> {
    if (!body || typeof body !== 'object') throw new Error('order body required');
    const path = '/api/v3/brokerage/orders/preview';
    return await this.request('POST', path, body);
  }

  /**
   * Get spot price (public endpoint - no auth needed)
   */
  async getSpotPrice(pair: string): Promise<number> {
    const url = `${this.baseUrl}/v2/prices/${pair}/spot`;
    const response = await axios.get(url, { timeout: 10000 });
    return parseFloat(response.data?.data?.amount || '0');
  }

  /**
   * Get all balances as a simple map
   */
  async getAllBalances(): Promise<Record<string, number>> {
    const balances: Record<string, number> = {};
    try {
      const response = await this.getAccounts({ limit: 250 });
      for (const account of response.accounts) {
        const available = parseFloat(account.available_balance.value);
        if (available > 0) {
          balances[account.currency] = available;
        }
      }
    } catch (e) {
      console.warn('[CoinbaseJWT] Failed to fetch balances:', (e as any)?.message);
      throw e;
    }
    return balances;
  }

  /**
   * Get spot prices for multiple currencies
   */
  async getSpotPrices(currencies: string[]): Promise<Record<string, number>> {
    const prices: Record<string, number> = {};
    for (const currency of currencies) {
      try {
        prices[currency] = await this.getSpotPrice(`${currency}-USD`);
      } catch (err: any) {
        console.warn(`[CoinbaseJWT] Failed to get price for ${currency}:`, err.message);
        prices[currency] = 0;
      }
    }
    return prices;
  }

  /**
   * Test connection by attempting to fetch accounts
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getAccounts({ limit: 1 });
      return true;
    } catch {
      return false;
    }
  }
}
