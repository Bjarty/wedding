import {
  ACCESS_CODE_ALPHABET,
  API_VERSION,
  INVITATION_VARIANTS,
  LIMITS,
  MEAL_CHOICES,
  type CurrentRsvp,
  type CredentialHash,
  type Env,
  type GuestSubmission,
  type MealChoice,
  type RateLimitBinding,
  type ResolveResult,
  type RuntimeDependencies,
  type SubmitResult,
  type WriterEnvelope,
  type WriterOperation,
  type WriterPayload,
} from './contract.js';
import { PublicHttpError } from './errors.js';
import { isRecord } from './validation.js';

const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// A real Apps Script durable write can take 20–30 seconds, particularly while
// Google follows the web-app redirect or waits for ScriptLock. Allow twice the
// observed upper range; the browser timeout deliberately includes more margin.
export const WRITER_TIMEOUT_MILLISECONDS = 60_000;
const OPAQUE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_NUMBER_PATTERN = /^RSVP-[A-Z0-9]{6,20}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const UNSAFE_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const RANDOM_SECRET_PATTERN = /^[A-Za-z0-9_-]{64}$/;
const ACCESS_CODE_PATTERN = new RegExp(`^[${ACCESS_CODE_ALPHABET}]{${LIMITS.accessCodeLength}}$`);
const CLIENT_IP_PATTERN = /^[0-9A-Fa-f:.]{2,64}$/;
const ACCESS_CODE_HASH_DOMAIN = 'rsvp-access-code-v1\0';
const CLIENT_RATE_LIMIT_HASH_DOMAIN = 'rsvp-client-ip-v1\0';

const encodeBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
};

const readLimitedResponseText = async (response: Response, maxBytes: number): Promise<string> => {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > maxBytes) {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }

  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(combined);
  } catch {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }
};

const hasOnlyKeys = (
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean => {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
};

const boundedString = (value: unknown, max: number, pattern?: RegExp): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && (pattern === undefined || pattern.test(value));

const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const isIsoTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length > 35) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && /^\d{4}-\d{2}-\d{2}T/u.test(value);
};

const parseWriterGuest = (
  value: unknown,
  mealChoiceRequired: boolean,
): GuestSubmission | undefined => {
  if (!isRecord(value) || !hasOnlyKeys(value, ['guestId', 'attending'], ['mealChoice'])) return undefined;
  if (!boundedString(value.guestId, LIMITS.idMax, OPAQUE_ID_PATTERN) || typeof value.attending !== 'boolean') {
    return undefined;
  }

  if (value.attending) {
    if (value.mealChoice === undefined && !mealChoiceRequired) {
      return { guestId: value.guestId, attending: true };
    }
    if (typeof value.mealChoice !== 'string' || !(MEAL_CHOICES as readonly string[]).includes(value.mealChoice)) {
      return undefined;
    }
    return {
      guestId: value.guestId,
      attending: true,
      mealChoice: value.mealChoice as MealChoice,
    };
  }

  if (value.mealChoice !== undefined) return undefined;
  return { guestId: value.guestId, attending: false };
};

const parseWriterGuests = (
  value: unknown,
  mealChoiceRequired: boolean,
): GuestSubmission[] | undefined => {
  if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.householdGuestsMax) return undefined;
  const guests: GuestSubmission[] = [];
  for (const item of value) {
    const guest = parseWriterGuest(item, mealChoiceRequired);
    if (guest === undefined) return undefined;
    guests.push(guest);
  }
  if (new Set(guests.map((guest) => guest.guestId)).size !== guests.length) return undefined;
  return guests;
};

