import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const rosterHeaders = [
  'householdId', 'guestId', 'firstName', 'familyNames',
  'invitationVariant', 'searchEnabled', 'reviewNote',
];
const idPattern = /^[A-Za-z0-9_-]{1,64}$/u;
const unsafeCell = /[\u0000-\u001f\u007f]|^[=+@-]/u;
const normalizeLabel = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/gu, ' ').trim();
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const assertKeys = (value, keys) => {
  if (!isRecord(value) || Object.keys(value).some((key) => !keys.includes(key))) {
    throw new Error('De gastenlijst bevat onbekende velden of een ongeldige structuur.');
  }
};
const textCell = (value, max, allowEmpty = false) => {
  if (typeof value !== 'string') throw new Error('Een tekstveld ontbreekt.');
  const text = value.normalize('NFC').trim();
  if ((!allowEmpty && !text) || text.length > max || unsafeCell.test(text)) {
    throw new Error('Een tekstveld is leeg, te lang of bevat onveilige tekens.');
  }
  return text;
};

/** Validates private input without guessing surname ownership or merging groups. */
export function prepareNameRoster(source) {
  assertKeys(source, ['version', 'source', 'groups']);
  if (source.version !== 1 || !Array.isArray(source.groups) || source.groups.length < 1 || source.groups.length > 200) {
    throw new Error('Verwacht versie 1 met één tot tweehonderd groepen.');
  }
  const householdIds = new Set();
  const guestIds = new Set();
  const enabledLabels = new Set();
  const rows = [];
  const summary = { groups: 0, people: 0, readyGroups: 0, readyPeople: 0, heldGroups: 0, heldPeople: 0 };
  for (const group of source.groups) {
    assertKeys(group, ['householdId', 'familyNames', 'invitationVariant', 'searchEnabled', 'reviewNote', 'guests']);
    if (!idPattern.test(group.householdId ?? '') || householdIds.has(group.householdId)) {
      throw new Error('Groeps-ID ontbreekt, is ongeldig of is dubbel gebruikt.');
    }
    householdIds.add(group.householdId);
    if (!['day', 'evening'].includes(group.invitationVariant) || typeof group.searchEnabled !== 'boolean') {
      throw new Error('Iedere groep vereist day/evening en een expliciete zoektoestemming.');
    }
    if (!Array.isArray(group.familyNames) || group.familyNames.length > 10) {
      throw new Error('Familienamen moeten een lijst met maximaal tien groepsaliassen zijn.');
    }
    const familyNames = group.familyNames.map((name) => textCell(name, 80));
    if (familyNames.some((name) => name.includes(',')) || new Set(familyNames.map(normalizeLabel)).size !== familyNames.length) {
      throw new Error('Vermeld iedere familienaam als aparte, unieke groepsalias.');
    }
    const reviewNote = textCell(group.reviewNote, 500, true);
    if (!Array.isArray(group.guests) || group.guests.length < 1 || group.guests.length > 20) {
      throw new Error('Iedere groep vereist één tot twintig personen.');
    }
    const guests = group.guests.map((guest) => {
      assertKeys(guest, ['guestId', 'firstName']);
      if (!idPattern.test(guest.guestId ?? '') || guestIds.has(guest.guestId)) {
        throw new Error('Persoons-ID ontbreekt, is ongeldig of is dubbel gebruikt.');
      }
      guestIds.add(guest.guestId);
      return { guestId: guest.guestId, firstName: textCell(guest.firstName, 80) };
    });
    const label = guests.map((guest) => guest.firstName).join(' & ') + (familyNames.length ? ` — ${familyNames.join(' / ')}` : '');
    if (label.length > 160) throw new Error('Een groepsnaam overschrijdt de limiet van 160 tekens.');
    const searchNames = new Set([
      ...guests.map((guest) => guest.firstName), ...familyNames,
      ...guests.flatMap((guest) => familyNames.map((name) => `${guest.firstName} ${name}`)),
    ]);
    if (searchNames.size > 100) throw new Error('Een groep heeft meer dan honderd zoeknamen.');
    const ready = group.searchEnabled && reviewNote === '';
    if (ready && enabledLabels.has(normalizeLabel(label))) {
      throw new Error('Twee actieve groepen hebben dezelfde herkenningsnaam. Maak het onderscheid duidelijk of zet ze in review.');
    }
    if (ready) enabledLabels.add(normalizeLabel(label));
    summary.groups += 1;
    summary.people += guests.length;
    summary[ready ? 'readyGroups' : 'heldGroups'] += 1;
    summary[ready ? 'readyPeople' : 'heldPeople'] += guests.length;
    for (const guest of guests) {
      rows.push([
        group.householdId, guest.guestId, guest.firstName, familyNames.join(', '),
        group.invitationVariant, ready ? 'TRUE' : 'FALSE', reviewNote,
      ]);
    }
  }
  return { text: [rosterHeaders, ...rows].map((row) => row.join('\t')).join('\n') + '\n', summary };
}

const within = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

export function assertPrivatePath(path) {
  const absolute = resolve(path);
  if (within(repository, absolute) && !within(resolve(repository, '.local/rsvp'), absolute)) {
    throw new Error('Bewaar de echte gastenlijst buiten de repository of in de genegeerde map .local/rsvp.');
  }
  return absolute;
}

export async function preparePrivateRosterFile(input, output) {
  const sourcePath = assertPrivatePath(input);
  const outputPath = assertPrivatePath(output);
  const actualInput = await realpath(sourcePath);
  assertPrivatePath(actualInput);
  let source;
  try {
    source = JSON.parse(await readFile(actualInput, 'utf8'));
  } catch {
    throw new Error('De private invoer kan niet als JSON worden gelezen.');
  }
  const prepared = prepareNameRoster(source);
  await mkdir(dirname(outputPath), { recursive: true });
  assertPrivatePath(resolve(await realpath(dirname(outputPath)), outputPath.split(/[\\/]/u).at(-1)));
  // Never replace an existing delivery, draft, or reviewed roster file.
  await writeFile(outputPath, prepared.text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return prepared.summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--out') {
    console.error('Gebruik: node scripts/prepare-name-roster.mjs --input <private.json> --out <nieuw-private-paste.txt>');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await preparePrivateRosterFile(args[1], args[3])));
    } catch {
      // No names, query values, input paths or partial input are logged.
      console.error('Gastenlijst niet aangemaakt. Controleer structuur, unieke IDs, reviewstatus, private paden en een nog niet bestaand uitvoerbestand.');
      process.exitCode = 1;
    }
  }
}
