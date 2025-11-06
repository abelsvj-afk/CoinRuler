export type NodeStatus = 'success' | 'warn' | 'error' | 'skip';

export interface NodeResult {
  id: string;
  name: string;
  type: string;
  status: NodeStatus;
  startedAt: string;
  finishedAt: string;
  data?: any;
  error?: string;
}

export interface NodeDefinition<TConfig = any> {
  id: string;
  name: string;
  type: string; // e.g., httpProbe, runCommand, portGuard, notify
  config?: TConfig;
  if?: string; // simple condition on context, e.g., ctx.apiHealthy === false
  onSuccess?: string; // next node id
  onError?: string; // next node id
  onWarn?: string; // next node id
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  start: string; // first node id
  nodes: NodeDefinition[];
}

export interface ExecutionContext {
  [key: string]: any;
}
