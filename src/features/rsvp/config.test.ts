import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRsvpConfig } from './config';

const configuredEnvironment = {
  VITE_RSVP_ENABLED: 'true',
  VITE_RSVP_API_BASE_URL: 'https://rsvp-api.example.test/',
  VITE_TURNSTILE_SITE_KEY: 'test-site-key',
} as const;

test('activeert RSVP alleen met de expliciete true-vlag en beide publieke waarden', () => {
  assert.equal(parseRsvpConfig(undefined), null);
  assert.equal(parseRsvpConfig({ ...configuredEnvironment, VITE_RSVP_ENABLED: 'false' }), null);
  assert.equal(parseRsvpConfig({ ...configuredEnvironment, VITE_TURNSTILE_SITE_KEY: '' }), null);
  assert.deepEqual(parseRsvpConfig(configuredEnvironment), {
    apiBaseUrl: 'https://rsvp-api.example.test',
    turnstileSiteKey: 'test-site-key',
  });
});

test('staat onversleuteld HTTP alleen toe voor lokale ontwikkeling', () => {
  const local = {
    ...configuredEnvironment,
    DEV: true,
    VITE_RSVP_API_BASE_URL: 'http://localhost:8787',
  } as const;
  assert.deepEqual(parseRsvpConfig(local), {
    apiBaseUrl: 'http://localhost:8787',
    turnstileSiteKey: 'test-site-key',
  });
  assert.equal(parseRsvpConfig({ ...local, DEV: false }), null);
  assert.equal(
    parseRsvpConfig({ ...local, VITE_RSVP_API_BASE_URL: 'http://example.test' }),
    null,
  );
});
