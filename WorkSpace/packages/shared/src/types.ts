// Shared types for CoinRuler WorkSpace

export interface Approval {
  _id?: string;
  type: 'buy' | 'sell' | 'stake' | 'stake-suggestion';
  coin: string;
  amount: number;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'declined' | 'executed';
  createdAt: Date;
  actedBy?: string;
  actedAt?: Date;
  metadata?: any;
}

export interface PortfolioSnapshot {
  BTC?: number;
  XRP?: number;
  USDC?: number;
  [coin: string]: number | undefined | { [key: string]: number };
  _prices?: { [coin: string]: number };
}

export interface MonteCarloResult {
  outcomes: number[];
  mean: number;
  median: number;
  percentile_5: number;
  percentile_95: number;
}

export interface KillSwitch {
  enabled: boolean;
  reason: string;
  timestamp: Date;
  setBy?: string;
}

export interface MemoryEntry {
  type: 'analysis' | 'trade' | 'approval' | 'execution_attempt';
  timestamp: Date;
  data: any;
}

export interface DailyReport {
  createdAt: Date;
  portfolioSnapshot: PortfolioSnapshot;
  summary: string;
  monteCarloMean?: number;
  sentiment?: any;
}

export interface MLPrediction {
  expectedValue: number;
  changePct: number;
  confidence: number;
}

export interface SentimentData {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number;
  sources: Array<{
    title: string;
    url: string;
    sentiment: string;
  }>;
}
