import { Db, ObjectId } from 'mongodb';
import { RuleSpec } from './types';

export async function listRules(db: Db): Promise<RuleSpec[]> {
  const docs = await db.collection('rules').find({}).toArray();
  return docs as any;
}

export async function createRule(db: Db, rule: RuleSpec): Promise<{ id: string } & RuleSpec> {
  const now = new Date();
  const doc: any = { ...rule, enabled: rule.enabled ?? true, createdAt: now };
  const res = await db.collection('rules').insertOne(doc);
  // Versioning minimal stub
  await db.collection('ruleVersions').insertOne({ ruleId: res.insertedId, spec: rule, createdAt: now, source: 'manual' });
  return { id: res.insertedId.toString(), ...doc };
}

export async function setRuleEnabled(db: Db, id: string, enabled: boolean) {
  await db.collection('rules').updateOne({ _id: new ObjectId(id) as any }, { $set: { enabled } });
}
