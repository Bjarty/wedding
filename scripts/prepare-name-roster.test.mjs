import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { assertPrivatePath, prepareNameRoster, preparePrivateRosterFile } from './prepare-name-roster.mjs';

const group = (overrides = {}) => ({
  householdId: 'synthetic_group_1', familyNames: ['Voorbeeld', 'Anders'],
  invitationVariant: 'day', searchEnabled: true, reviewNote: '',
  guests: [{ guestId: 'synthetic_person_1', firstName: 'Één' }, { guestId: 'synthetic_person_2', firstName: 'Twee' }],
  ...overrides,
});
const roster = (groups = [group()]) => ({ version: 1, groups });

test('groepeert personen zonder achternamen toe te wijzen en bewaart accenten', () => {
  const result = prepareNameRoster(roster());
  assert.deepEqual(result.summary, { groups: 1, people: 2, readyGroups: 1, readyPeople: 2, heldGroups: 0, heldPeople: 0 });
  assert.match(result.text, /Één\tVoorbeeld, Anders\tday\tTRUE/u);
  assert.match(result.text, /Twee\tVoorbeeld, Anders\tday\tTRUE/u);
  assert.equal(prepareNameRoster(roster([group({ familyNames: [] })])).summary.readyPeople, 2);
});

test('review en expliciet uitschakelen sluiten de hele groep uit', () => {
  for (const change of [{ reviewNote: 'Variant nog bevestigen' }, { searchEnabled: false }]) {
    const result = prepareNameRoster(roster([group(change)]));
    assert.equal(result.summary.readyGroups, 0);
    assert.equal(result.summary.heldPeople, 2);
    assert.doesNotMatch(result.text, /\tTRUE\t/u);
  }
});

test('weigert dubbele IDs, ononderscheidbare actieve groepen en onveilige cellen', () => {
  assert.throws(() => prepareNameRoster(roster([group(), group()])));
  assert.throws(() => prepareNameRoster(roster([group({ guests: [group().guests[0], group().guests[0]] })])));
  const duplicateLabel = group({ householdId: 'synthetic_group_2', guests: group().guests.map((guest) => ({ ...guest, guestId: guest.guestId + '_other' })) });
  assert.throws(() => prepareNameRoster(roster([group(), duplicateLabel])));
  assert.equal(prepareNameRoster(roster([group({ searchEnabled: false }), { ...duplicateLabel, searchEnabled: false }])).summary.heldGroups, 2);
  for (const firstName of ['=HYPERLINK("example")', '+cmd', '@value', '-formula', 'Naam\tcel', 'Naam\ncel']) {
    assert.throws(() => prepareNameRoster(roster([group({ guests: [{ guestId: 'synthetic_person_1', firstName }] })])));
  }
});

test('hanteert dezelfde aliaslimieten als de Sheet-import', () => {
  assert.throws(() => prepareNameRoster(roster([group({ familyNames: Array.from({ length: 11 }, (_, i) => `A${i}`) })])));
  assert.throws(() => prepareNameRoster(roster([group({
    familyNames: Array.from({ length: 10 }, (_, i) => `A${i}`),
    guests: Array.from({ length: 10 }, (_, i) => ({ guestId: `synthetic_${i}`, firstName: `N${i}` })),
  })])));
});

test('houdt importbestanden privaat en overschrijft nooit een bestand', async () => {
  assert.throws(() => assertPrivatePath(resolve('public/guests.json')));
  assert.throws(() => assertPrivatePath(resolve('src/guests.json')));
  assertPrivatePath(resolve('.local/rsvp/example.json'));
  const directory = await mkdtemp(resolve(tmpdir(), 'rsvp-roster-'));
  try {
    const input = resolve(directory, 'input.json');
    const output = resolve(directory, 'paste.txt');
    await writeFile(input, JSON.stringify(roster()), 'utf8');
    assert.equal((await preparePrivateRosterFile(input, output)).people, 2);
    const original = await readFile(output, 'utf8');
    await assert.rejects(preparePrivateRosterFile(input, output));
    assert.equal(await readFile(output, 'utf8'), original);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
