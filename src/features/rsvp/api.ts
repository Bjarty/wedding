import type {
  CurrentRsvp,
  GuestSubmission,
  MealChoice,
  PublicErrorCode,
  ResolvedHousehold,
  SubmitPayload,
  SubmitResult,
} from './types';

const knownErrorCodes = new Set<PublicErrorCode>([
  'BAD_REQUEST',
  'CHALLENGE_FAILED',
  'CONFIGURATION_ERROR',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
  'INVITATION_INVALID',
  'METHOD_NOT_ALLOWED',
  'NOT_FOUND',
  'ORIGIN_NOT_ALLOWED',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'REVISION_CONFLICT',
  'RSVP_CLOSED',
  'UNSUPPORTED_MEDIA_TYPE',
  'UPSTREAM_UNAVAILABLE',
  'VALIDATION_FAILED',
]);

const mealChoices = new Set<MealChoice>(['fish', 'meat', 'vegetarian', 'vegan']);
const opaqueIdPattern = /^[A-Za-z0-9_-]{1,64}$/u;
const receiptPattern = /^RSVP-[A-Z0-9]{6,20}$/u;
// The Worker may spend up to 5s on Turnstile and 20s on the Apps Script
// writer. Keep separate margin for redirects, response parsing and network
// latency so the browser does not abandon a request the server can still
// finish normally.
const requestTimeoutMilliseconds = 35_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonNegativeInteger = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;

const isIsoTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 35 && /^\d{4}-\d{2}-\d{2}T/u.test(value) && Number.isFinite(Date.parse(value));

const parseGuestSubmission = (value: unknown): GuestSubmission | null => {
  if (!isRecord(value) || typeof value.guestId !== 'string' || !opaqueIdPattern.test(value.guestId)) return null;
  if (typeof value.attending !== 'boolean') return null;

  if (value.attending) {
    if (typeof value.mealChoice !== 'string' || !mealChoices.has(value.mealChoice as MealChoice)) return null;
    return { guestId: value.guestId, attending: true, mealChoice: value.mealChoice as MealChoice };
  }

  if (value.mealChoice !== undefined) return null;
  return { guestId: value.guestId, attending: false };
};

const parseCurrentRsvp = (value: unknown): CurrentRsvp | null | undefined => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.revision) ||
    value.revision < 1 ||
    typeof value.receiptNumber !== 'string' ||
    !receiptPattern.test(value.receiptNumber) ||
    typeof value.attending !== 'boolean' ||
    !Array.isArray(value.guests) ||
    !isIsoTimestamp(value.updatedAt)
  ) {
    return undefined;
  }

  const guests = value.guests.map(parseGuestSubmission);
  if (guests.length === 0 || guests.some((guest) => guest === null)) return undefined;
  const parsedGuests = guests as GuestSubmission[];
  if (new Set(parsedGuests.map((guest) => guest.guestId)).size !== parsedGuests.length) return undefined;
  if (value.attending !== parsedGuests.some((guest) => guest.attending)) return undefined;
  if (value.email !== undefined && (typeof value.email !== 'string' || value.email.length > 254)) return undefined;
  if (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 1_000)) return undefined;

  const current: CurrentRsvp = {
    revision: value.revision,
    receiptNumber: value.receiptNumber,
    attending: value.attending,
    guests: parsedGuests,
    updatedAt: value.updatedAt,
  };
  if (typeof value.email === 'string') current.email = value.email;
  if (typeof value.message === 'string') current.message = value.message;
  return current;
};

