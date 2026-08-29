import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateTestConfig } from './validate-test-config.mjs';

const TURNSTILE_TEST_SECRET_SHA256 = Object.freeze({
  pass: 'fb8f35129df87662c650ada12fd614f1b58dce4a37fdd7589ba3a6b9a78c0aae',
  'server-fail': '1e3e58656012d861e23deae64f177673d7b86a9c55fe1d5d10b94e3c9755d168',
});
const REQUIRED_SECRET_KEYS = [
  'ACCESS_CODE_HASH_SECRET',
  'INVITATION_TOKEN_HASH_SECRET',
  'TURNSTILE_SECRET',
  'WRITER_HMAC_SECRET',
  'WRITER_URL',
];
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const workerDirectory = resolve(scriptDirectory, '..');
const repositoryDirectory = resolve(workerDirectory, '..', '..');

const isInside = (parent, candidate) => {
  const pathFromParent = relative(parent, candidate);
  return pathFromParent === '' || (!pathFromParent.startsWith('..') && !isAbsolute(pathFromParent));
};

const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

export const validateCloudflareAccountId = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/.test(value)) {
    throw new Error('CLOUDFLARE_ACCOUNT_ID must be an explicit 32-character lowercase hex account ID');
  }
  return value;
};

export const validateTestSecrets = (
  secrets,
  { turnstileMode = 'pass', fingerprint = sha256Hex } = {},
) => {
  if (!secrets || Array.isArray(secrets) || typeof secrets !== 'object') {
    throw new Error('the temporary secrets file must contain one JSON object');
  }
  const keys = Object.keys(secrets).sort();
  if (JSON.stringify(keys) !== JSON.stringify(REQUIRED_SECRET_KEYS)) {
    throw new Error('the temporary secrets file must contain exactly the five test secrets');
  }
  if (!Object.hasOwn(TURNSTILE_TEST_SECRET_SHA256, turnstileMode)) {
    throw new Error('turnstile mode must be pass or server-fail');
  }
  if (
    typeof secrets.TURNSTILE_SECRET !== 'string' ||
    fingerprint(secrets.TURNSTILE_SECRET) !== TURNSTILE_TEST_SECRET_SHA256[turnstileMode]
  ) {
    throw new Error(`TURNSTILE_SECRET must match Cloudflare's ${turnstileMode} test secret`);
  }
  if (
    typeof secrets.WRITER_URL !== 'string' ||
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(secrets.WRITER_URL)
  ) {
    throw new Error('WRITER_URL must be an Apps Script /exec URL');
  }
  for (const key of [
    'ACCESS_CODE_HASH_SECRET',
    'WRITER_HMAC_SECRET',
    'INVITATION_TOKEN_HASH_SECRET',
  ]) {
    if (typeof secrets[key] !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(secrets[key])) {
      throw new Error(`${key} must be 48 random bytes encoded as 64 base64url characters`);
    }
    if (new Set(secrets[key]).size < 16) {
      throw new Error(`${key} does not look independently generated`);
    }
  }
  if (
    new Set([
      secrets.ACCESS_CODE_HASH_SECRET,
      secrets.WRITER_HMAC_SECRET,
      secrets.INVITATION_TOKEN_HASH_SECRET,
    ]).size !== 3
  ) {
    throw new Error('the writer, invitation-token, and access-code secrets must be different');
  }
};

export const parseArguments = (args) => {
  if (
    args.length !== 4 ||
    args[0] !== '--secrets-file' ||
    !isAbsolute(args[1]) ||
    args[2] !== '--turnstile-mode' ||
    !Object.hasOwn(TURNSTILE_TEST_SECRET_SHA256, args[3])
  ) {
    throw new Error(
      'usage: npm run upload:test -- --secrets-file <absolute-json-path> --turnstile-mode <pass|server-fail>',
    );
  }
  return {
    secretsPath: args[1],
    turnstileMode: args[3],
  };
};

export const assertNode22 = (version) => {
  if (Number(version.split('.')[0]) !== 22) throw new Error('upload requires Node.js 22');
};

export const buildWranglerCommand = (secretsPath) => {
  if (typeof secretsPath !== 'string' || !isAbsolute(secretsPath)) {
    throw new Error('secrets path must be absolute');
  }
  const wranglerPath = resolve(workerDirectory, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const configPath = resolve(workerDirectory, 'wrangler.test.local.toml');
  const args = [
    wranglerPath,
    'versions',
    'upload',
    '--strict',
    '--experimental-provision=false',
    '--experimental-auto-create=false',
    '--config',
    configPath,
    '--preview-alias',
    'rsvp-test',
    '--secrets-file',
    secretsPath,
  ];
  return {
    command: process.execPath,
    args,
  };
};

const main = async () => {
  try {
    assertNode22(process.versions.node);
    const accountId = validateCloudflareAccountId(process.env.CLOUDFLARE_ACCOUNT_ID);

    const parsed = parseArguments(process.argv.slice(2));
    const secretsPath = await realpath(resolve(parsed.secretsPath));
    const repositoryRealPath = await realpath(repositoryDirectory);
    if (isInside(repositoryRealPath, secretsPath)) {
      throw new Error('the temporary secrets file must be outside the repository');
    }

    const configPath = resolve(workerDirectory, 'wrangler.test.local.toml');
    validateTestConfig(await readFile(configPath, 'utf8'));

    let secrets;
    try {
      secrets = JSON.parse(await readFile(secretsPath, 'utf8'));
    } catch {
      throw new Error('the temporary secrets file must be valid JSON');
    }
    validateTestSecrets(secrets, { turnstileMode: parsed.turnstileMode });

    const command = buildWranglerCommand(secretsPath);
    const result = spawnSync(command.command, command.args, {
      stdio: 'inherit',
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'test upload failed';
    process.stderr.write(`Testupload geweigerd: ${message}\n`);
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
