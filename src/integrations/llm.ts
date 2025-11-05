import axios from 'axios';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

export async function getLLMAdvice(messages: any[], opts: any = {}): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set in env');
  const url = 'https://api.openai.com/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${OPENAI_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const body = {
    model: OPENAI_MODEL,
    messages,
    max_tokens: opts.max_tokens || 256,
    temperature: opts.temperature || 0.7,
    user: opts.user || undefined,
  };
  const res = await axios.post(url, body, { headers });
  const reply = res.data.choices && res.data.choices[0] && res.data.choices[0].message && res.data.choices[0].message.content;
  return reply || '[No response from LLM]';
}
