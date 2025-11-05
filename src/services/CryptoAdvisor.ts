import { CoinbaseClient } from '../integrations/CoinbaseClient';
import { Portfolio } from '../models/Portfolio';
import { Config } from '../config';

interface PortfolioSnapshot {
  btc_balance: number;
  xrp_balance: number;
  usdc_balance: number;
  total_value_usd: number;
  timestamp: Date;
}

interface StatusResponse {
  portfolio: PortfolioSnapshot | null;
  killSwitch: boolean;
  pendingApprovals: number;
  lastUpdate: string;
}

export class CryptoAdvisor {
  private coinbase: CoinbaseClient;
  private config: Config;
  private readonly MINIMUM_XRP = 10;
  private readonly BTC_PROFIT_THRESHOLD = 0.15;
  private readonly BTC_BUYBACK_THRESHOLD = -0.10;
  private killSwitchActive = false;
  private lastTrade: any = null;
  
  constructor(config: Config) {
    this.coinbase = new CoinbaseClient(config.coinbaseApiKey, config.coinbaseApiSecret);
    this.config = config;
  }

  async getStatus(): Promise<StatusResponse> {
    const portfolio = await this.getCurrentPortfolio();
    return {
      portfolio,
      killSwitch: this.killSwitchActive,
      pendingApprovals: 0, // TODO: fetch from DB
      lastUpdate: new Date().toISOString(),
    };
  }

  async approveLastTrade(): Promise<void> {
    if (!this.lastTrade) {
      throw new Error('No trade to approve');
    }
    console.log('Trade approved:', this.lastTrade);
    // TODO: Execute trade via Coinbase
    this.lastTrade = null;
  }

  async panic(): Promise<void> {
    this.killSwitchActive = true;
    console.log('PANIC MODE ACTIVATED - All trading stopped');
    // TODO: Cancel all open orders, log to DB
  }

  async getCurrentPortfolio(): Promise<PortfolioSnapshot> {
    // TODO: Fetch from Coinbase API
    return {
      btc_balance: 0,
      xrp_balance: 0,
      usdc_balance: 0,
      total_value_usd: 0,
      timestamp: new Date(),
    };
  }

  async evaluatePortfolio(): Promise<void> {
    if (this.killSwitchActive) {
      console.log('Kill switch active, skipping evaluation');
      return;
    }

    if (process.env.DRY_RUN === 'true') {
      console.log('Running in simulation mode');
    }

    const portfolio = await this.getCurrentPortfolio();
    await this.enforceBaselines(portfolio);
    await this.executeBTCRuleChain(portfolio);
  }

  private async enforceBaselines(portfolio: PortfolioSnapshot): Promise<void> {
    if (portfolio.xrp_balance < this.MINIMUM_XRP) {
      throw new Error('XRP balance below minimum threshold');
    }
    // ...existing trading logic...
  }

  async executeBTCRuleChain(portfolio: PortfolioSnapshot): Promise<void> {
    // Check if BTC is above profit threshold
    const btcProfit = portfolio.btc_balance * this.BTC_PROFIT_THRESHOLD;
    if (btcProfit > 0) {
      console.log(`BTC profit opportunity: ${btcProfit}`);
      this.lastTrade = {
        type: 'sell',
        coin: 'BTC',
        amount: btcProfit,
        reason: 'profit_taking',
      };
    }
  }
}
