import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COMMANDS_DIR = path.resolve('src/commands');

test('every command module exports data.execute and a serialisable builder', async () => {
  const files = readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js'));
  assert.ok(files.length >= 20, `expected at least 20 command files, found ${files.length}`);

  for (const file of files) {
    const url = pathToFileURL(path.join(COMMANDS_DIR, file)).href;
    const mod = await import(url);
    const cmd = mod.default;
    assert.ok(cmd, `${file}: missing default export`);
    assert.ok(cmd.data, `${file}: missing data`);
    assert.equal(typeof cmd.execute, 'function', `${file}: execute must be a function`);
    assert.equal(typeof cmd.data.toJSON, 'function', `${file}: data.toJSON must be a function`);
    const json = cmd.data.toJSON();
    assert.ok(json.name, `${file}: command JSON missing name`);
    assert.ok(json.description, `${file}: command JSON missing description`);
  }
});
