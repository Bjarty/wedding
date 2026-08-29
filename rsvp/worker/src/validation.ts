import {
  LIMITS,
  MEAL_CHOICES,
  type FieldIssue,
  type GuestSubmission,
  type MealChoice,
  type ResolveRequest,
  type SubmitRequest,
} from './contract.js';

export type ParseResult<T> = { ok: true; value: T } | { ok: false; issues: FieldIssue[] };

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UNSAFE_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const addUnknownFieldIssue = (
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  issues: FieldIssue[],
) => {
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    issues.push({ path, code: 'unknown_field' });
  }
};

const normalizeText = (value: string) => value.normalize('NFC').trim();

const requiredString = (
  record: Record<string, unknown>,
  key: string,
  options: { min: number; max: number; pattern?: RegExp },
  issues: FieldIssue[],
): string | undefined => {
  const value = record[key];
  if (value === undefined || value === null || value === '') {
    issues.push({ path: key, code: 'required' });
    return undefined;
  }
  if (typeof value !== 'string') {
    issues.push({ path: key, code: 'invalid_type' });
    return undefined;
  }

  const normalized = normalizeText(value);
  if (normalized.length < options.min) {
    issues.push({ path: key, code: 'too_short' });
    return undefined;
  }
  if (normalized.length > options.max) {
    issues.push({ path: key, code: 'too_long' });
    return undefined;
  }
  if (options.pattern !== undefined && !options.pattern.test(normalized)) {
    issues.push({ path: key, code: 'invalid_format' });
    return undefined;
  }
  return normalized;
};

const optionalString = (
  record: Record<string, unknown>,
  key: string,
  options: { max: number; pattern?: RegExp; allowNewlines?: boolean },
  issues: FieldIssue[],
): string | undefined => {
  const value = record[key];
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    issues.push({ path: key, code: 'invalid_type' });
    return undefined;
  }

  const normalized = normalizeText(value);
  if (normalized === '') return undefined;
  if (normalized.length > options.max) {
    issues.push({ path: key, code: 'too_long' });
    return undefined;
  }
  if (UNSAFE_CONTROL_PATTERN.test(normalized)) {
    issues.push({ path: key, code: 'invalid_format' });
    return undefined;
  }
  if (options.allowNewlines === false && /[\r\n]/u.test(normalized)) {
    issues.push({ path: key, code: 'invalid_format' });
    return undefined;
  }
  if (options.pattern !== undefined && !options.pattern.test(normalized)) {
    issues.push({ path: key, code: 'invalid_format' });
    return undefined;
  }
  return normalized;
};

const parseGuest = (value: unknown, index: number, issues: FieldIssue[]): GuestSubmission | undefined => {
  const basePath = `guests[${index}]`;
  if (!isRecord(value)) {
    issues.push({ path: basePath, code: 'invalid_type' });
    return undefined;
  }
  addUnknownFieldIssue(value, new Set(['guestId', 'attending', 'mealChoice']), basePath, issues);

  const guestIssues: FieldIssue[] = [];
  const guestId = requiredString(
    value,
    'guestId',
    { min: 1, max: LIMITS.idMax, pattern: OPAQUE_ID_PATTERN },
    guestIssues,
  );
  const attendingValue = value.attending;
  let attending: boolean | undefined;
  if (typeof attendingValue !== 'boolean') {
    guestIssues.push({ path: 'attending', code: attendingValue === undefined ? 'required' : 'invalid_type' });
  } else {
    attending = attendingValue;
  }

  const mealValue = value.mealChoice;
  let mealChoice: MealChoice | undefined;
  if (attending === true) {
    if (typeof mealValue !== 'string') {
      guestIssues.push({ path: 'mealChoice', code: mealValue === undefined ? 'required' : 'invalid_type' });
    } else if (!(MEAL_CHOICES as readonly string[]).includes(mealValue)) {
      guestIssues.push({ path: 'mealChoice', code: 'invalid_format' });
    } else {
      mealChoice = mealValue as MealChoice;
    }
  } else if (mealValue !== undefined) {
    guestIssues.push({ path: 'mealChoice', code: 'inconsistent' });
  }

  issues.push(
    ...guestIssues.map((issue) => ({
      path: `${basePath}.${issue.path}`,
      code: issue.code,
    })),
  );

  if (guestId === undefined || attending === undefined || guestIssues.length > 0) return undefined;
  return mealChoice === undefined ? { guestId, attending } : { guestId, attending, mealChoice };
};

