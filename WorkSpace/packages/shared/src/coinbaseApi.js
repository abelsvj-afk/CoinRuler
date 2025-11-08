"use strict";
/**
 * Coinbase Advanced Trade API client for portfolio access
 * Uses REST API (not the old legacy Client SDK)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoinbaseApiClient = void 0;
exports.getCoinbaseApiClient = getCoinbaseApiClient;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
class CoinbaseApiClient {
    constructor(apiKey, apiSecret) {
        this.baseUrl = 'https://api.coinbase.com';
        this.apiKey = apiKey || process.env.COINBASE_API_KEY || '';
        // Handle escaped newlines in the private key
        const rawSecret = apiSecret || process.env.COINBASE_API_SECRET || '';
        this.apiSecret = rawSecret.replace(/\\n/g, '\n');
    }
    sign(timestamp, method, path, body = '') {
        const message = timestamp + method + path + body;
        return crypto_1.default.createHmac('sha256', this.apiSecret).update(message).digest('hex');
    }
    async request(method, path, body) {
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
        const response = await (0, axios_1.default)({ method, url, headers, data: body, timeout: 10000 });
        return response.data;
    }
    /**
     * Get all account balances
     */
    async getAccounts() {
        const data = await this.request('GET', '/api/v3/brokerage/accounts');
        return data.accounts || [];
    }
    /**
     * Get balance for specific currency
     */
    async getBalance(currency) {
        const accounts = await this.getAccounts();
        const account = accounts.find(a => a.currency === currency);
        return account ? parseFloat(account.available_balance.value) : 0;
    }
    /**
     * Get all balances as a simple map
     */
    async getAllBalances() {
        const accounts = await this.getAccounts();
        const balances = {};
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
    async getSpotPrice(pair) {
        // pair format: BTC-USD
        const data = await this.request('GET', `/v2/prices/${pair}/spot`);
        return parseFloat(data.data?.amount || '0');
    }
    /**
     * Get spot prices for multiple assets
     */
    async getSpotPrices(currencies) {
        const prices = {};
        for (const currency of currencies) {
            try {
                prices[currency] = await this.getSpotPrice(`${currency}-USD`);
            }
            catch (err) {
                console.warn(`[Coinbase] Failed to get price for ${currency}:`, err.message);
                prices[currency] = 0;
            }
        }
        return prices;
    }
    /**
     * Check if API credentials are valid
     */
    async testConnection() {
        try {
            await this.getAccounts();
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get collateral information (for loans/borrowing)
     * Note: This is a placeholder - actual endpoint depends on Coinbase's borrowing API
     */
    async getCollateral() {
        try {
            // This endpoint might not exist yet - adjust based on actual Coinbase API
            const data = await this.request('GET', '/api/v3/brokerage/loans/collateral');
            return data.collateral || [];
        }
        catch (err) {
            console.warn('[Coinbase] Collateral endpoint not available:', err.message);
            return [];
        }
    }
    /**
     * Place a market order (DRY RUN by default)
     */
    async placeMarketOrder(productId, side, amount, dryRun = true) {
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
exports.CoinbaseApiClient = CoinbaseApiClient;
// Singleton instance
let coinbaseApiClient = null;
function getCoinbaseApiClient() {
    if (!coinbaseApiClient) {
        coinbaseApiClient = new CoinbaseApiClient();
    }
    return coinbaseApiClient;
}
