import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewNameRenewal } from './nameRenewal';
import type { ResolvedHousehold, RsvpDraft } from './types';

const household: ResolvedHousehold = {
  householdId: 'example_group', displayName: 'Groep Voorbeeld', maxGuests: 2,
  guests: [{ guestId: 'example_alex', displayName: 'Alex Voorbeeld' }, { guestId: 'example_sam', displayName: 'Sam Voorbeeld' }],
  invitationVariant: 'day', mealChoiceRequired: true, currentRsvp: null,
};
const draft: RsvpDraft = {
  guests: [{ guestId: 'example_alex', attending: true, mealChoice: 'vegan' }, { guestId: 'example_sam', attending: false, mealChoice: null }],
  email: 'example@example.test', message: 'Nog niet opgeslagen bericht',
};

test('vernieuwde naamselectie behoudt alle niet-opgeslagen antwoorden voor dezelfde groep en revisie', () => {
  const before = structuredClone(draft);
  const result = reviewNameRenewal(household, draft, 0, {
    ...household,
    guests: [...household.guests].reverse(),
  });
  assert.equal(result.decision, 'resume');
  assert.equal(result.draft, draft);
  assert.deepEqual(draft, before);
});

test('een andere groep of gewijzigde groepssamenstelling vervangt nooit de invoer', () => {
  const before = structuredClone(draft);
  assert.equal(reviewNameRenewal(household, draft, 0, { ...household, householdId: 'someone_else' }).decision, 'wrong-group');
  const variations: ResolvedHousehold[] = [
    { ...household, guests: [household.guests[0]] },
    { ...household, guests: [household.guests[0], { guestId: 'replacement', displayName: 'Ander Voorbeeld' }] },
    { ...household, guests: [household.guests[0], household.guests[0]] },
    { ...household, invitationVariant: 'evening', mealChoiceRequired: false },
    { ...household, maxGuests: 3 },
  ];
  for (const refreshed of variations) {
    const result = reviewNameRenewal(household, draft, 0, refreshed);
    assert.equal(result.decision, 'changed-group');
    assert.equal(result.draft, draft);
  }
  assert.deepEqual(draft, before);
});

test('een andere opgeslagen revisie vereist expliciet herladen en behoudt de invoer tot die keuze', () => {
  const refreshed: ResolvedHousehold = {
    ...household,
    currentRsvp: {
      revision: 2, receiptNumber: 'RSVP-EXAMPLE', attending: false,
      guests: household.guests.map((guest) => ({ guestId: guest.guestId, attending: false })),
      email: 'other@example.test', message: 'Een eerdere versie', updatedAt: '2026-11-27T12:00:00Z',
    },
  };
  const result = reviewNameRenewal(household, draft, 1, refreshed);
  assert.equal(result.decision, 'conflict');
  assert.equal(result.draft, draft);
  assert.equal(result.draft.email, 'example@example.test');
  assert.equal(result.draft.guests[0].mealChoice, 'vegan');
  assert.equal(reviewNameRenewal(household, draft, 3, refreshed).decision, 'conflict');
});
