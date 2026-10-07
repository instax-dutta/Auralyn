import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { HyperscaleShardManager } from '../../src/shard-manager.js';

const silent = () => ({ info() {}, warn() {}, error() {}, debug() {} });

class FakeShard extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.sent = [];
    this.killed = 0;
  }

  async send(message) {
    this.sent.push(message);
    return true;
  }

  kill() { this.killed += 1; }
}

class FakeShardingManager extends EventEmitter {
  constructor(shards = []) {
    super();
    this.shards = new Map(shards.map(shard => [shard.id, shard]));
    this.respawn = true;
  }
}

const [mode, reportPath] = process.argv.slice(2);

const shards = [new FakeShard(0), new FakeShard(1)];
const manager = new FakeShardingManager(shards);

const instance = new HyperscaleShardManager({
  manager,
  logger: silent(),
  config: {
    token: 'test-token',
    totalShards: 2,
    spawnDelayMs: 0,
    spawnTimeoutMs: 0,
    healthCheckIntervalMs: 50,
    maxMemoryMb: 512,
    gracefulShutdownTimeoutMs: 60,
    statusIntervalMs: 50,
  },
});

// The report goes to a file because a shutdown that calls process.exit cannot
// be trusted to flush stdout.
const report = async extra => {
  const payload = {
    killed: shards.map(shard => shard.killed),
    sent: shards.map(shard => shard.sent),
    respawn: manager.respawn,
    exitCode: process.exitCode ?? 0,
    ...extra,
  };
  await fs.writeFile(reportPath, JSON.stringify(payload), 'utf8');
};

const run = async () => {
  if (mode === 'clean') {
    const shutdown = instance.gracefulShutdown('SIGTERM', { exit: false });
    await Promise.resolve();
    for (const shard of shards) shard.emit('death', { exitCode: 0 });
    await shutdown;
    await report({ completed: true });
  }

  if (mode === 'hang') {
    await instance.gracefulShutdown('SIGTERM', { exit: false });
    await report({ completed: true });
  }
};

run().catch(async error => {
  await report({ error: String(error?.message ?? error), completed: false });
});