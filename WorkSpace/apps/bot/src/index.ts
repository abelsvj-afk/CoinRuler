import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import axios from 'axios';
import { getLLMAdvice } from '@coinruler/llm';

const token = process.env.DISCORD_BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
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

const apiBase = process.env.API_BASE_URL || 'http://localhost:3001';

client.on('ready', () => console.log(`Bot logged in as ${client.user?.tag}`));

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  
  // /ping
  if (content === '/ping') {
    await message.reply('pong');
    return;
  }
  
  // /status
  if (content.startsWith('/status')) {
    try {
      const { data } = await axios.get(`${apiBase}/status`);
      await message.reply('Status: ' + JSON.stringify(data));
    } catch (e: any) {
      await message.reply('Error fetching status: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // /approvals
  if (content.startsWith('/approvals')) {
    try {
      const { data } = await axios.get(`${apiBase}/approvals`);
      if (!data || data.length === 0) {
        await message.reply('No pending approvals.');
        return;
      }
      const lines = data.map((a: any, i: number) => 
        `${i + 1}. [${a._id}] ${a.title} - ${a.coin} ${a.amount}`
      );
      await message.reply('Pending approvals:\n' + lines.join('\n'));
    } catch (e: any) {
      await message.reply('Error fetching approvals: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // /approve <id>
  if (content.startsWith('/approve ')) {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    const id = content.replace('/approve ', '').trim();
    try {
      await axios.patch(`${apiBase}/approvals/${id}`, { 
        status: 'approved', 
        actedBy: message.author.id 
      });
      await message.reply(`Approval ${id} approved.`);
    } catch (e: any) {
      await message.reply('Error approving: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // /decline <id>
  if (content.startsWith('/decline ')) {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    const id = content.replace('/decline ', '').trim();
    try {
      await axios.patch(`${apiBase}/approvals/${id}`, { 
        status: 'declined', 
        actedBy: message.author.id 
      });
      await message.reply(`Approval ${id} declined.`);
    } catch (e: any) {
      await message.reply('Error declining: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // /panic
  if (content === '/panic') {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    try {
      await axios.post(`${apiBase}/kill-switch`, { 
        enabled: true, 
        reason: 'Panic triggered by user',
        setBy: message.author.id 
      });
      await message.reply('🚨 PANIC MODE ACTIVATED - All trading stopped');
    } catch (e: any) {
      await message.reply('Error activating panic: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // /resume
  if (content === '/resume') {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    try {
      await axios.post(`${apiBase}/kill-switch`, { 
        enabled: false, 
        reason: 'Resumed by user',
        setBy: message.author.id 
      });
      await message.reply('✅ Trading resumed');
    } catch (e: any) {
      await message.reply('Error resuming: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // /advice
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

  // /rotation-status
  if (content === '/rotation-status') {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    try {
      const { data } = await axios.get(`${apiBase}/rotation/status`);
      const lines = data.map((item: any) =>
        `${item.service}: ${item.enabled ? '✅ Enabled' : '❌ Disabled'} | Last: ${item.lastRotation ? new Date(item.lastRotation).toLocaleDateString() : 'Never'} | Due: ${item.isDue ? '⚠️ YES' : '✅ No'}`
      );
      await message.reply('**Credential Rotation Status**\n' + lines.join('\n'));
    } catch (e: any) {
      await message.reply('Error fetching rotation status: ' + (e?.message || 'unknown'));
    }
    return;
  }

  // /rotate <service>
  if (content.startsWith('/rotate ')) {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    const service = content.replace('/rotate ', '').trim();
    try {
      await message.reply(`Rotating credentials for ${service}...`);
      const { data } = await axios.post(`${apiBase}/rotation/rotate/${service}`);
      if (data.success) {
        await message.reply(`✅ Rotation successful for ${service}\nNew Key: ${data.newKeyId}\nGrace period ends: ${new Date(data.gracePeriodEnd).toLocaleString()}`);
      } else {
        await message.reply(`❌ Rotation failed for ${service}: ${data.error}`);
      }
    } catch (e: any) {
      await message.reply('Error rotating credentials: ' + (e?.message || 'unknown'));
    }
    return;
  }

  // /rotation-check
  if (content === '/rotation-check') {
    if (OWNER_ID && message.author.id !== OWNER_ID) {
      await message.reply('Unauthorized');
      return;
    }
    try {
      await message.reply('Running credential rotation check...');
      await axios.post(`${apiBase}/rotation/scheduler/check`);
      await message.reply('✅ Rotation check completed. Check logs for details.');
    } catch (e: any) {
      await message.reply('Error running rotation check: ' + (e?.message || 'unknown'));
    }
    return;
  }
  
  // Natural language fallback for advice
  if (/\b(advice|should|what|how|why|recommend|suggest|risk|opinion|strategy|portfolio|buy|sell|hold)\b/i.test(content)) {
    await message.reply('Thinking...');
    try {
      const reply = await getLLMAdvice([
        { role: 'system', content: 'You are an expert crypto trading advisor. Be safe, compliant, and actionable.' },
        { role: 'user', content }
      ], { user: message.author.id });
      await message.reply(reply);
    } catch (e: any) {
      await message.reply('LLM error: ' + (e?.message || 'unknown'));
    }
  }
});

client.login(token);
