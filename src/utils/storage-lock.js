import { randomBytes } from 'node:crypto';
import { open, readFile, stat, unlink, utimes } from 'node:fs/promises';
import path from 'node:path';

const inProcessQueues = new Map();

/**
 * Serializes work by canonical path within this process. Without it two
 * concurrent saves both read the same cache and the second write loses the
 * first.
 */
export function withPathQueue(key, task) {
  const previous = inProcessQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  inProcessQueues.set(key, next.catch(() => {}));
  return next;
}

const ownerToken = () => `${process.pid}-${randomBytes(6).toString('hex')}`;

async function readOwner(lockPath) {
  try {
    return (await readFile(lockPath, 'utf8')).trim();
  } catch {
    return null;
  }
}

function ownerIsAlive(owner) {
  const pid = Number.parseInt(String(owner).split('-')[0], 10);
  if (!Number.isInteger(pid)) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

/**
 * Runs `task` while holding an on-disk lock for `filePath`, so a second process
 * cannot interleave a read-modify-write with ours. The lock records an owner
 * token and PID; a lock whose owner is verifiably gone is reclaimed rather than
 * blocking forever.
 */
export async function withFileLock(filePath, task, { staleMs = 30_000 } = {}) {
  const lockPath = `${filePath}.lock`;
  const key = path.resolve(filePath);
  const token = ownerToken();

  return withPathQueue(key, async () => {
    const deadline = Date.now() + staleMs;

    for (;;) {
      try {
        const handle = await open(lockPath, 'wx');
        try {
          await handle.writeFile(`${token} ${process.pid}`, 'utf8');
        } finally {
          await handle.close();
        }
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;

        const owner = await readOwner(lockPath);
        let reclaim = owner === null || !ownerIsAlive(owner);

        if (!reclaim) {
          try {
            const info = await stat(lockPath);
            reclaim = Date.now() - info.mtimeMs > staleMs;
          } catch {
            reclaim = true;
          }
        }

        if (reclaim) {
          await unlink(lockPath).catch(() => {});
          continue;
        }

        if (Date.now() > deadline) throw new Error(`Timed out waiting for lock on ${filePath}`);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    }

    // Refresh the lock's mtime while the task runs so a holder that is alive
    // but slow never looks stale to another process.
    const heartbeat = setInterval(() => {
      const now = new Date();
      utimes(lockPath, now, now).catch(() => {});
    }, Math.max(50, Math.floor(staleMs / 4)));
    heartbeat.unref?.();

    try {
      return await task();
    } finally {
      clearInterval(heartbeat);
      await unlink(lockPath).catch(() => {});
    }
  });
}