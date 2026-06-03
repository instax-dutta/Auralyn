import { ShardingManager } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createLogger } from './utils/logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.DISCORD_TOKEN) {
  process.stderr.write('DISCORD_TOKEN is required to spawn shards.\n');
  process.exit(1);
}

const logger = createLogger({ level: process.env.LOG_LEVEL ?? 'info', scope: 'shard-mgr' });

// 5500ms is the Discord identify rate-limit window per shard. Spawning faster
// than this guarantees a 1015 (rate-limited) close on subsequent shards.
const SPAWN_DELAY_MS = Number(process.env.SHARD_SPAWN_DELAY_MS ?? 5500);
const SPAWN_TIMEOUT_MS = Number(process.env.SHARD_SPAWN_TIMEOUT_MS ?? 30000);

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token: process.env.DISCORD_TOKEN,
  totalShards: process.env.TOTAL_SHARDS && process.env.TOTAL_SHARDS !== 'auto'
    ? Number(process.env.TOTAL_SHARDS)
    : 'auto',
  respawn: true,
  mode: 'process',
});

manager.on('shardCreate', (shard) => {
  logger.info(`Launched shard ${shard.id}`);
  shard.on('death', (proc) => {
    const code = proc?.exitCode;
    const signal = proc?.signalCode;
    logger.warn(`Shard ${shard.id} process died (exitCode=${code ?? 'n/a'} signal=${signal ?? 'n/a'}) — respawning`);
  });
  shard.on('disconnect', () => logger.warn(`Shard ${shard.id} disconnected`));
  shard.on('reconnecting', () => logger.debug(`Shard ${shard.id} reconnecting`));
  shard.on('error', (error) => logger.error(`Shard ${shard.id} error`, error));
});

manager.spawn({ delay: SPAWN_DELAY_MS, timeout: SPAWN_TIMEOUT_MS }).catch((error) => {
  logger.error('Failed to spawn shards', error);
  process.exit(1);
});

const shutdown = (signal) => {
  logger.info(`Received ${signal}, killing all shards`);
  for (const shard of manager.shards.values()) {
    shard.kill();
  }
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
