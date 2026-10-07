import { ShardingManager } from 'discord.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readShardManagerConfig(env = process.env) {
  return {
    token: env.DISCORD_TOKEN,
    totalShards: env.TOTAL_SHARDS && env.TOTAL_SHARDS !== 'auto' ? Number(env.TOTAL_SHARDS) : 'auto',
    spawnDelayMs: Number(env.SHARD_SPAWN_DELAY_MS ?? 5500),
    spawnTimeoutMs: Number(env.SHARD_SPAWN_TIMEOUT_MS ?? 30000),
    healthCheckIntervalMs: Number(env.SHARD_HEALTH_CHECK_INTERVAL ?? 60000),
    maxMemoryMb: Number(env.SHARD_MAX_MEMORY_MB ?? 512),
    gracefulShutdownTimeoutMs: Number(env.GRACEFUL_SHUTDOWN_TIMEOUT ?? 30000),
    statusIntervalMs: env.SHARD_STATUS_INTERVAL ? Number(env.SHARD_STATUS_INTERVAL) : null,
  };
}

export class HyperscaleShardManager {
  /**
   * `manager` and `logger` are injectable so shutdown behaviour can be tested
   * against fakes without a gateway connection.
   */
  constructor({ manager, logger, config = readShardManagerConfig() } = {}) {
    this.config = config;
    this.logger = logger ?? createLogger({ level: process.env.LOG_LEVEL ?? 'info', scope: 'shard-mgr' });
    this.manager = manager ?? new ShardingManager(path.join(__dirname, 'index.js'), {
      token: config.token,
      totalShards: config.totalShards,
      respawn: true,
      mode: 'process',
    });
    this.shardStates = new Map();
    this.isShuttingDown = false;
    this.timers = new Set();
    this.setupEventHandlers();
  }


  setupEventHandlers() {
    this.manager.on('shardCreate', (shard) => {
      const state = { id: shard.id, status: 'spawning', uptime: Date.now(), restarts: 0 };
      this.shardStates.set(shard.id, state);
      this.logger.info(`Shard ${shard.id} spawned`);

      shard.on('ready', () => {
        this.shardStates.set(shard.id, { ...state, status: 'ready' });
        this.logger.info(`Shard ${shard.id} ready`);
      });

      shard.on('death', (proc) => {
        if (this.isShuttingDown) return;
        const code = proc?.exitCode;
        const signal = proc?.signalCode;
        const shardState = this.shardStates.get(shard.id);
        if (shardState) shardState.restarts += 1;
        this.logger.warn(`Shard ${shard.id} died (exitCode=${code ?? 'n/a'} signal=${signal ?? 'n/a'}) restarts=${shardState?.restarts ?? 0} — respawning`);
      });

      shard.on('disconnect', () => {
        this.shardStates.set(shard.id, { ...state, status: 'disconnected' });
        this.logger.warn(`Shard ${shard.id} disconnected`);
      });

      shard.on('reconnecting', () => {
        this.shardStates.set(shard.id, { ...state, status: 'reconnecting' });
        this.logger.debug(`Shard ${shard.id} reconnecting`);
      });

      shard.on('error', (error) => {
        this.logger.error(`Shard ${shard.id} error`, error);
      });
    });
  }

  async spawn() {
    try {
      this.logger.info(`Spawning shards with ${this.config.spawnDelayMs}ms delay, ${this.config.spawnTimeoutMs}ms timeout`);
      await this.manager.spawn({ delay: this.config.spawnDelayMs, timeout: this.config.spawnTimeoutMs });
      this.logger.info('All shards spawned successfully');
      this.startHealthMonitoring();
    } catch (error) {
      this.logger.error('Failed to spawn shards', error);
      process.exit(1);
    }
  }

  startHealthMonitoring() {
    const timer = setInterval(async () => {
      for (const shard of this.manager.shards.values()) {
        try {
          const stats = await shard.fetchClientValue('shardStats');
          const state = this.shardStates.get(shard.id);
          if (state) {
            state.lastStats = stats;
            if (stats?.memoryUsageMB > this.config.maxMemoryMb) {
              this.logger.warn(`Shard ${shard.id} memory high: ${stats.memoryUsageMB}MB > ${this.config.maxMemoryMb}MB`);
            }
          }
        } catch (error) {
          this.logger.debug(`Failed to fetch stats for shard ${shard.id}`, error);
        }
      }
    }, this.config.healthCheckIntervalMs);

    // Health reporting is background work and must not keep the process alive.
  }

  startStatusReporting() {
    const timer = setInterval(() => this.printStatus(), this.config.statusIntervalMs);
    timer.unref?.();
    return this.own(timer);
  }

  /** Registers a timer the manager owns, so it can be disposed on shutdown. */
  own(timer) {
    this.timers.add(timer);
    return timer;
  }

  disposeTimers() {
    for (const timer of this.timers) {
      clearInterval(timer);
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  /**
   * Asks every child to stop and waits for it to exit on its own.
   *
   * The child flushes and exits 0 after the typed message. Force-killing it
   * would discard that work, so a child that never exits is reported rather
   * than killed.
   */
  async gracefulShutdown(signal, { exit = true } = {}) {
    if (this.isShuttingDown) return { ok: true, alreadyShuttingDown: true };
    this.isShuttingDown = true;

    this.logger.info(`Received ${signal}, initiating graceful shutdown`);

    // Stop respawning before asking anyone to stop, otherwise a child exiting
    // normally is immediately replaced and shutdown never converges.
    if (this.manager.respawn !== false) this.manager.respawn = false;

    const shards = Array.from(this.manager.shards.values());
    const results = await Promise.all(shards.map(shard => this.shutdownShard(shard)));

    this.disposeTimers();

    const timedOut = results.filter(result => result.status === 'timeout');

    if (timedOut.length > 0) {
      this.logger.error(
        `${timedOut.length} shard(s) did not exit within ${this.config.gracefulShutdownTimeoutMs}ms; leaving them running rather than force-killing`,
      );
      process.exitCode = 1;
    } else {
      this.logger.info('All shards shut down');
    }

    if (exit) this.finish();

    return { ok: timedOut.length === 0, timedOut: timedOut.map(result => result.id) };
  }

  /** Resolves when the shard process exits, or reports a timeout. */
  async shutdownShard(shard) {
    try {
      await shard.send({ op: 'graceful_shutdown' });
    } catch (error) {
      this.logger.error(`Shard ${shard.id} shutdown message failed`, error);
    }

    return new Promise((resolve) => {
      let settled = false;

      const timer = this.own(setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({ id: shard.id, status: 'timeout' });
      }, this.config.gracefulShutdownTimeoutMs));

      shard.once('death', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.timers.delete(timer);
        this.logger.info(`Shard ${shard.id} exited cleanly`);
        resolve({ id: shard.id, status: 'exited' });
      });
    });
  }

  finish() {
    process.exit(process.exitCode ?? 0);
  }

  startStatusReporting() {
    const timer = setInterval(() => this.printStatus(), this.config.statusIntervalMs);
    timer.unref?.();
    return this.own(timer);
  }

  printStatus() {
    this.logger.info('--- Shard Status ---');
    for (const [id, state] of this.shardStates.entries()) {
      const uptime = ((Date.now() - state.uptime) / 1000).toFixed(1);
      this.logger.info(`Shard ${id}: ${state.status} | Uptime: ${uptime}s | Restarts: ${state.restarts}`);
    }
  }
}