const REQUIRED_ENV = ['DISCORD_TOKEN', 'CLIENT_ID'];

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

export function loadConfig() {
  for (const name of REQUIRED_ENV) {
    requireEnv(name);
  }

  return {
    discordToken: requireEnv('DISCORD_TOKEN'),
    clientId: requireEnv('CLIENT_ID'),
    guildId: optionalEnv('GUILD_ID'),
    logLevel: optionalEnv('LOG_LEVEL', 'info'),
    lavalink: {
      host: optionalEnv('LAVALINK_HOST', '127.0.0.1'),
      port: optionalNumberEnv('LAVALINK_PORT', 2333),
      password: requireEnv('LAVALINK_PASSWORD'),
      secure: optionalEnv('LAVALINK_SECURE', 'false') === 'true',
    },
  };
}
