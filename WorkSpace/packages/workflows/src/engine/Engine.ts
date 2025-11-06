import { ExecutionContext, NodeDefinition, NodeResult, WorkflowDefinition } from '../types';
import { runHttpProbe } from '../nodes/httpProbe';
import { runCommand } from '../nodes/runCommand';
import { runPortGuard } from '../nodes/portGuard';
import { runNotify } from '../nodes/notify';

export class Engine {
  private workflow: WorkflowDefinition;
  private nodesById: Map<string, NodeDefinition>;
  private context: ExecutionContext;

  constructor(workflow: WorkflowDefinition, initialContext: ExecutionContext = {}) {
    this.workflow = workflow;
    this.nodesById = new Map(workflow.nodes.map(n => [n.id, n]));
    this.context = { ...initialContext };
  }

  getContext() {
    return this.context;
  }

  private evalCondition(expr?: string): boolean {
    if (!expr) return true;
    try {
      // very small and safe-ish evaluator against context only
      // eslint-disable-next-line no-new-func
      const fn = new Function('ctx', `try { return (${expr}); } catch { return false; }`);
      return !!fn(this.context);
    } catch {
      return false;
    }
  }

  private async runNode(node: NodeDefinition): Promise<NodeResult> {
    const startedAt = new Date().toISOString();
    if (node.if && !this.evalCondition(node.if)) {
      return {
        id: node.id,
        name: node.name,
        type: node.type,
        status: 'skip',
        startedAt,
        finishedAt: new Date().toISOString(),
      };
    }

    try {
      switch (node.type) {
        case 'httpProbe':
          return await runHttpProbe(node);
        case 'runCommand':
          return await runCommand(node);
        case 'portGuard':
          return await runPortGuard(node);
        case 'notify':
          return await runNotify(node, this.context);
        default:
          return {
            id: node.id,
            name: node.name,
            type: node.type,
            status: 'error',
            startedAt,
            finishedAt: new Date().toISOString(),
            error: `Unknown node type: ${node.type}`,
          };
      }
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

  private applyResultToContext(result: NodeResult) {
    // store by node id and by lastResult for convenience
    this.context[`node:${result.id}`] = result;
    this.context.lastResult = result;
    // convenience flags for common nodes
    if (result.name.toLowerCase().includes('api')) {
      this.context.apiHealthy = result.status === 'success';
    }
    if (result.name.toLowerCase().includes('web')) {
      this.context.webHealthy = result.status === 'success';
    }
  }

  private nextFor(node: NodeDefinition, result: NodeResult): string | undefined {
    if (result.status === 'success') return node.onSuccess;
    if (result.status === 'warn') return node.onWarn || node.onSuccess;
    if (result.status === 'error') return node.onError || node.onWarn || node.onSuccess;
    return node.onSuccess;
  }

  async run(): Promise<{ results: NodeResult[]; context: ExecutionContext }> {
    const results: NodeResult[] = [];
    let currentId: string | undefined = this.workflow.start;
    const visited = new Set<string>();

    while (currentId) {
      const node = this.nodesById.get(currentId);
      if (!node) break;

      // prevent infinite loops
      if (visited.has(node.id)) break;
      visited.add(node.id);

      const res = await this.runNode(node);
      results.push(res);
      this.applyResultToContext(res);

      currentId = this.nextFor(node, res);
    }

    return { results, context: this.context };
  }
}
