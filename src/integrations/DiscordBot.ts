import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { Config } from '../config';
import { CryptoAdvisor } from '../services/CryptoAdvisor';
import { getLLMAdvice } from './llm';

export async function setupDiscordBot(config: Config, advisor: CryptoAdvisor): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.on('ready', () => {
    console.log('Discord bot ready!');
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const commands: { [key: string]: () => Promise<void> } = {
      '/status': async () => {
        const status = await advisor.getStatus();
        await message.reply(JSON.stringify(status, null, 2));
      },
      '/approve': async () => {
        if (message.author.id !== config.ownerId) {
          await message.reply('Unauthorized');
          return;
        }
        await advisor.approveLastTrade();
        await message.reply('Trade approved');
      },
      '/panic': async () => {
        if (message.author.id !== config.ownerId) {
          await message.reply('Unauthorized');
          return;
        }
        await advisor.panic();
        await message.reply('PANIC MODE ACTIVATED - All trading stopped');
      },
      '/advice': async () => {
        // LLM advice: expects the rest of the message as prompt
        const prompt = message.content.replace('/advice', '').trim() || 'Give me crypto trading advice.';
        await message.reply('Thinking...');
        try {
          const llmReply = await getLLMAdvice([
            { role: 'system', content: 'You are an expert crypto trading advisor. Give actionable, safe, and compliant advice.' },
            { role: 'user', content: prompt }
          ], { user: message.author.id });
          await message.reply(llmReply);
        } catch (err) {
          await message.reply('LLM error: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
      }
    };

    // If the message is a known command, run it
    const command = Object.keys(commands).find(cmd => message.content.startsWith(cmd));
    if (command) {
      await commands[command]!();
      return;
    }

    // Fallback: if message is a question or looks like advice request, use LLM
    if (/\b(advice|should|what|how|why|recommend|suggest|risk|opinion|strategy|portfolio|buy|sell|hold)\b/i.test(message.content)) {
      await message.reply('Thinking...');
      try {
        const llmReply = await getLLMAdvice([
          { role: 'system', content: 'You are an expert crypto trading advisor. Give actionable, safe, and compliant advice.' },
          { role: 'user', content: message.content }
        ], { user: message.author.id });
        await message.reply(llmReply);
      } catch (err) {
        await message.reply('LLM error: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    }
  });

  await client.login(config.discordBotToken);
  return client;
}
