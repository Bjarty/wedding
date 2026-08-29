import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import { handleRequest } from '../dist/index.js';
import { WRITER_TIMEOUT_MILLISECONDS } from '../dist/integrations.js';
import { createInvitation } from '../scripts/provision-invitation.mjs';

const ORIGIN = 'https://lisetteenbjarty.nl';
const WRITER_URL = 'https://script.google.com/macros/s/test-deployment/exec';
const REQUEST_ID = '00000000-0000-4000-8000-000000000001';
const IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111';
const RAW_TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-token';
const RAW_ACCESS_CODE = '2a3bc-4d5ef 6g7hj-8kmnp';
const NORMALIZED_ACCESS_CODE = '2A3BC4D5EF6G7HJ8KMNP';
const HASH_SECRET = 'token-hash-secret-that-is-at-least-32-bytes';
const ACCESS_HASH_SECRET = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const WRITER_SECRET = 'writer-signing-secret-that-is-at-least-32-bytes';
const DUMMY_SECRET_PLACEHOLDER = 'turnstile-dummy-secret-supplied-outside-git';
const DUMMY_SECRET_SHA256 = 'fb8f35129df87662c650ada12fd614f1b58dce4a37fdd7589ba3a6b9a78c0aae';

const allowRateLimit = { limit: async () => ({ success: true }) };

test('allows a slow durable Apps Script write to finish', () => {
  assert.equal(WRITER_TIMEOUT_MILLISECONDS, 60_000);
  assert.ok(WRITER_TIMEOUT_MILLISECONDS > 30_000);
});

const baseEnv = {
  ACCESS_CODE_HASH_SECRET: ACCESS_HASH_SECRET,
  ALLOWED_ORIGIN: ORIGIN,
  CLIENT_RATE_LIMITER: allowRateLimit,
  GLOBAL_RATE_LIMITER: allowRateLimit,
  HOUSEHOLD_CODES_ENABLED: 'true',
  INVITATION_TOKEN_HASH_SECRET: HASH_SECRET,
  RESOLVE_RATE_LIMITER: allowRateLimit,
  SUBMIT_RATE_LIMITER: allowRateLimit,
  TURNSTILE_EXPECTED_HOSTNAME: 'lisetteenbjarty.nl',
  TURNSTILE_SECRET: 'turnstile-test-secret-long-enough',
  WRITER_URL,
  WRITER_HMAC_SECRET: WRITER_SECRET,
};

const resolveData = {
  householdId: 'hh_example',
  displayName: 'Familie Voorbeeld',
  invitationVariant: 'day',
  mealChoiceRequired: true,
  maxGuests: 2,
  guests: [
    { guestId: 'guest_1', displayName: 'Gast één' },
    { guestId: 'guest_2', displayName: 'Gast twee' },
  ],
  currentRsvp: null,
};

const submitData = {
  revision: 1,
  savedAt: '2027-01-02T12:34:56.000Z',
  idempotencyKey: IDEMPOTENCY_KEY,
  receiptNumber: 'RSVP-8K2M4P',
};

const submitBody = {
  inviteToken: RAW_TOKEN,
  idempotencyKey: IDEMPOTENCY_KEY,
  revision: 0,
  attending: true,
  guests: [
    { guestId: 'guest_1', attending: true, mealChoice: 'vegetarian' },
    { guestId: 'guest_2', attending: false },
  ],
  email: ' gast@example.nl ',
  message: ' Tot dan! ',
  turnstileToken: 'turnstile-token',
};

const makeRequest = (path, body, options = {}) =>
  new Request(`https://rsvp-api.example.test${path}${options.query ?? ''}`, {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? ORIGIN,
      'Content-Type': options.contentType ?? 'application/json',
      'CF-Connecting-IP': '2001:db8::1234',
      ...(options.headers ?? {}),
    },
    body: options.method === 'OPTIONS' || options.method === 'GET' ? undefined : JSON.stringify(body),
  });

