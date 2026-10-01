import { JsonSessionStore } from '../../src/utils/session-store.js';

// Inert when executed directly: `npm test` is bare `node --test`, which runs
// every .js file under test/ as a script with no arguments.
const [file, guildId] = process.argv.slice(2);

if (file && guildId) {
  const store = new JsonSessionStore({ filePath: file });
  await store.save(guildId, { guildId, queue: [], updatedAt: new Date().toISOString() });
  process.stdout.write('saved\n');
}