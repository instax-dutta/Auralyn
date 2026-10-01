import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

const OWNER_TOKEN = randomBytes(8).toString('hex');

function tempPathFor(filePath) {
  return `${filePath}.${OWNER_TOKEN}.tmp`;
}

async function syncDir(dir) {
  let handle;
  try {
    handle = await open(dir, 'r');
    await handle.sync();
  } catch {
    // Directory fsync is best effort: some platforms refuse it, and the rename
    // is still atomic without it.
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * Writes JSON so a reader never observes a partial file: the payload is written
 * to a unique sibling temp file, flushed, then renamed over the target. A
 * failure before the rename leaves the previous file untouched, and the temp
 * file is always removed.
 */
export async function writeJsonAtomic(filePath, value, { mode } = {}) {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });

  const payload = JSON.stringify(value, null, 2);
  const tempPath = tempPathFor(filePath);

  try {
    const handle = await open(tempPath, mode === undefined ? 'w' : `w${mode}`);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(tempPath, filePath);
    await syncDir(dir);

    return { committed: true };
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

/**
 * Reads and parses JSON, quarantining an unparseable file instead of throwing so
 * one bad file cannot block startup. Returns `{ value, quarantinedTo }`.
 */
export async function readJsonWithQuarantine(filePath) {
  let raw;

  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { value: null, missing: true };
    throw error;
  }

  try {
    return { value: JSON.parse(raw) };
  } catch {
    const quarantinedTo = `${filePath}.corrupt-${Date.now()}`;
    await rename(filePath, quarantinedTo).catch(() => {});
    return { value: null, quarantinedTo };
  }
}