const parseJson = async (response) => JSON.parse(await response.text());

const decodePayload = (envelope) => JSON.parse(Buffer.from(envelope.payload, 'base64url').toString('utf8'));

const hmacBase64Url = async (secret, value) => {
  const key = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await webcrypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return Buffer.from(signature).toString('base64url');
};

const sha256Hex = async (value) => {
  const digest = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('hex');
};

const testDummySecretFingerprint = async (value) =>
  value === DUMMY_SECRET_PLACEHOLDER ? DUMMY_SECRET_SHA256 : sha256Hex(value);

const makeDependencies = (fetchImpl, overrides = {}) => ({
  fetch: fetchImpl,
  crypto: webcrypto,
  sha256Hex,
  now: () => 1_800_000_000_000,
  randomUUID: () => REQUEST_ID,
  ...overrides,
});

const makeHappyFetch = ({ action, writerData, onWriter }) => {
  let calls = 0;
  const fetch = async (input, init = {}) => {
    calls += 1;
    const url = String(input);
    if (url.includes('/turnstile/v0/siteverify')) {
      return Response.json({ success: true, hostname: 'lisetteenbjarty.nl', action });
    }
    if (url === WRITER_URL) {
      const envelope = JSON.parse(String(init.body));
      if (onWriter) await onWriter(envelope, init);
      return Response.json({
        version: 'v1',
        requestId: envelope.requestId,
        ok: true,
        data: writerData,
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { fetch, get calls() { return calls; } };
};

test('preflight allows only the exact configured origin and JSON header', async () => {
  const dependencies = makeDependencies(async () => {
    throw new Error('preflight must not fetch');
  });
  const request = makeRequest('/v1/households/resolve', null, {
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  });
  const response = await handleRequest(request, baseEnv, dependencies);

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(response.headers.get('access-control-allow-headers'), 'Content-Type');
  assert.equal(response.headers.get('access-control-expose-headers'), 'Retry-After');
  assert.equal(response.headers.get('access-control-allow-credentials'), null);
});

test('rejects lookalike origins without CORS access', async () => {
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'x' }, {
      origin: 'https://www.lisetteenbjarty.nl',
    }),
    baseEnv,
    makeDependencies(async () => { throw new Error('must not fetch'); }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(body.error.code, 'ORIGIN_NOT_ALLOWED');
});

test('allows only the exact local browser origin in the isolated test environment', async () => {
  const testEnv = {
    ...baseEnv,
    ALLOWED_ORIGIN: 'http://localhost:3000',
    TURNSTILE_EXPECTED_HOSTNAME: 'localhost',
  };
  let calls = 0;
  const dependencies = makeDependencies(async (input, init = {}) => {
    calls += 1;
    if (String(input).includes('/turnstile/v0/siteverify')) {
      return Response.json({ success: true, hostname: 'localhost', action: 'rsvp_resolve' });
    }
    const envelope = JSON.parse(String(init.body));
    return Response.json({
      version: 'v1',
      requestId: envelope.requestId,
      ok: true,
      data: resolveData,
    });
  });
  const accepted = await handleRequest(
    makeRequest(
      '/v1/households/resolve',
      { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' },
      { origin: 'http://localhost:3000' },
    ),
    testEnv,
    dependencies,
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.equal(calls, 2);

  const rejected = await handleRequest(
    makeRequest(
      '/v1/households/resolve',
      { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' },
      { origin: 'http://127.0.0.1:3000' },
    ),
    testEnv,
    makeDependencies(async () => { throw new Error('must not fetch'); }),
  );
  assert.equal(rejected.status, 403);
});

test('allows Cloudflare dummy action only in the isolated localhost test environment', async () => {
  const testEnv = {
    ...baseEnv,
    ALLOWED_ORIGIN: 'http://localhost:3000',
    TURNSTILE_EXPECTED_ACTION: 'test',
    TURNSTILE_EXPECTED_HOSTNAME: 'localhost',
    TURNSTILE_SECRET: DUMMY_SECRET_PLACEHOLDER,
  };
  const dependencies = makeDependencies(async (input, init = {}) => {
    if (String(input).includes('/turnstile/v0/siteverify')) {
      return Response.json({ success: true, hostname: 'localhost', action: 'test' });
    }
    const envelope = JSON.parse(String(init.body));
    return Response.json({
      version: 'v1',
      requestId: envelope.requestId,
      ok: true,
      data: resolveData,
    });
  }, { sha256Hex: testDummySecretFingerprint });
  const accepted = await handleRequest(
    makeRequest(
      '/v1/households/resolve',
      { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' },
      { origin: 'http://localhost:3000' },
    ),
    testEnv,
    dependencies,
  );
  assert.equal(accepted.status, 200);

  for (const unsafeEnv of [
    { ...testEnv, ALLOWED_ORIGIN: ORIGIN },
    { ...testEnv, TURNSTILE_EXPECTED_ACTION: 'rsvp_resolve' },
    { ...testEnv, TURNSTILE_SECRET: 'production-like-secret-long-enough' },
  ]) {
    const rejected = await handleRequest(
      makeRequest(
        '/v1/households/resolve',
        { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' },
        { origin: unsafeEnv.ALLOWED_ORIGIN },
      ),
      unsafeEnv,
      makeDependencies(async () => {
        throw new Error('must not fetch');
      }, { sha256Hex: testDummySecretFingerprint }),
    );
    assert.equal(rejected.status, 503);
    assert.equal((await parseJson(rejected)).error.code, 'CONFIGURATION_ERROR');
  }
});

test('accepts only Cloudflare\'s marked literal dummy response in the isolated test environment', async () => {
  const testEnv = {
    ...baseEnv,
    ALLOWED_ORIGIN: 'http://localhost:3000',
    TURNSTILE_EXPECTED_ACTION: 'test',
    TURNSTILE_EXPECTED_HOSTNAME: 'localhost',
    TURNSTILE_SECRET: DUMMY_SECRET_PLACEHOLDER,
  };
  const makeLiteralFetch = (metadata = { result_with_testing_key: true }) => async (input, init = {}) => {
    if (String(input).includes('/turnstile/v0/siteverify')) {
      return Response.json({ success: true, hostname: 'example.com', metadata });
    }
    const envelope = JSON.parse(String(init.body));
    return Response.json({
      version: 'v1',
      requestId: envelope.requestId,
      ok: true,
      data: resolveData,
    });
  };
  const request = () =>
    makeRequest(
      '/v1/households/resolve',
      { inviteToken: RAW_TOKEN, turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX' },
      { origin: 'http://localhost:3000' },
    );

  const accepted = await handleRequest(
    request(),
    testEnv,
    makeDependencies(makeLiteralFetch(), { sha256Hex: testDummySecretFingerprint }),
  );
  assert.equal(accepted.status, 200);

  const rejected = await handleRequest(
    request(),
    testEnv,
    makeDependencies(
      makeLiteralFetch({ result_with_testing_key: false }),
      { sha256Hex: testDummySecretFingerprint },
    ),
  );
  assert.equal(rejected.status, 403);
  assert.equal((await parseJson(rejected)).error.code, 'CHALLENGE_FAILED');
});

test('resolve verifies Turnstile, hashes the invitation token, and signs the writer envelope', async () => {
  const mock = makeHappyFetch({
    action: 'rsvp_resolve',
    writerData: resolveData,
    onWriter: async (envelope) => {
      assert.equal(envelope.version, 'v1');
      assert.equal(envelope.timestamp, 1_800_000_000);
      assert.equal(envelope.requestId, REQUEST_ID);
      const payload = decodePayload(envelope);
      assert.deepEqual(Object.keys(payload.data), ['tokenHash']);
      assert.equal(payload.operation, 'resolve');
      assert.equal(payload.requestId, REQUEST_ID);
      assert.equal(payload.data.tokenHash, await hmacBase64Url(HASH_SECRET, RAW_TOKEN));
      assert.equal(JSON.stringify(payload).includes(RAW_TOKEN), false);

      const signingInput = `v1.${envelope.timestamp}.${envelope.requestId}.${envelope.payload}`;
      assert.equal(envelope.signature, await hmacBase64Url(WRITER_SECRET, signingInput));
    },
  });
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    baseEnv,
    makeDependencies(mock.fetch),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, resolveData);
  assert.equal(JSON.stringify(body).includes(RAW_TOKEN), false);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(mock.calls, 2);
});

test('resolve accepts and safely shapes an existing response with a receipt number', async () => {
  const currentRsvp = {
    revision: 3,
    receiptNumber: 'RSVP-ABC123',
    attending: true,
    guests: [
      { guestId: 'guest_1', attending: true, mealChoice: 'fish' },
      { guestId: 'guest_2', attending: false },
    ],
    email: 'gast@example.nl',
    message: 'Geen bijzonderheden',
    updatedAt: '2027-02-03T10:11:12.000Z',
  };
  const mock = makeHappyFetch({
    action: 'rsvp_resolve',
    writerData: { ...resolveData, currentRsvp },
  });
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    baseEnv,
    makeDependencies(mock.fetch),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.data.currentRsvp, currentRsvp);
});

test('access codes are normalized, domain-hashed, and never sent to the writer', async () => {
  const mock = makeHappyFetch({
    action: 'rsvp_resolve',
    writerData: resolveData,
    onWriter: async (envelope) => {
      const payload = decodePayload(envelope);
      assert.deepEqual(Object.keys(payload.data), ['accessCodeHash']);
      assert.equal(
        payload.data.accessCodeHash,
        await hmacBase64Url(ACCESS_HASH_SECRET, `rsvp-access-code-v1\0${NORMALIZED_ACCESS_CODE}`),
      );
      assert.equal(JSON.stringify(payload).toLowerCase().includes(RAW_ACCESS_CODE.toLowerCase()), false);
      assert.equal(JSON.stringify(payload).includes(NORMALIZED_ACCESS_CODE), false);
    },
  });
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', {
      accessCode: RAW_ACCESS_CODE,
      turnstileToken: 'turnstile-token',
    }),
    baseEnv,
    makeDependencies(mock.fetch),
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await parseJson(response)).data, resolveData);
});

test('access codes fail closed when disabled and requests require exactly one credential', async () => {
  let calls = 0;
  const disabled = await handleRequest(
    makeRequest('/v1/households/resolve', {
      accessCode: RAW_ACCESS_CODE,
      turnstileToken: 'turnstile-token',
    }),
    { ...baseEnv, HOUSEHOLD_CODES_ENABLED: 'false' },
    makeDependencies(async () => {
      calls += 1;
      throw new Error('must not fetch');
    }),
  );
  assert.equal(disabled.status, 404);
  assert.equal((await parseJson(disabled)).error.code, 'INVITATION_INVALID');
  assert.equal(calls, 0);

  for (const body of [
    { turnstileToken: 'turnstile-token' },
    { inviteToken: RAW_TOKEN, accessCode: RAW_ACCESS_CODE, turnstileToken: 'turnstile-token' },
    { accessCode: '2A3BC-4D5EF-6G7HI-8KMNP', turnstileToken: 'turnstile-token' },
  ]) {
    const response = await handleRequest(
      makeRequest('/v1/households/resolve', body),
      baseEnv,
      makeDependencies(async () => {
        throw new Error('must not fetch');
      }),
    );
    const result = await parseJson(response);
    assert.equal(response.status, 422);
    assert.equal(result.error.code, 'VALIDATION_FAILED');
  }
});

test('evening responses may omit meals while day responses remain strict at the writer boundary', async () => {
  const currentRsvpWithoutMeals = {
    revision: 2,
    receiptNumber: 'RSVP-ABC123',
    attending: true,
    guests: [
      { guestId: 'guest_1', attending: true },
      { guestId: 'guest_2', attending: false },
    ],
    updatedAt: '2027-02-03T10:11:12.000Z',
  };
  const eveningData = {
    ...resolveData,
    invitationVariant: 'evening',
    mealChoiceRequired: false,
    currentRsvp: currentRsvpWithoutMeals,
  };
  const eveningMock = makeHappyFetch({ action: 'rsvp_resolve', writerData: eveningData });
  const evening = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    baseEnv,
    makeDependencies(eveningMock.fetch),
  );
  assert.equal(evening.status, 200);
  assert.deepEqual((await parseJson(evening)).data, eveningData);

  const dayMock = makeHappyFetch({
    action: 'rsvp_resolve',
    writerData: { ...resolveData, currentRsvp: currentRsvpWithoutMeals },
  });
  const day = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    baseEnv,
    makeDependencies(dayMock.fetch),
  );
  assert.equal(day.status, 503);
  assert.equal((await parseJson(day)).error.code, 'UPSTREAM_UNAVAILABLE');
});

test('resolve enforces that preset guests never exceed maxGuests', async () => {
  const validMock = makeHappyFetch({
    action: 'rsvp_resolve',
    writerData: { ...resolveData, maxGuests: 3 },
  });
  const validResponse = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    baseEnv,
    makeDependencies(validMock.fetch),
  );
  assert.equal(validResponse.status, 200);

  const invalidMock = makeHappyFetch({
    action: 'rsvp_resolve',
    writerData: { ...resolveData, maxGuests: 1 },
  });
  const invalidResponse = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    baseEnv,
    makeDependencies(invalidMock.fetch),
  );
  const invalidBody = await parseJson(invalidResponse);
  assert.equal(invalidResponse.status, 503);
  assert.equal(invalidBody.error.code, 'UPSTREAM_UNAVAILABLE');
});

