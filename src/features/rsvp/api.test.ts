import assert from 'node:assert/strict';
import test from 'node:test';
import { credentialRequestFields, RSVP_REQUEST_TIMEOUT_MILLISECONDS } from './api';

test('wacht langer dan de maximale Worker-keten', () => {
  const turnstileTimeoutMilliseconds = 5_000;
  const writerTimeoutMilliseconds = 60_000;
  const minimumNetworkMarginMilliseconds = 15_000;

  assert.equal(
    RSVP_REQUEST_TIMEOUT_MILLISECONDS,
    turnstileTimeoutMilliseconds + writerTimeoutMilliseconds + minimumNetworkMarginMilliseconds,
  );
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
