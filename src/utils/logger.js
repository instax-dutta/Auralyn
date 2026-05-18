const LOG_LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLevel(level) {
  return LOG_LEVELS[level] ? level : 'info';
}

function defaultSink(entry) {
  const line = `[${entry.scope}] ${entry.message}`;
  if (entry.level === 'error') {
    console.error(line, ...(entry.args ?? []));
    return;
  }

  if (entry.level === 'warn') {
    console.warn(line, ...(entry.args ?? []));
    return;
  }

  console.log(line, ...(entry.args ?? []));
}

export function createLogger({ level = 'info', scope = 'app', sink = defaultSink } = {}) {
  const normalizedLevel = normalizeLevel(level);
  const threshold = LOG_LEVELS[normalizedLevel];

  const emit = (entryLevel, message, ...args) => {
    if (LOG_LEVELS[entryLevel] < threshold) return;
    sink({
      level: entryLevel,
      scope,
      message,
      args,
      time: new Date().toISOString(),
    });
  };

  return {
    level: normalizedLevel,
    debug: (message, ...args) => emit('debug', message, ...args),
    info: (message, ...args) => emit('info', message, ...args),
    warn: (message, ...args) => emit('warn', message, ...args),
    error: (message, ...args) => emit('error', message, ...args),
    child(childScope) {
      return createLogger({
        level: normalizedLevel,
        sink,
        scope: `${scope}:${childScope}`,
      });
    },
  };
}

export function createSilentLogger() {
  const noop = () => {};
  return {
    level: 'error',
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child() {
      return createSilentLogger();
    },
  };
}