test('submit forwards only the token hash and normalized validated fields', async () => {
  const mock = makeHappyFetch({
    action: 'rsvp_submit',
    writerData: submitData,
    onWriter: async (envelope) => {
      const payload = decodePayload(envelope);
      assert.equal(payload.operation, 'submit');
      assert.equal(payload.data.tokenHash, await hmacBase64Url(HASH_SECRET, RAW_TOKEN));
      assert.equal(payload.data.inviteToken, undefined);
      assert.equal(JSON.stringify(payload).includes(RAW_TOKEN), false);
      assert.equal(payload.data.email, 'gast@example.nl');
      assert.equal(payload.data.message, 'Tot dan!');
      assert.equal(payload.data.idempotencyKey, IDEMPOTENCY_KEY);
      assert.equal(payload.data.revision, 0);
      assert.deepEqual(payload.data.guests, submitBody.guests);
    },
  });
  const response = await handleRequest(
    makeRequest('/v1/rsvps/submit', submitBody),
    baseEnv,
    makeDependencies(mock.fetch),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 200);
  assert.deepEqual(body.data, submitData);
  assert.equal(body.data.receiptNumber, 'RSVP-8K2M4P');
});

test('submit accepts an access code and can omit a meal for writer-enforced evening policy', async () => {
  const { inviteToken: _inviteToken, ...withoutInviteToken } = submitBody;
  const accessSubmit = {
    ...withoutInviteToken,
    accessCode: RAW_ACCESS_CODE,
    guests: [
      { guestId: 'guest_1', attending: true },
      { guestId: 'guest_2', attending: false },
    ],
  };
  const mock = makeHappyFetch({
    action: 'rsvp_submit',
    writerData: submitData,
    onWriter: async (envelope) => {
      const payload = decodePayload(envelope);
      assert.equal(payload.data.tokenHash, undefined);
      assert.equal(payload.data.accessCode, undefined);
      assert.equal(
        payload.data.accessCodeHash,
        await hmacBase64Url(ACCESS_HASH_SECRET, `rsvp-access-code-v1\0${NORMALIZED_ACCESS_CODE}`),
      );
      assert.equal(Object.hasOwn(payload.data.guests[0], 'mealChoice'), false);
    },
  });
  const response = await handleRequest(
    makeRequest('/v1/rsvps/submit', accessSubmit),
    baseEnv,
    makeDependencies(mock.fetch),
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await parseJson(response)).data, submitData);
});

