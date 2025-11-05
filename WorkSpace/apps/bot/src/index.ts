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

const apiBase = process.env.API_BASE_URL || process.env.API_BASE || 'http://localhost:3001';

client.on('ready', () => {
  console.log(`Bot logged in as ${client.user?.tag}`);
  console.log(`Bot is in ${client.guilds.cache.size} server(s):`);
  client.guilds.cache.forEach(guild => {
    console.log(`  - ${guild.name} (ID: ${guild.id})`);
  });
  console.log(`\n✅ Slash commands registered! Try typing / in Discord to see them.`);
  console.log(`\nBot invite URL: https://discord.com/api/oauth2/authorize?client_id=${client.user?.id}&permissions=8&scope=bot`);
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  try {
    if (commandName === 'ping') {
      await interaction.reply({ content: 'Pong! 🏓', ephemeral: true });
      return;
    }

    if (commandName === 'status') {
      try {
        const { data } = await axios.get(`${apiBase}/status`);
        await interaction.reply({ content: 'Status: ' + JSON.stringify(data), ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: 'Error fetching status: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'approvals') {
      try {
        const { data } = await axios.get(`${apiBase}/approvals`);
        if (!data || data.length === 0) {
          await interaction.reply({ content: 'No pending approvals.', ephemeral: true });
          return;
        }
        const lines = data.map((a: any, i: number) => 
          `${i + 1}. [${a._id}] ${a.title} - ${a.coin} ${a.amount}`
        );
        await interaction.reply({ content: 'Pending approvals:\n' + lines.join('\n'), ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: 'Error fetching approvals: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'approve') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      const id = interaction.options.getString('id', true);
      try {
        await axios.patch(`${apiBase}/approvals/${id}`, { 
          status: 'approved', 
          actedBy: interaction.user.id 
        });
        await interaction.reply({ content: `✅ Approval ${id} approved.`, ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: '❌ Error approving: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'decline') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      const id = interaction.options.getString('id', true);
      try {
        await axios.patch(`${apiBase}/approvals/${id}`, { 
          status: 'declined', 
          actedBy: interaction.user.id 
        });
        await interaction.reply({ content: `✅ Approval ${id} declined.`, ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: '❌ Error declining: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'panic') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      try {
        await axios.post(`${apiBase}/kill-switch`, { 
          enabled: true, 
          reason: 'Panic triggered by user',
          setBy: interaction.user.id 
        });
        await interaction.reply({ content: '🚨 PANIC MODE ACTIVATED - All trading stopped', ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: '❌ Error activating panic: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'resume') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      try {
        await axios.post(`${apiBase}/kill-switch`, { 
          enabled: false, 
          reason: 'Resumed by user',
          setBy: interaction.user.id 
        });
        await interaction.reply({ content: '✅ Trading resumed', ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: '❌ Error resuming: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'advice') {
      const prompt = interaction.options.getString('prompt') || 'Give me crypto trading advice.';
      await interaction.deferReply({ ephemeral: true });
      try {
        const reply = await getLLMAdvice([
          { role: 'system', content: 'You are an expert crypto trading advisor. Be safe, compliant, and actionable.' },
          { role: 'user', content: prompt }
        ], { user: interaction.user.id });
        await interaction.editReply(reply);
      } catch (e: any) {
        await interaction.editReply('❌ LLM error: ' + (e?.message || 'unknown'));
      }
      return;
    }

    if (commandName === 'rotation-status') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      try {
        const { data } = await axios.get(`${apiBase}/rotation/status`);
        const lines = data.map((item: any) =>
          `${item.service}: ${item.enabled ? '✅ Enabled' : '❌ Disabled'} | Last: ${item.lastRotation ? new Date(item.lastRotation).toLocaleDateString() : 'Never'} | Due: ${item.isDue ? '⚠️ YES' : '✅ No'}`
        );
        await interaction.reply({ content: '**Credential Rotation Status**\n' + lines.join('\n'), ephemeral: true });
      } catch (e: any) {
        await interaction.reply({ content: '❌ Error fetching rotation status: ' + (e?.message || 'unknown'), ephemeral: true });
      }
      return;
    }

    if (commandName === 'rotate') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      const service = interaction.options.getString('service', true);
      await interaction.deferReply({ ephemeral: true });
      try {
        const { data } = await axios.post(`${apiBase}/rotation/rotate/${service}`);
        if (data.success) {
          await interaction.editReply(`✅ Rotation successful for ${service}\nNew Key: ${data.newKeyId}\nGrace period ends: ${new Date(data.gracePeriodEnd).toLocaleString()}`);
        } else {
          await interaction.editReply(`❌ Rotation failed for ${service}: ${data.error}`);
        }
      } catch (e: any) {
        await interaction.editReply('❌ Error rotating credentials: ' + (e?.message || 'unknown'));
      }
      return;
    }

    if (commandName === 'rotation-check') {
      if (OWNER_ID && interaction.user.id !== OWNER_ID) {
        await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      try {
        await axios.post(`${apiBase}/rotation/scheduler/check`);
        await interaction.editReply('✅ Rotation check completed. Check logs for details.');
      } catch (e: any) {
        await interaction.editReply('❌ Error running rotation check: ' + (e?.message || 'unknown'));
      }
      return;
    }

  } catch (error: any) {
    console.error('Error handling interaction:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp('❌ An error occurred');
    } else {
      await interaction.reply('❌ An error occurred');
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  
  const channelName = 'name' in message.channel ? message.channel.name : 'DM';
  console.log(`[Message] ${message.author.tag} in #${channelName}: ${content}`);
  
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
