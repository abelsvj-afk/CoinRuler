/**
 * Knowledge Store - Bot's memory and learning repository
 * Stores market insights, patterns, user preferences, and decision rationale
 */

import type { Db, ObjectId } from 'mongodb';
import { getLogger } from '@coinruler/shared';
import { emitAlert } from './events';

const logger = getLogger({ svc: 'knowledge' });

export interface KnowledgeDocument {
  _id?: ObjectId;
  type: 'market_insight' | 'pattern' | 'user_preference' | 'decision_rationale' | 'external_data' | 'learning';
  title: string;
  content: string;
  tags: string[];
  confidence: number; // 0-1
  source: string; // e.g., 'ml_model', 'user_feedback', 'news', 'whale_tracker'
  relevance: number; // 0-1, decays over time
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date; // Optional TTL for time-sensitive knowledge
}

/**
 * Ingest new knowledge document
 */
export async function ingestKnowledge(
  db: Db,
  doc: Omit<KnowledgeDocument, '_id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = new Date();
  const fullDoc: Omit<KnowledgeDocument, '_id'> = {
    ...doc,
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection('knowledge').insertOne(fullDoc as any);
  
  logger.info(`Knowledge ingested: ${doc.title} (type=${doc.type}, source=${doc.source})`);
  
  // Emit SSE alert for high-confidence insights
  if (doc.confidence >= 0.8) {
    emitAlert({
      type: 'knowledge_ingestion',
      severity: 'info',
      message: `New ${doc.type.replace('_', ' ')}: ${doc.title}`,
      data: { id: result.insertedId, type: doc.type, confidence: doc.confidence },
    });
  }

  return result.insertedId.toString();
}

/**
 * Query knowledge by filters
 */
export async function queryKnowledge(
  db: Db,
  filters: {
    type?: KnowledgeDocument['type'];
    tags?: string[];
    minConfidence?: number;
    minRelevance?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'confidence' | 'relevance';
  } = {}
): Promise<KnowledgeDocument[]> {
  const query: any = {};

  if (filters.type) query.type = filters.type;
  if (filters.tags && filters.tags.length) query.tags = { $in: filters.tags };
  if (filters.minConfidence) query.confidence = { $gte: filters.minConfidence };
  if (filters.minRelevance) query.relevance = { $gte: filters.minRelevance };

  // Exclude expired documents
  query.$or = [
    { expiresAt: { $exists: false } },
    { expiresAt: { $gt: new Date() } },
  ];

  const sort: any = {};
  if (filters.sortBy === 'confidence') sort.confidence = -1;
  else if (filters.sortBy === 'relevance') sort.relevance = -1;
  else sort.createdAt = -1;

  const limit = Math.min(100, Math.max(1, filters.limit || 50));

  const docs = await db.collection('knowledge')
    .find(query)
    .sort(sort)
    .limit(limit)
    .toArray();

  return docs as unknown as KnowledgeDocument[];
}

/**
 * Update knowledge relevance (decay over time)
 */
export async function decayRelevance(db: Db): Promise<void> {
  const decayFactor = 0.95; // 5% decay per run
  
  await db.collection('knowledge').updateMany(
    { relevance: { $gt: 0.1 } },
    [
      {
        $set: {
          relevance: { $multiply: ['$relevance', decayFactor] },
          updatedAt: new Date(),
        },
      },
    ]
  );

  logger.debug('Knowledge relevance decay applied');
}

/**
 * Get context for AI chat (most relevant knowledge)
 */
export async function getAIChatContext(db: Db, tags: string[] = []): Promise<string> {
  const relevantDocs = await queryKnowledge(db, {
    tags,
    minConfidence: 0.6,
    minRelevance: 0.5,
    limit: 10,
    sortBy: 'relevance',
  });

  if (!relevantDocs.length) return '';

  const context = relevantDocs.map(doc => 
    `[${doc.type}] ${doc.title}: ${doc.content.slice(0, 200)}`
  ).join('\n\n');

  return `Relevant Knowledge:\n${context}`;
}

/**
 * Store decision rationale for learning
 */
export async function storeDecisionRationale(
  db: Db,
  decision: {
    action: string;
    reasoning: string;
    outcome?: string;
    confidence: number;
  }
): Promise<void> {
  await ingestKnowledge(db, {
    type: 'decision_rationale',
    title: `Decision: ${decision.action}`,
    content: `Reasoning: ${decision.reasoning}\nOutcome: ${decision.outcome || 'pending'}`,
    tags: ['decision', decision.action.toLowerCase()],
    confidence: decision.confidence,
    source: 'autonomous_system',
    relevance: 1.0,
    metadata: decision,
  });
}
