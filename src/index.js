import { Client, Events, GatewayIntentBits, Collection, Options } from 'discord.js';
import { Connectors, Shoukaku } from 'shoukaku';
import fs, { existsSync, unlinkSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadConfig } from './config.js';
import { MusicPlayer, createTrackResolver } from './music/index.js';
import { GuildSettingsStore } from './utils/guild-settings.js';
import { JsonSessionStore } from './utils/session-store.js';
import { createLogger } from './utils/logger.js';
import { deployCommands, deployCommandsForGuild } from './utils/deploy-commands.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { Telemetry } from './utils/telemetry.js';

dotenv.config();

const config = loadConfig();
const logger = createLogger({ level: config.logLevel, scope: 'auralyn' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: { interval: 3600, lifetime: 1800 },
    users: {
      interval: 3600,
      filter: () => (user) => user.bot && user.id !== user.client.user?.id,
    },
  },
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
    PresenceManager: 0,
    ReactionManager: 0,
    ReactionUserManager: 0,
  }),
});
client.commands = new Collection();
client.logger = logger;

const shoukaku = new Shoukaku(
  new Connectors.DiscordJS(client),
  [{
    name: 'main',
    url: `${config.lavalink.host}:${config.lavalink.port}`,
    auth: config.lavalink.password,
    secure: config.lavalink.secure,
  }],
  {
    resume: true,
    resumeTimeout: 60,
    reconnectTries: 5,
    reconnectInterval: 5,
    restTimeout: 30,
  },
);

client.telemetry = new Telemetry(logger.child('telemetry'));
client.settingsStore = new GuildSettingsStore({
  filePath: path.join(config.dataDir, 'guild-settings.json'),
});
const sessionStore = new JsonSessionStore({
  filePath: path.join(config.dataDir, 'sessions.json'),
});
const trackResolver = createTrackResolver();
client.musicPlayer = new MusicPlayer(shoukaku, logger.child('player'), {
  settingsStore: client.settingsStore,
  sessionStore,
  trackResolver,
  telemetry: client.telemetry,
});

const loadCommands = async () => {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = (await import(pathToFileURL(filePath).href)).default;
    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
    } else {
      throw new Error(`Command ${file} must export data and execute.`);
    }
  }
};

const loadEvents = async () => {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = (await import(pathToFileURL(filePath).href)).default;
    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client, shoukaku));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client, shoukaku));
    }
  }
};

const setupShoukakuEvents = () => {
  shoukaku.on('ready', (name, resumed) => {
    if (resumed) client.telemetry?.trackReconnect();
    logger.info(`Lavalink node ${name} ready${resumed ? ' (resumed)' : ''}`);
  });
  shoukaku.on('error', (name, error) => {
    logger.error(`Lavalink node ${name} error`, error);
  });
  shoukaku.on('close', (name, code, reason) => {
    logger.warn(`Lavalink node ${name} closed (${code}): ${reason ?? 'no reason'}`);
  });
  shoukaku.on('disconnect', (name, playerCount) => {
    logger.warn(`Lavalink node ${name} disconnected. players=${playerCount}`);
  });
};

const setupClientEvents = () => {
  client.on(Events.Error, (error) => {
    logger.error('Discord client error', error);
  });
  client.on(Events.ShardError, (error, shardId) => {
    logger.error(`Shard ${shardId} error`, error);
  });
  client.on(Events.ShardDisconnect, (event, shardId) => {
    logger.warn(`Shard ${shardId} disconnected (code=${event?.code ?? 'unknown'})`);
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    logger.debug(`Shard ${shardId} reconnecting...`);
  });
  client.on(Events.ShardResume, (shardId, replayedEvents) => {
    logger.info(`Shard ${shardId} resumed (replayed ${replayedEvents} events)`);
    client.telemetry?.trackReconnect();
  });
  client.on(Events.Invalidated, () => {
    logger.error('Discord session invalidated — exiting for clean container restart');
    process.exit(1);
  });
};

const shutdown = async (signal) => {
  logger.warn(`Received ${signal}. Shutting down Auralyn...`);
  for (const guildId of [...client.musicPlayer.players.keys()]) {
    await client.musicPlayer.disconnect(guildId).catch(error => {
      logger.error(`Failed to disconnect guild ${guildId}`, error);
    });
  }
  await client.settingsStore?.persist().catch(error => {
    logger.error('Failed to persist guild settings', error);
  });
  client.destroy();
  process.exit(0);
};

export async function main() {
  logger.info('Starting Auralyn bot...');
  await loadCommands();
  await loadEvents();
  setupShoukakuEvents();
  setupClientEvents();
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await client.login(config.discordToken);

  if (config.autoSyncGlobalCommands && (!client.shard || client.shard.ids.includes(0))) {
    const markerPaths = [
      '/app/.reset-commands',
      '/home/container/.reset-commands',
    ];
    const markerPath = markerPaths.find(p => existsSync(p));
    const reset = config.forceResetCommands
      || process.argv.includes('--reset-commands')
      || !!markerPath;
    await deployCommands(config, {
      reset,
      hashPath: path.join(config.dataDir, 'commands.hash'),
    });
    if (markerPath) {
      try { unlinkSync(markerPath); } catch { /* ignore */ }
    }
  }

  logger.info('Auralyn bot started successfully');
}

const guildSyncLimiter = new RateLimiter({ intervalMs: 2000, maxBurst: 5 });

client.on('guildCreate', async (guild) => {
  if (!config.autoSyncGuildCommands) return;

  try {
    await guildSyncLimiter.enqueue(() => deployCommandsForGuild(config, guild.id));
    logger.info(`Guild command sync complete for joined guild ${guild.id}`);
  } catch (error) {
    logger.error(`Failed to sync commands for joined guild ${guild.id}`, error);
  }
});

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch(error => {
    logger.error('Auralyn failed to start', error);
    process.exit(1);
  });
}

export { client, shoukaku };
