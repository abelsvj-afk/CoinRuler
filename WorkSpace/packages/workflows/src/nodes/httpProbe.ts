import axios from 'axios';
import { NodeDefinition, NodeResult } from '../types';

interface HttpProbeConfig {
  url: string;
  method?: 'GET' | 'POST' | 'HEAD';
  expectStatus?: number;
  timeoutMs?: number;
}

export async function runHttpProbe(node: NodeDefinition<HttpProbeConfig>): Promise<NodeResult> {
  const startedAt = new Date().toISOString();
  const cfg = node.config || ({} as HttpProbeConfig);
  const method = cfg.method || 'GET';
  const expect = cfg.expectStatus ?? 200;
  const timeout = cfg.timeoutMs ?? 5000;

  try {
    const res = await axios.request({ url: cfg.url, method, timeout, validateStatus: () => true });
    const status: NodeResult['status'] = res.status === expect ? 'success' : 'warn';
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      data: { statusCode: res.status, ok: res.status === expect, url: cfg.url },
      error: res.status === expect ? undefined : `Expected ${expect}, got ${res.status}`,
    };
  } catch (e: any) {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      status: 'error',
      startedAt,
      finishedAt: new Date().toISOString(),
      error: e?.message || String(e),
    };
  }
}