test('rejects an invalid meal choice before any upstream call', async () => {
  for (const mealChoice of ['chicken']) {
    let calls = 0;
    const body = structuredClone(submitBody);
    body.guests[0].mealChoice = mealChoice;

    const response = await handleRequest(
      makeRequest('/v1/rsvps/submit', body),
      baseEnv,
      makeDependencies(async () => { calls += 1; throw new Error('must not fetch'); }),
    );
    const result = await parseJson(response);
    assert.equal(response.status, 422);
    assert.equal(result.error.code, 'VALIDATION_FAILED');
    assert.equal(result.error.fields.some((field) => field.path === 'guests[0].mealChoice'), true);
    assert.equal(calls, 0);
  }
});

test('rejects duplicate guests and inconsistent household attendance', async () => {
  const duplicate = structuredClone(submitBody);
  duplicate.guests[1].guestId = 'guest_1';
  const duplicateResponse = await handleRequest(
    makeRequest('/v1/rsvps/submit', duplicate),
    baseEnv,
    makeDependencies(async () => { throw new Error('must not fetch'); }),
  );
  assert.equal(duplicateResponse.status, 422);
  assert.equal((await parseJson(duplicateResponse)).error.fields.some((field) => field.code === 'duplicate'), true);

  const inconsistent = structuredClone(submitBody);
  inconsistent.attending = false;
  const inconsistentResponse = await handleRequest(
    makeRequest('/v1/rsvps/submit', inconsistent),
    baseEnv,
    makeDependencies(async () => { throw new Error('must not fetch'); }),
  );
  assert.equal(inconsistentResponse.status, 422);
  assert.equal((await parseJson(inconsistentResponse)).error.fields.some((field) => field.path === 'attending'), true);
});

