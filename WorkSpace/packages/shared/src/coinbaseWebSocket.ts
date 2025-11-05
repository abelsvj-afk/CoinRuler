// Real-time Coinbase WebSocket Client
// Provides live price feeds, balance updates, and transaction notifications

import { EventEmitter } from 'events';

interface CoinbaseMessage {
  type: string;
  product_id?: string;
  price?: string;
  time?: string;
  [key: string]: any;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: Date;
  volume24h?: number;
  change24h?: number;
}

export class CoinbaseWebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private subscriptions: string[] = ['BTC-USD', 'XRP-USD', 'USDC-USD'];
  private prices: Map<string, number> = new Map();
  private isConnected = false;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Connect to Coinbase WebSocket feed
   */
  connect() {
    try {
      console.log('🔌 Connecting to Coinbase WebSocket...');
      
      this.ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');

      this.ws.onopen = () => {
        console.log('✅ Coinbase WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.subscribe();
        this.emit('connected');
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.ws.onerror = (error) => {
        console.error('❌ Coinbase WebSocket error:', error);
        this.emit('error', error);
      };

      this.ws.onclose = () => {
        console.log('🔌 Coinbase WebSocket disconnected');
        this.isConnected = false;
        this.emit('disconnected');
        this.attemptReconnect();
      };

    } catch (error) {
      console.error('❌ Failed to connect to Coinbase WebSocket:', error);
      this.attemptReconnect();
    }
  }

  /**
   * Subscribe to ticker updates for specified products
   */
  private subscribe() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('⚠️  WebSocket not open, cannot subscribe');
      return;
    }

    const subscribeMessage = {
      type: 'subscribe',
      product_ids: this.subscriptions,
      channels: [
        'ticker',
        'level2', // Order book updates
        'matches' // Trade matches
      ],
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log('📡 Subscribed to:', this.subscriptions.join(', '));
  }

  /**
   * Handle incoming messages from Coinbase
   */
  private handleMessage(message: CoinbaseMessage) {
    switch (message.type) {
      case 'ticker':
        this.handleTickerUpdate(message);
        break;

      case 'match':
        this.handleTradeMatch(message);
        break;

      case 'l2update':
        this.handleOrderBookUpdate(message);
        break;

      case 'subscriptions':
        console.log('📋 Subscription confirmed:', message);
        break;

      case 'error':
        console.error('❌ Coinbase error:', message);
        this.emit('error', message);
        break;
    }
  }

  /**
   * Handle ticker (price) updates
   */
  private handleTickerUpdate(message: CoinbaseMessage) {
    if (!message.product_id || !message.price) return;

    const symbol = message.product_id.replace('-USD', '');
    const price = parseFloat(message.price);

    // Store latest price
    this.prices.set(symbol, price);

    const priceUpdate: PriceUpdate = {
      symbol,
      price,
      timestamp: new Date(message.time || Date.now()),
      volume24h: message.volume_24h ? parseFloat(message.volume_24h) : undefined,
    };

    // Emit price update event
    this.emit('price:update', priceUpdate);
    this.emit(`price:${symbol}`, priceUpdate);

    // Check for significant price movements
    this.checkPriceAlert(symbol, price);
  }

  /**
   * Handle trade match updates (actual trades executed)
   */
  private handleTradeMatch(message: CoinbaseMessage) {
    if (!message.product_id || !message.price || !message.size) return;

    const symbol = message.product_id.replace('-USD', '');
    const price = parseFloat(message.price);
    const size = parseFloat(message.size);
    const value = price * size;

    // Emit trade event
    this.emit('trade', {
      symbol,
      price,
      size,
      value,
      side: message.side, // 'buy' or 'sell'
      timestamp: new Date(message.time || Date.now()),
    });

    // Check for whale trades (large trades)
    if (value > 1000000) { // $1M+
      this.emit('whale:trade', {
        symbol,
        price,
        size,
        value,
        side: message.side,
        timestamp: new Date(message.time || Date.now()),
      });
    }
  }

  /**
   * Handle order book updates
   */
  private handleOrderBookUpdate(message: CoinbaseMessage) {
    if (!message.product_id || !message.changes) return;

    this.emit('orderbook:update', {
      symbol: message.product_id.replace('-USD', ''),
      changes: message.changes,
      timestamp: new Date(message.time || Date.now()),
    });
  }

  /**
   * Check for significant price movements and emit alerts
   */
  private checkPriceAlert(symbol: string, newPrice: number) {
    const oldPrice = this.prices.get(`${symbol}:previous`);
    
    if (!oldPrice) {
      this.prices.set(`${symbol}:previous`, newPrice);
      return;
    }

    const change = ((newPrice - oldPrice) / oldPrice) * 100;
    const absChange = Math.abs(change);

    // Alert on significant moves (>5%)
    if (absChange >= 5) {
      this.emit('alert:volatility', {
        symbol,
        oldPrice,
        newPrice,
        change,
        severity: absChange >= 10 ? 'high' : 'medium',
        timestamp: new Date(),
      });

      // Update reference price
      this.prices.set(`${symbol}:previous`, newPrice);
    }
  }

  /**
   * Get current price for a symbol
   */
  getPrice(symbol: string): number | undefined {
    return this.prices.get(symbol);
  }

  /**
   * Get all current prices
   */
  getAllPrices(): Record<string, number> {
    const prices: Record<string, number> = {};
    this.subscriptions.forEach(productId => {
      const symbol = productId.replace('-USD', '');
      const price = this.prices.get(symbol);
      if (price) {
        prices[symbol] = price;
      }
    });
    return prices;
  }

  /**
   * Add new subscription
   */
  addSubscription(productId: string) {
    if (!this.subscriptions.includes(productId)) {
      this.subscriptions.push(productId);
      if (this.isConnected) {
        this.subscribe();
      }
    }
  }

  /**
   * Attempt to reconnect after disconnection
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.emit('reconnect:failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    if (this.ws) {
      console.log('🔌 Disconnecting from Coinbase WebSocket...');
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if currently connected
   */
  isWebSocketConnected(): boolean {
    return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let coinbaseClient: CoinbaseWebSocketClient | null = null;

export function getCoinbaseWebSocketClient(): CoinbaseWebSocketClient {
  if (!coinbaseClient) {
    coinbaseClient = new CoinbaseWebSocketClient();
  }
  return coinbaseClient;
}
