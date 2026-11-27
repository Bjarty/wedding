import type { ResolvedHousehold, RsvpDraft } from './types';

export type NameRenewalDecision = 'resume' | 'wrong-group' | 'changed-group' | 'conflict';

/** Renew access only. This helper never replaces, mutates or submits the draft. */
export const reviewNameRenewal = (
  original: ResolvedHousehold,
  draft: RsvpDraft,
  revision: number,
  refreshed: ResolvedHousehold,
): { decision: NameRenewalDecision; draft: RsvpDraft } => {
  if (refreshed.householdId !== original.householdId) return { decision: 'wrong-group', draft };
  const sameGuestIds = (ids: string[], other: string[]): boolean => {
    const known = new Set(ids);
    return known.size === ids.length && other.length === ids.length &&
      new Set(other).size === other.length && other.every((id) => known.has(id));
  };
  const originalIds = original.guests.map((guest) => guest.guestId);
  if (
    !sameGuestIds(originalIds, refreshed.guests.map((guest) => guest.guestId)) ||
    !sameGuestIds(originalIds, draft.guests.map((guest) => guest.guestId)) ||
    original.invitationVariant !== refreshed.invitationVariant ||
    original.mealChoiceRequired !== refreshed.mealChoiceRequired ||
    original.maxGuests !== refreshed.maxGuests
  ) return { decision: 'changed-group', draft };
  return {
    decision: (refreshed.currentRsvp?.revision ?? 0) === revision ? 'resume' : 'conflict',
    draft,
  };
};