test('Turnstile failure or wrong action fails closed before calling the writer', async () => {
  for (const verification of [
    { success: false, hostname: 'lisetteenbjarty.nl', action: 'rsvp_resolve' },
    { success: true, hostname: 'lisetteenbjarty.nl', action: 'rsvp_submit' },
    { success: true, hostname: 'evil.example', action: 'rsvp_resolve' },
  ]) {
    let writerCalls = 0;
    const fetch = async (input) => {
      if (String(input).includes('/turnstile/v0/siteverify')) return Response.json(verification);
      writerCalls += 1;
      return Response.json({});
    };
    const response = await handleRequest(
      makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
      baseEnv,
      makeDependencies(fetch),
    );
    assert.equal(response.status, 403);
    assert.equal((await parseJson(response)).error.code, 'CHALLENGE_FAILED');
    assert.equal(writerCalls, 0);
  }
});

test('per-token rate limiting returns 429 before Turnstile or writer', async () => {
  let upstreamCalls = 0;
  let rateLimitKey;
  const env = {
    ...baseEnv,
    RESOLVE_RATE_LIMITER: {
      limit: async ({ key }) => {
        rateLimitKey = key;
        return { success: false };
      },
    },
  };
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'turnstile-token' }),
    env,
    makeDependencies(async () => { upstreamCalls += 1; throw new Error('must not fetch'); }),
  );
  const body = await parseJson(response);

  assert.equal(response.status, 429);
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('access-control-expose-headers'), 'Retry-After');
  assert.equal(rateLimitKey, await hmacBase64Url(HASH_SECRET, RAW_TOKEN));
  assert.equal(rateLimitKey.includes(RAW_TOKEN), false);
  assert.equal(upstreamCalls, 0);
});

