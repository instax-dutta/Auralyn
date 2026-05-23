import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadConfig } from '../config.js';
import { createLogger } from './logger.js';

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

export function getCommandDeploymentTargets(config) {
  if (config.guildId) {
    return [{ scope: 'guild', clientId: config.clientId, guildId: config.guildId }];
  }
  return [{ scope: 'global', clientId: config.clientId }];
}

export async function deployCommands(config = loadConfig()) {
  const logger = createLogger({ level: config.logLevel, scope: 'deploy' });
  const commands = await loadCommandPayloads();
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const targets = getCommandDeploymentTargets(config);

  logger.info(`Refreshing ${commands.length} application commands.`);

  for (const target of targets) {
    if (target.scope === 'global') {
      const data = await rest.put(
        Routes.applicationCommands(target.clientId),
        { body: commands },
      );
      logger.info(`Registered ${data.length} global commands. Propagation can take up to one hour.`);
      continue;
    }

    try {
      const data = await rest.put(
        Routes.applicationGuildCommands(target.clientId, target.guildId),
        { body: commands },
      );
      logger.info(`Registered ${data.length} guild commands for ${target.guildId}.`);
    } catch (err) {
      logger.warn(`Skipping guild ${target.guildId}: ${err.message}`);
    }
  }
}

export async function deployCommandsForGuild(config, guildId) {
  const logger = createLogger({ level: config.logLevel, scope: 'deploy' });
  const commands = await loadCommandPayloads();
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const data = await rest.put(
    Routes.applicationGuildCommands(config.clientId, guildId),
    { body: commands },
  );
  logger.info(`Registered ${data.length} guild commands for ${guildId}.`);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  deployCommands().catch(error => {
    const logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info', scope: 'deploy' });
    logger.error('Failed to deploy commands', error);
    process.exit(1);
  });
}
