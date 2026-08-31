import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productionTemplate = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('committed production template has no endpoint and requires every secret', () => {
  assert.match(productionTemplate, /^workers_dev = false$/m);
  assert.match(productionTemplate, /^preview_urls = false$/m);
  assert.match(productionTemplate, /^ALLOWED_ORIGIN = "https:\/\/lisetteenbjarty\.nl"$/m);
  assert.match(productionTemplate, /^HOUSEHOLD_CODES_ENABLED = "false"$/m);
  assert.match(productionTemplate, /^TURNSTILE_EXPECTED_HOSTNAME = "lisetteenbjarty\.nl"$/m);
  assert.doesNotMatch(productionTemplate, /^\s*(?:account_id|route|routes|custom_domain)\s*=/m);

  const requiredBlock = productionTemplate.match(/^\[secrets\]\s*[\s\S]*?required\s*=\s*\[([\s\S]*?)\]/m);
  assert.ok(requiredBlock);
  assert.deepEqual(
    [...requiredBlock[1].matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]).sort(),
    [
      'ACCESS_CODE_HASH_SECRET',
      'INVITATION_TOKEN_HASH_SECRET',
      'TURNSTILE_SECRET',
      'WRITER_HMAC_SECRET',
      'WRITER_URL',
    ],
  );
  assert.equal((productionTemplate.match(/^\[\[ratelimits\]\]$/gm) ?? []).length, 4);
  assert.equal((productionTemplate.match(/^namespace_id = "REPLACE_WITH_[A-Z_]+"$/gm) ?? []).length, 4);
});
