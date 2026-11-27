import { LIMITS, type Env, type RuntimeDependencies } from './contract.js';
import { PublicHttpError } from './errors.js';

const NAME_TICKET_DOMAIN = 'rsvp-name-selection-v1\0';
export const NAME_TICKET_LIFETIME_SECONDS = 60 * 60;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/u;
const SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u;

const encode = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
};

const decode = (value: string): Uint8Array => {
  if (!SEGMENT_PATTERN.test(value)) throw new Error('Invalid encoding');
  const binary = atob(value.replace(/-/gu, '+').replace(/_/gu, '/'));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (encode(bytes) !== value) throw new Error('Non-canonical encoding');
  return bytes;
};

const signingKey = (env: Env, dependencies: RuntimeDependencies, usage: 'sign' | 'verify') =>
  dependencies.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.ACCESS_CODE_HASH_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );

/** A short-lived selection capability, not proof of a guest's identity. */
export const createNameTicket = async (
  householdId: string,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<string> => {
  if (env.NAME_LOOKUP_ENABLED !== 'true' || !ID_PATTERN.test(householdId)) {
    throw new PublicHttpError(404, 'INVITATION_INVALID');
  }
  const payload = encode(new TextEncoder().encode(JSON.stringify({
    v: 1,
    householdId,
    expiresAt: Math.floor(dependencies.now() / 1_000) + NAME_TICKET_LIFETIME_SECONDS,
  })));
  const signature = await dependencies.crypto.subtle.sign(
    'HMAC',
    await signingKey(env, dependencies, 'sign'),
    new TextEncoder().encode(`${NAME_TICKET_DOMAIN}${payload}`),
  );
  return `nt1.${payload}.${encode(new Uint8Array(signature))}`;
};

export const readNameTicket = async (
  ticket: string,
  env: Env,
  dependencies: RuntimeDependencies,
): Promise<string> => {
  if (env.NAME_LOOKUP_ENABLED !== 'true') throw new PublicHttpError(404, 'INVITATION_INVALID');
  try {
    if (typeof ticket !== 'string' || ticket.length > LIMITS.nameTicketMax) throw new Error('Invalid ticket');
    const parts = ticket.split('.');
    if (parts.length !== 3 || parts[0] !== 'nt1') throw new Error('Invalid ticket');
    const payload = parts[1];
    const signature = parts[2];
    if (payload === undefined || signature === undefined || signature.length !== 43) throw new Error('Invalid ticket');
    const payloadBytes = decode(payload);
    const signatureBytes = decode(signature);
    const valid = await dependencies.crypto.subtle.verify(
      'HMAC',
      await signingKey(env, dependencies, 'verify'),
      signatureBytes,
      new TextEncoder().encode(`${NAME_TICKET_DOMAIN}${payload}`),
    );
    if (!valid) throw new Error('Invalid signature');
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(payloadBytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid payload');
    const value = parsed as Record<string, unknown>;
    const keys = Object.keys(value);
    if (keys.length !== 3 || !keys.every((key) => ['v', 'householdId', 'expiresAt'].includes(key))) {
      throw new Error('Invalid payload');
    }
    const now = Math.floor(dependencies.now() / 1_000);
    if (
      value.v !== 1 ||
      typeof value.householdId !== 'string' || !ID_PATTERN.test(value.householdId) ||
      !Number.isSafeInteger(value.expiresAt) ||
      (value.expiresAt as number) <= now ||
      (value.expiresAt as number) > now + NAME_TICKET_LIFETIME_SECONDS
    ) throw new Error('Invalid payload');
    return value.householdId;
  } catch {
    // Ticket, household identifiers and names must never enter public errors or logs.
    throw new PublicHttpError(404, 'INVITATION_INVALID');
  }
};
