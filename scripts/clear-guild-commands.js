import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.argv[2];

if (!token || !clientId || !guildId) {
  console.error('Usage: node scripts/clear-guild-commands.js <GUILD_ID>');
  console.error('Requires DISCORD_TOKEN and CLIENT_ID in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
console.log(`Cleared guild commands for ${guildId}. ${data.length} commands remaining.`);
