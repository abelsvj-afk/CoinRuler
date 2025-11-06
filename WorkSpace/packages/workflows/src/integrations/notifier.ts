import axios from 'axios';

export interface NotifyOptions {
  channels?: Array<'discord' | 'console'>;
}

export async function notify(message: string | object, opts: NotifyOptions = {}): Promise<void> {
  const channels = opts.channels || ['discord', 'console'];
  const text = typeof message === 'string' ? message : '```json\n' + JSON.stringify(message, null, 2) + '\n```';

  for (const ch of channels) {
    try {
      if (ch === 'console') {
        // eslint-disable-next-line no-console
        console.log('[Notifier]', typeof message === 'string' ? message : JSON.stringify(message));
      } else if (ch === 'discord') {
        const url = process.env.DISCORD_MONITOR_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
        if (!url) {
          // eslint-disable-next-line no-console
          console.warn('[Notifier] Discord webhook not configured');
          continue;
        }
        await axios.post(url, { content: text });
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(`[Notifier] ${ch} failed:`, e?.message || e);
    }
  }
}
