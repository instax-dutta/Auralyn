import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadConfig } from '../config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function loadCommandPayloads() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = (await import(pathToFileURL(filePath).href)).default;
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    } else {
      throw new Error(`Command ${file} must export data and execute.`);
    }
  }

  return commands;
}

export async function deployCommands(config = loadConfig()) {
  const commands = await loadCommandPayloads();
  const rest = new REST({ version: '10' }).setToken(config.discordToken);

  console.log(`Refreshing ${commands.length} application commands.`);

  if (config.guildId) {
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );
    console.log(`Registered ${data.length} guild commands for ${config.guildId}.`);
  } else {
    const data = await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands },
    );
    console.log(`Registered ${data.length} global commands. Propagation can take up to one hour.`);
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  deployCommands().catch(error => {
    console.error('Failed to deploy commands:', error);
    process.exit(1);
  });
}
