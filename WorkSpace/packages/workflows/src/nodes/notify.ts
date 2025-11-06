import { NodeDefinition, NodeResult, ExecutionContext } from '../types';
import { notify } from '../integrations/notifier';

interface NotifyConfig {
  message?: string;
  template?: string; // allows simple templates using context JSON
  channels?: Array<'discord' | 'console'>;
}

export async function runNotify(node: NodeDefinition<NotifyConfig>, ctx: ExecutionContext): Promise<NodeResult> {
  const startedAt = new Date().toISOString();
  const cfg = node.config || {};

  try {
    let text = cfg.message || '';
    if (cfg.template) {
      // naive template replace: {{key}} -> ctx[key]
      text = cfg.template.replace(/{{([^}]+)}}/g, (_, k) => {
        const key = String(k).trim();
        const val = key.split('.').reduce((acc: any, part: string) => (acc ? acc[part] : undefined), ctx as any);
        return typeof val === 'undefined' ? '' : String(typeof val === 'object' ? JSON.stringify(val) : val);
      });
    }

    const payload = text || `Workflow notify from ${node.name}`;
    await notify(payload, { channels: cfg.channels });

    return {
      id: node.id,
      name: node.name,
      type: node.type,
      status: 'success',
      startedAt,
      finishedAt: new Date().toISOString(),
      data: { payload },
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