test('global and privacy-safe client limiting run before credential parsing', async () => {
  const order = [];
  let clientKey = '';
  const env = {
    ...baseEnv,
    GLOBAL_RATE_LIMITER: {
      limit: async ({ key }) => {
        order.push('global');
        assert.equal(key, 'rsvp-api-v1');
        return { success: true };
      },
    },
    CLIENT_RATE_LIMITER: {
      limit: async ({ key }) => {
        order.push('client');
        clientKey = key;
        return { success: false };
      },
    },
  };
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', { deliberately: 'not a credential' }),
    env,
    makeDependencies(async () => {
      throw new Error('must not fetch');
    }),
  );
  assert.equal(response.status, 429);
  assert.deepEqual(order, ['global', 'client']);
  assert.equal(
    clientKey,
    await hmacBase64Url(ACCESS_HASH_SECRET, 'rsvp-client-ip-v1\u00002001:db8::1234'),
  );
  assert.equal(clientKey.includes('2001:db8::1234'), false);
});

test('global limiting fails closed before client limiting and body parsing', async () => {
  let clientCalls = 0;
  const response = await handleRequest(
    makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN }),
    {
      ...baseEnv,
      GLOBAL_RATE_LIMITER: { limit: async () => ({ success: false }) },
      CLIENT_RATE_LIMITER: {
        limit: async () => {
          clientCalls += 1;
          return { success: true };
        },
      },
    },
    makeDependencies(async () => {
      throw new Error('must not fetch');
    }),
  );
  assert.equal(response.status, 429);
  assert.equal(clientCalls, 0);
});

