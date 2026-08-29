export interface RsvpConfig {
  apiBaseUrl: string;
  turnstileSiteKey: string;
}

interface RsvpImportMeta extends ImportMeta {
  readonly env?: RsvpEnvironment;
}

export interface RsvpEnvironment {
  readonly DEV?: boolean;
  readonly VITE_RSVP_ENABLED?: string;
  readonly VITE_RSVP_API_BASE_URL?: string;
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

const normalizeApiBaseUrl = (value: string | undefined, allowLocalhost: boolean): string | null => {
  if (value === undefined || value.trim() === '') return null;

  try {
    const url = new URL(value.trim());
    const isLocalDevelopment =
      allowLocalhost &&
      url.protocol === 'http:' &&
      (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]');

    if (
      (url.protocol !== 'https:' && !isLocalDevelopment) ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    ) {
      return null;
    }

    return url.toString().replace(/\/$/u, '');
  } catch {
    return null;
  }
};

export const parseRsvpConfig = (env: RsvpEnvironment | undefined): RsvpConfig | null => {
  if (env?.VITE_RSVP_ENABLED !== 'true') return null;
  const apiBaseUrl = normalizeApiBaseUrl(env?.VITE_RSVP_API_BASE_URL, env?.DEV === true);
  const turnstileSiteKey = env?.VITE_TURNSTILE_SITE_KEY?.trim();

  if (apiBaseUrl === null || turnstileSiteKey === undefined || turnstileSiteKey === '') return null;
  return { apiBaseUrl, turnstileSiteKey };
};

export const getRsvpConfig = (): RsvpConfig | null =>
  parseRsvpConfig((import.meta as RsvpImportMeta).env);
