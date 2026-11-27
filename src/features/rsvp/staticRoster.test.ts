import assert from 'node:assert/strict';
import test from 'node:test';
import { parseStaticRoster, searchStaticRoster, staticGroupDisplayName, type StaticRosterGroup } from './staticRoster';

const examples: StaticRosterGroup[] = [
  {
    householdId: 'example-day',
    familyNames: ['Voorbeeld', 'de Test'],
    invitationVariant: 'day',
    guests: [{ guestId: 'example-alex', firstName: 'Alex' }, { guestId: 'example-zoe', firstName: 'Zoë' }],
  },
  {
    householdId: 'example-evening',
    familyNames: ['Voorbeeld'],
    invitationVariant: 'evening',
    guests: [{ guestId: 'example-sam', firstName: 'Sam' }],
  },
  {
    householdId: 'example-no-surname',
    familyNames: [],
    invitationVariant: 'day',
    guests: [{ guestId: 'example-ines', firstName: 'Inès' }],
  },
];

test('de openbare lijst bevat alleen expliciete publieke velden en unieke groepen/personen', () => {
  const roster = { version: 1, groups: examples };
  assert.deepEqual(parseStaticRoster(roster), roster);
  assert.equal(staticGroupDisplayName(examples[0]), 'Alex & Zoë — Voorbeeld / de Test');
  assert.equal(staticGroupDisplayName(examples[2]), 'Inès');
  assert.throws(() => parseStaticRoster({ ...roster, source: 'private' }));
  for (const extra of ['email', 'address', 'reviewNote', 'searchEnabled', 'tokenHash']) {
    assert.throws(() => parseStaticRoster({ version: 1, groups: [{ ...examples[0], [extra]: 'private' }] }));
  }
  assert.throws(() => parseStaticRoster({ version: 2, groups: examples }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [examples[0], examples[0]] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [examples[0], { ...examples[1], guests: examples[0].guests }] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [{ ...examples[0], invitationVariant: 'maybe' }] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [{ ...examples[0], guests: [] }] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [{ ...examples[0], familyNames: ['Voorbeeld?'] }] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [{ ...examples[0], familyNames: ['Voorbéeld', 'VOORBEELD'] }] }));
  assert.throws(() => parseStaticRoster({ version: 1, groups: [{ ...examples[0], householdId: '../private' }] }));
});

test('twee ononderscheidbare groepsnamen worden afgewezen voordat gasten kunnen kiezen', () => {
  assert.throws(() => parseStaticRoster({ version: 1, groups: [examples[2], {
    ...examples[2], householdId: 'example-other', guests: [{ guestId: 'example-other-guest', firstName: 'INES' }],
  }] }));
});

test('zoeken vindt ieder groepslid en iedere familienaam zonder hoofdletters of accenten', () => {
  for (const query of ['ALex', 'zoe', 'ZOE\u0308', 'de test', 'alex voorbeeld', ' zoë ']) {
    assert.deepEqual(searchStaticRoster(query, examples), {
      matches: [{ householdId: 'example-day', displayName: 'Alex & Zoë — Voorbeeld / de Test' }], tooMany: false,
    });
  }
  assert.deepEqual(searchStaticRoster('ines', examples).matches, [{ householdId: 'example-no-surname', displayName: 'Inès' }]);
  assert.deepEqual(searchStaticRoster('voorbeeld', examples).matches.map((group) => group.householdId), ['example-day', 'example-evening']);
});

test('zoeken ondersteunt samengestelde voornamen en apostrofs in familienamen', () => {
  const groups: StaticRosterGroup[] = [{ householdId: 'example-punctuation', invitationVariant: 'day',
    familyNames: ['O’Voorbeeld'], guests: [{ guestId: 'example-double', firstName: 'Marie-Lou' }] }];
  for (const query of ['marie lou', 'marie-lou', 'ovoorbeeld', "o'voorbeeld", 'O’Voorbeeld']) {
    assert.equal(searchStaticRoster(query, groups).matches.length, 1);
  }
});

test('een lege, te korte of ongeldige naam geeft geen lijst terug', () => {
  for (const query of ['', 'A', ' A ', '-.', '12', 'A?', 'x'.repeat(81), 'onbekende naam']) {
    assert.deepEqual(searchStaticRoster(query, examples), { matches: [], tooMany: false });
  }
});

test('meer dan acht treffers vraagt om een specifiekere naam zonder afgekorte lijst', () => {
  const names = ['Amber', 'Berit', 'Cleo', 'Dara', 'Ellis', 'Faye', 'Guus', 'Hugo', 'Iris'];
  const groups = Array.from({ length: 9 }, (_, index): StaticRosterGroup => ({
    householdId: `example-${index}`, invitationVariant: 'day', familyNames: ['Voorbeeld'],
    guests: [{ guestId: `example-person-${index}`, firstName: `Alex ${names[index]}` }],
  }));
  assert.equal(searchStaticRoster('Voorbeeld', groups.slice(0, 8)).matches.length, 8);
  assert.deepEqual(searchStaticRoster('Voorbeeld', groups), { matches: [], tooMany: true });
  assert.deepEqual(searchStaticRoster('Alex Amber', groups).matches.map((group) => group.householdId), ['example-0']);
});

test('typen en zoeken werkt geheel lokaal zonder netwerkverzoek', () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Zoeken mag geen netwerk gebruiken.'); };
  try {
    assert.equal(searchStaticRoster('zoe', examples).matches[0]?.householdId, 'example-day');
  } finally {
    globalThis.fetch = previousFetch;
  }
});
