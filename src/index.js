import { Client, GatewayIntentBits, Collection, Events } from 'discord.js';
import { Connectors, Shoukaku } from 'shoukaku';
import fs from 'fs';
import path from 'path';
import { dataPath } from './utils/data-dir.js';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadConfig } from './config.js';
import { MusicPlayer } from './music/player.js';
import { createLogger } from './utils/logger.js';
import { deployCommands, deployCommandsForGuild, isManagedChildProcess } from './utils/deploy-commands.js';
import { RateLimiter } from './utils/rate-limiter.js';
import { Telemetry } from './utils/telemetry.js';
import { checkSpotifyCredentials } from './utils/spotify-check.js';
import { getSpotifyYtCache } from './utils/spotify-yt-cache.js';
import { GuildSettingsStore } from './utils/guild-settings.js';
import { JsonSessionStore } from './utils/session-store.js';
import { PlaylistStore } from './utils/playlist-store.js';
import { LikedStore } from './utils/liked-store.js';

dotenv.config();

const config = loadConfig();

// When launched via ShardingManager, SHARDS=`[<id>]` and SHARD_COUNT=<n> are
// injected by the manager. Detect them so logs and the Client constructor can
// carry shard identity. Falls back cleanly to a non-sharded single process.
const parseShardIds = (raw) => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const SHARD_IDS = parseShardIds(process.env.SHARDS);
const SHARD_COUNT = process.env.SHARD_COUNT ? Number(process.env.SHARD_COUNT) : null;
const SHARD_TAG = SHARD_IDS && SHARD_COUNT ? `shard-${SHARD_IDS.join(',')}-of-${SHARD_COUNT}` : 'auralyn';

const logger = createLogger({ level: config.logLevel, scope: SHARD_TAG });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  // Explicit shards/shardCount so the Client always agrees with the manager.
  // discord.js also reads SHARDS/SHARD_COUNT env vars, but being explicit
  // avoids surprises if env vars are stripped by an orchestrator.
  ...(SHARD_IDS && SHARD_COUNT ? { shards: SHARD_IDS, shardCount: SHARD_COUNT } : {}),
});
client.commands = new Collection();
client.logger = logger;
client.config = config;
client.shardInfo = { ids: SHARD_IDS, count: SHARD_COUNT };

client.on(Events.ShardReady, (shardId, unavailableGuilds) => {
  logger.info(`Shard ${shardId} ready (${unavailableGuilds ? unavailableGuilds.size : 0} unavailable guilds)`);
});
client.on(Events.ShardReconnecting, (shardId) => {
  logger.warn(`Shard ${shardId} reconnecting`);
  client.telemetry?.trackReconnect?.();
});
client.on(Events.ShardResume, (shardId, replayedEvents) => {
  logger.info(`Shard ${shardId} resumed (${replayedEvents} events replayed)`);
});
client.on(Events.ShardDisconnect, (event, shardId) => {
  logger.warn(`Shard ${shardId} disconnected (code=${event?.code ?? 'n/a'})`);
});
client.on(Events.ShardError, (error, shardId) => {
  logger.error(`Shard ${shardId} websocket error`, error);
});

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
    reconnectTries: 10,
    reconnectInterval: 5,
    restTimeout: 30,
    moveOnDisconnect: false,
    connectionTimeout: 30000,
  },
);

client.telemetry = new Telemetry(logger.child('telemetry'));
client.settingsStore = new GuildSettingsStore({ logger });
client.sessionStore = new JsonSessionStore({ filePath: dataPath('sessions.json') });

// Lift any pre-per-guild data forward before playback reads it. Both are
// idempotent and never delete their source.
try {
  const settingsMigration = await client.settingsStore.migrateLegacySettings();
  if (settingsMigration.migrated > 0) {
    logger.info(`Migrated ${settingsMigration.migrated} guild(s) to per-guild settings files`);
  }
  const sessionMigration = await client.sessionStore.migrateLegacySessions();
  if (sessionMigration.migrated > 0) {
    logger.info(`Migrated ${sessionMigration.migrated} session(s) to the versioned envelope`);
  }
} catch (error) {
  logger.error('Failed to migrate legacy persistence files', error);
}
client.playlistStore = new PlaylistStore();
client.likedStore = new LikedStore();
client.musicPlayer = new MusicPlayer(shoukaku, logger.child('player'), { telemetry: client.telemetry, settingsStore: client.settingsStore, sessionStore: client.sessionStore });

client.shardStats = function() {
  return {
    shardId: this.shard?.ids?.[0] ?? null,
    totalShards: this.shard?.count ?? 1,
    uptime: this.uptime,
    memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    guildCount: this.guilds.cache.size,
    playerCount: this.musicPlayer?.players?.size ?? 0,
    commandsLoaded: this.commands?.size ?? 0,
    ping: this.ws.ping,
  };
};

