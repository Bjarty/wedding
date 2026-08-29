import {
  API_VERSION,
  LIMITS,
  ROUTES,
  TURNSTILE_ACTIONS,
  type Env,
  type PublicErrorBody,
  type PublicSuccessBody,
  type ResolveResult,
  type RuntimeDependencies,
  type SubmitResult,
} from './contract.js';
import { getPublicMessage, PublicHttpError } from './errors.js';
import {
  assertEnvironment,
  callWriter,
  enforceRateLimit,
  hashClientIdentity,
  hashCredential,
  verifyTurnstile,
} from './integrations.js';
import { parseResolveRequest, parseSubmitRequest } from './validation.js';

const defaultDependencies: RuntimeDependencies = {
  fetch: (input, init) => fetch(input, init),
  crypto: globalThis.crypto,
  sha256Hex: async (value) => {
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(value),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  },
  now: () => Date.now(),
  randomUUID: () => globalThis.crypto.randomUUID(),
};

const securityHeaders = (): Headers =>
  new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });

const addCorsHeaders = (headers: Headers, origin: string): void => {
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Expose-Headers', 'Retry-After');
  headers.set('Access-Control-Max-Age', '600');
  headers.set('Vary', 'Origin');
};

const jsonSuccess = <T>(status: number, data: T, requestId: string, origin: string): Response => {
  const headers = securityHeaders();
  headers.set('X-Request-Id', requestId);
  addCorsHeaders(headers, origin);
  const body: PublicSuccessBody<T> = { version: API_VERSION, requestId, data };
  return new Response(JSON.stringify(body), { status, headers });
};

const jsonError = (error: PublicHttpError, requestId: string, corsOrigin?: string): Response => {
  const headers = securityHeaders();
  headers.set('X-Request-Id', requestId);
  if (corsOrigin !== undefined) addCorsHeaders(headers, corsOrigin);
  if (error.retryAfter !== undefined) headers.set('Retry-After', String(error.retryAfter));
  if (error.status === 405) headers.set('Allow', 'POST, OPTIONS');

  const publicError: PublicErrorBody['error'] = {
    code: error.code,
    message: getPublicMessage(error.code),
    requestId,
  };
  if (error.fields !== undefined) publicError.fields = error.fields;
  const body: PublicErrorBody = { version: API_VERSION, error: publicError };
  return new Response(JSON.stringify(body), { status: error.status, headers });
};

const readJsonBody = async (request: Request): Promise<unknown> => {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > LIMITS.bodyBytes) {
    throw new PublicHttpError(413, 'PAYLOAD_TOO_LARGE');
  }
  if (request.body === null) throw new PublicHttpError(400, 'BAD_REQUEST');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > LIMITS.bodyBytes) {
      await reader.cancel();
      throw new PublicHttpError(413, 'PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let raw: string;
  try {
    raw = new TextDecoder('utf-8', { fatal: true }).decode(combined);
  } catch {
    throw new PublicHttpError(400, 'BAD_REQUEST');
  }
  if (raw.trim() === '') throw new PublicHttpError(400, 'BAD_REQUEST');

  try {
    return JSON.parse(raw);
  } catch {
    throw new PublicHttpError(400, 'BAD_REQUEST');
  }
};

const isKnownRoute = (path: string): boolean => path === ROUTES.resolve || path === ROUTES.submit;

const validatePreflight = (request: Request): void => {
  const requestedMethod = request.headers.get('access-control-request-method');
  if (requestedMethod !== null && requestedMethod !== 'POST') {
    throw new PublicHttpError(405, 'METHOD_NOT_ALLOWED');
  }

  const requestedHeaders = request.headers.get('access-control-request-headers');
  if (requestedHeaders !== null) {
    const headers = requestedHeaders
      .split(',')
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean);
    if (headers.some((header) => header !== 'content-type')) {
      throw new PublicHttpError(403, 'ORIGIN_NOT_ALLOWED');
    }
  }
};

