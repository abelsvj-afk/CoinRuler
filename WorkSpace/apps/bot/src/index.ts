import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import { getLLMAdvice } from '@coinruler/llm';

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error('Missing DISCORD_BOT_TOKEN in env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on('ready', () => console.log(`Bot logged in as ${client.user?.tag}`));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  if (content === '/ping') {
    await message.reply('pong');
    return;
  }
  if (content.startsWith('/status')) {
    try {
      const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';
      const { data } = await axios.get(`${apiBase}/status`);
      await message.reply('Status: ' + JSON.stringify(data));
    } catch (e: any) {
      await message.reply('Error fetching status: ' + (e?.message || 'unknown'));
    }
    return;
  }
  if (content.startsWith('/advice')) {
    const prompt = content.replace('/advice', '').trim() || 'Give me crypto trading advice.';
    await message.reply('Thinking...');
    try {
      const reply = await getLLMAdvice([
        { role: 'system', content: 'You are an expert crypto trading advisor. Be safe, compliant, and actionable.' },
        { role: 'user', content: prompt }
      ], { user: message.author.id });
      await message.reply(reply);
    } catch (e: any) {
      await message.reply('LLM error: ' + (e?.message || 'unknown'));
    }
    return;
  }
});

client.login(token);