test('rate-limit binding failure fails closed before Turnstile or writer', async () => {
  let upstreamCalls = 0;
  const env = {
    ...baseEnv,
    SUBMIT_RATE_LIMITER: { limit: async () => { throw new Error('binding unavailable'); } },
  };
  const response = await handleRequest(
    makeRequest('/v1/rsvps/submit', submitBody),
    env,
    makeDependencies(async () => { upstreamCalls += 1; throw new Error('must not fetch'); }),
  );

  assert.equal(response.status, 503);
  assert.equal((await parseJson(response)).error.code, 'UPSTREAM_UNAVAILABLE');
  assert.equal(upstreamCalls, 0);
});

test('maps known writer conflicts and sanitizes unknown writer failures', async () => {
  for (const [writerCode, expectedStatus, expectedCode] of [
    ['REVISION_CONFLICT', 409, 'REVISION_CONFLICT'],
    ['IDEMPOTENCY_CONFLICT', 409, 'IDEMPOTENCY_CONFLICT'],
    ['PRIVATE_SHEET_STACK_TRACE', 503, 'UPSTREAM_UNAVAILABLE'],
  ]) {
    const fetch = async (input, init = {}) => {
      if (String(input).includes('/turnstile/v0/siteverify')) {
        return Response.json({ success: true, hostname: 'lisetteenbjarty.nl', action: 'rsvp_submit' });
      }
      const envelope = JSON.parse(String(init.body));
      return Response.json({
        version: 'v1',
        requestId: envelope.requestId,
        ok: false,
        error: { code: writerCode, message: 'secret internal detail' },
      });
    };
    const response = await handleRequest(
      makeRequest('/v1/rsvps/submit', submitBody),
      baseEnv,
      makeDependencies(fetch),
    );
    const body = await parseJson(response);
    assert.equal(response.status, expectedStatus);
    assert.equal(body.error.code, expectedCode);
    assert.equal(JSON.stringify(body).includes('secret internal detail'), false);
  }
});

test('rejects a mismatched idempotency echo or malformed receipt from the writer', async () => {
  for (const writerData of [
    { ...submitData, idempotencyKey: '22222222-2222-4222-8222-222222222222' },
    { ...submitData, revision: 0 },
    { ...submitData, receiptNumber: '=IMPORTXML(EVIL)' },
  ]) {
    const mock = makeHappyFetch({ action: 'rsvp_submit', writerData });
    const response = await handleRequest(
      makeRequest('/v1/rsvps/submit', submitBody),
      baseEnv,
      makeDependencies(mock.fetch),
    );
    assert.equal(response.status, 503);
    assert.equal((await parseJson(response)).error.code, 'UPSTREAM_UNAVAILABLE');
  }
});

