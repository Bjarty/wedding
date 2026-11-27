import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialRequestFields, parseNameSearchResult, resolveHousehold, RSVP_REQUEST_TIMEOUT_MILLISECONDS, RsvpApiError, searchHouseholds, submitRsvp } from './api';
import type { ResolvedHousehold, SubmitPayload } from './types';

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

test('een vaste naamselectie stuurt alleen de openbare groeps-ID en geen code of ticket', () => {
  assert.deepEqual(credentialRequestFields({ type: 'publicGroupId', value: 'example-group' }), { publicGroupId: 'example-group' });
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

test('de vaste naamselectie opent, bewaart en wijzigt dezelfde groep met het bestaande RSVP-contract', async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  const household: ResolvedHousehold = {
    householdId: 'example-group', displayName: 'Alex — Voorbeeld', maxGuests: 1,
    invitationVariant: 'day', mealChoiceRequired: true,
    guests: [{ guestId: 'example-person', displayName: 'Alex' }], currentRsvp: null,
  };
  const seenPaths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    seenPaths.push(url.pathname);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.cache, 'no-store');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.publicGroupId, 'example-group');
    assert.equal(body.turnstileToken, 'synthetic-challenge');
    for (const field of ['accessCode', 'inviteToken', 'nameTicket', 'credential', 'query']) assert.equal(Object.hasOwn(body, field), false);
    if (url.pathname === '/v1/households/resolve') {
      return new Response(JSON.stringify({ version: 'v1', data: household }));
    }
    assert.equal(url.pathname, '/v1/rsvps/submit');
    assert.equal(body.revision, household.currentRsvp?.revision ?? 0);
    const updatedAt = '2027-01-02T12:00:00.000Z';
    household.currentRsvp = {
      revision: body.revision + 1, receiptNumber: 'RSVP-EXAMPLE1', attending: body.attending,
      guests: body.guests, email: body.email, message: body.message, updatedAt,
    };
    return new Response(JSON.stringify({ version: 'v1', data: {
      revision: body.revision + 1, receiptNumber: 'RSVP-EXAMPLE1', savedAt: updatedAt, idempotencyKey: body.idempotencyKey,
    } }));
  };
  try {
    const credential = { type: 'publicGroupId', value: 'example-group' } as const;
    const initial = await resolveHousehold('https://rsvp.example.test', credential, 'synthetic-challenge');
    assert.equal(initial.currentRsvp, null);
    const payload: SubmitPayload = { credential, turnstileToken: 'synthetic-challenge', revision: 0,
      idempotencyKey: '00000000-0000-4000-8000-000000000001', attending: true,
      guests: [{ guestId: 'example-person', attending: true, mealChoice: 'vegetarian' }],
      email: 'guest@example.test', message: 'Voorbeeldreactie',
    };
    assert.equal((await submitRsvp('https://rsvp.example.test', payload)).revision, 1);
    const reopened = await resolveHousehold('https://rsvp.example.test', credential, 'synthetic-challenge');
    assert.equal(reopened.currentRsvp?.guests[0].mealChoice, 'vegetarian');
    const edited: SubmitPayload = { ...payload, revision: 1,
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
      guests: [{ guestId: 'example-person', attending: true, mealChoice: 'vegan' }],
    };
    assert.equal((await submitRsvp('https://rsvp.example.test', edited)).revision, 2);
    const afterEdit = await resolveHousehold('https://rsvp.example.test', credential, 'synthetic-challenge');
    assert.equal(afterEdit.currentRsvp?.guests[0].mealChoice, 'vegan');
    assert.equal(afterEdit.currentRsvp?.revision, 2);
    assert.deepEqual(seenPaths, ['/v1/households/resolve', '/v1/rsvps/submit', '/v1/households/resolve', '/v1/rsvps/submit', '/v1/households/resolve']);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('een vaste naamselectie accepteert nooit een andere groep uit de API', async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } });
  globalThis.fetch = async () => new Response(JSON.stringify({ version: 'v1', data: {
    householdId: 'example-other-group', displayName: 'Alex', maxGuests: 1,
    invitationVariant: 'evening', mealChoiceRequired: false,
    guests: [{ guestId: 'example-person', displayName: 'Alex' }], currentRsvp: null,
  } }));
  try {
    await assert.rejects(resolveHousehold('https://rsvp.example.test', { type: 'publicGroupId', value: 'example-group' }, 'synthetic-challenge'),
      (error) => error instanceof RsvpApiError && error.code === 'UPSTREAM_UNAVAILABLE');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
