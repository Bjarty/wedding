import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateTestConfig } from '../scripts/validate-test-config.mjs';
import {
  assertNode22,
  buildWranglerCommand,
  parseArguments,
  validateCloudflareAccountId,
  validateTestSecrets,
} from '../scripts/upload-test.mjs';

const TEST_PASS_SECRET = 'pass-secret-supplied-outside-the-repository';
const TEST_FAIL_SECRET = 'fail-secret-supplied-outside-the-repository';
const TEST_SECRET_FINGERPRINTS = new Map([
  [TEST_PASS_SECRET, 'fb8f35129df87662c650ada12fd614f1b58dce4a37fdd7589ba3a6b9a78c0aae'],
  [TEST_FAIL_SECRET, '1e3e58656012d861e23deae64f177673d7b86a9c55fe1d5d10b94e3c9755d168'],
]);
const fingerprintTestSecret = (value) => TEST_SECRET_FINGERPRINTS.get(value) ?? 'not-approved';
const validateSecrets = (secrets, turnstileMode = 'pass') =>
  validateTestSecrets(secrets, { turnstileMode, fingerprint: fingerprintTestSecret });

const template = await readFile(new URL('../wrangler.test.toml', import.meta.url), 'utf8');
const localConfig = template
  .replace('REPLACE_WITH_UNUSED_POSITIVE_INTEGER_RESOLVE', '910001')
  .replace('REPLACE_WITH_UNUSED_POSITIVE_INTEGER_SUBMIT', '910002');

test('committed Wrangler test template is fail-closed and contains no account values', () => {
  assert.deepEqual(validateTestConfig(template, { template: true }), {
    name: 'lisette-bjarty-rsvp-api-test',
    previewUrls: true,
    template: true,
  });
});

test('a local test config requires distinct positive namespace IDs', () => {
  assert.doesNotThrow(() => validateTestConfig(localConfig));
  assert.throws(
    () => validateTestConfig(localConfig.replace('910002', '910001')),
    /namespace IDs must be different/,
  );
  assert.throws(
    () => validateTestConfig(localConfig.replace('910002', 'REPLACE_ME')),
    /positive integer/,
  );
});

test('test config rejects production routing and inline secrets', () => {
  assert.throws(
    () => validateTestConfig(`${localConfig}\nroute = "lisetteenbjarty.nl/api/*"\n`),
    /account ID, route, or custom domain/,
  );
  assert.throws(
    () => validateTestConfig(`${localConfig}\nWRITER_HMAC_SECRET = "not-allowed"\n`),
    /secret values must not be assigned/,
  );
  assert.throws(
    () => validateTestConfig(localConfig.replace('http://localhost:3000', 'https://lisetteenbjarty.nl')),
    /production origin or writer URL/,
  );
  assert.throws(
    () => validateTestConfig(localConfig.replace('TURNSTILE_EXPECTED_ACTION = "test"', 'TURNSTILE_EXPECTED_ACTION = "rsvp_resolve"')),
    /unexpected key, section, order, or value/,
  );
  assert.throws(
    () => validateTestConfig(`${localConfig}\n[[routes]]\npattern = "staging.example/*"\n`),
    /unexpected key, section, order, or value/,
  );
});

test('test upload accepts only an isolated four-secret bundle', () => {
  const secrets = {
    TURNSTILE_SECRET: TEST_PASS_SECRET,
    WRITER_URL: 'https://script.google.com/macros/s/test-deployment_123/exec',
    WRITER_HMAC_SECRET: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
    INVITATION_TOKEN_HASH_SECRET: '0123456789_-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  };
  assert.doesNotThrow(() => validateSecrets(secrets));
  assert.doesNotThrow(() =>
    validateSecrets({ ...secrets, TURNSTILE_SECRET: TEST_FAIL_SECRET }, 'server-fail'),
  );
  assert.throws(
    () => validateSecrets({ ...secrets, EXTRA_SECRET: 'not-allowed' }),
    /exactly the four test secrets/,
  );
  assert.throws(
    () => validateSecrets({ ...secrets, WRITER_URL: 'https://example.test/dev' }),
    /Apps Script \/exec URL/,
  );
  assert.throws(
    () =>
      validateSecrets({
        ...secrets,
        INVITATION_TOKEN_HASH_SECRET: secrets.WRITER_HMAC_SECRET,
      }),
    /must be different/,
  );
  assert.throws(
    () => validateSecrets({ ...secrets, WRITER_HMAC_SECRET: 'a'.repeat(64) }),
    /independently generated/,
  );
  assert.throws(
    () => validateSecrets(secrets, 'server-fail'),
    /server-fail test secret/,
  );
});

test('test upload parser and command stay fail-closed', () => {
  const secretsPath = process.platform === 'win32' ? 'C:\\temp\\rsvp-test.json' : '/tmp/rsvp-test.json';
  assert.deepEqual(
    parseArguments(['--secrets-file', secretsPath, '--turnstile-mode', 'pass']),
    { secretsPath, turnstileMode: 'pass' },
  );
  assert.throws(() => parseArguments(['--secrets-file', secretsPath]), /turnstile-mode/);
  assert.throws(() => parseArguments(['--inherit-existing-pass-secrets']), /usage:/);
  assert.throws(
    () => parseArguments([
      '--secrets-file',
      secretsPath,
      '--turnstile-mode',
      'pass',
      '--initial-create',
      'lisette-bjarty-rsvp-api-test',
    ]),
    /usage:/,
  );
  assert.doesNotThrow(() => assertNode22('22.23.2'));
  assert.throws(() => assertNode22('24.0.0'), /Node.js 22/);
  assert.equal(
    validateCloudflareAccountId('0123456789abcdef0123456789abcdef'),
    '0123456789abcdef0123456789abcdef',
  );
  assert.throws(() => validateCloudflareAccountId(undefined), /CLOUDFLARE_ACCOUNT_ID/);
  assert.throws(() => validateCloudflareAccountId('ABCDEF'), /CLOUDFLARE_ACCOUNT_ID/);

  const command = buildWranglerCommand(secretsPath);
  assert.equal(command.command, process.execPath);
  assert.match(command.args[0], /node_modules[\\/]wrangler[\\/]bin[\\/]wrangler\.js$/);
  assert.deepEqual(command.args.slice(1), [
    'versions',
    'upload',
    '--strict',
    '--experimental-provision=false',
    '--experimental-auto-create=false',
    '--config',
    command.args[7],
    '--preview-alias',
    'rsvp-test',
    '--secrets-file',
    secretsPath,
  ]);
  assert.match(command.args[7], /rsvp[\\/]worker[\\/]wrangler\.test\.local\.toml$/);
  assert.throws(() => buildWranglerCommand(null), /absolute/);
});

test('tracked test tooling contains fingerprints, not Turnstile dummy secrets', async () => {
  const sources = await Promise.all([
    readFile(new URL('../scripts/upload-test.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/integrations.ts', import.meta.url), 'utf8'),
    readFile(new URL('./worker.test.mjs', import.meta.url), 'utf8'),
  ]);
  for (const source of sources) assert.doesNotMatch(source, /[12]x0{20,}AA/u);
});
