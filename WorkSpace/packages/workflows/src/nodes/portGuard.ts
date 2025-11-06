import { createServer } from 'net';
import { NodeDefinition, NodeResult } from '../types';

interface PortGuardConfig {
  port: number;
  autoFixCommand?: { command: string; args?: string[]; shell?: boolean; cwd?: string };
  timeoutMs?: number;
}

async function isPortFree(port: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { server.close(); } catch {}
        resolve(false);
      }
    }, timeoutMs);

    server.once('error', () => {
      if (!resolved) {
        clearTimeout(timer);
        resolved = true;
        resolve(false);
      }
    });
    server.listen(port, () => {
      clearTimeout(timer);
      server.close(() => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      });
    });
  });
}

export async function runPortGuard(node: NodeDefinition<PortGuardConfig>): Promise<NodeResult> {
  const startedAt = new Date().toISOString();
  const cfg = node.config!;
  const free = await isPortFree(cfg.port);
  if (free) {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      status: 'success',
      startedAt,
      finishedAt: new Date().toISOString(),
      data: { port: cfg.port, free: true },
    };
  }

  // If not free, optionally return a suggested autofix command (not executed here to keep cross-platform safety)
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    status: 'warn',
    startedAt,
    finishedAt: new Date().toISOString(),
    data: {
      port: cfg.port,
      free: false,
      suggestion: cfg.autoFixCommand || {
        command: 'powershell',
        args: [
          '-NoProfile',
          '-Command',
          `Get-NetTCPConnection -LocalPort ${cfg.port} -ErrorAction SilentlyContinue | Select-Object OwningProcess | Get-Unique | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }`
        ],
        shell: false,
      },
    },
    error: `Port ${cfg.port} is in use`,
  };
}
