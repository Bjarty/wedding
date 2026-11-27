import type { RsvpExperienceServices } from './RsvpExperience';
import { RsvpApiError } from './api';
import { isPublicDemoHouseholdCode } from './householdCode';
import { isValidNameQuery, type NameSearchServices } from './nameSearch';
import type { CurrentRsvp, ResolvedHousehold, RsvpCredential, SubmitPayload } from './types';

const demoGuests = [
  { guestId: 'demo_garcia_alex', displayName: 'Alex Garcia' },
  { guestId: 'demo_garcia_sam', displayName: 'Sam Garcia' },
] as const;

let currentRsvp: CurrentRsvp | null = null;

// Public synthetic value for the local demo, never accepted by the live Worker.
export const PUBLIC_DEMO_NAME_TICKET = `nt1.ZGVtby1nYXJjaWE.${'A'.repeat(43)}`;

const isDemoCredential = (credential: RsvpCredential): boolean =>
  (credential.type === 'accessCode' && isPublicDemoHouseholdCode(credential.value)) ||
  (credential.type === 'nameTicket' && credential.value === PUBLIC_DEMO_NAME_TICKET);

const cloneCurrentRsvp = (): CurrentRsvp | null => {
  if (currentRsvp === null) return null;
  return {
    ...currentRsvp,
    guests: currentRsvp.guests.map((guest) => ({ ...guest })),
  };
};

const resolveDemoHousehold = async (credential: RsvpCredential): Promise<ResolvedHousehold> => {
  if (!isDemoCredential(credential)) {
    throw new RsvpApiError('INVITATION_INVALID');
  }

  return {
    householdId: 'demo_family_garcia',
    displayName: 'Familie Garcia',
    maxGuests: demoGuests.length,
    guests: demoGuests.map((guest) => ({ ...guest })),
    currentRsvp: cloneCurrentRsvp(),
    invitationVariant: 'day',
    mealChoiceRequired: true,
  };
};

const submitDemoRsvp = async (payload: SubmitPayload) => {
  if (!isDemoCredential(payload.credential)) {
    throw new RsvpApiError('INVITATION_INVALID');
  }
  if (payload.revision !== (currentRsvp?.revision ?? 0)) {
    throw new RsvpApiError('REVISION_CONFLICT');
  }

  const expectedGuestIds = new Set<string>(demoGuests.map((guest) => guest.guestId));
  const submittedGuestIds = new Set(payload.guests.map((guest) => guest.guestId));
  if (
    payload.guests.length !== expectedGuestIds.size ||
    submittedGuestIds.size !== payload.guests.length ||
    payload.guests.some(
      (guest) =>
        !expectedGuestIds.has(guest.guestId) ||
        (guest.attending && guest.mealChoice === undefined) ||
        (!guest.attending && guest.mealChoice !== undefined),
    ) ||
    payload.attending !== payload.guests.some((guest) => guest.attending)
  ) {
    throw new RsvpApiError('VALIDATION_FAILED');
  }

  const savedAt = new Date().toISOString();
  const nextRevision = payload.revision + 1;
  const receiptNumber = currentRsvp?.receiptNumber ?? 'RSVP-DEMO01';
  currentRsvp = {
    revision: nextRevision,
    receiptNumber,
    attending: payload.attending,
    guests: payload.guests.map((guest) => ({ ...guest })),
    ...(payload.email === undefined ? {} : { email: payload.email }),
    ...(payload.message === undefined ? {} : { message: payload.message }),
    updatedAt: savedAt,
  };

  return {
    revision: nextRevision,
    savedAt,
    idempotencyKey: payload.idempotencyKey,
    receiptNumber,
  };
};

export const invitationDemoServices: RsvpExperienceServices = {
  requestTurnstileToken: async () => 'local-demo-challenge',
  resolveHousehold: async (_apiBaseUrl, credential) => resolveDemoHousehold(credential),
  submitRsvp: async (_apiBaseUrl, payload) => submitDemoRsvp(payload),
};

export const invitationDemoNameSearchServices: NameSearchServices = {
  requestTurnstileToken: invitationDemoServices.requestTurnstileToken,
  searchHouseholds: async (_apiBaseUrl, query) => {
    if (!isValidNameQuery(query)) throw new RsvpApiError('VALIDATION_FAILED');
    const normalize = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
    const words = normalize(query).split(/\s+/u);
    const match = words.every((word) => normalize('Alex Sam Garcia').includes(word));
    return {
      matches: match ? [{ displayName: 'Alex & Sam Garcia', nameTicket: PUBLIC_DEMO_NAME_TICKET }] : [],
      tooMany: false,
    };
  },
};

export const resetInvitationDemo = (): void => {
  currentRsvp = null;
};
