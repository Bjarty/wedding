import type { FieldIssue, PublicErrorCode } from './contract.js';

const PUBLIC_MESSAGES: Record<PublicErrorCode, string> = {
  BAD_REQUEST: 'Het verzoek kon niet worden gelezen.',
  CHALLENGE_FAILED: 'De beveiligingscontrole is niet geslaagd. Probeer het opnieuw.',
  CONFIGURATION_ERROR: 'De RSVP-service is tijdelijk niet beschikbaar.',
  IDEMPOTENCY_CONFLICT: 'Deze inzending kan niet veilig opnieuw worden verwerkt.',
  INTERNAL_ERROR: 'Er ging iets mis. Probeer het later opnieuw.',
  INVITATION_INVALID: 'Deze uitnodigingslink is ongeldig of verlopen.',
  METHOD_NOT_ALLOWED: 'Deze bewerking wordt niet ondersteund.',
  NOT_FOUND: 'Deze API-route bestaat niet.',
  ORIGIN_NOT_ALLOWED: 'Dit verzoek is niet toegestaan.',
  PAYLOAD_TOO_LARGE: 'De inzending is te groot.',
  RATE_LIMITED: 'Er zijn te veel pogingen gedaan. Probeer het later opnieuw.',
  REVISION_CONFLICT: 'Deze reactie is intussen gewijzigd. Laad de nieuwste versie en probeer opnieuw.',
  RSVP_CLOSED: 'De RSVP is gesloten.',
  UNSUPPORTED_MEDIA_TYPE: 'Stuur het verzoek als JSON.',
  UPSTREAM_UNAVAILABLE: 'Opslaan is tijdelijk niet mogelijk. Probeer het later opnieuw.',
  VALIDATION_FAILED: 'Controleer de gemarkeerde velden.',
};

export class PublicHttpError extends Error {
  readonly status: number;
  readonly code: PublicErrorCode;
  readonly fields?: FieldIssue[];
  readonly retryAfter?: number;

  constructor(
    status: number,
    code: PublicErrorCode,
    options: { fields?: FieldIssue[]; retryAfter?: number } = {},
  ) {
    super(PUBLIC_MESSAGES[code]);
    this.name = 'PublicHttpError';
    this.status = status;
    this.code = code;
    if (options.fields !== undefined) this.fields = options.fields;
    if (options.retryAfter !== undefined) this.retryAfter = options.retryAfter;
  }
}

export const getPublicMessage = (code: PublicErrorCode) => PUBLIC_MESSAGES[code];
