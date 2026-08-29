import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isRsvpInviteFragment,
  readInviteToken,
  shouldRemoveInviteFragment,
} from './inviteToken';

const validToken = 'abcdefghijklmnopqrstuvwxyzABCDEF';

test('leest alleen een volledig base64url-achtig RSVP-fragment', () => {
  assert.equal(readInviteToken(`#rsvp/${validToken}`), validToken);
  assert.equal(readInviteToken(`#rsvp/${validToken}/extra`), null);
  assert.equal(readInviteToken('#rsvp/te-kort'), null);
  assert.equal(readInviteToken(`#rsvp/${validToken}!`), null);
});

test('herkent ook een ongeldig persoonlijk fragment zodat het kan worden verwijderd', () => {
  assert.equal(isRsvpInviteFragment('#rsvp/te-kort'), true);
  assert.equal(isRsvpInviteFragment('#locatie'), false);
});

test('bewaart de persoonlijke link zolang de RSVP nog niet is geactiveerd', () => {
  assert.equal(shouldRemoveInviteFragment(`#rsvp/${validToken}`, false), false);
  assert.equal(shouldRemoveInviteFragment(`#rsvp/${validToken}`, true), true);
});
