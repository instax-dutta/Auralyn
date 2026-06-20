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

const SPAWN_DELAY_MS = Number(process.env.SHARD_SPAWN_DELAY_MS ?? 5500);
const SPAWN_TIMEOUT_MS = Number(process.env.SHARD_SPAWN_TIMEOUT_MS ?? 30000);
const SHARD_HEALTH_CHECK_INTERVAL = Number(process.env.SHARD_HEALTH_CHECK_INTERVAL ?? 60000);
const SHARD_MAX_MEMORY_MB = Number(process.env.SHARD_MAX_MEMORY_MB ?? 512);
const GRACEFUL_SHUTDOWN_TIMEOUT = Number(process.env.GRACEFUL_SHUTDOWN_TIMEOUT ?? 30000);

class HyperscaleShardManager {
  constructor() {
    this.manager = new ShardingManager(path.join(__dirname, 'index.js'), {
      token: process.env.DISCORD_TOKEN,
      totalShards: process.env.TOTAL_SHARDS && process.env.TOTAL_SHARDS !== 'auto'
        ? Number(process.env.TOTAL_SHARDS)
        : 'auto',
      respawn: true,
      mode: 'process',
    });
    this.shardStates = new Map();
    this.isShuttingDown = false;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.manager.on('shardCreate', (shard) => {
      const state = { id: shard.id, status: 'spawning', uptime: Date.now(), restarts: 0 };
      this.shardStates.set(shard.id, state);
      logger.info(`Shard ${shard.id} spawned`);

      shard.on('ready', () => {
        this.shardStates.set(shard.id, { ...state, status: 'ready' });
        logger.info(`Shard ${shard.id} ready`);
      });

      shard.on('death', (proc) => {
        if (this.isShuttingDown) return;
        const code = proc?.exitCode;
        const signal = proc?.signalCode;
        const shardState = this.shardStates.get(shard.id);
        if (shardState) shardState.restarts += 1;
        logger.warn(`Shard ${shard.id} died (exitCode=${code ?? 'n/a'} signal=${signal ?? 'n/a'}) restarts=${shardState?.restarts ?? 0} — respawning`);
      });

      shard.on('disconnect', () => {
        this.shardStates.set(shard.id, { ...state, status: 'disconnected' });
        logger.warn(`Shard ${shard.id} disconnected`);
      });

      shard.on('reconnecting', () => {
        this.shardStates.set(shard.id, { ...state, status: 'reconnecting' });
        logger.debug(`Shard ${shard.id} reconnecting`);
      });

      shard.on('error', (error) => {
        logger.error(`Shard ${shard.id} error`, error);
      });
    });
  }

  async spawn() {
    try {
      logger.info(`Spawning shards with ${SPAWN_DELAY_MS}ms delay, ${SPAWN_TIMEOUT_MS}ms timeout`);
      await this.manager.spawn({ delay: SPAWN_DELAY_MS, timeout: SPAWN_TIMEOUT_MS });
      logger.info(`All shards spawned successfully`);
      this.startHealthMonitoring();
    } catch (error) {
      logger.error('Failed to spawn shards', error);
      process.exit(1);
    }
  }

  startHealthMonitoring() {
    setInterval(async () => {
      for (const shard of this.manager.shards.values()) {
        try {
          const stats = await shard.fetchClientValue('shardStats');
          const state = this.shardStates.get(shard.id);
          if (state) {
            state.lastStats = stats;
            if (stats?.memoryUsageMB > SHARD_MAX_MEMORY_MB) {
              logger.warn(`Shard ${shard.id} memory high: ${stats.memoryUsageMB}MB > ${SHARD_MAX_MEMORY_MB}MB`);
            }
          }
        } catch (error) {
          logger.debug(`Failed to fetch stats for shard ${shard.id}`, error);
        }
      }
    }, SHARD_HEALTH_CHECK_INTERVAL);
  }

  async gracefulShutdown(signal) {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info(`Received ${signal}, initiating graceful shutdown`);

    const shutdownPromises = Array.from(this.manager.shards.values()).map(shard =>
      Promise.race([
        new Promise(resolve => {
          shard.on('disconnect', () => resolve());
          shard.send({ op: 'graceful_shutdown' }).catch(() => {});
        }),
        new Promise(resolve => setTimeout(resolve, GRACEFUL_SHUTDOWN_TIMEOUT)),
      ]).then(() => {
        shard.kill();
        logger.info(`Shard ${shard.id} terminated`);
      }).catch((error) => {
        logger.error(`Shard ${shard.id} shutdown error`, error);
        shard.kill();
      })
    );

    await Promise.all(shutdownPromises);
    logger.info('All shards shut down');
    process.exit(0);
  }

  printStatus() {
    logger.info('--- Shard Status ---');
    for (const [id, state] of this.shardStates.entries()) {
      const uptime = ((Date.now() - state.uptime) / 1000).toFixed(1);
      logger.info(`Shard ${id}: ${state.status} | Uptime: ${uptime}s | Restarts: ${state.restarts}`);
    }
  }
}

const hyperscaleManager = new HyperscaleShardManager();
hyperscaleManager.spawn();

process.on('SIGINT', () => hyperscaleManager.gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => hyperscaleManager.gracefulShutdown('SIGTERM'));

if (process.env.SHARD_STATUS_INTERVAL) {
  const interval = Number(process.env.SHARD_STATUS_INTERVAL);
  setInterval(() => hyperscaleManager.printStatus(), interval);
}
