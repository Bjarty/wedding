import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertPrivatePath, prepareNameRoster } from './prepare-name-roster.mjs';

const publicRosterUrl = new URL('../src/content/rsvpRoster.json', import.meta.url);

/** The deliberately public list contains no credentials, answers or review notes. */
export function prepareStaticRoster(source) {
  const keysAre = (value, keys) => value !== null && typeof value === 'object' &&
    !Array.isArray(value) && Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key));
  if (!keysAre(source, ['version', 'groups']) || source.version !== 1 || !Array.isArray(source.groups)) {
    throw new Error('Ongeldige publieke gastenlijst.');
  }
  for (const group of source.groups) {
    if (!keysAre(group, ['householdId', 'familyNames', 'invitationVariant', 'guests']) ||
      !Array.isArray(group.guests) ||
      group.guests.some((guest) => !keysAre(guest, ['guestId', 'firstName']))) {
      throw new Error('De publieke gastenlijst bevat onbekende of ontbrekende velden.');
    }
  }
  return prepareNameRoster({
    version: 1,
    groups: source.groups.map((group) => ({ ...group, searchEnabled: true, reviewNote: '' })),
  });
}

export async function exportStaticRoster(output) {
  const prepared = prepareStaticRoster(JSON.parse(await readFile(publicRosterUrl, 'utf8')));
  const outputPath = assertPrivatePath(output);
  await mkdir(dirname(outputPath), { recursive: true });
  assertPrivatePath(resolve(await realpath(dirname(outputPath)), outputPath.split(/[\\/]/u).at(-1)));
  await writeFile(outputPath, prepared.text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  return prepared.summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out') {
    console.error('Gebruik: node scripts/prepare-static-roster.mjs --out <nieuw-private-paste.txt>');
    process.exitCode = 1;
  } else {
    try {
      console.log(JSON.stringify(await exportStaticRoster(args[1])));
    } catch {
      console.error('Export mislukt. Controleer de publieke lijst en kies een nieuw bestand in .local/rsvp.');
      process.exitCode = 1;
    }
  }
}
