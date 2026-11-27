import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { prepareStaticRoster } from './prepare-static-roster.mjs';

const source = () => ({ version: 1, groups: [{
  householdId: 'group_a', familyNames: ['Voorbeeld'], invitationVariant: 'day',
  guests: [{ guestId: 'person_a', firstName: 'Robin' }],
}] });

test('publieke lijst levert dezelfde blijvende IDs voor de bestaande veilige import', () => {
  const prepared = prepareStaticRoster(source());
  assert.match(prepared.text, /group_a\tperson_a\tRobin\tVoorbeeld\tday\tTRUE\t\n/u);
  assert.equal(prepared.summary.readyGroups, 1);
  assert.equal(prepared.summary.heldGroups, 0);
});

test('export weigert credentials, antwoorden en beheernotities in de publieke lijst', () => {
  for (const extra of ['accessCode', 'inviteToken', 'email', 'reviewNote', 'currentRsvp']) {
    const roster = source();
    roster.groups[0][extra] = 'mag niet openbaar';
    assert.throws(() => prepareStaticRoster(roster));
  }
  const roster = source();
  roster.groups[0].guests[0].message = 'privé';
  assert.throws(() => prepareStaticRoster(roster));
});

test('ook vaste lijsten weigeren dubbele IDs, ambiguë labels en spreadsheetformules', () => {
  const duplicate = source();
  duplicate.groups.push(structuredClone(duplicate.groups[0]));
  assert.throws(() => prepareStaticRoster(duplicate));
  const ambiguous = source();
  ambiguous.groups.push({ ...structuredClone(ambiguous.groups[0]), householdId: 'group_b',
    guests: [{ guestId: 'person_b', firstName: 'Robin' }] });
  assert.throws(() => prepareStaticRoster(ambiguous));
  const formula = source();
  formula.groups[0].guests[0].firstName = '=IMPORTDATA()';
  assert.throws(() => prepareStaticRoster(formula));
});

test('werkelijke publieke roster blijft importeerbaar en bevat alleen toegestane velden', async () => {
  const roster = JSON.parse(await readFile(new URL('../src/content/rsvpRoster.json', import.meta.url), 'utf8'));
  const prepared = prepareStaticRoster(roster);
  assert.ok(prepared.summary.readyGroups > 0);
  assert.equal(prepared.summary.groups, prepared.summary.readyGroups);
});
