import dotenv from 'dotenv';
import { HyperscaleShardManager, readShardManagerConfig } from './shard-manager.js';
import { isMainModule } from './utils/is-main-module.js';

dotenv.config();

if (!process.env.DISCORD_TOKEN) {
  process.stderr.write('DISCORD_TOKEN is required to spawn shards.\n');
  process.exit(1);
}

// Importing this file must not spawn shards, allocate a manager, or register
// process-wide handlers; only running it as the entrypoint does. `scripts/start.sh`
// launches this file directly, so the container path depends on the guard
// resolving true for `node /app/src/shard.js`.
const isMain = isMainModule(import.meta.url, process.argv[1]);

if (isMain) {
  const logger = (await import('./utils/logger.js')).createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    scope: 'shard-mgr',
  });

  const config = readShardManagerConfig();
  const hyperscaleManager = new HyperscaleShardManager({ logger, config });

  hyperscaleManager.spawn().catch(() => {
    process.exitCode = 1;
  });

  process.on('SIGINT', () => hyperscaleManager.gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => hyperscaleManager.gracefulShutdown('SIGTERM'));

  if (config.statusIntervalMs) {
    hyperscaleManager.startStatusReporting();
  }
}