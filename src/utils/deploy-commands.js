import { REST, Routes } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadConfig } from '../config.js';
import { createLogger } from './logger.js';
import { deployWithRetry } from './deploy-retry.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deployedHashes = new Map();

// Test seam: deployment state is process-local and intentionally long-lived,
// so tests reset it to stay isolated from one another.
export function resetDeploymentState() {
  deployedHashes.clear();
}

function targetKey(target) {
  return target.scope === 'global'
    ? `global:${target.clientId}`
    : `guild:${target.clientId}:${target.guildId}`;
}

function hashCommands(commands) {
  return createHash('sha256').update(JSON.stringify(commands)).digest('hex');
}

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

/**
 * Resolves which command scopes this process owns.
 *
 * Ownership is decided by runtime role, never by GUILD_ID. A managed child is a
 * single-shard process that must only ever deploy its own guilds; the manager
 * (and any standalone process) owns global scope. discord.js injects
 * SHARDING_MANAGER=true into every managed child's environment, which is what
 * the entrypoint reads to compute `isManagedChild`.
 */
export function getCommandDeploymentTargets(config, { isManagedChild = false } = {}) {
  if (isManagedChild) {
    // A managed child never owns global scope. With GUILD_ID it deploys that
    // one guild; without it, it deploys nothing here and relies on guildCreate.
    return config.guildId
      ? [{ scope: 'guild', clientId: config.clientId, guildId: config.guildId }]
      : [];
  }

  if (config.guildId) {
    return [{ scope: 'guild', clientId: config.clientId, guildId: config.guildId }];
  }
  return [{ scope: 'global', clientId: config.clientId }];
}

/**
 * True when this process is a shard spawned by the ShardingManager. Discord.js
 * sets SHARDING_MANAGER in every child environment, so this is reliable rather
 * than a heuristic based on SHARDS or SHARD_COUNT.
 */
export function isManagedChildProcess(env = process.env) {
  return env.SHARDING_MANAGER === true || env.SHARDING_MANAGER === 'true';
}

export async function deployCommands(config = loadConfig(), { force = false, timerRegistry, isManagedChild = false } = {}) {
  const logger = createLogger({ level: config.logLevel, scope: 'deploy' });
  const commands = await loadCommandPayloads();
  const hash = hashCommands(commands);

    const rest = new REST({
    version: '10',
    retries: 0,
    rejectOnRateLimit: async () => true,
    makeRequest: async (url, options) => fetch(url, {
      ...options,
      headers: { ...options.headers, 'X-RateLimit-Precision': 'millisecond' },
    }),
  }).setToken(config.discordToken);

  const targets = getCommandDeploymentTargets(config, { isManagedChild });

  for (const target of targets) {
    const key = targetKey(target);

    if (!force && deployedHashes.get(key) === hash) {
      logger.debug(`Commands unchanged for ${key} — skipping.`);
      continue;
    }

    logger.info(`Refreshing ${commands.length} application commands for ${key}.`);

    if (target.scope === 'global') {
      const data = await deployWithRetry(
        () => rest.put(Routes.applicationCommands(target.clientId), { body: commands }),
        { timerRegistry },
      );
      logger.info(`Registered ${data.length} global commands. Propagation can take up to one hour.`);
      deployedHashes.set(key, hash);
      continue;
    }

    try {
      const data = await deployWithRetry(
        () => rest.put(Routes.applicationGuildCommands(target.clientId, target.guildId), { body: commands }),
        { timerRegistry },
      );
      logger.info(`Registered ${data.length} guild commands for ${target.guildId}.`);
      deployedHashes.set(key, hash);
    } catch (err) {
      logger.warn(`Skipping guild ${target.guildId}: ${err.message}`);
    }
  }
}

export async function deployCommandsForGuild(config, guildId, force = false, { timerRegistry } = {}) {
  const logger = createLogger({ level: config.logLevel, scope: 'deploy' });
  const commands = await loadCommandPayloads();
  const hash = hashCommands(commands);
  const key = `guild:${config.clientId}:${guildId}`;

  if (!force && deployedHashes.get(key) === hash) {
    logger.debug(`Skipping guild ${guildId} deploy — commands unchanged.`);
    return;
  }

    const rest = new REST({
    version: '10',
    retries: 0,
    rejectOnRateLimit: async () => true,
  }).setToken(config.discordToken);

  const data = await deployWithRetry(
    () => rest.put(Routes.applicationGuildCommands(config.clientId, guildId), { body: commands }),
    { timerRegistry },
  );
  logger.info(`Registered ${data.length} guild commands for ${guildId}.`);
  deployedHashes.set(key, hash);
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  deployCommands().catch(error => {
    const logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info', scope: 'deploy' });
    logger.error('Failed to deploy commands', error);
    process.exit(1);
  });
}
