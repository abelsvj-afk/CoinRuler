import { Schema, model } from 'mongoose';

const PortfolioSchema = new Schema({
  timestamp: { type: Date, default: Date.now },
  btc_balance: { type: Number, required: true },
  btc_baseline: { type: Number, required: true },
  btc_collateral: { type: Number, default: 0 },
  xrp_balance: { type: Number, required: true },
  xrp_baseline: { type: Number, required: true },
  usdc_balance: { type: Number, default: 0 },
  total_value_usd: { type: Number, required: true }
});

export const Portfolio = model('Portfolio', PortfolioSchema);
