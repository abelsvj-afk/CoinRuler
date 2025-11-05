import { Client, GatewayIntentBits, TextChannel } from 'discord.js';
import { Config } from '../config';
import { CryptoAdvisor } from '../services/CryptoAdvisor';

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
      }
    };

    const command = commands[message.content];
    if (command) {
      await command();
    }
  });

  await client.login(config.discordBotToken);
  return client;
}