test('enforces body, media type, query, and strict field limits', async () => {
  const noFetch = makeDependencies(async () => { throw new Error('must not fetch'); });

  const oversized = await handleRequest(
    makeRequest('/v1/households/resolve', {
      inviteToken: RAW_TOKEN,
      turnstileToken: 'x'.repeat(17_000),
    }),
    baseEnv,
    noFetch,
  );
  assert.equal(oversized.status, 413);

  const wrongMedia = await handleRequest(
    makeRequest('/v1/households/resolve', {}, { contentType: 'text/plain' }),
    baseEnv,
    noFetch,
  );
  assert.equal(wrongMedia.status, 415);

  const query = await handleRequest(
    makeRequest('/v1/households/resolve', {}, { query: `?inviteToken=${RAW_TOKEN}` }),
    baseEnv,
    noFetch,
  );
  assert.equal(query.status, 400);

  const unknownField = await handleRequest(
    makeRequest('/v1/households/resolve', {
      inviteToken: RAW_TOKEN,
      turnstileToken: 'token',
      rawGuestName: 'should not be accepted',
    }),
    baseEnv,
    noFetch,
  );
  assert.equal(unknownField.status, 422);
  assert.equal((await parseJson(unknownField)).error.fields[0].path, 'body');
});

test('fails closed when secrets are missing, short, or reused', async () => {
  for (const env of [
    { ...baseEnv, WRITER_HMAC_SECRET: '' },
    { ...baseEnv, ACCESS_CODE_HASH_SECRET: 'short' },
    { ...baseEnv, HOUSEHOLD_CODES_ENABLED: '' },
    { ...baseEnv, INVITATION_TOKEN_HASH_SECRET: 'short' },
    { ...baseEnv, INVITATION_TOKEN_HASH_SECRET: WRITER_SECRET },
    { ...baseEnv, ACCESS_CODE_HASH_SECRET: WRITER_SECRET },
    { ...baseEnv, CLIENT_RATE_LIMITER: undefined },
    { ...baseEnv, GLOBAL_RATE_LIMITER: undefined },
  ]) {
    const response = await handleRequest(
      makeRequest('/v1/households/resolve', { inviteToken: RAW_TOKEN, turnstileToken: 'token' }),
      env,
      makeDependencies(async () => { throw new Error('must not fetch'); }),
    );
    assert.equal(response.status, 503);
    assert.equal((await parseJson(response)).error.code, 'CONFIGURATION_ERROR');
  }
});

test('offline provisioning emits a private fragment link and the same keyed token hash', async () => {
  const deterministicBytes = Buffer.alloc(32, 7);
  const result = createInvitation({
    householdId: 'hh_example',
    secret: HASH_SECRET,
    random: () => deterministicBytes,
  });
  const token = deterministicBytes.toString('base64url');

  assert.equal(result.invitationLink, `${ORIGIN}/#rsvp/${token}`);
  assert.equal(result.tokenHash, await hmacBase64Url(HASH_SECRET, token));
  assert.equal(result.tokenHash.includes(token), false);
  assert.equal(Object.hasOwn(result, 'token'), false);
  assert.equal(JSON.stringify(result).includes(HASH_SECRET), false);

  const localResult = createInvitation({
    householdId: 'hh_local_test',
    origin: 'http://localhost:3000',
    secret: HASH_SECRET,
    random: () => deterministicBytes,
  });
  assert.equal(localResult.invitationLink, `http://localhost:3000/#rsvp/${token}`);
  assert.throws(
    () => createInvitation({
      householdId: 'hh_wrong_local_origin',
      origin: 'http://127.0.0.1:3000',
      secret: HASH_SECRET,
      random: () => deterministicBytes,
    }),
    /exact local test origin/u,
  );
});