export const handleRequest = async (
  request: Request,
  env: Env,
  dependencies: RuntimeDependencies = defaultDependencies,
): Promise<Response> => {
  const requestId = dependencies.randomUUID();
  let corsOrigin: string | undefined;

  try {
    await assertEnvironment(env, dependencies);

    const origin = request.headers.get('origin');
    if (origin === null || origin !== env.ALLOWED_ORIGIN) {
      throw new PublicHttpError(403, 'ORIGIN_NOT_ALLOWED');
    }
    corsOrigin = origin;

    const url = new URL(request.url);
    if (!isKnownRoute(url.pathname)) throw new PublicHttpError(404, 'NOT_FOUND');
    if (url.search !== '') throw new PublicHttpError(400, 'BAD_REQUEST');

    if (request.method === 'OPTIONS') {
      validatePreflight(request);
      const headers = securityHeaders();
      headers.delete('Content-Type');
      headers.set('X-Request-Id', requestId);
      addCorsHeaders(headers, corsOrigin);
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== 'POST') throw new PublicHttpError(405, 'METHOD_NOT_ALLOWED');

    const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') throw new PublicHttpError(415, 'UNSUPPORTED_MEDIA_TYPE');

    // These two layers run before the body is read or any invitation
    // credential is parsed. The per-client key is an HMAC, never a raw IP.
    await enforceRateLimit(env.GLOBAL_RATE_LIMITER, 'rsvp-api-v1');
    const clientKey = await hashClientIdentity(request, env, dependencies);
    await enforceRateLimit(env.CLIENT_RATE_LIMITER, clientKey);

    const body = await readJsonBody(request);

    if (url.pathname === ROUTES.resolve) {
      const parsed = parseResolveRequest(body);
      if (!parsed.ok) throw new PublicHttpError(422, 'VALIDATION_FAILED', { fields: parsed.issues });
      const credential = 'inviteToken' in parsed.value
        ? { inviteToken: parsed.value.inviteToken }
        : { accessCode: parsed.value.accessCode };
      const credentialHash = await hashCredential(credential, env, dependencies);
      await enforceRateLimit(
        env.RESOLVE_RATE_LIMITER,
        'tokenHash' in credentialHash ? credentialHash.tokenHash : credentialHash.accessCodeHash,
      );
      await verifyTurnstile(
        parsed.value.turnstileToken,
        TURNSTILE_ACTIONS.resolve,
        requestId,
        env,
        dependencies,
      );
      const result = (await callWriter(
        'resolve',
        credentialHash,
        requestId,
        undefined,
        env,
        dependencies,
      )) as ResolveResult;
      return jsonSuccess(200, result, requestId, corsOrigin);
    }

    const parsed = parseSubmitRequest(body);
    if (!parsed.ok) throw new PublicHttpError(422, 'VALIDATION_FAILED', { fields: parsed.issues });
    const credential = 'inviteToken' in parsed.value
      ? { inviteToken: parsed.value.inviteToken }
      : { accessCode: parsed.value.accessCode };
    const credentialHash = await hashCredential(credential, env, dependencies);
    await enforceRateLimit(
      env.SUBMIT_RATE_LIMITER,
      'tokenHash' in credentialHash ? credentialHash.tokenHash : credentialHash.accessCodeHash,
    );
    await verifyTurnstile(
      parsed.value.turnstileToken,
      TURNSTILE_ACTIONS.submit,
      requestId,
      env,
      dependencies,
    );
    const submission = {
      idempotencyKey: parsed.value.idempotencyKey,
      revision: parsed.value.revision,
      attending: parsed.value.attending,
      guests: parsed.value.guests,
      ...(parsed.value.email === undefined ? {} : { email: parsed.value.email }),
      ...(parsed.value.message === undefined ? {} : { message: parsed.value.message }),
    };
    const writerData = { ...credentialHash, ...submission };
    const result = (await callWriter(
      'submit',
      writerData,
      requestId,
      parsed.value.idempotencyKey,
      env,
      dependencies,
    )) as SubmitResult;
    return jsonSuccess(200, result, requestId, corsOrigin);
  } catch (error) {
    if (error instanceof PublicHttpError) return jsonError(error, requestId, corsOrigin);
    return jsonError(new PublicHttpError(500, 'INTERNAL_ERROR'), requestId, corsOrigin);
  }
};

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

export type {
  CurrentRsvp,
  Env,
  FieldIssue,
  GuestSubmission,
  InvitationCredential,
  InvitationVariant,
  MealChoice,
  PublicErrorBody,
  PublicSuccessBody,
  ResolveRequest,
  ResolveResult,
  SubmitRequest,
  SubmitResult,
} from './contract.js';
