// Real-time price feeds via WebSocket
import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface PriceUpdate {
  symbol: string;
  price: number;
  timestamp: number;
  volume24h?: number;
  change24h?: number;
}

export class PriceFeedManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private symbols: string[] = [];
  private reconnectDelay = 5000;

  constructor(symbols: string[] = ['BTC', 'ETH', 'XRP']) {
    super();
    this.symbols = symbols;
  }

  connect(): void {
    // Using Coinbase Pro WebSocket feed
    this.ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');

    this.ws.on('open', () => {
      console.log('[PriceFeed] WebSocket connected');
      this.subscribe();
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('[PriceFeed] Error parsing message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('[PriceFeed] WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('[PriceFeed] WebSocket closed, reconnecting...');
      this.reconnect();
    });
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    const productIds = this.symbols.map(s => `${s}-USD`);
    
    const subscribeMsg = {
      type: 'subscribe',
      product_ids: productIds,
      channels: ['ticker'],
    };

    this.ws.send(JSON.stringify(subscribeMsg));
    console.log('[PriceFeed] Subscribed to:', productIds);
  }

  private handleMessage(message: any): void {
    if (message.type === 'ticker') {
      const symbol = message.product_id.replace('-USD', '');
      const priceUpdate: PriceUpdate = {
        symbol,
        price: parseFloat(message.price),
        timestamp: Date.now(),
        volume24h: parseFloat(message.volume_24h),
      };

      this.emit('price', priceUpdate);
    }
  }

  private reconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      console.log('[PriceFeed] Attempting to reconnect...');
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  addSymbol(symbol: string): void {
    if (!this.symbols.includes(symbol)) {
      this.symbols.push(symbol);
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.subscribe();
      }
    }
  }

  removeSymbol(symbol: string): void {
    this.symbols = this.symbols.filter(s => s !== symbol);
    // Would need to unsubscribe, but for simplicity we'll just restart
    if (this.ws) {
      this.disconnect();
      this.connect();
    }
  }
}

// Binance WebSocket alternative
export class BinancePriceFeed extends EventEmitter {
  private ws: WebSocket | null = null;
  private symbols: string[] = [];

  constructor(symbols: string[] = ['BTCUSDT', 'ETHUSDT', 'XRPUSDT']) {
    super();
    this.symbols = symbols;
  }

  connect(): void {
    const streams = this.symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
    
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[Binance] WebSocket connected');
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.data) {
          const symbol = message.data.s.replace('USDT', '');
          const priceUpdate: PriceUpdate = {
            symbol,
            price: parseFloat(message.data.c),
            timestamp: message.data.E,
            volume24h: parseFloat(message.data.v),
            change24h: parseFloat(message.data.P),
          };
          this.emit('price', priceUpdate);
        }
      } catch (error) {
        console.error('[Binance] Error parsing message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('[Binance] WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('[Binance] WebSocket closed');
      setTimeout(() => this.connect(), 5000);
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
