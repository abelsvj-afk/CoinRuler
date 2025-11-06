import { spawn } from 'child_process';
import { NodeDefinition, NodeResult } from '../types';

interface RunCommandConfig {
  command: string; // executable or shell command
  args?: string[]; // args if executable
  shell?: boolean; // run through shell
  cwd?: string;
  timeoutMs?: number;
}

export async function runCommand(node: NodeDefinition<RunCommandConfig>): Promise<NodeResult> {
  const startedAt = new Date().toISOString();
  const cfg = node.config || ({} as RunCommandConfig);
  const cmd = cfg.command;
  const args = cfg.args || [];
  const shell = cfg.shell ?? false;
  const timeoutMs = cfg.timeoutMs ?? 60_000;

  return new Promise<NodeResult>((resolve) => {
    try {
      const child = spawn(cmd, args, { shell, cwd: cfg.cwd, env: process.env });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
      }, timeoutMs);

      child.stdout?.on('data', (d) => (stdout += d.toString()))
      child.stderr?.on('data', (d) => (stderr += d.toString()))

      child.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          id: node.id,
          name: node.name,
          type: node.type,
          status: 'error',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: err?.message || String(err),
          data: { stdout, stderr },
        });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const ok = code === 0;
        resolve({
          id: node.id,
          name: node.name,
          type: node.type,
          status: ok ? 'success' : 'warn',
          startedAt,
          finishedAt: new Date().toISOString(),
          data: { code, stdout: stdout.trim(), stderr: stderr.trim() },
          error: ok ? undefined : `Exited with code ${code}`,
        });
      });
    } catch (e: any) {
      resolve({
        id: node.id,
        name: node.name,
        type: node.type,
        status: 'error',
        startedAt,
        finishedAt: new Date().toISOString(),
        error: e?.message || String(e),
      });
    }
  });
}