const parseCurrentRsvp = (
  value: unknown,
  mealChoiceRequired: boolean,
): CurrentRsvp | undefined => {
  if (!isRecord(value)) return undefined;
  if (
    !hasOnlyKeys(
      value,
      ['revision', 'receiptNumber', 'attending', 'guests', 'updatedAt'],
      ['email', 'message'],
    ) ||
    !isNonNegativeInteger(value.revision) ||
    value.revision < 1 ||
    !boundedString(value.receiptNumber, LIMITS.receiptNumberMax, RECEIPT_NUMBER_PATTERN) ||
    typeof value.attending !== 'boolean' ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return undefined;
  }

  const guests = parseWriterGuests(value.guests, mealChoiceRequired);
  if (guests === undefined) return undefined;
  if (value.attending !== guests.some((guest) => guest.attending)) return undefined;
  if (
    value.email !== undefined &&
    (!boundedString(value.email, LIMITS.emailMax, EMAIL_PATTERN) || /[\r\n]/u.test(value.email))
  ) {
    return undefined;
  }
  if (
    value.message !== undefined &&
    (!boundedString(value.message, LIMITS.messageMax) || UNSAFE_CONTROL_PATTERN.test(value.message))
  ) {
    return undefined;
  }

  const current: CurrentRsvp = {
    revision: value.revision,
    receiptNumber: value.receiptNumber,
    attending: value.attending,
    guests,
    updatedAt: value.updatedAt,
  };
  if (typeof value.email === 'string') current.email = value.email;
  if (typeof value.message === 'string') current.message = value.message;
  return current;
};

const parseResolveResult = (value: unknown): ResolveResult | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(
      value,
      [
        'householdId',
        'displayName',
        'invitationVariant',
        'mealChoiceRequired',
        'maxGuests',
        'guests',
        'currentRsvp',
      ],
    ) ||
    !boundedString(value.householdId, LIMITS.idMax, OPAQUE_ID_PATTERN) ||
    !boundedString(value.displayName, LIMITS.displayNameMax) ||
    typeof value.invitationVariant !== 'string' ||
    !(INVITATION_VARIANTS as readonly string[]).includes(value.invitationVariant) ||
    typeof value.mealChoiceRequired !== 'boolean' ||
    (value.invitationVariant === 'day') !== value.mealChoiceRequired ||
    !Number.isSafeInteger(value.maxGuests) ||
    (value.maxGuests as number) < 1 ||
    (value.maxGuests as number) > LIMITS.householdGuestsMax ||
    !Array.isArray(value.guests) ||
    value.guests.length < 1 ||
    value.guests.length > LIMITS.householdGuestsMax
  ) {
    return undefined;
  }

  const guests: ResolveResult['guests'] = [];
  for (const guest of value.guests) {
    if (
      !isRecord(guest) ||
      !hasOnlyKeys(guest, ['guestId', 'displayName']) ||
      !boundedString(guest.guestId, LIMITS.idMax, OPAQUE_ID_PATTERN) ||
      !boundedString(guest.displayName, LIMITS.displayNameMax)
    ) {
      return undefined;
    }
    guests.push({ guestId: guest.guestId, displayName: guest.displayName });
  }
  if (new Set(guests.map((guest) => guest.guestId)).size !== guests.length) return undefined;
  // Provisioning invariant: every preset guest must be able to attend. A
  // smaller maxGuests would let the browser render an impossible form that is
  // rejected only on submit.
  if (guests.length > (value.maxGuests as number)) return undefined;

  let currentRsvp: CurrentRsvp | null = null;
  if (value.currentRsvp !== null) {
    const parsed = parseCurrentRsvp(value.currentRsvp, value.mealChoiceRequired);
    if (parsed === undefined) return undefined;
    const allowedGuestIds = new Set(guests.map((guest) => guest.guestId));
    if (
      parsed.guests.length !== guests.length ||
      parsed.guests.some((guest) => !allowedGuestIds.has(guest.guestId))
    ) {
      return undefined;
    }
    currentRsvp = parsed;
  }

  return {
    householdId: value.householdId,
    displayName: value.displayName,
    invitationVariant: value.invitationVariant as ResolveResult['invitationVariant'],
    mealChoiceRequired: value.mealChoiceRequired,
    maxGuests: value.maxGuests as number,
    guests,
    currentRsvp,
  };
};

const parseSubmitResult = (
  value: unknown,
  expectedIdempotencyKey: string,
  expectedCurrentRevision: number,
): SubmitResult | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['revision', 'savedAt', 'idempotencyKey', 'receiptNumber']) ||
    !isNonNegativeInteger(value.revision) ||
    value.revision !== expectedCurrentRevision + 1 ||
    value.revision < 1 ||
    !isIsoTimestamp(value.savedAt) ||
    !boundedString(value.idempotencyKey, 36, IDEMPOTENCY_KEY_PATTERN) ||
    value.idempotencyKey !== expectedIdempotencyKey ||
    !boundedString(value.receiptNumber, LIMITS.receiptNumberMax, RECEIPT_NUMBER_PATTERN)
  ) {
    return undefined;
  }
  return {
    revision: value.revision,
    savedAt: value.savedAt,
    idempotencyKey: value.idempotencyKey,
    receiptNumber: value.receiptNumber,
  };
};