const parseResolvedHousehold = (value: unknown): ResolvedHousehold | null => {
  if (
    !isRecord(value) ||
    typeof value.householdId !== 'string' ||
    !opaqueIdPattern.test(value.householdId) ||
    typeof value.displayName !== 'string' ||
    value.displayName.length === 0 ||
    value.displayName.length > 160 ||
    !Number.isSafeInteger(value.maxGuests) ||
    (value.maxGuests as number) < 1 ||
    (value.maxGuests as number) > 20 ||
    !Array.isArray(value.guests) ||
    value.guests.length === 0 ||
    value.guests.length > 20
  ) {
    return null;
  }

  const guests: ResolvedHousehold['guests'] = [];
  for (const guest of value.guests) {
    if (
      !isRecord(guest) ||
      typeof guest.guestId !== 'string' ||
      !opaqueIdPattern.test(guest.guestId) ||
      typeof guest.displayName !== 'string' ||
      guest.displayName.length === 0 ||
      guest.displayName.length > 160
    ) {
      return null;
    }
    guests.push({ guestId: guest.guestId, displayName: guest.displayName });
  }
  if (new Set(guests.map((guest) => guest.guestId)).size !== guests.length) return null;
  if (guests.length > (value.maxGuests as number)) return null;

  const currentRsvp = parseCurrentRsvp(value.currentRsvp);
  if (currentRsvp === undefined) return null;
  const allowedIds = new Set(guests.map((guest) => guest.guestId));
  if (
    currentRsvp !== null &&
    (currentRsvp.guests.length !== guests.length ||
      currentRsvp.guests.some((guest) => !allowedIds.has(guest.guestId)))
  ) return null;

  return {
    householdId: value.householdId,
    displayName: value.displayName,
    maxGuests: value.maxGuests as number,
    guests,
    currentRsvp,
  };
};

const parseSubmitResult = (value: unknown): SubmitResult | null => {
  if (
    !isRecord(value) ||
    !isNonNegativeInteger(value.revision) ||
    !isIsoTimestamp(value.savedAt) ||
    typeof value.idempotencyKey !== 'string' ||
    value.idempotencyKey.length !== 36 ||
    typeof value.receiptNumber !== 'string' ||
    !receiptPattern.test(value.receiptNumber)
  ) {
    return null;
  }
  return {
    revision: value.revision,
    savedAt: value.savedAt,
    idempotencyKey: value.idempotencyKey,
    receiptNumber: value.receiptNumber,
  };
};

export class RsvpApiError extends Error {
  readonly code: PublicErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: PublicErrorCode, retryAfterSeconds?: number) {
    super(code);
    this.name = 'RsvpApiError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const parseRetryAfter = (response: Response): number | undefined => {
  const value = Number(response.headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : undefined;
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new RsvpApiError('UPSTREAM_UNAVAILABLE');
  }
};

const post = async (
  apiBaseUrl: string,
  path: string,
  body: object,
  signal?: AbortSignal,
): Promise<unknown> => {
  let response: Response;
  let parsed: unknown;
  let timedOut = false;
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  if (signal?.aborted === true) controller.abort();
  else signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMilliseconds);

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    parsed = await readJson(response);
  } catch (error) {
    if (error instanceof RsvpApiError) throw error;
    if (!timedOut && signal?.aborted === true && error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new RsvpApiError('UPSTREAM_UNAVAILABLE');
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  if (!response.ok) {
    const candidate =
      isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.code === 'string'
        ? parsed.error.code
        : 'INTERNAL_ERROR';
    const code = knownErrorCodes.has(candidate as PublicErrorCode)
      ? (candidate as PublicErrorCode)
      : 'INTERNAL_ERROR';
    throw new RsvpApiError(code, parseRetryAfter(response));
  }

  if (!isRecord(parsed) || parsed.version !== 'v1' || !Object.hasOwn(parsed, 'data')) {
    throw new RsvpApiError('UPSTREAM_UNAVAILABLE');
  }
  return parsed.data;
};

export const resolveHousehold = async (
  apiBaseUrl: string,
  inviteToken: string,
  turnstileToken: string,
  signal?: AbortSignal,
): Promise<ResolvedHousehold> => {
  const data = await post(
    apiBaseUrl,
    '/v1/households/resolve',
    { inviteToken, turnstileToken },
    signal,
  );
  const household = parseResolvedHousehold(data);
  if (household === null) throw new RsvpApiError('UPSTREAM_UNAVAILABLE');
  return household;
};

export const submitRsvp = async (
  apiBaseUrl: string,
  payload: SubmitPayload,
  signal?: AbortSignal,
): Promise<SubmitResult> => {
  const data = await post(apiBaseUrl, '/v1/rsvps/submit', payload, signal);
  const result = parseSubmitResult(data);
  if (
    result === null ||
    result.idempotencyKey !== payload.idempotencyKey ||
    result.revision !== payload.revision + 1
  ) {
    throw new RsvpApiError('UPSTREAM_UNAVAILABLE');
  }
  return result;
};
