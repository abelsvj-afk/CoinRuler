/**
 * Register Discord slash commands (guild or global). Usage:
 * node scripts/register_slash_commands.js --guild GUILD_ID
 */
require('dotenv').config();
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const TOKEN = process.env.DISCORD_TOKEN;
const APP_ID = process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID;
if (!TOKEN || !APP_ID) {
  console.error('DISCORD_TOKEN and DISCORD_APPLICATION_ID must be set in env');
  process.exit(1);
}

const commands = [
  { name: 'status', description: 'Show current portfolio and health' },
  { name: 'advice', description: 'Get portfolio advice and analysis' },
  { name: 'approvals', description: 'List pending approvals' },
  { name: 'approve', description: 'Approve a pending action', options: [{ name: 'id', description: 'Approval id', type: 3, required: true }] },
  { name: 'decline', description: 'Decline a pending action', options: [{ name: 'id', description: 'Approval id', type: 3, required: true }] },
  { name: 'deposit', description: 'Record a deposit', options: [{ name: 'coin', type: 3, required: true, description: 'Coin symbol' }, { name: 'amount', type: 10, required: true, description: 'Amount' }] },
  { name: 'panic', description: 'Trigger kill-switch (owner only)' },
];

const rest = new REST({ version: '9' }).setToken(TOKEN);

(async () => {
  try {
    const guild = process.argv.includes('--guild') ? process.argv[process.argv.indexOf('--guild') + 1] : null;
    if (guild) {
      console.log('Registering commands to guild', guild);
      await rest.put(Routes.applicationGuildCommands(APP_ID, guild), { body: commands });
      console.log('Registered to guild');
    } else {
      console.log('Registering global commands (may take up to 1 hour to propagate)');
      await rest.put(Routes.applicationCommands(APP_ID), { body: commands });
      console.log('Registered globally');
    }
  } catch (err) {
    console.error('Failed to register commands:', err && err.stack ? err.stack : err);
  }
})();
