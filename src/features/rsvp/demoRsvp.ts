import type { RsvpExperienceServices } from './RsvpExperience';
import { RsvpApiError } from './api';
import { isPublicDemoHouseholdCode } from './householdCode';
import type { CurrentRsvp, ResolvedHousehold, RsvpCredential, SubmitPayload } from './types';

const demoGuests = [
  { guestId: 'demo_garcia_alex', displayName: 'Alex Garcia' },
  { guestId: 'demo_garcia_sam', displayName: 'Sam Garcia' },
] as const;

let currentRsvp: CurrentRsvp | null = null;

const cloneCurrentRsvp = (): CurrentRsvp | null => {
  if (currentRsvp === null) return null;
  return {
    ...currentRsvp,
    guests: currentRsvp.guests.map((guest) => ({ ...guest })),
  };
};

const resolveDemoHousehold = async (credential: RsvpCredential): Promise<ResolvedHousehold> => {
  if (credential.type !== 'accessCode' || !isPublicDemoHouseholdCode(credential.value)) {
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
  if (payload.credential.type !== 'accessCode' || !isPublicDemoHouseholdCode(payload.credential.value)) {
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

export const resetInvitationDemo = (): void => {
  currentRsvp = null;
};