export const assertEnvironment = (env: Env): void => {
  try {
    const origin = new URL(env.ALLOWED_ORIGIN);
    if (
      origin.origin !== env.ALLOWED_ORIGIN ||
      origin.protocol !== 'https:'
    ) throw new Error('invalid origin');

    const writerUrl = new URL(env.WRITER_URL);
    if (
      writerUrl.protocol !== 'https:' ||
      writerUrl.hostname !== 'script.google.com' ||
      !/^\/macros\/s\/[^/]+\/exec$/u.test(writerUrl.pathname)
    ) {
      throw new Error('invalid writer URL');
    }
  } catch {
    throw new PublicHttpError(503, 'CONFIGURATION_ERROR');
  }

  if (
    !/^[A-Za-z0-9.-]+$/u.test(env.TURNSTILE_EXPECTED_HOSTNAME) ||
    env.TURNSTILE_EXPECTED_HOSTNAME.includes('..') ||
    typeof env.TURNSTILE_SECRET !== 'string' ||
    env.TURNSTILE_SECRET.length < 16 ||
    typeof env.ACCESS_CODE_HASH_SECRET !== 'string' ||
    !RANDOM_SECRET_PATTERN.test(env.ACCESS_CODE_HASH_SECRET) ||
    new Set(env.ACCESS_CODE_HASH_SECRET).size < 16 ||
    (env.HOUSEHOLD_CODES_ENABLED !== 'true' && env.HOUSEHOLD_CODES_ENABLED !== 'false') ||
    typeof env.INVITATION_TOKEN_HASH_SECRET !== 'string' ||
    env.INVITATION_TOKEN_HASH_SECRET.length < 32 ||
    typeof env.WRITER_HMAC_SECRET !== 'string' ||
    env.WRITER_HMAC_SECRET.length < 32 ||
    new Set([
      env.ACCESS_CODE_HASH_SECRET,
      env.INVITATION_TOKEN_HASH_SECRET,
      env.WRITER_HMAC_SECRET,
    ]).size !== 3 ||
    typeof env.CLIENT_RATE_LIMITER?.limit !== 'function' ||
    typeof env.GLOBAL_RATE_LIMITER?.limit !== 'function' ||
    typeof env.RESOLVE_RATE_LIMITER?.limit !== 'function' ||
    typeof env.SUBMIT_RATE_LIMITER?.limit !== 'function'
  ) {
    throw new PublicHttpError(503, 'CONFIGURATION_ERROR');
  }
};

export const enforceRateLimit = async (limiter: RateLimitBinding, key: string): Promise<void> => {
  let result: { success: boolean };
  try {
    result = await limiter.limit({ key });
  } catch {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }
  if (result.success !== true) {
    throw new PublicHttpError(429, 'RATE_LIMITED', { retryAfter: 60 });
  }
};

const hmacBase64Url = async (
  secret: string,
  value: string,
  dependencies: RuntimeDependencies,
): Promise<string> => {
  const key = await dependencies.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = await dependencies.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return encodeBase64Url(new Uint8Array(digest));
};

