import dotenv from 'dotenv';
dotenv.config();

export interface Config {
  mongoDbUri: string;
  databaseName: string;
  discordBotToken: string;
  discordChannelId: string;
  coinbaseApiKey: string;
  coinbaseApiSecret: string;
  dryRun: boolean;
  ownerId?: string;
}

export const config: Config = {
  mongoDbUri: process.env.MONGODB_URI!,
  databaseName: process.env.DATABASE_NAME!,
  discordBotToken: process.env.DISCORD_BOT_TOKEN!,
  discordChannelId: process.env.DISCORD_CHANNEL_ID!,
  coinbaseApiKey: process.env.COINBASE_API_KEY!,
  coinbaseApiSecret: process.env.COINBASE_API_SECRET!,
  dryRun: process.env.DRY_RUN === 'true',
  ownerId: process.env.OWNER_ID
};
