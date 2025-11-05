require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = '1435501762516615208'; // Your bot's client ID

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Test if bot is responding'),
  
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check system status'),
  
  new SlashCommandBuilder()
    .setName('approvals')
    .setDescription('List pending trade approvals'),
  
  new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve a trade')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Approval ID')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('decline')
    .setDescription('Decline a trade')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Approval ID')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('panic')
    .setDescription('Emergency stop - activate kill switch'),
  
  new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume trading - deactivate kill switch'),
  
  new SlashCommandBuilder()
    .setName('advice')
    .setDescription('Get AI trading advice')
    .addStringOption(option =>
      option.setName('prompt')
        .setDescription('Your question or topic')
        .setRequired(false)),
  
  new SlashCommandBuilder()
    .setName('rotation-status')
    .setDescription('View credential rotation status'),
  
  new SlashCommandBuilder()
    .setName('rotate')
    .setDescription('Manually rotate credentials for a service')
    .addStringOption(option =>
      option.setName('service')
        .setDescription('Service to rotate')
        .setRequired(true)
        .addChoices(
          { name: 'Coinbase', value: 'coinbase' },
          { name: 'Discord', value: 'discord' },
          { name: 'MongoDB', value: 'mongodb' },
          { name: 'OpenAI', value: 'openai' },
          { name: 'News API', value: 'newsapi' },
          { name: 'Whale Alert', value: 'whalealert' },
          { name: 'Trading Economics', value: 'tradingecon' },
          { name: 'Twilio', value: 'twilio' }
        )),
  
  new SlashCommandBuilder()
    .setName('rotation-check')
    .setDescription('Force credential rotation check'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('Successfully registered application (/) commands!');
    console.log(`Registered ${commands.length} commands:`);
    commands.forEach(cmd => console.log(`  - /${cmd.name}`));
  } catch (error) {
    console.error(error);
  }
})();
