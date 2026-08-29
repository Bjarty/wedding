import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXPECTED_SECRETS = [
  'ACCESS_CODE_HASH_SECRET',
  'INVITATION_TOKEN_HASH_SECRET',
  'TURNSTILE_SECRET',
  'WRITER_HMAC_SECRET',
  'WRITER_URL',
];

const TEMPLATE_NAMESPACE_IDS = new Map([
  ['GLOBAL_RATE_LIMITER', 'REPLACE_WITH_UNUSED_POSITIVE_INTEGER_GLOBAL'],
  ['CLIENT_RATE_LIMITER', 'REPLACE_WITH_UNUSED_POSITIVE_INTEGER_CLIENT'],
  ['RESOLVE_RATE_LIMITER', 'REPLACE_WITH_UNUSED_POSITIVE_INTEGER_RESOLVE'],
  ['SUBMIT_RATE_LIMITER', 'REPLACE_WITH_UNUSED_POSITIVE_INTEGER_SUBMIT'],
]);

const EXPECTED_STRUCTURE = [
  'name = "lisette-bjarty-rsvp-api-test"',
  'main = "src/index.ts"',
  'compatibility_date = "2026-08-29"',
  'workers_dev = false',
  'preview_urls = true',
  '[vars]',
  'ALLOWED_ORIGIN = "http://localhost:3000"',
  'HOUSEHOLD_CODES_ENABLED = "true"',
  'TURNSTILE_EXPECTED_HOSTNAME = "localhost"',
  'TURNSTILE_EXPECTED_ACTION = "test"',
  '[secrets]',
  'required = [',
  '"TURNSTILE_SECRET",',
  '"WRITER_URL",',
  '"WRITER_HMAC_SECRET",',
  '"INVITATION_TOKEN_HASH_SECRET",',
  '"ACCESS_CODE_HASH_SECRET",',
  ']',
  '[[ratelimits]]',
  'name = "GLOBAL_RATE_LIMITER"',
  'namespace_id = "<ACCOUNT_REVIEWED_ID>"',
  'simple = { limit = 300, period = 60 }',
  '[[ratelimits]]',
  'name = "CLIENT_RATE_LIMITER"',
  'namespace_id = "<ACCOUNT_REVIEWED_ID>"',
  'simple = { limit = 30, period = 60 }',
  '[[ratelimits]]',
  'name = "RESOLVE_RATE_LIMITER"',
  'namespace_id = "<ACCOUNT_REVIEWED_ID>"',
  'simple = { limit = 10, period = 60 }',
  '[[ratelimits]]',
  'name = "SUBMIT_RATE_LIMITER"',
  'namespace_id = "<ACCOUNT_REVIEWED_ID>"',
  'simple = { limit = 5, period = 60 }',
].join('\n');

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const readStringAssignment = (source, key) => {
  const matches = [
    ...source.matchAll(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*"([^"]*)"\\s*$`, 'gm')),
  ];
  if (matches.length !== 1) throw new Error(`${key} must be assigned exactly once`);
  return matches[0][1];
};

const readBooleanAssignment = (source, key) => {
  const matches = [
    ...source.matchAll(new RegExp(`^\\s*${escapeRegex(key)}\\s*=\\s*(true|false)\\s*$`, 'gm')),
  ];
  if (matches.length !== 1) throw new Error(`${key} must be assigned exactly once`);
  return matches[0][1] === 'true';
};

const readSection = (source, name) => {
  const marker = new RegExp(`^\\s*\\[${escapeRegex(name)}\\]\\s*$`, 'm').exec(source);
  if (!marker) throw new Error(`[${name}] section is required`);
  const tail = source.slice(marker.index + marker[0].length);
  const nextSection = tail.search(/^\s*\[/m);
  return nextSection === -1 ? tail : tail.slice(0, nextSection);
};

const readRateLimits = (source) =>
  source
    .split(/^\s*\[\[ratelimits\]\]\s*$/m)
    .slice(1)
    .map((block) => ({
      name: readStringAssignment(block, 'name'),
      namespaceId: readStringAssignment(block, 'namespace_id'),
      simple: block.match(/^\s*simple\s*=\s*\{\s*limit\s*=\s*(\d+)\s*,\s*period\s*=\s*(\d+)\s*\}\s*$/m),
    }));

const readRequiredSecrets = (source) => {
  const required = readSection(source, 'secrets').match(/required\s*=\s*\[([\s\S]*?)\]/m);
  if (!required) throw new Error('secrets.required is required');
  return [...required[1].matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]).sort();
};

const assertExact = (actual, expected, label) => {
  if (actual !== expected) throw new Error(`${label} must be exactly ${expected}`);
};

