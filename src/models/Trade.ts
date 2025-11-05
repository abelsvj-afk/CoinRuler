import { Schema, model } from 'mongoose';

const TradeSchema = new Schema({
  timestamp: { type: Date, default: Date.now },
  asset: { type: String, required: true },
  type: { type: String, enum: ['BUY', 'SELL'], required: true },
  amount: { type: Number, required: true },
  price: { type: Number, required: true },
  strategy: { type: String, required: true },
  approved: { type: Boolean, default: false },
  executedAt: Date,
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED'] }
});

export const Trade = model('Trade', TradeSchema);
