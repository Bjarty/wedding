import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';

test('lokale server blokkeert private gastenbestanden en behoudt Vite-secretregels', async () => {
  const config = await resolveConfig({ configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) }, 'serve');
  for (const rule of ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/output/**']) {
    assert.ok(config.server.fs.deny.includes(rule));
  }
  assert.equal(config.server.host, '127.0.0.1');
  assert.equal(config.preview.host, '127.0.0.1');
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(manifest.scripts.dev, /--host=127\.0\.0\.1/u);
  assert.doesNotMatch(manifest.scripts.dev, /0\.0\.0\.0/u);
});