const assertAllowedStructure = (source) => {
  const structure = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.replace(/\s+#.*$/, '').trim())
    .map((line) =>
      line.startsWith('namespace_id = ') ? 'namespace_id = "<ACCOUNT_REVIEWED_ID>"' : line,
    )
    .join('\n');
  if (structure !== EXPECTED_STRUCTURE) {
    throw new Error('test config contains an unexpected key, section, order, or value');
  }
};

export const validateTestConfig = (source, { template = false } = {}) => {
  if (/^\s*(?:account_id|route|routes|custom_domain)\s*=/m.test(source)) {
    throw new Error('test config must not contain an account ID, route, or custom domain');
  }
  if (/^\s*(?:TURNSTILE_SECRET|WRITER_URL|WRITER_HMAC_SECRET|INVITATION_TOKEN_HASH_SECRET|ACCESS_CODE_HASH_SECRET)\s*=/m.test(source)) {
    throw new Error('secret values must not be assigned in Wrangler config');
  }
  if (/lisetteenbjarty\.nl|script\.google\.com\/macros\//i.test(source)) {
    throw new Error('test config must not contain a production origin or writer URL');
  }
  assertAllowedStructure(source);

  const topLevel = source.split(/^\s*\[/m)[0];
  const publicVars = readSection(source, 'vars');
  assertExact(readStringAssignment(topLevel, 'name'), 'lisette-bjarty-rsvp-api-test', 'name');
  assertExact(readStringAssignment(topLevel, 'main'), 'src/index.ts', 'main');
  assertExact(readStringAssignment(topLevel, 'compatibility_date'), '2026-08-29', 'compatibility_date');
  assertExact(readBooleanAssignment(topLevel, 'workers_dev'), false, 'workers_dev');
  assertExact(readBooleanAssignment(topLevel, 'preview_urls'), true, 'preview_urls');
  assertExact(readStringAssignment(publicVars, 'ALLOWED_ORIGIN'), 'http://localhost:3000', 'ALLOWED_ORIGIN');
  assertExact(
    readStringAssignment(publicVars, 'HOUSEHOLD_CODES_ENABLED'),
    'true',
    'HOUSEHOLD_CODES_ENABLED',
  );
  assertExact(
    readStringAssignment(publicVars, 'TURNSTILE_EXPECTED_HOSTNAME'),
    'localhost',
    'TURNSTILE_EXPECTED_HOSTNAME',
  );
  assertExact(
    readStringAssignment(publicVars, 'TURNSTILE_EXPECTED_ACTION'),
    'test',
    'TURNSTILE_EXPECTED_ACTION',
  );

  const secrets = readRequiredSecrets(source);
  if (JSON.stringify(secrets) !== JSON.stringify(EXPECTED_SECRETS)) {
    throw new Error('secrets.required must contain exactly the five RSVP test secrets');
  }

  const limits = readRateLimits(source);
  if (limits.length !== 4) throw new Error('exactly four rate-limit bindings are required');

  const ids = [];
  for (const [name, expectedLimit] of [
    ['GLOBAL_RATE_LIMITER', 300],
    ['CLIENT_RATE_LIMITER', 30],
    ['RESOLVE_RATE_LIMITER', 10],
    ['SUBMIT_RATE_LIMITER', 5],
  ]) {
    const binding = limits.find((entry) => entry.name === name);
    if (!binding || !binding.simple) throw new Error(`${name} must have a simple rate limit`);
    assertExact(Number(binding.simple[1]), expectedLimit, `${name} limit`);
    assertExact(Number(binding.simple[2]), 60, `${name} period`);

    if (template) {
      assertExact(binding.namespaceId, TEMPLATE_NAMESPACE_IDS.get(name), `${name} namespace_id`);
    } else if (!/^[1-9]\d*$/.test(binding.namespaceId)) {
      throw new Error(`${name} namespace_id must be a positive integer`);
    }
    ids.push(binding.namespaceId);
  }

  if (new Set(ids).size !== ids.length) {
    throw new Error('rate-limit namespace IDs must be different');
  }

  return {
    name: 'lisette-bjarty-rsvp-api-test',
    previewUrls: true,
    template,
  };
};

const main = async () => {
  try {
    const args = process.argv.slice(2);
    const template = args[0] === '--template';
    const filePath = args[template ? 1 : 0];
    if (!filePath || args.length !== (template ? 2 : 1)) {
      throw new Error('usage: validate-test-config.mjs [--template] <config-path>');
    }
    validateTestConfig(await readFile(filePath, 'utf8'), { template });
    process.stdout.write(`Veilige RSVP-testconfiguratie gecontroleerd: ${filePath}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'validation failed';
    process.stderr.write(`Testconfiguratie geweigerd: ${message}\n`);
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
