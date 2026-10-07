import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { HyperscaleShardManager, readShardManagerConfig } from './shard-manager.js';

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
  process.stderr.write('DISCORD_TOKEN is required to spawn shards.\n');
  process.exit(1);
}

const logger = (await import('./utils/logger.js')).createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  scope: 'shard-mgr',
});

const config = readShardManagerConfig();

const hyperscaleManager = new HyperscaleShardManager({ logger, config });

// Importing this file must not spawn shards or register process-wide handlers;
// only running it as the entrypoint does.
const isMainModule = process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isMainModule) {
  hyperscaleManager.spawn().catch(() => {
    process.exitCode = 1;
  });

  process.on('SIGINT', () => hyperscaleManager.gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => hyperscaleManager.gracefulShutdown('SIGTERM'));

  if (config.statusIntervalMs) {
    hyperscaleManager.startStatusReporting();
  }
}