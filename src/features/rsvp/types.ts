export const mealChoices = ['fish', 'meat', 'vegetarian', 'vegan'] as const;

export type MealChoice = (typeof mealChoices)[number];

export interface GuestSubmission {
  guestId: string;
  attending: boolean;
  mealChoice?: MealChoice;
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

export interface ResolvedHousehold {
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

export interface GuestDraft {
  guestId: string;
  attending: boolean | null;
  mealChoice: MealChoice | null;
}

export interface RsvpDraft {
  guests: GuestDraft[];
  email: string;
  message: string;
}

export interface DraftErrors {
  guestAttendance: Record<string, string>;
  guestMeal: Record<string, string>;
  email?: string;
  message?: string;
}

export interface SubmitPayload {
  inviteToken: string;
  idempotencyKey: string;
  revision: number;
  attending: boolean;
  guests: GuestSubmission[];
  email?: string;
  message?: string;
  turnstileToken: string;
}