export const hashInvitationToken = async (
  inviteToken: string,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<string> => hmacBase64Url(env.INVITATION_TOKEN_HASH_SECRET, inviteToken, dependencies);

export const hashAccessCode = async (
  accessCode: string,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<string> => {
  if (!ACCESS_CODE_PATTERN.test(accessCode)) {
    throw new PublicHttpError(422, 'VALIDATION_FAILED');
  }
  return hmacBase64Url(
    env.ACCESS_CODE_HASH_SECRET,
    `${ACCESS_CODE_HASH_DOMAIN}${accessCode}`,
    dependencies,
  );
};

export const hashClientIdentity = async (
  request: Request,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<string> => {
  const supplied = request.headers.get('CF-Connecting-IP')?.trim() ?? '';
  const clientIdentity = CLIENT_IP_PATTERN.test(supplied) ? supplied.toLowerCase() : 'unavailable';
  return hmacBase64Url(
    env.ACCESS_CODE_HASH_SECRET,
    `${CLIENT_RATE_LIMIT_HASH_DOMAIN}${clientIdentity}`,
    dependencies,
  );
};

export const hashCredential = async (
  credential: { inviteToken: string } | { accessCode: string },
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<CredentialHash> => {
  if ('inviteToken' in credential) {
    return { tokenHash: await hashInvitationToken(credential.inviteToken, env, dependencies) };
  }
  if (env.HOUSEHOLD_CODES_ENABLED !== 'true') {
    throw new PublicHttpError(404, 'INVITATION_INVALID');
  }
  return { accessCodeHash: await hashAccessCode(credential.accessCode, env, dependencies) };
};

export const verifyTurnstile = async (
  token: string,
  expectedAction: string,
  requestId: string,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<void> => {
  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET,
    response: token,
    idempotency_key: requestId,
  });

  let response: Response;
  try {
    response = await dependencies.fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }
  if (!response.ok) throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');

  const raw = await readLimitedResponseText(response, LIMITS.turnstileResponseBytes);
  let result: unknown;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }

  if (
    !isRecord(result) ||
    result.success !== true ||
    result.hostname !== env.TURNSTILE_EXPECTED_HOSTNAME ||
    result.action !== expectedAction
  ) {
    throw new PublicHttpError(403, 'CHALLENGE_FAILED');
  }
};

export const createWriterEnvelope = async <T>(
  operation: WriterOperation,
  data: T,
  requestId: string,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<WriterEnvelope> => {
  const payloadObject: WriterPayload<T> = {
    version: API_VERSION,
    operation,
    requestId,
    data,
  };
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payloadObject)));
  const timestamp = Math.floor(dependencies.now() / 1_000);
  const signingInput = `${API_VERSION}.${timestamp}.${requestId}.${payload}`;
  const key = await dependencies.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.WRITER_HMAC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await dependencies.crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );

  return {
    version: API_VERSION,
    timestamp,
    requestId,
    payload,
    signature: encodeBase64Url(new Uint8Array(signature)),
  };
};

const WRITER_ERROR_MAP: Record<string, { status: number; code: ConstructorParameters<typeof PublicHttpError>[1] }> = {
  IDEMPOTENCY_CONFLICT: { status: 409, code: 'IDEMPOTENCY_CONFLICT' },
  INVITATION_INVALID: { status: 404, code: 'INVITATION_INVALID' },
  RATE_LIMITED: { status: 429, code: 'RATE_LIMITED' },
  REVISION_CONFLICT: { status: 409, code: 'REVISION_CONFLICT' },
  RSVP_CLOSED: { status: 410, code: 'RSVP_CLOSED' },
  WRITER_BUSY: { status: 503, code: 'UPSTREAM_UNAVAILABLE' },
};

export const callWriter = async <T>(
  operation: WriterOperation,
  data: T,
  requestId: string,
  expectedIdempotencyKey: string | undefined,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<ResolveResult | SubmitResult> => {
  const envelope = await createWriterEnvelope(operation, data, requestId, env, dependencies);
  let response: Response;
  try {
    response = await dependencies.fetch(env.WRITER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
      redirect: 'follow',
      // Apps Script may legitimately wait up to ten seconds for ScriptLock.
      // Keep enough budget for that wait plus the durable write/recovery path.
      signal: AbortSignal.timeout(WRITER_TIMEOUT_MILLISECONDS),
    });
  } catch {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }
  if (!response.ok) throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');

  const raw = await readLimitedResponseText(response, LIMITS.writerResponseBytes);
  let result: unknown;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }
  if (
    !isRecord(result) ||
    result.version !== API_VERSION ||
    result.requestId !== requestId ||
    typeof result.ok !== 'boolean'
  ) {
    throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  }

  if (!result.ok) {
    const writerCode = isRecord(result.error) && typeof result.error.code === 'string' ? result.error.code : '';
    const mapped = WRITER_ERROR_MAP[writerCode];
    if (mapped === undefined) throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
    throw new PublicHttpError(mapped.status, mapped.code, mapped.code === 'RATE_LIMITED' ? { retryAfter: 60 } : {});
  }

  const parsed =
    operation === 'resolve'
      ? parseResolveResult(result.data)
      : expectedIdempotencyKey === undefined ||
          !isRecord(data) ||
          !isNonNegativeInteger(data.revision)
        ? undefined
        : parseSubmitResult(result.data, expectedIdempotencyKey, data.revision);
  if (parsed === undefined) throw new PublicHttpError(503, 'UPSTREAM_UNAVAILABLE');
  return parsed;
};
