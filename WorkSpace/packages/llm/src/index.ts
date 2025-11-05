import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

export type ChatRole = 'system' | 'user' | 'assistant';
export type ChatMessage = { role: ChatRole; content: string };
export interface LLMOptions { max_tokens?: number; temperature?: number; user?: string }

export async function getLLMAdvice(messages: ChatMessage[], opts: LLMOptions = {}): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in env');
  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  } as const;
  const body = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: opts.max_tokens || 256,
    temperature: opts.temperature || 0.7,
    user: opts.user || undefined,
  } as const;
  const res = await axios.post(url, body, { headers });
  const reply = res.data?.choices?.[0]?.message?.content as string | undefined;
  return reply || '[No response from LLM]';
}

export async function streamLLMAdvice(
  messages: ChatMessage[],
  onToken: (token: string) => void,
  opts: LLMOptions = {}
): Promise<void> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in env');
  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    Authorization: `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const body = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: opts.max_tokens || 512,
    temperature: opts.temperature || 0.7,
    user: opts.user || undefined,
    stream: true,
  };

  const res = await axios.post(url, body, { headers, responseType: 'stream' });
  const stream = res.data;

  return new Promise((resolve, reject) => {
    let buffer = '';
    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            resolve();
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) onToken(token);
          } catch (_) {
            // Ignore parse errors
          }
        }
      }
    });

    stream.on('end', resolve);
    stream.on('error', reject);
  });
}
