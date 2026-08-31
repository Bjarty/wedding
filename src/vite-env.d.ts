/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RSVP_ENABLED?: string;
  readonly VITE_RSVP_API_BASE_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_RSVP_HOUSEHOLD_CODES_ENABLED?: string;
  readonly VITE_RSVP_CONFIRMATION_EMAIL_ENABLED?: string;
}
