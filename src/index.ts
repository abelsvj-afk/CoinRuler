import express from 'express';
import mongoose from 'mongoose';
import { config } from './config';
import { CryptoAdvisor } from './services/CryptoAdvisor';
import { setupDiscordBot } from './integrations/DiscordBot';

const app = express();
const port = process.env.PORT || 3000;

async function bootstrap() {
  await mongoose.connect(config.mongoDbUri);
  
  const advisor = new CryptoAdvisor(config);
  const discordBot = await setupDiscordBot(config, advisor);

  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy',
      dryRun: config.dryRun,
      dbConnected: mongoose.connection.readyState === 1
    });
  });

  app.listen(port, () => {
    console.log(`CoinRuler running on port ${port}`);
  });
}

bootstrap().catch(console.error);
