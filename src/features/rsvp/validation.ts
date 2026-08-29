import type {
  DraftErrors,
  GuestSubmission,
  ResolvedHousehold,
  RsvpDraft,
} from './types';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const createDraft = (household: ResolvedHousehold): RsvpDraft => {
  const savedGuests = new Map(
    household.currentRsvp?.guests.map((guest) => [guest.guestId, guest] as const) ?? [],
  );

  return {
    guests: household.guests.map((guest) => {
      const saved = savedGuests.get(guest.guestId);
      return {
        guestId: guest.guestId,
        attending: saved?.attending ?? null,
        mealChoice: saved?.mealChoice ?? null,
      };
    }),
    email: household.currentRsvp?.email ?? '',
    message: household.currentRsvp?.message ?? '',
  };
};

export const validateDraft = (
  draft: RsvpDraft,
  mealChoiceRequired = true,
): DraftErrors => {
  const errors: DraftErrors = { guestAttendance: {}, guestMeal: {} };

  for (const guest of draft.guests) {
    if (guest.attending === null) {
      errors.guestAttendance[guest.guestId] = 'Kies of deze gast erbij is.';
    } else if (mealChoiceRequired && guest.attending && guest.mealChoice === null) {
      errors.guestMeal[guest.guestId] = 'Kies een maaltijd.';
    }
  }

  const email = draft.email.normalize('NFC').trim();
  if (email.length > 254) {
    errors.email = 'Het e-mailadres is te lang.';
  } else if (email !== '' && !emailPattern.test(email)) {
    errors.email = 'Vul een geldig e-mailadres in of laat dit veld leeg.';
  }

  if (draft.message.normalize('NFC').trim().length > 1_000) {
    errors.message = 'Je bericht mag maximaal 1000 tekens bevatten.';
  }

  return errors;
};

export const hasDraftErrors = (errors: DraftErrors): boolean =>
  Object.keys(errors.guestAttendance).length > 0 ||
  Object.keys(errors.guestMeal).length > 0 ||
  errors.email !== undefined ||
  errors.message !== undefined;

export const toGuestSubmissions = (
  draft: RsvpDraft,
  mealChoiceRequired = true,
): GuestSubmission[] =>
  draft.guests.map((guest) => {
    if (guest.attending === true && mealChoiceRequired && guest.mealChoice !== null) {
      return { guestId: guest.guestId, attending: true, mealChoice: guest.mealChoice };
    }
    if (guest.attending === true && !mealChoiceRequired) {
      return { guestId: guest.guestId, attending: true };
    }
    return { guestId: guest.guestId, attending: false };
  });

export const normalizeOptionalText = (value: string): string | undefined => {
  const normalized = value.normalize('NFC').trim();
  return normalized === '' ? undefined : normalized;
};
