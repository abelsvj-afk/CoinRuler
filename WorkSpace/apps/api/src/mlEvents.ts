/**
 * ML Events Logger - Track model training, predictions, and anomalies
 */

import type { Db } from 'mongodb';
import { emitAlert } from './events';
import { getLogger } from '@coinruler/shared';

const logger = getLogger({ svc: 'ml-events' });

export interface MLEvent {
  type: 'training_start' | 'training_complete' | 'prediction' | 'anomaly_detection' | 'model_update';
  model: string;
  details: Record<string, any>;
  metrics?: {
    accuracy?: number;
    loss?: number;
    confidence?: number;
  };
  timestamp: Date;
}

export async function logMLTrainingStart(db: Db, modelName: string, config: any) {
  const event: MLEvent = {
    type: 'training_start',
    model: modelName,
    details: config,
    timestamp: new Date(),
  };

  await db.collection('ml_events').insertOne(event as any);
  
  emitAlert({
    type: 'ml_training',
    severity: 'info',
    message: `Model training started: ${modelName}`,
    data: { model: modelName, config },
  });

  logger.info(`ML training started: ${modelName}`);
}

export async function logMLTrainingComplete(
  db: Db,
  modelName: string,
  metrics: { accuracy: number; loss: number }
) {
  const event: MLEvent = {
    type: 'training_complete',
    model: modelName,
    details: { status: 'completed' },
    metrics,
    timestamp: new Date(),
  };

  await db.collection('ml_events').insertOne(event as any);

  emitAlert({
    type: 'ml_training',
    severity: 'info',
    message: `Model training complete: ${modelName} (accuracy: ${(metrics.accuracy * 100).toFixed(1)}%)`,
    data: { model: modelName, metrics },
  });

  logger.info(`ML training complete: ${modelName} - accuracy: ${metrics.accuracy}, loss: ${metrics.loss}`);
}

export async function logMLPrediction(
  db: Db,
  modelName: string,
  prediction: any,
  confidence: number
) {
  const event: MLEvent = {
    type: 'prediction',
    model: modelName,
    details: prediction,
    metrics: { confidence },
    timestamp: new Date(),
  };

  await db.collection('ml_events').insertOne(event as any);

  // Only emit high-confidence predictions
  if (confidence >= 0.8) {
    emitAlert({
      type: 'ml_prediction',
      severity: 'medium',
      message: `High-confidence prediction from ${modelName}`,
      data: { model: modelName, prediction, confidence },
    });
  }

  logger.debug(`ML prediction: ${modelName} - confidence: ${confidence}`);
}

export async function logAnomalyDetection(
  db: Db,
  anomalyType: string,
  details: any,
  severity: 'low' | 'medium' | 'high'
) {
  const event: MLEvent = {
    type: 'anomaly_detection',
    model: 'anomaly_detector',
    details: { anomalyType, ...details },
    timestamp: new Date(),
  };

  await db.collection('ml_events').insertOne(event as any);

  emitAlert({
    type: 'anomaly',
    severity: severity === 'high' ? 'warning' : 'info',
    message: `Anomaly detected: ${anomalyType}`,
    data: details,
  });

  logger.warn(`Anomaly detected: ${anomalyType}`, details);
}

export async function getRecentMLEvents(db: Db, limit: number = 50) {
  return await db.collection('ml_events')
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
}
