import rosterSource from '../../content/rsvpRoster.json';
import { isValidNameQuery } from './nameSearch';

export interface StaticRosterGroup {
  householdId: string;
  familyNames: string[];
  invitationVariant: 'day' | 'evening';
  guests: Array<{ guestId: string; firstName: string }>;
}

export interface StaticRoster {
  version: 1;
  groups: StaticRosterGroup[];
}

export interface StaticNameMatch {
  householdId: string;
  displayName: string;
}

export interface StaticNameSearchResult {
  matches: StaticNameMatch[];
  tooMany: boolean;
}

const idPattern = /^[A-Za-z0-9_-]{1,64}$/u;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const validName = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 80 &&
  /^[\p{L}\p{M} '\u2019.\-]+$/u.test(value) && /\p{L}/u.test(value);

export const normalizeStaticName = (value: string): string => value
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .toLowerCase()
  .replace(/[\u2019']/gu, '')
  .replace(/[.\-]/gu, ' ')
  .replace(/\s+/gu, ' ')
  .trim();

export const staticGroupDisplayName = (group: StaticRosterGroup): string =>
  `${group.guests.map((guest) => guest.firstName).join(' & ')}${group.familyNames.length ? ` — ${group.familyNames.join(' / ')}` : ''}`;

/** The committed roster is intentionally public. Reject accidental private metadata. */
export const parseStaticRoster = (value: unknown): StaticRoster => {
  const invalid = (): never => { throw new Error('De openbare RSVP-lijst heeft een ongeldige indeling.'); };
  if (!isRecord(value) || !exactKeys(value, ['version', 'groups']) || value.version !== 1 ||
    !Array.isArray(value.groups) || value.groups.length < 1 || value.groups.length > 200) return invalid();
  const groupIds = new Set<string>();
  const guestIds = new Set<string>();
  const labels = new Set<string>();
  const groups = value.groups.map((candidate): StaticRosterGroup => {
    if (!isRecord(candidate) || !exactKeys(candidate, ['householdId', 'familyNames', 'invitationVariant', 'guests']) ||
      typeof candidate.householdId !== 'string' || !idPattern.test(candidate.householdId) || groupIds.has(candidate.householdId) ||
      !Array.isArray(candidate.familyNames) || candidate.familyNames.length > 10 || !candidate.familyNames.every(validName) ||
      (candidate.invitationVariant !== 'day' && candidate.invitationVariant !== 'evening') ||
      !Array.isArray(candidate.guests) || candidate.guests.length < 1 || candidate.guests.length > 20) return invalid();
    groupIds.add(candidate.householdId);
    if (new Set(candidate.familyNames.map(normalizeStaticName)).size !== candidate.familyNames.length) return invalid();
    const guests = candidate.guests.map((guest) => {
      if (!isRecord(guest) || !exactKeys(guest, ['guestId', 'firstName']) ||
        typeof guest.guestId !== 'string' || !idPattern.test(guest.guestId) || guestIds.has(guest.guestId) ||
        !validName(guest.firstName)) return invalid();
      guestIds.add(guest.guestId);
      return { guestId: guest.guestId, firstName: guest.firstName.normalize('NFC') };
    });
    const group: StaticRosterGroup = {
      householdId: candidate.householdId,
      familyNames: candidate.familyNames.map((name) => name.normalize('NFC')),
      invitationVariant: candidate.invitationVariant,
      guests,
    };
    const label = staticGroupDisplayName(group);
    const normalizedLabel = normalizeStaticName(label);
    if (label.length > 160 || labels.has(normalizedLabel)) return invalid();
    labels.add(normalizedLabel);
    return group;
  });
  return { version: 1, groups };
};

export const publicRsvpRoster = parseStaticRoster(rosterSource);

/** No network, challenge or identifier lookup is needed while typing. */
export const searchStaticRoster = (
  query: string,
  groups: readonly StaticRosterGroup[] = publicRsvpRoster.groups,
): StaticNameSearchResult => {
  if (!isValidNameQuery(query)) return { matches: [], tooMany: false };
  const terms = normalizeStaticName(query).split(' ').filter(Boolean);
  const matches = groups.filter((group) => {
    const searchable = normalizeStaticName([
      ...group.guests.map((guest) => guest.firstName),
      ...group.familyNames,
    ].join(' '));
    return terms.every((term) => searchable.includes(term));
  }).map((group) => ({ householdId: group.householdId, displayName: staticGroupDisplayName(group) }));
  if (matches.length > 8) return { matches: [], tooMany: true };
  matches.sort((left, right) => left.displayName.localeCompare(right.displayName, 'nl', { sensitivity: 'base' }));
  return { matches, tooMany: false };
};
