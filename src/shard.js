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

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token: process.env.DISCORD_TOKEN,
  totalShards: process.env.TOTAL_SHARDS && process.env.TOTAL_SHARDS !== 'auto'
    ? Number(process.env.TOTAL_SHARDS)
    : 'auto',
});

manager.on('shardCreate', (shard) => {
  logger.info(`Launched shard ${shard.id}`);
  shard.on('death', () => logger.warn(`Shard ${shard.id} process died`));
  shard.on('disconnect', () => logger.warn(`Shard ${shard.id} disconnected`));
  shard.on('reconnecting', () => logger.debug(`Shard ${shard.id} reconnecting`));
});

manager.spawn().catch((error) => {
  logger.error('Failed to spawn shards', error);
  process.exit(1);
});
