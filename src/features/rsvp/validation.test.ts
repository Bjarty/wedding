import assert from 'node:assert/strict';
import test from 'node:test';
import type { ResolvedHousehold, RsvpDraft } from './types';
import {
  createDraft,
  hasDraftErrors,
  normalizeOptionalText,
  toGuestSubmissions,
  validateDraft,
} from './validation';

const household: ResolvedHousehold = {
  householdId: 'household_1',
  displayName: 'Lisette en Bjarty',
  maxGuests: 2,
  guests: [
    { guestId: 'guest_1', displayName: 'Lisette' },
    { guestId: 'guest_2', displayName: 'Bjarty' },
  ],
  currentRsvp: null,
};

test('een nieuw huishouden begint zonder vooraf gekozen antwoorden', () => {
  assert.deepEqual(createDraft(household), {
    guests: [
      { guestId: 'guest_1', attending: null, mealChoice: null },
      { guestId: 'guest_2', attending: null, mealChoice: null },
    ],
    email: '',
    message: '',
  });
});

test('aanwezigheid en maaltijd zijn per persoon verplicht', () => {
  const draft: RsvpDraft = {
    guests: [
      { guestId: 'guest_1', attending: true, mealChoice: null },
      { guestId: 'guest_2', attending: null, mealChoice: null },
    ],
    email: '',
    message: '',
  };
  const errors = validateDraft(draft);

  assert.equal(errors.guestMeal.guest_1, 'Kies een maaltijd.');
  assert.equal(errors.guestAttendance.guest_2, 'Kies of deze gast erbij is.');
  assert.equal(hasDraftErrors(errors), true);
});

test('afwezigen worden zonder maaltijd verstuurd', () => {
  const draft: RsvpDraft = {
    guests: [
      { guestId: 'guest_1', attending: true, mealChoice: 'vegetarian' },
      { guestId: 'guest_2', attending: false, mealChoice: null },
    ],
    email: '  gast@example.nl  ',
    message: '  Tot dan!  ',
  };

  assert.equal(hasDraftErrors(validateDraft(draft)), false);
  assert.deepEqual(toGuestSubmissions(draft), [
    { guestId: 'guest_1', attending: true, mealChoice: 'vegetarian' },
    { guestId: 'guest_2', attending: false },
  ]);
  assert.equal(normalizeOptionalText(draft.email), 'gast@example.nl');
  assert.equal(normalizeOptionalText(draft.message), 'Tot dan!');
});

test('een ongeldig optioneel e-mailadres wordt gemarkeerd', () => {
  const draft: RsvpDraft = {
    guests: [{ guestId: 'guest_1', attending: false, mealChoice: null }],
    email: 'geen-adres',
    message: '',
  };

  assert.match(validateDraft(draft).email ?? '', /geldig e-mailadres/u);
});
