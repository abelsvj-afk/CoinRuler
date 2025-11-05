/**
 * Reporting module - TypeScript migration
 * Generate and persist daily reports
 */
import { Db } from 'mongodb';

export interface Portfolio {
  [coin: string]: number | { [key: string]: number } | undefined;
  _prices?: { [coin: string]: number };
}

export interface ReportOptions {
  summary?: string;
  monteCarloMean?: number;
  sentiment?: any;
  mlPredictions?: any;
  alerts?: any[];
}

export interface DailyReport {
  createdAt: Date;
  portfolioSnapshot: Portfolio;
  summary: string;
  monteCarloMean: number | null;
  sentiment: any | null;
  mlPredictions?: any;
  alerts?: any[];
}

export async function generateDailyReport(
  db: Db | null,
  portfolio: Portfolio,
  options: ReportOptions = {}
): Promise<DailyReport> {
  const report: DailyReport = {
    createdAt: new Date(),
    portfolioSnapshot: portfolio || {},
    summary: options.summary || 'Automated daily report',
    monteCarloMean: options.monteCarloMean || null,
    sentiment: options.sentiment || null,
    mlPredictions: options.mlPredictions || null,
    alerts: options.alerts || [],
  };
  
  if (db) {
    await db.collection<DailyReport>('reports').insertOne(report);
  }
  
  return report;
}
