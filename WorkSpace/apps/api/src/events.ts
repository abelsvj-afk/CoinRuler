import { EventEmitter } from 'events';

// Global live event bus shared across modules (SSE broadcasting, alerts, learning, profit-taking)
// Centralizes the emitter so feature modules can publish without circular importing index.ts.
export const liveEvents = new EventEmitter();
liveEvents.setMaxListeners(200);

export type LiveEventType =
  | 'approval:created'
  | 'approval:updated'
  | 'killswitch:changed'
  | 'portfolio:updated'
  | 'portfolio:snapshot'
  | 'alert'
  | 'trade:submitted'
  | 'trade:result'
  | 'learning'
  | 'macro_feargreed'
  | 'profit_taking'
  | 'profit_taking_auto';

export function emitAlert(data: { type: string; severity?: string; message: string; data?: any }) {
  try {
    liveEvents.emit('alert', { ...data, timestamp: new Date().toISOString() });
  } catch {}
}
