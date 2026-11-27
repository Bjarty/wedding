import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialRequestFields, parseNameSearchResult, RSVP_REQUEST_TIMEOUT_MILLISECONDS, RsvpApiError, searchHouseholds } from './api';

test('wacht langer dan de maximale Worker-keten', () => {
  const turnstileTimeoutMilliseconds = 5_000;
  const writerTimeoutMilliseconds = 60_000;
  const minimumNetworkMarginMilliseconds = 15_000;

  assert.equal(
    RSVP_REQUEST_TIMEOUT_MILLISECONDS,
    turnstileTimeoutMilliseconds + writerTimeoutMilliseconds + minimumNetworkMarginMilliseconds,
  );
});

test('naamselectie gebruikt alleen het onzichtbare ticket als credential', () => {
  assert.deepEqual(credentialRequestFields({ type: 'nameTicket', value: 'synthetic-ticket' }), { nameTicket: 'synthetic-ticket' });
});

test('naamzoekresultaten accepteren alleen begrensde namen en tickets', () => {
  const match = { displayName: 'Alex & Sam Voorbeeld', nameTicket: `nt1.ZGVtbw.${'A'.repeat(43)}` };
  assert.deepEqual(parseNameSearchResult({ matches: [match], tooMany: false }), { matches: [match], tooMany: false });
  assert.deepEqual(parseNameSearchResult({ matches: [], tooMany: true }), { matches: [], tooMany: true });
  const badResults = [
    { matches: [match], tooMany: true },
    { matches: [match, match], tooMany: false },
    { matches: Array.from({ length: 9 }, (_, index) => ({ ...match, nameTicket: `nt1.ZGVtbw${index}.${'A'.repeat(43)}` })), tooMany: false },
    { matches: [{ ...match, email: 'private@example.test' }], tooMany: false },
    { matches: [{ ...match, displayName: ' ' }], tooMany: false },
    { matches: [{ ...match, displayName: 'A'.repeat(161) }], tooMany: false },
    { matches: [{ ...match, displayName: 'Alex\nVoorbeeld' }], tooMany: false },
    { matches: [{ ...match, nameTicket: 'not-a-ticket' }], tooMany: false },
    { matches: [{ ...match, nameTicket: `nt1.${'A'.repeat(480)}.${'A'.repeat(43)}` }], tooMany: false },
    { matches: [], tooMany: false, total: 100 },
    { matches: [], tooMany: 'false' },
    null,
  ];
  for (const value of badResults) assert.throws(() => parseNameSearchResult(value), RsvpApiError);
});

test('naamzoekopdracht verstuurt de naam alleen in een niet-gecachete POST-body', async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  let called = false;
  globalThis.fetch = async (input, init) => {
    called = true;
    assert.equal(input, 'https://rsvp.example.test/v1/households/search');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    assert.deepEqual(JSON.parse(String(init?.body)), { query: 'Alex', turnstileToken: 'synthetic-challenge' });
    return new Response(JSON.stringify({ version: 'v1', data: { matches: [], tooMany: false } }), { status: 200 });
  };
  try {
    assert.deepEqual(await searchHouseholds('https://rsvp.example.test', ' Alex ', 'synthetic-challenge'), { matches: [], tooMany: false });
    assert.equal(called, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('stuurt precies één legacy-tokenveld naar de Worker', () => {
  assert.deepEqual(
    credentialRequestFields({ type: 'inviteToken', value: 'legacy-secret' }),
    { inviteToken: 'legacy-secret' },
  );
});

test('stuurt precies één huishoudcodeveld naar de Worker', () => {
  assert.deepEqual(
    credentialRequestFields({ type: 'accessCode', value: '23456ABCDEFGHJKMNPQR' }),
    { accessCode: '23456ABCDEFGHJKMNPQR' },
  );
});
