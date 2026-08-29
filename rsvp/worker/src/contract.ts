export const API_VERSION = 'v1' as const;

export const ROUTES = {
  resolve: '/v1/households/resolve',
  submit: '/v1/rsvps/submit',
} as const;

export const TURNSTILE_ACTIONS = {
  resolve: 'rsvp_resolve',
  submit: 'rsvp_submit',
} as const;

export const MEAL_CHOICES = ['fish', 'meat', 'vegetarian', 'vegan'] as const;
export type MealChoice = (typeof MEAL_CHOICES)[number];

export const LIMITS = {
  bodyBytes: 16_384,
  inviteTokenMin: 32,
  inviteTokenMax: 128,
  turnstileTokenMax: 2_048,
  idMax: 64,
  displayNameMax: 160,
  householdGuestsMax: 20,
  emailMax: 254,
  messageMax: 1_000,
  receiptNumberMax: 25,
  writerResponseBytes: 32_768,
  turnstileResponseBytes: 8_192,
} as const;

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  ALLOWED_ORIGIN: string;
  INVITATION_TOKEN_HASH_SECRET: string;
  RESOLVE_RATE_LIMITER: RateLimitBinding;
  SUBMIT_RATE_LIMITER: RateLimitBinding;
  TURNSTILE_EXPECTED_ACTION?: string;
  TURNSTILE_EXPECTED_HOSTNAME: string;
  TURNSTILE_SECRET: string;
  WRITER_URL: string;
  WRITER_HMAC_SECRET: string;
}

export interface ResolveRequest {
  inviteToken: string;
  turnstileToken: string;
}

export interface GuestSubmission {
  guestId: string;
  attending: boolean;
  mealChoice?: MealChoice;
}

export interface SubmitRequest {
  inviteToken: string;
  idempotencyKey: string;
  revision: number;
  attending: boolean;
  guests: GuestSubmission[];
  email?: string;
  message?: string;
  turnstileToken: string;
}

export interface CurrentRsvp {
  revision: number;
  receiptNumber: string;
  attending: boolean;
  guests: GuestSubmission[];
  email?: string;
  message?: string;
  updatedAt: string;
}

export interface ResolveResult {
  householdId: string;
  displayName: string;
  maxGuests: number;
  guests: Array<{
    guestId: string;
    displayName: string;
  }>;
  currentRsvp: CurrentRsvp | null;
}

export interface SubmitResult {
  revision: number;
  savedAt: string;
  idempotencyKey: string;
  receiptNumber: string;
}

export type PublicErrorCode =
  | 'BAD_REQUEST'
  | 'CHALLENGE_FAILED'
  | 'CONFIGURATION_ERROR'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'INVITATION_INVALID'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'ORIGIN_NOT_ALLOWED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'REVISION_CONFLICT'
  | 'RSVP_CLOSED'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'UPSTREAM_UNAVAILABLE'
  | 'VALIDATION_FAILED';

export type FieldIssueCode =
  | 'duplicate'
  | 'inconsistent'
  | 'invalid_format'
  | 'invalid_type'
  | 'required'
  | 'too_long'
  | 'too_many'
  | 'too_short'
  | 'unknown_field';

export interface FieldIssue {
  path: string;
  code: FieldIssueCode;
}

export interface PublicErrorBody {
  version: typeof API_VERSION;
  error: {
    code: PublicErrorCode;
    message: string;
    requestId: string;
    fields?: FieldIssue[];
  };
}

export interface PublicSuccessBody<T> {
  version: typeof API_VERSION;
  requestId: string;
  data: T;
}

export type WriterOperation = 'resolve' | 'submit';

export interface WriterPayload<T> {
  version: typeof API_VERSION;
  operation: WriterOperation;
  requestId: string;
  data: T;
}

export interface WriterEnvelope {
  version: typeof API_VERSION;
  timestamp: number;
  requestId: string;
  payload: string;
  signature: string;
}

export interface RuntimeDependencies {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  crypto: Crypto;
  sha256Hex: (value: string) => Promise<string>;
  now: () => number;
  randomUUID: () => string;
}