export const parseResolveRequest = (value: unknown): ParseResult<ResolveRequest> => {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: 'body', code: 'invalid_type' }] };
  }

  const issues: FieldIssue[] = [];
  addUnknownFieldIssue(value, new Set(['inviteToken', 'turnstileToken']), 'body', issues);
  const inviteToken = requiredString(
    value,
    'inviteToken',
    { min: LIMITS.inviteTokenMin, max: LIMITS.inviteTokenMax, pattern: INVITE_TOKEN_PATTERN },
    issues,
  );
  const turnstileToken = requiredString(
    value,
    'turnstileToken',
    { min: 1, max: LIMITS.turnstileTokenMax },
    issues,
  );

  if (issues.length > 0 || inviteToken === undefined || turnstileToken === undefined) {
    return { ok: false, issues };
  }
  return { ok: true, value: { inviteToken, turnstileToken } };
};

export const parseSubmitRequest = (value: unknown): ParseResult<SubmitRequest> => {
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: 'body', code: 'invalid_type' }] };
  }

  const issues: FieldIssue[] = [];
  addUnknownFieldIssue(
    value,
    new Set([
      'inviteToken',
      'idempotencyKey',
      'revision',
      'attending',
      'guests',
      'email',
      'message',
      'turnstileToken',
    ]),
    'body',
    issues,
  );

  const inviteToken = requiredString(
    value,
    'inviteToken',
    { min: LIMITS.inviteTokenMin, max: LIMITS.inviteTokenMax, pattern: INVITE_TOKEN_PATTERN },
    issues,
  );
  const idempotencyKey = requiredString(
    value,
    'idempotencyKey',
    { min: 36, max: 36, pattern: UUID_PATTERN },
    issues,
  );
  const turnstileToken = requiredString(
    value,
    'turnstileToken',
    { min: 1, max: LIMITS.turnstileTokenMax },
    issues,
  );

  let revision: number | undefined;
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    issues.push({ path: 'revision', code: value.revision === undefined ? 'required' : 'invalid_format' });
  } else {
    revision = value.revision as number;
  }

  let attending: boolean | undefined;
  if (typeof value.attending !== 'boolean') {
    issues.push({ path: 'attending', code: value.attending === undefined ? 'required' : 'invalid_type' });
  } else {
    attending = value.attending;
  }

  const guests: GuestSubmission[] = [];
  if (!Array.isArray(value.guests)) {
    issues.push({ path: 'guests', code: value.guests === undefined ? 'required' : 'invalid_type' });
  } else if (value.guests.length === 0) {
    issues.push({ path: 'guests', code: 'too_short' });
  } else if (value.guests.length > LIMITS.householdGuestsMax) {
    issues.push({ path: 'guests', code: 'too_many' });
  } else {
    value.guests.forEach((guest, index) => {
      const parsed = parseGuest(guest, index, issues);
      if (parsed !== undefined) guests.push(parsed);
    });
  }

  if (new Set(guests.map((guest) => guest.guestId)).size !== guests.length) {
    issues.push({ path: 'guests', code: 'duplicate' });
  }
  if (attending === true && !guests.some((guest) => guest.attending)) {
    issues.push({ path: 'attending', code: 'inconsistent' });
  }
  if (attending === false && guests.some((guest) => guest.attending)) {
    issues.push({ path: 'attending', code: 'inconsistent' });
  }

  const email = optionalString(
    value,
    'email',
    { max: LIMITS.emailMax, pattern: EMAIL_PATTERN, allowNewlines: false },
    issues,
  );
  const message = optionalString(value, 'message', { max: LIMITS.messageMax }, issues);

  if (
    issues.length > 0 ||
    inviteToken === undefined ||
    idempotencyKey === undefined ||
    revision === undefined ||
    attending === undefined ||
    turnstileToken === undefined
  ) {
    return { ok: false, issues };
  }

  const parsed: SubmitRequest = {
    inviteToken,
    idempotencyKey,
    revision,
    attending,
    guests,
    turnstileToken,
  };
  if (email !== undefined) parsed.email = email;
  if (message !== undefined) parsed.message = message;
  return { ok: true, value: parsed };
};
