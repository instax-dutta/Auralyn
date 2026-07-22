import path from 'node:path';

const ROOT = process.env.DATA_DIR ?? '/app/data';

export function dataPath(...segments) {
  return path.join(ROOT, ...segments);
}
