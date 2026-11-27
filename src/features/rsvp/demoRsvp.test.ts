import assert from 'node:assert/strict';
import test from 'node:test';
import { RsvpApiError } from './api';
import { invitationDemoNameSearchServices, invitationDemoServices, PUBLIC_DEMO_NAME_TICKET, resetInvitationDemo } from './demoRsvp';
import {
  LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE,
  PUBLIC_DEMO_HOUSEHOLD_CODE,
} from './householdCode';

const idempotencyKey = '11111111-1111-4111-8111-111111111111';

test('de naamdemo vindt dezelfde groep, slaat op en opent daarna dezelfde reactie voor wijzigen', async () => {
  resetInvitationDemo();
  for (const query of ['Alex', 'Sam', 'garcía']) {
    const found = await invitationDemoNameSearchServices.searchHouseholds('https://demo.invalid', query, 'demo-challenge');
    assert.equal(found.matches.length, 1);
    assert.equal(found.matches[0].nameTicket, PUBLIC_DEMO_NAME_TICKET);
  }
  const none = await invitationDemoNameSearchServices.searchHouseholds('https://demo.invalid', 'Niemand', 'demo-challenge');
  assert.equal(none.matches.length, 0);
  const credential = { type: 'nameTicket', value: PUBLIC_DEMO_NAME_TICKET } as const;
  const household = await invitationDemoServices.resolveHousehold('https://demo.invalid', credential, 'demo-challenge');
  assert.equal(household.guests.length, 2);
  const first = await invitationDemoServices.submitRsvp('https://demo.invalid', {
    credential, idempotencyKey, revision: 0, attending: true,
    guests: [{ guestId: 'demo_garcia_alex', attending: true, mealChoice: 'vegan' }, { guestId: 'demo_garcia_sam', attending: false }],
    turnstileToken: 'demo-challenge',
  });
  const reopened = await invitationDemoServices.resolveHousehold('https://demo.invalid', credential, 'demo-challenge');
  assert.equal(reopened.currentRsvp?.guests[0].mealChoice, 'vegan');
  const second = await invitationDemoServices.submitRsvp('https://demo.invalid', {
    credential, idempotencyKey: '22222222-2222-4222-8222-222222222222', revision: reopened.currentRsvp!.revision, attending: true,
    guests: [{ guestId: 'demo_garcia_alex', attending: true, mealChoice: 'fish' }, { guestId: 'demo_garcia_sam', attending: false }],
    turnstileToken: 'demo-challenge',
  });
  assert.equal(second.revision, 2);
  assert.equal(second.receiptNumber, first.receiptNumber);
});

test('de lokale Familie Garcia-demo resolveert en bewaart alleen in modulegeheugen', async () => {
  resetInvitationDemo();
  const household = await invitationDemoServices.resolveHousehold(
    'https://demo.invalid',
    { type: 'accessCode', value: PUBLIC_DEMO_HOUSEHOLD_CODE },
    'local-demo-challenge',
  );
  assert.equal(household.displayName, 'Familie Garcia');
  assert.equal(household.invitationVariant, 'day');
  assert.equal(household.mealChoiceRequired, true);
  assert.equal(household.currentRsvp, null);

  const result = await invitationDemoServices.submitRsvp('https://demo.invalid', {
    credential: { type: 'accessCode', value: PUBLIC_DEMO_HOUSEHOLD_CODE },
    idempotencyKey,
    revision: 0,
    attending: true,
    guests: [
      { guestId: 'demo_garcia_alex', attending: true, mealChoice: 'fish' },
      { guestId: 'demo_garcia_sam', attending: false },
    ],
    turnstileToken: 'local-demo-challenge',
  });
  assert.equal(result.revision, 1);
  assert.equal(result.receiptNumber, 'RSVP-DEMO01');

  const updated = await invitationDemoServices.resolveHousehold(
    'https://demo.invalid',
    { type: 'accessCode', value: PUBLIC_DEMO_HOUSEHOLD_CODE },
    'local-demo-challenge',
  );
  assert.equal(updated.currentRsvp?.revision, 1);
  assert.equal(updated.currentRsvp?.guests[0].mealChoice, 'fish');
});

test('de bestaande lange Familie Garcia-code blijft werken voor invullen en wijzigen', async () => {
  resetInvitationDemo();
  const household = await invitationDemoServices.resolveHousehold(
    'https://demo.invalid',
    { type: 'accessCode', value: LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE.toLowerCase() },
    'local-demo-challenge',
  );
  assert.equal(household.currentRsvp, null);

  const first = await invitationDemoServices.submitRsvp('https://demo.invalid', {
    credential: { type: 'accessCode', value: LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE },
    idempotencyKey,
    revision: 0,
    attending: true,
    guests: [
      { guestId: 'demo_garcia_alex', attending: true, mealChoice: 'vegetarian' },
      { guestId: 'demo_garcia_sam', attending: false },
    ],
    turnstileToken: 'local-demo-challenge',
  });
  assert.equal(first.revision, 1);

  const reopened = await invitationDemoServices.resolveHousehold(
    'https://demo.invalid',
    { type: 'accessCode', value: LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE },
    'local-demo-challenge',
  );
  assert.equal(reopened.currentRsvp?.revision, 1);

  const changed = await invitationDemoServices.submitRsvp('https://demo.invalid', {
    credential: { type: 'accessCode', value: LEGACY_PUBLIC_DEMO_HOUSEHOLD_CODE },
    idempotencyKey: '22222222-2222-4222-8222-222222222222',
    revision: 1,
    attending: true,
    guests: [
      { guestId: 'demo_garcia_alex', attending: true, mealChoice: 'vegan' },
      { guestId: 'demo_garcia_sam', attending: true, mealChoice: 'fish' },
    ],
    turnstileToken: 'local-demo-challenge',
  });
  assert.equal(changed.revision, 2);
  assert.equal(changed.receiptNumber, first.receiptNumber);
});

test('de lokale demo geeft voor iedere andere code dezelfde generieke fout', async () => {
  await assert.rejects(
    invitationDemoServices.resolveHousehold(
      'https://demo.invalid',
      { type: 'accessCode', value: '7K3MP-9TWX4-HCQ2R-DV6FX' },
      'local-demo-challenge',
    ),
    (error: unknown) => error instanceof RsvpApiError && error.code === 'INVITATION_INVALID',
  );
});

test('de lokale demo weigert dubbele gastregels', async () => {
  resetInvitationDemo();
  await assert.rejects(
    invitationDemoServices.submitRsvp('https://demo.invalid', {
      credential: { type: 'accessCode', value: PUBLIC_DEMO_HOUSEHOLD_CODE },
      idempotencyKey,
      revision: 0,
      attending: true,
      guests: [
        { guestId: 'demo_garcia_alex', attending: true, mealChoice: 'fish' },
        { guestId: 'demo_garcia_alex', attending: true, mealChoice: 'fish' },
      ],
      turnstileToken: 'local-demo-challenge',
    }),
    (error: unknown) => error instanceof RsvpApiError && error.code === 'VALIDATION_FAILED',
  );
});
