import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID'];

const DATA_DIR_CANDIDATES = [
  '/app/data',
  '/home/container/auralyn-data',
  '/tmp/auralyn',
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function optionalEnv(name, fallback = undefined) {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

function optionalNumberEnv(name, fallback) {
  const value = optionalEnv(name);
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function isWritable(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    writeFileSync(probe, '');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  const explicit = optionalEnv('DATA_DIR');
  if (explicit) return explicit;
  for (const candidate of DATA_DIR_CANDIDATES) {
    if (isWritable(candidate)) return candidate;
  }
  return DATA_DIR_CANDIDATES[DATA_DIR_CANDIDATES.length - 1];
}

export function loadConfig() {
  for (const name of REQUIRED_ENV) {
    requireEnv(name);
  }

  return {
    discordToken: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('CLIENT_ID'),
    guildId: optionalEnv('GUILD_ID'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
    autoSyncGlobalCommands: optionalEnv('AUTO_SYNC_GLOBAL_COMMANDS', 'true') === 'true',
    autoSyncGuildCommands: optionalEnv('AUTO_SYNC_GUILD_COMMANDS', 'true') === 'true',
    enableDebugCommands: optionalEnv('ENABLE_DEBUG_COMMANDS', 'false') === 'true',
    strictDjMode: optionalEnv('STRICT_DJ_MODE', 'false') === 'true',
    forceResetCommands: optionalEnv('FORCE_RESET_COMMANDS', 'false') === 'true',
    dataDir: resolveDataDir(),
    lavalink: {
      host: optionalEnv('LAVALINK_HOST', '127.0.0.1'),
      port: optionalNumberEnv('LAVALINK_PORT', 2333),
      password: requireEnv('LAVALINK_PASSWORD'),
      secure: optionalEnv('LAVALINK_SECURE', 'false') === 'true',
    },
  };
}