client.on('messageCreate', (message) => {
  if (message.content === '!graceful_shutdown') {
    process.emit('SIGTERM');
  }
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
  let reattached = false;
  shoukaku.on('ready', async (name, resumed) => {
    if (resumed) client.telemetry?.trackReconnect();
    logger.info(`Lavalink node ${name} ready${resumed ? ' (resumed)' : ''}`);

    // Sessions restored at client-ready can only resume now that Lavalink is
    // connected. Only the first node to come up reattaches.
    if (client.musicPlayer?.reattachRestored && !reattached) {
      reattached = true;
      await client.musicPlayer.reattachRestored().catch(error => {
        logger.error('Failed to reattach restored sessions', error);
      });
    }
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

let shutdownInFlight = null;

const shutdown = (signal) => {
  // Single flight. A signal and a typed manager message can arrive together,
  // and `process.once` does not dedupe across the two channels. Running the
  // teardown twice would flush the cache and destroy the client twice, and the
  // first process.exit(0) would truncate the second's writes.
  if (shutdownInFlight) return shutdownInFlight;

  shutdownInFlight = runShutdown(signal);
  return shutdownInFlight;
};

const runShutdown = async (signal) => {
  logger.warn(`Received ${signal}. Shutting down Auralyn (shard ${SHARD_TAG})...`);

  try {
    const playerCount = client.musicPlayer.players.size;
    if (playerCount > 0) {
      logger.info(`Disconnecting ${playerCount} music players...`);
      const disconnectPromises = [...client.musicPlayer.players.keys()].map(guildId =>
        client.musicPlayer.disconnect(guildId).catch(error => {
          logger.error(`Failed to disconnect guild ${guildId}`, error);
        })
      );
      await Promise.all(disconnectPromises);
      logger.info('All music players disconnected');
    }

    logger.info('Flushing caches...');
    await getSpotifyYtCache().flush().catch(error => {
      logger.warn(`Failed to flush Spotify→YT cache: ${error.message}`);
    });

    // Release timers started by handlers (e.g. the ready presence interval)
    // before the client is destroyed.
    client.timerRegistry?.dispose();

    logger.info('Destroying Discord client...');
    await client.destroy();
    logger.info('Shutdown complete');
  } catch (error) {
    logger.error('Error during shutdown', error);
  }
  process.exit(0);
};

export async function main() {
  logger.info('Starting Auralyn bot...');
  await loadCommands();
  await loadEvents();
  setupShoukakuEvents();
  await checkSpotifyCredentials(logger.child('spotify'));
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  await client.login(config.discordToken);

  // Global scope is owned by the manager (or a standalone process). Every
  // managed child would otherwise issue an identical global PUT and race the
  // others, so children skip it and deploy only their own guilds.
  const isManagedChild = isManagedChildProcess();

  if (isManagedChild) {
    logger.info('Managed child detected; global command deployment is owned by the shard manager.');
  }

  if (config.autoSyncGlobalCommands) {
    const mode = config.guildId ? `guild-only (${config.guildId})` : 'global';
    logger.info(`Syncing commands in ${mode} mode.`);
    await deployCommands(config, { isManagedChild });
  }

  logger.info('Auralyn bot started successfully');
}

const guildSyncLimiter = new RateLimiter({ intervalMs: 3000, maxBurst: 3 });

client.on('guildCreate', async (guild) => {
  if (!config.autoSyncGuildCommands) return;

  try {
    await guildSyncLimiter.enqueue(() => deployCommandsForGuild(config, guild.id));
    logger.info(`Guild command sync complete for joined guild ${guild.id}`);
  } catch (error) {
    logger.error(`Failed to sync commands for joined guild ${guild.id}`, error);
  }
});

// The ShardingManager asks a child to stop with a typed IPC message instead of
// a signal, so a child that has finished booting can flush and exit cleanly.
// This is registered only when the process really is a forked child; importing
// this module in a normal process must not attach an IPC listener.
if (typeof process.send === 'function') {
  process.on('message', message => {
    if (!message || message.op !== 'graceful_shutdown') return;
    shutdown('graceful_shutdown').catch(error => {
      logger.error('Error during graceful shutdown message', error);
      process.exit(1);
    });
  });
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch(error => {
    logger.error('Auralyn failed to start', error);
    process.exit(1);
  });
}

export { client, shoukaku };

/** Exported for tests: shutdown is idempotent, so the returned promise
 * identity proves concurrent triggers collapse into one teardown. */
export { shutdown };
