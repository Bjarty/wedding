/**
 * Private Google Sheets writer for wedding RSVPs.
 *
 * Only the serverless RSVP API may call this web app. The browser must never
 * know the deployment URL or WRITER_HMAC_SECRET.
 */

const PROTOCOL_VERSION_ = 'v1';
const DEFAULT_CLOCK_SKEW_SECONDS_ = 300;
const MAX_ENCODED_PAYLOAD_LENGTH_ = 60000;
const MAX_INTENT_JSON_LENGTH_ = 20000;
const LOCK_TIMEOUT_MILLISECONDS_ = 10000;
const INTENT_MAC_DOMAIN_ = 'rsvp-intent-v1';
const COMPLETION_MAC_DOMAIN_ = 'rsvp-completion-v1';
const EMAIL_CONTENT_MAC_DOMAIN_ = 'rsvp-email-content-v1';
const EMAIL_STATE_MAC_DOMAIN_ = 'rsvp-email-state-v1';
const EMAIL_DELIVERY_ID_DOMAIN_ = 'rsvp-email-delivery-id-v1';
const EMAIL_PROVIDER_KEY_DOMAIN_ = 'rsvp-email-provider-key-v1';
const PRODUCTION_SHEET_CLEAR_EARLIEST_ = '2027-05-23T00:00:00+02:00';
const RETENTION_DELETE_BY_ = '2027-08-01T00:00:00+02:00';
const EMAIL_AMBIGUITY_CUTOFF_MILLISECONDS_ = 24 * 60 * 60 * 1000;
const EMAIL_CLAIM_LEASE_MILLISECONDS_ = 60 * 1000;
const EMAIL_OUTBOX_BATCH_SIZE_ = 20;
const EMAIL_PROVIDER_URL_ = 'https://api.resend.com/emails';
const CURRENT_EMAIL_TEMPLATE_VERSION_ = 'rsvp_confirmation_v1';
const SUPPORTED_EMAIL_TEMPLATE_VERSIONS_ = new Set(['rsvp_confirmation_v1']);

const REQUEST_ID_PATTERN_ = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_PATTERN_ = REQUEST_ID_PATTERN_;
const TOKEN_HASH_PATTERN_ = /^[A-Za-z0-9_-]{43}$/;
const OPAQUE_ID_PATTERN_ = /^[A-Za-z0-9_-]{1,64}$/;
const RECEIPT_NUMBER_PATTERN_ = /^RSVP-[A-Z0-9]{6,20}$/;
const PROVIDER_MESSAGE_ID_PATTERN_ = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEAL_CHOICES_ = new Set(['fish', 'meat', 'vegetarian', 'vegan']);
const INVITATION_VARIANTS_ = new Set(['day', 'evening']);
const LEGACY_INVITATION_HEADERS_ = Object.freeze([
  'householdId',
  'tokenHash',
  'displayName',
  'maxGuests',
  'active',
  'currentRevision',
  'createdAt',
  'updatedAt',
]);
const PUBLIC_ERROR_CODES_ = new Set([
  'INVITATION_INVALID',
  'RSVP_CLOSED',
  'REVISION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'RATE_LIMITED',
  'WRITER_BUSY',
]);

const SHEETS_ = Object.freeze({
  invitations: 'Invitations',
  responses: 'Responses',
  guestDetails: 'GuestDetails',
  idempotency: 'Idempotency',
  audit: 'Audit',
  emailOutbox: 'EmailOutbox',
});

const HEADERS_ = Object.freeze({
  Invitations: [
    'householdId',
    'tokenHash',
    'accessCodeHash',
    'displayName',
    'invitationVariant',
    'mealChoiceRequired',
    'maxGuests',
    'active',
    'currentRevision',
    'createdAt',
    'updatedAt',
  ],
  Responses: [
    'responseId',
    'receiptNumber',
    'householdId',
    'revision',
    'attending',
    'guestCount',
    'email',
    'message',
    'submittedAt',
    'updatedAt',
  ],
  GuestDetails: [
    'householdId',
    'guestId',
    'displayName',
    'attending',
    'mealChoice',
    'revision',
    'updatedAt',
  ],
  Idempotency: [
    'requestId',
    'operation',
    'idempotencyKey',
    'payloadHash',
    'householdId',
    'baseRevision',
    'targetRevision',
    'status',
    'intentJson',
    'intentMac',
    'responseJson',
    'completionMac',
    'requestTimestamp',
    'createdAt',
    'updatedAt',
    'expiresAt',
  ],
  Audit: [
    'auditId',
    'occurredAt',
    'operation',
    'outcome',
    'householdId',
    'responseId',
    'revision',
    'idempotencyKey',
    'requestId',
  ],
  EmailOutbox: [
    'deliveryId',
    'idempotencyKey',
    'submitIntentMac',
    'templateVersion',
    'recipientEmail',
    'receiptNumber',
    'revision',
    'createdAt',
    'expiresAt',
    'contentMac',
    'status',
    'attemptCount',
    'firstAttemptAt',
    'claimedAt',
    'lastAttemptAt',
    'nextAttemptAt',
    'sentAt',
    'providerMessageId',
    'lastErrorCode',
    'stateMac',
  ],
});

const TEXT_COLUMNS_ = Object.freeze({
  Invitations: ['householdId', 'tokenHash', 'accessCodeHash', 'displayName', 'invitationVariant'],
  Responses: ['responseId', 'receiptNumber', 'householdId', 'email', 'message'],
  GuestDetails: ['householdId', 'guestId', 'displayName', 'mealChoice'],
  Idempotency: [
    'requestId',
    'operation',
    'idempotencyKey',
    'payloadHash',
    'householdId',
    'status',
    'intentJson',
    'intentMac',
    'responseJson',
    'completionMac',
  ],
  Audit: ['auditId', 'operation', 'outcome', 'householdId', 'responseId', 'idempotencyKey', 'requestId'],
  EmailOutbox: [
    'deliveryId',
    'idempotencyKey',
    'submitIntentMac',
    'templateVersion',
    'recipientEmail',
    'receiptNumber',
    'contentMac',
    'status',
    'providerMessageId',
    'lastErrorCode',
    'stateMac',
  ],
});

class ApiError_ extends Error {
  constructor(code) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** Creates the six required tabs and exact headers without deleting data. */
function initSheet() {
  const spreadsheet = getConfiguredSpreadsheet_();
  assertExpectedOwner_(spreadsheet);
  getEnvironment_();

  spreadsheet.setSpreadsheetTimeZone('Europe/Amsterdam');
  spreadsheet.setSpreadsheetLocale('nl_NL');

  const initialized = [];
  for (const sheetName of Object.values(SHEETS_)) {
    const headers = HEADERS_[sheetName];
    let sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) sheet = spreadsheet.insertSheet(sheetName);

    ensureColumnCapacity_(sheet, headers.length);
    const existingHeader = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    const headerIsEmpty = existingHeader.every((value) => value.trim() === '');
    if (headerIsEmpty) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else if (!arraysEqual_(existingHeader, headers)) {
      throw new Error(`${sheetName} has an unexpected header row; no data was changed.`);
    }

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1C1917')
      .setFontColor('#FAFAF9');
    setTextColumnFormats_(sheet, headers, TEXT_COLUMNS_[sheetName]);
    sheet.autoResizeColumns(1, headers.length);
    initialized.push(sheetName);
  }

  SpreadsheetApp.flush();
  return {
    environment: getEnvironment_(),
    spreadsheetId: spreadsheet.getId(),
    owner: spreadsheet.getOwner().getEmail(),
    sheets: initialized,
  };
}

/**
 * Migrates only the legacy Invitations header to the v2 access-code schema.
 *
 * Existing invitations remain usable through tokenHash and receive the
 * legacy-safe policy day/meal-required. The migration is idempotent, refuses
 * unrecognized headers and never runs while a durable submit intent is
 * pending. It deliberately does not create access codes.
 */
function migrateInvitationSchemaV1ToV2() {
  return withScriptLock_(() => {
    const spreadsheet = getConfiguredSpreadsheet_();
    assertExpectedOwner_(spreadsheet);
    getEnvironment_();

    const invitationSheet = spreadsheet.getSheetByName(SHEETS_.invitations);
    if (!invitationSheet) throw new Error('Missing required sheet Invitations.');
    const currentHeaders = HEADERS_.Invitations;
    if (invitationSheet.getLastColumn() > currentHeaders.length) {
      throw new Error('Invitations contains unexpected trailing columns; no data was changed.');
    }
    const headerWidth = Math.max(LEGACY_INVITATION_HEADERS_.length, currentHeaders.length);
    const visibleHeader = invitationSheet.getRange(1, 1, 1, headerWidth).getDisplayValues()[0];
    const isCurrent = arraysEqual_(visibleHeader.slice(0, currentHeaders.length), currentHeaders)
      && visibleHeader.slice(currentHeaders.length).every((value) => value.trim() === '');
    if (isCurrent) {
      assertSchema_(spreadsheet);
      return { migrated: false, schemaVersion: 2, invitationRows: Math.max(0, invitationSheet.getLastRow() - 1) };
    }

    const isLegacy = arraysEqual_(
      visibleHeader.slice(0, LEGACY_INVITATION_HEADERS_.length),
      LEGACY_INVITATION_HEADERS_,
    ) && visibleHeader.slice(LEGACY_INVITATION_HEADERS_.length).every((value) => value.trim() === '');
    if (!isLegacy) throw new Error('Invitations has neither the exact legacy nor v2 header; no data was changed.');

    for (const sheetName of Object.values(SHEETS_)) {
      if (sheetName === SHEETS_.invitations) continue;
      const sheet = spreadsheet.getSheetByName(sheetName);
      const headers = HEADERS_[sheetName];
      if (!sheet) throw new Error(`Missing required sheet ${sheetName}; no data was changed.`);
      const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
      if (!arraysEqual_(actual, headers)) {
        throw new Error(`Sheet ${sheetName} has unexpected headers; no data was changed.`);
      }
    }

    const idempotencySheet = spreadsheet.getSheetByName(SHEETS_.idempotency);
    const submitIntents = findRows_(idempotencySheet, 'operation', 'submit');
    if (submitIntents.some((row) => !['pending', 'completed'].includes(String(row.values.status)))) {
      throw new Error('A submit intent has an unknown status; no migration was performed.');
    }
    const pendingSubmit = submitIntents.some((row) => String(row.values.status) === 'pending');
    if (pendingSubmit) throw new Error('A pending submit intent exists; no migration was performed.');

    const dataRowCount = Math.max(0, invitationSheet.getLastRow() - 1);
    const legacyRows = dataRowCount === 0
      ? []
      : invitationSheet.getRange(2, 1, dataRowCount, headerWidth).getValues();
    const householdIds = new Set();
    const tokenHashes = new Set();
    const migratedRows = legacyRows.map((row) => {
      if (row.slice(LEGACY_INVITATION_HEADERS_.length).some((value) => value !== '' && value !== null)) {
        throw new Error('Legacy Invitations contains unexpected trailing data; no data was changed.');
      }
      const legacy = Object.fromEntries(
        LEGACY_INVITATION_HEADERS_.map((header, index) => [header, row[index]]),
      );
      const householdId = normalizeOpaqueId_(legacy.householdId);
      const tokenHash = normalizeStoredCredentialHash_(legacy.tokenHash, false);
      normalizeStoredDisplayName_(legacy.displayName);
      asInteger_(legacy.maxGuests, 1, 20);
      asBooleanStrict_(legacy.active);
      if (legacy.currentRevision !== '') asInteger_(legacy.currentRevision, 0, 1000000);
      toIsoTimestamp_(legacy.createdAt);
      toIsoTimestamp_(legacy.updatedAt);
      if (householdIds.has(householdId) || tokenHashes.has(tokenHash)) {
        throw new Error('Legacy Invitations contains duplicate household or token hashes; no data was changed.');
      }
      householdIds.add(householdId);
      tokenHashes.add(tokenHash);

      return [
        legacy.householdId,
        legacy.tokenHash,
        '',
        legacy.displayName,
        'day',
        true,
        legacy.maxGuests,
        legacy.active,
        legacy.currentRevision,
        legacy.createdAt,
        legacy.updatedAt,
      ];
    });

    ensureColumnCapacity_(invitationSheet, currentHeaders.length);
    // Commit header and converted rows in one Sheets write. A failure cannot
    // otherwise leave a v2 header above still-legacy row positions, which a
    // retry could mistake for an already completed migration.
    invitationSheet
      .getRange(1, 1, migratedRows.length + 1, currentHeaders.length)
      .setValues([currentHeaders, ...migratedRows]);
    setTextColumnFormats_(invitationSheet, currentHeaders, TEXT_COLUMNS_.Invitations);
    invitationSheet.setFrozenRows(1);
    invitationSheet.autoResizeColumns(1, currentHeaders.length);
    SpreadsheetApp.flush();
    assertSchema_(spreadsheet);
    return { migrated: true, schemaVersion: 2, invitationRows: migratedRows.length };
  });
}

/** Read-only preview for a defense-in-depth Sheet data clear. */
function previewRsvpSheetClear() {
  const spreadsheet = getConfiguredSpreadsheet_();
  assertExpectedOwner_(spreadsheet);
  assertSchema_(spreadsheet);
  return buildSheetClearPreview_(spreadsheet, new Date());
}

/**
 * Clears visible data cells in all six RSVP tabs while preserving headers.
 * This is a reset/defense-in-depth step, not permanent erasure: Sheet version
 * history may retain data until the owner deletes and empties the file trash.
 */
function clearRsvpSheetDataWithConfirmation() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MILLISECONDS_)) {
    throw new Error('Could not acquire the RSVP ScriptLock. Try again later.');
  }

  try {
    if (confirmationEmailEnabled_()) {
      throw new Error('Disable confirmation email before clearing RSVP Sheet data.');
    }
    const spreadsheet = getConfiguredSpreadsheet_();
    assertExpectedOwner_(spreadsheet);
    assertSchema_(spreadsheet);
    if (findRows_(spreadsheet.getSheetByName(SHEETS_.emailOutbox), 'status', 'sending').length > 0) {
      throw new Error('Confirmation email delivery is still in flight; Sheet clear was blocked.');
    }
    const preview = buildSheetClearPreview_(spreadsheet, new Date());
    if (!preview.eligibleNow) {
      throw new Error(`Production Sheet clear is blocked until ${PRODUCTION_SHEET_CLEAR_EARLIEST_}.`);
    }

    const properties = PropertiesService.getScriptProperties();
    const providedConfirmation = properties.getProperty('RSVP_SHEET_CLEAR_CONFIRMATION');
    if (!constantTimeEqual_(providedConfirmation || '', preview.confirmationValue)) {
      throw new Error('RSVP_SHEET_CLEAR_CONFIRMATION does not match the Sheet-clear preview.');
    }

    for (const sheetName of Object.values(SHEETS_)) {
      const sheet = spreadsheet.getSheetByName(sheetName);
      const dataRows = Math.max(0, sheet.getLastRow() - 1);
      if (dataRows > 0) {
        sheet.getRange(2, 1, dataRows, sheet.getLastColumn()).clearContent();
      }
    }

    SpreadsheetApp.flush();
    const clearedAt = new Date().toISOString();
    properties.deleteProperty('RSVP_SHEET_CLEAR_CONFIRMATION');
    properties.setProperty('LAST_RSVP_SHEET_CLEAR_AT', clearedAt);
    return {
      environment: preview.environment,
      clearedAt,
      clearedRows: preview.rowCounts,
      headersPreserved: true,
      permanentDeletionCompleted: false,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Manually recovers every durable pending submit intent. This is intentionally
 * not installed as a trigger: operators run it after inspecting the Sheet.
 */
function recoverAllPendingIntents() {
  return withScriptLock_(() => {
    const spreadsheet = getReadySpreadsheet_();
    const sheet = spreadsheet.getSheetByName(SHEETS_.idempotency);
    const submitRows = findRows_(sheet, 'operation', 'submit');
    if (submitRows.some((row) => !['pending', 'completed'].includes(String(row.values.status)))) {
      throw new Error('Submit idempotency row has an unknown status.');
    }
    const pendingRows = submitRows.filter((row) => row.values.status === 'pending');
    const intents = pendingRows.map((row) => ({ row, intent: readAndValidateSubmitIntent_(row) }));
    const pendingHouseholds = new Set();
    for (const entry of intents) {
      if (pendingHouseholds.has(entry.intent.householdId)) {
        throw new Error('More than one pending intent exists for a household.');
      }
      pendingHouseholds.add(entry.intent.householdId);
    }

    const recovered = intents.map((entry) => applyPendingIntent_(spreadsheet, entry.row));
    return { recovered: recovered.length, results: recovered };
  });
}

/**
 * Reconciles and delivers at most one bounded batch of confirmation emails.
 * Install this as a time-driven trigger only after the Resend configuration
 * and the activation timestamp have been reviewed. The function deliberately
 * returns counts only: recipient addresses and provider details stay private.
 */
function processConfirmationEmailOutbox() {
  if (!confirmationEmailEnabled_()) {
    return { processed: 0, sent: 0, retry: 0, manualReview: 0 };
  }

  reconcileConfirmationEmailOutbox_();
  const summary = { processed: 0, sent: 0, retry: 0, manualReview: 0 };
  const candidates = listConfirmationEmailCandidates_(EMAIL_OUTBOX_BATCH_SIZE_);
  for (const candidate of candidates) {
    const outcome = processOneConfirmationEmail_(candidate.deliveryId, candidate);
    if (!outcome) continue;
    summary.processed += 1;
    if (outcome.status === 'sent') summary.sent += 1;
    else if (outcome.status === 'retry') summary.retry += 1;
    else if (outcome.status === 'manual_review') summary.manualReview += 1;
  }
  return summary;
}

function confirmationEmailEnabled_() {
  return PropertiesService.getScriptProperties()
    .getProperty('CONFIRMATION_EMAIL_ENABLED') === 'true';
}

function getConfirmationEmailActivationIso_() {
  const value = getRequiredProperty_('CONFIRMATION_EMAIL_ACTIVATED_AT').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) {
    throw new Error('CONFIRMATION_EMAIL_ACTIVATED_AT must include an explicit ISO-8601 time zone.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const offsetHours = match[10] === undefined ? 0 : Number(match[10]);
  const offsetMinutes = match[11] === undefined ? 0 : Number(match[11]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]
      || offsetHours > 14 || (offsetHours === 14 && offsetMinutes !== 0)) {
    throw new Error('CONFIRMATION_EMAIL_ACTIVATED_AT is not a valid zoned timestamp.');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error('CONFIRMATION_EMAIL_ACTIVATED_AT is not a valid zoned timestamp.');
  }
  return new Date(timestamp).toISOString();
}

function getResendApiKey_() {
  const value = getRequiredProperty_('RESEND_API_KEY').trim();
  if (!/^re_[A-Za-z0-9_-]{16,}$/.test(value)) {
    throw new Error('RESEND_API_KEY has an unexpected format.');
  }
  return value;
}

function trySynchronizeConfirmationEmail_(spreadsheet, completedRow) {
  if (!confirmationEmailEnabled_()) return '';
  try {
    supersedeOlderConfirmationEmails_(spreadsheet, completedRow);
    return ensureConfirmationEmailOutboxRow_(spreadsheet, completedRow);
  } catch (error) {
    // Never include addresses, receipt numbers or exception messages in logs.
    console.error('RSVP confirmation email enqueue failed.');
    return '';
  }
}

function ensureConfirmationEmailOutboxRow_(spreadsheet, completedRow) {
  if (!confirmationEmailEnabled_()) return '';
  if (!completedRow || completedRow.values.operation !== 'submit'
      || completedRow.values.status !== 'completed') {
    throw new Error('Confirmation email requires a completed submit intent.');
  }
  if (Date.now() >= Date.parse(RETENTION_DELETE_BY_)) return '';

  const intent = readAndValidateSubmitIntent_(completedRow);
  const activationIso = getConfirmationEmailActivationIso_();
  // savedAt is inside the authenticated submit intent. The mutable
  // Idempotency.createdAt cell must never be able to move the mail cutoff.
  const submitCreatedAt = intent.result.savedAt;
  if (Date.parse(submitCreatedAt) < Date.parse(activationIso)) return '';
  const responseSheet = spreadsheet.getSheetByName(SHEETS_.responses);
  const responseRow = findUniqueRow_(
    responseSheet,
    'householdId',
    intent.householdId,
  );
  if (!responseRow) throw new Error('Confirmation submit has no current response.');
  assertResponseRowHasNoFormulas_(responseSheet, responseRow);
  const currentResponse = responseStateFromValues_(responseRow.values);
  assertStoredResponseTextValid_(currentResponse);
  if (currentResponse.revision > intent.targetRevision) return '';
  if (currentResponse.revision !== intent.targetRevision
      || currentResponse.receiptNumber !== intent.result.receiptNumber
      || currentResponse.email !== intent.response.email) {
    throw new Error('Confirmation submit does not match the current response.');
  }
  if (!intent.response.email) return '';
  const secret = getRequiredProperty_('WRITER_HMAC_SECRET');
  const deliveryId = hmacSha256Base64Url_(
    JSON.stringify([
      EMAIL_DELIVERY_ID_DOMAIN_,
      intent.idempotencyKey,
      String(completedRow.values.intentMac),
    ]),
    secret,
  );
  const sheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);
  const existing = findUniqueRow_(sheet, 'deliveryId', deliveryId);
  if (existing) {
    readAndValidateConfirmationOutboxRow_(spreadsheet, existing);
    return deliveryId;
  }

  const values = {
    deliveryId,
    idempotencyKey: intent.idempotencyKey,
    submitIntentMac: String(completedRow.values.intentMac),
    templateVersion: CURRENT_EMAIL_TEMPLATE_VERSION_,
    recipientEmail: intent.response.email,
    receiptNumber: intent.result.receiptNumber,
    revision: intent.result.revision,
    createdAt: submitCreatedAt,
    expiresAt: new Date(RETENTION_DELETE_BY_).toISOString(),
    contentMac: '',
    status: 'queued',
    attemptCount: 0,
    firstAttemptAt: '',
    claimedAt: '',
    lastAttemptAt: '',
    nextAttemptAt: submitCreatedAt,
    sentAt: '',
    providerMessageId: '',
    lastErrorCode: '',
    stateMac: '',
  };
  values.contentMac = computeEmailContentMac_(values);
  values.stateMac = computeEmailStateMac_(values);
  appendObjectRow_(sheet, HEADERS_.EmailOutbox, {
    ...values,
    recipientEmail: escapeForSheet_(values.recipientEmail),
  });
  SpreadsheetApp.flush();

  const durable = findUniqueRow_(sheet, 'deliveryId', deliveryId);
  if (!durable) throw new Error('Confirmation outbox row was not persisted.');
  readAndValidateConfirmationOutboxRow_(spreadsheet, durable);
  return deliveryId;
}

function buildConfirmationEmailOutboxPlan_(completedRow, intent, currentResponse, existingByDeliveryId) {
  if (Date.now() >= Date.parse(RETENTION_DELETE_BY_)) return null;
  const activationIso = getConfirmationEmailActivationIso_();
  const submitCreatedAt = intent.result.savedAt;
  if (Date.parse(submitCreatedAt) < Date.parse(activationIso)
      || currentResponse.revision > intent.targetRevision) {
    return null;
  }
  if (currentResponse.revision !== intent.targetRevision
      || currentResponse.receiptNumber !== intent.result.receiptNumber
      || currentResponse.email !== intent.response.email) {
    throw new Error('Confirmation submit does not match the current response.');
  }
  if (!intent.response.email) return null;

  const deliveryId = hmacSha256Base64Url_(
    JSON.stringify([
      EMAIL_DELIVERY_ID_DOMAIN_,
      intent.idempotencyKey,
      String(completedRow.values.intentMac),
    ]),
    getRequiredProperty_('WRITER_HMAC_SECRET'),
  );
  if (existingByDeliveryId.has(deliveryId)) {
    return { deliveryId, values: null };
  }
  const values = {
    deliveryId,
    idempotencyKey: intent.idempotencyKey,
    submitIntentMac: String(completedRow.values.intentMac),
    templateVersion: CURRENT_EMAIL_TEMPLATE_VERSION_,
    recipientEmail: intent.response.email,
    receiptNumber: intent.result.receiptNumber,
    revision: intent.result.revision,
    createdAt: submitCreatedAt,
    expiresAt: new Date(RETENTION_DELETE_BY_).toISOString(),
    contentMac: '',
    status: 'queued',
    attemptCount: 0,
    firstAttemptAt: '',
    claimedAt: '',
    lastAttemptAt: '',
    nextAttemptAt: submitCreatedAt,
    sentAt: '',
    providerMessageId: '',
    lastErrorCode: '',
    stateMac: '',
  };
  values.contentMac = computeEmailContentMac_(values);
  values.stateMac = computeEmailStateMac_(values);
  return { deliveryId, values };
}

function supersedeOlderConfirmationEmails_(spreadsheet, completedRow) {
  if (!completedRow || completedRow.values.operation !== 'submit'
      || completedRow.values.status !== 'completed') {
    throw new Error('Confirmation supersede requires a completed submit intent.');
  }
  const currentIntent = readAndValidateSubmitIntent_(completedRow);
  const sheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);
  const submitRowsByIdempotencyKey = new Map();
  for (const row of readAllObjectRows_(spreadsheet.getSheetByName(SHEETS_.idempotency))) {
    if (row.values.operation !== 'submit') continue;
    const key = String(row.values.idempotencyKey || '');
    if (submitRowsByIdempotencyKey.has(key)) throw new Error('Submit idempotency key is duplicated.');
    submitRowsByIdempotencyKey.set(key, row);
  }
  // Validate every row before the first mutation so a tampered outbox fails
  // closed without partially superseding other deliveries.
  const outboxRows = readAllObjectRows_(sheet);
  assertEmailOutboxRecipientFormulasEmpty_(sheet, outboxRows.length);
  const entries = outboxRows.map((row) => ({
    row,
    value: readAndValidateConfirmationOutboxRow_(spreadsheet, row, {
      submitRowsByIdempotencyKey,
      formulasAlreadyChecked: true,
    }),
  }));
  for (const entry of entries) {
    const value = entry.value;
    const abandonedSending = value.status === 'sending'
      && Date.now() - Date.parse(value.claimedAt) >= EMAIL_CLAIM_LEASE_MILLISECONDS_;
    if (value.householdId !== currentIntent.householdId
        || value.revision >= currentIntent.targetRevision
        || (!['queued', 'retry'].includes(value.status) && !abandonedSending)) {
      continue;
    }
    writeConfirmationEmailState_(spreadsheet, entry.row, {
      ...value,
      status: 'manual_review',
      claimedAt: '',
      nextAttemptAt: '',
      sentAt: '',
      providerMessageId: '',
      lastErrorCode: 'superseded',
    });
  }
}

function reconcileConfirmationEmailOutbox_() {
  return withScriptLock_(() => {
    if (!confirmationEmailEnabled_()) return { createdOrPresent: 0 };
    const spreadsheet = getReadySpreadsheet_();
    const idempotencySheet = spreadsheet.getSheetByName(SHEETS_.idempotency);
    const responseSheet = spreadsheet.getSheetByName(SHEETS_.responses);
    const outboxSheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);

    // Build every index once. No Sheets mutation occurs until current
    // responses, their submit intents and the complete outbox all validate.
    const submitRowsByIdempotencyKey = new Map();
    const completedRowsByHouseholdRevision = new Map();
    for (const row of readAllObjectRows_(idempotencySheet)) {
      if (row.values.operation !== 'submit') continue;
      if (!['pending', 'completed'].includes(String(row.values.status))) {
        throw new Error('Submit idempotency row has an unknown status.');
      }
      const idempotencyKey = String(row.values.idempotencyKey || '');
      if (submitRowsByIdempotencyKey.has(idempotencyKey)) {
        throw new Error('Submit idempotency key is duplicated.');
      }
      submitRowsByIdempotencyKey.set(idempotencyKey, row);
      if (row.values.status !== 'completed') continue;
      const binding = `${String(row.values.householdId)}\u0000${String(row.values.targetRevision)}`;
      if (completedRowsByHouseholdRevision.has(binding)) {
        throw new Error('Completed household revision is duplicated.');
      }
      completedRowsByHouseholdRevision.set(binding, row);
    }

    const currentResponseByHousehold = new Map();
    const responseRows = readAllObjectRows_(responseSheet);
    assertResponseFormulasEmpty_(responseSheet, responseRows.length);
    const currentEntries = responseRows.map((responseRow) => {
      const response = responseStateFromValues_(responseRow.values);
      assertStoredResponseTextValid_(response);
      if (currentResponseByHousehold.has(response.householdId)) {
        throw new Error('Current response household is duplicated.');
      }
      currentResponseByHousehold.set(response.householdId, { row: responseRow, response });
      const completedRow = completedRowsByHouseholdRevision.get(
        `${response.householdId}\u0000${response.revision}`,
      );
      if (!completedRow) throw new Error('Current response has no completed submit intent.');
      const intent = readAndValidateSubmitIntent_(completedRow);
      if (intent.householdId !== response.householdId
          || intent.response.email !== response.email
          || intent.result.receiptNumber !== response.receiptNumber) {
        throw new Error('Current response differs from its completed submit intent.');
      }
      return { row: completedRow, intent, response };
    });
    const currentIntentByHousehold = new Map(
      currentEntries.map((entry) => [entry.intent.householdId, entry.intent]),
    );

    const outboxRows = readAllObjectRows_(outboxSheet);
    assertEmailOutboxRecipientFormulasEmpty_(outboxSheet, outboxRows.length);
    const validationOptions = { submitRowsByIdempotencyKey, formulasAlreadyChecked: true };
    const outboxEntries = outboxRows.map((row) => ({
      row,
      value: readAndValidateConfirmationOutboxRow_(spreadsheet, row, validationOptions),
    }));
    const outboxByDeliveryId = new Map();
    for (const entry of outboxEntries) {
      if (outboxByDeliveryId.has(entry.value.deliveryId)) {
        throw new Error('Confirmation delivery ID is duplicated.');
      }
      outboxByDeliveryId.set(entry.value.deliveryId, entry);
    }

    const statePlans = [];
    for (const entry of outboxEntries) {
      const latestIntent = currentIntentByHousehold.get(entry.value.householdId);
      if (!latestIntent || entry.value.revision >= latestIntent.targetRevision) continue;
      const abandonedSending = entry.value.status === 'sending'
        && Date.now() - Date.parse(entry.value.claimedAt) >= EMAIL_CLAIM_LEASE_MILLISECONDS_;
      if (!['queued', 'retry'].includes(entry.value.status) && !abandonedSending) continue;
      statePlans.push({
        row: entry.row,
        target: prepareConfirmationEmailState_({
          ...entry.value,
          status: 'manual_review',
          claimedAt: '',
          nextAttemptAt: '',
          sentAt: '',
          providerMessageId: '',
          lastErrorCode: 'superseded',
        }),
      });
    }

    const enqueuePlans = currentEntries
      .map((entry) => buildConfirmationEmailOutboxPlan_(
        entry.row,
        entry.intent,
        entry.response,
        outboxByDeliveryId,
      ))
      .filter((plan) => plan !== null);
    const newPlans = enqueuePlans.filter((plan) => plan.values !== null);

    // All reads and MAC/binding validation have completed. Apply state changes
    // and contiguous appends, then cross one shared flush boundary.
    const columns = headerIndex_(HEADERS_.EmailOutbox);
    for (const plan of statePlans) {
      outboxSheet
        .getRange(plan.row.rowNumber, columns.status + 1, 1, HEADERS_.EmailOutbox.length - columns.status)
        .setValues([confirmationEmailStateCells_(plan.target)]);
    }
    if (newPlans.length > 0) {
      outboxSheet
        .getRange(outboxSheet.getLastRow() + 1, 1, newPlans.length, HEADERS_.EmailOutbox.length)
        .setValues(newPlans.map((plan) => confirmationEmailOutboxCells_(plan.values)));
    }
    if (statePlans.length > 0 || newPlans.length > 0) {
      SpreadsheetApp.flush();
      const durableRows = readAllObjectRows_(outboxSheet);
      assertEmailOutboxRecipientFormulasEmpty_(outboxSheet, durableRows.length);
      const durableByDeliveryId = new Map();
      for (const row of durableRows) {
        const value = readAndValidateConfirmationOutboxRow_(spreadsheet, row, validationOptions);
        if (durableByDeliveryId.has(value.deliveryId)) {
          throw new Error('Confirmation delivery ID is duplicated after reconciliation.');
        }
        durableByDeliveryId.set(value.deliveryId, value);
      }
      for (const plan of statePlans) {
        const durable = durableByDeliveryId.get(plan.target.deliveryId);
        if (!durable || durable.status !== 'manual_review'
            || durable.lastErrorCode !== 'superseded') {
          throw new Error('Superseded confirmation state was not persisted.');
        }
      }
      for (const plan of newPlans) {
        const durable = durableByDeliveryId.get(plan.deliveryId);
        if (!durable || durable.status !== 'queued') {
          throw new Error('Queued confirmation outbox row was not persisted.');
        }
      }
    }
    return { createdOrPresent: enqueuePlans.length };
  });
}

function listConfirmationEmailCandidates_(limit) {
  return withScriptLock_(() => {
    if (!confirmationEmailEnabled_()) return [];
    const spreadsheet = getReadySpreadsheet_();
    const idempotencySheet = spreadsheet.getSheetByName(SHEETS_.idempotency);
    const responseSheet = spreadsheet.getSheetByName(SHEETS_.responses);
    const outboxSheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);

    const submitRowsByIdempotencyKey = new Map();
    for (const row of readAllObjectRows_(idempotencySheet)) {
      if (row.values.operation !== 'submit') continue;
      const key = String(row.values.idempotencyKey || '');
      if (submitRowsByIdempotencyKey.has(key)) throw new Error('Submit idempotency key is duplicated.');
      submitRowsByIdempotencyKey.set(key, row);
    }
    const responseByHousehold = new Map();
    const responseRows = readAllObjectRows_(responseSheet);
    assertResponseFormulasEmpty_(responseSheet, responseRows.length);
    for (const row of responseRows) {
      const response = responseStateFromValues_(row.values);
      assertStoredResponseTextValid_(response);
      if (responseByHousehold.has(response.householdId)) {
        throw new Error('Current response household is duplicated.');
      }
      responseByHousehold.set(response.householdId, { row, response });
    }

    const outboxRows = readAllObjectRows_(outboxSheet);
    assertEmailOutboxRecipientFormulasEmpty_(outboxSheet, outboxRows.length);
    const validationOptions = { submitRowsByIdempotencyKey, formulasAlreadyChecked: true };
    const now = new Date();
    return outboxRows
      .map((row) => ({
        row,
        value: readAndValidateConfirmationOutboxRow_(spreadsheet, row, validationOptions),
      }))
      .sort((left, right) => Date.parse(left.value.createdAt) - Date.parse(right.value.createdAt)
        || left.value.deliveryId.localeCompare(right.value.deliveryId))
      .filter((entry) => {
        const value = entry.value;
        if (['sent', 'manual_review'].includes(value.status)) return false;
        const responseEntry = responseByHousehold.get(value.householdId);
        if (!responseEntry) throw new Error('Confirmation household has no current response.');
        if (responseEntry.response.revision > value.revision) {
          return value.status !== 'sending'
            || now.getTime() - Date.parse(value.claimedAt) >= EMAIL_CLAIM_LEASE_MILLISECONDS_;
        }
        if (value.firstAttemptAt
            && now.getTime() - Date.parse(value.firstAttemptAt)
              >= EMAIL_AMBIGUITY_CUTOFF_MILLISECONDS_) {
          return true;
        }
        if (value.status === 'sending'
            && now.getTime() - Date.parse(value.claimedAt) < EMAIL_CLAIM_LEASE_MILLISECONDS_) {
          return false;
        }
        if (value.status === 'retry' && Date.parse(value.nextAttemptAt) > now.getTime()) return false;
        return ['queued', 'retry', 'sending'].includes(value.status);
      })
      .slice(0, limit)
      .map((entry) => {
        const submitRow = submitRowsByIdempotencyKey.get(entry.value.idempotencyKey);
        const responseEntry = responseByHousehold.get(entry.value.householdId);
        if (!submitRow || !responseEntry) throw new Error('Confirmation candidate binding disappeared.');
        return {
          deliveryId: entry.value.deliveryId,
          outboxRowNumber: entry.row.rowNumber,
          submitRowNumber: submitRow.rowNumber,
          responseRowNumber: responseEntry.row.rowNumber,
        };
      });
  });
}

function tryProcessConfirmationEmail_(deliveryId) {
  try {
    processOneConfirmationEmail_(deliveryId);
  } catch (error) {
    // The RSVP is already committed. Mail/tamper/config failures are surfaced
    // through outbox state and this privacy-safe signal, never to the guest.
    console.error('RSVP confirmation email processing failed.');
  }
}

function processOneConfirmationEmail_(deliveryId, candidate) {
  if (!confirmationEmailEnabled_()) return null;
  // Validate private provider configuration before changing queued state.
  // A missing key therefore leaves the message untouched and retryable.
  const apiKey = getResendApiKey_();
  const claim = claimConfirmationEmail_(deliveryId, candidate);
  if (!claim) return null;
  if (claim.transitionOnly) return { status: claim.status };

  let providerOutcome;
  let finalizedClaim = claim;
  try {
    const delivery = sendConfirmationEmailViaResend_(claim, apiKey);
    finalizedClaim = delivery.claim;
    providerOutcome = delivery.outcome;
  } catch (error) {
    providerOutcome = { classification: 'retry', code: 'provider_unavailable' };
  }
  return finalizeConfirmationEmailAttempt_(finalizedClaim, providerOutcome);
}

function claimConfirmationEmail_(deliveryId, candidate) {
  return withScriptLock_(() => {
    if (!confirmationEmailEnabled_()) return null;
    if (Date.now() >= Date.parse(RETENTION_DELETE_BY_)) return null;
    const spreadsheet = getReadySpreadsheet_();
    const sheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);
    const rows = deliveryId
      ? (candidate
        ? [readObjectRowAt_(sheet, candidate.outboxRowNumber)]
        : findRows_(sheet, 'deliveryId', deliveryId))
      : readAllObjectRows_(sheet);
    if (deliveryId && rows.length > 1) throw new Error('Confirmation delivery ID is duplicated.');
    if (candidate && String(rows[0].values.deliveryId || '') !== deliveryId) {
      throw new Error('Confirmation outbox candidate row changed.');
    }
    let validationOptions;
    if (candidate) {
      const submitRow = readObjectRowAt_(
        spreadsheet.getSheetByName(SHEETS_.idempotency),
        candidate.submitRowNumber,
      );
      validationOptions = {
        submitRowsByIdempotencyKey: new Map([[String(submitRow.values.idempotencyKey), submitRow]]),
      };
    }
    const entries = rows
      .map((row) => ({
        row,
        value: readAndValidateConfirmationOutboxRow_(spreadsheet, row, validationOptions),
      }))
      .sort((left, right) => Date.parse(left.value.createdAt) - Date.parse(right.value.createdAt));
    const now = new Date();

    for (const entry of entries) {
      const value = entry.value;
      if (['sent', 'manual_review'].includes(value.status)) continue;
      const currentResponse = candidate
        ? readObjectRowAt_(
          spreadsheet.getSheetByName(SHEETS_.responses),
          candidate.responseRowNumber,
        )
        : findUniqueRow_(
          spreadsheet.getSheetByName(SHEETS_.responses),
          'householdId',
          value.householdId,
        );
      if (!currentResponse) throw new Error('Confirmation household has no current response.');
      if (String(currentResponse.values.householdId) !== value.householdId) {
        throw new Error('Confirmation response candidate row changed.');
      }
      const currentRevision = asInteger_(currentResponse.values.revision, 1, 1000001);
      if (currentRevision > value.revision) {
        const activeSending = value.status === 'sending'
          && now.getTime() - Date.parse(value.claimedAt) < EMAIL_CLAIM_LEASE_MILLISECONDS_;
        if (activeSending) continue;
        writeConfirmationEmailState_(spreadsheet, entry.row, {
          ...value,
          status: 'manual_review',
          claimedAt: '',
          nextAttemptAt: '',
          sentAt: '',
          providerMessageId: '',
          lastErrorCode: 'superseded',
        }, validationOptions);
        return { transitionOnly: true, status: 'manual_review' };
      }
      const ambiguityExpired = value.firstAttemptAt
        && now.getTime() - Date.parse(value.firstAttemptAt)
          >= EMAIL_AMBIGUITY_CUTOFF_MILLISECONDS_;
      if (ambiguityExpired) {
        const manual = {
          ...value,
          status: 'manual_review',
          claimedAt: '',
          nextAttemptAt: '',
          lastErrorCode: 'ambiguity_window_expired',
        };
        writeConfirmationEmailState_(spreadsheet, entry.row, manual, validationOptions);
        return { transitionOnly: true, status: 'manual_review' };
      }
      if (value.status === 'sending'
          && now.getTime() - Date.parse(value.claimedAt) < EMAIL_CLAIM_LEASE_MILLISECONDS_) {
        continue;
      }
      if (value.status === 'retry' && Date.parse(value.nextAttemptAt) > now.getTime()) continue;
      if (!['queued', 'retry', 'sending'].includes(value.status)) {
        throw new Error('Confirmation outbox status cannot be claimed.');
      }

      const claimedAt = now.toISOString();
      const claimed = {
        ...value,
        status: 'sending',
        attemptCount: value.attemptCount + 1,
        firstAttemptAt: value.firstAttemptAt || claimedAt,
        claimedAt,
        lastAttemptAt: claimedAt,
        nextAttemptAt: '',
        sentAt: '',
        providerMessageId: '',
        lastErrorCode: '',
      };
      const durableClaim = writeConfirmationEmailState_(
        spreadsheet,
        entry.row,
        claimed,
        validationOptions,
      );
      if (candidate) {
        durableClaim.outboxRowNumber = entry.row.rowNumber;
        durableClaim.submitRowNumber = candidate.submitRowNumber;
      }
      return durableClaim;
    }
    return null;
  });
}

function sendConfirmationEmailViaResend_(claim, apiKey) {
  const providerKey = hmacSha256Base64Url_(
    JSON.stringify([
      EMAIL_PROVIDER_KEY_DOMAIN_,
      claim.deliveryId,
      claim.idempotencyKey,
      claim.submitIntentMac,
      claim.templateVersion,
    ]),
    getRequiredProperty_('WRITER_HMAC_SECRET'),
  );
  const payload = renderConfirmationEmail_(claim);
  let response;
  try {
    response = UrlFetchApp.fetch(EMAIL_PROVIDER_URL_, {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Idempotency-Key': providerKey,
        'User-Agent': 'LisetteBjarty-RSVP/1.0',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeoutSeconds: 10,
    });
  } catch (error) {
    return {
      claim,
      outcome: { classification: 'retry', code: 'provider_unavailable' },
    };
  }
  const statusCode = Number(response.getResponseCode());
  const responseBody = parseProviderJson_(response.getContentText());
  if (statusCode >= 200 && statusCode < 300
      && responseBody
      && typeof responseBody.id === 'string'
      && PROVIDER_MESSAGE_ID_PATTERN_.test(responseBody.id)) {
    return {
      claim,
      outcome: { classification: 'sent', code: '', providerMessageId: responseBody.id },
    };
  }

  const providerErrorName = responseBody && typeof responseBody.name === 'string'
    ? responseBody.name
    : '';
  if (statusCode === 409 && providerErrorName === 'concurrent_idempotent_requests') {
    return { claim, outcome: { classification: 'retry', code: 'provider_concurrent' } };
  }
  if (statusCode === 409 && providerErrorName === 'invalid_idempotent_request') {
    return {
      claim,
      outcome: { classification: 'manual_review', code: 'provider_idempotency_conflict' },
    };
  }
  if (statusCode === 429 || statusCode >= 500) {
    return {
      claim,
      outcome: {
        classification: 'retry',
        code: statusCode === 429 ? 'provider_rate_limited' : 'provider_unavailable',
      },
    };
  }
  return {
    claim,
    outcome: { classification: 'manual_review', code: 'provider_rejected' },
  };
}

function renderConfirmationEmail_(claim) {
  if (claim.templateVersion === 'rsvp_confirmation_v1') {
    return renderConfirmationEmailV1_(claim);
  }
  throw new Error('Confirmation email template version is unsupported.');
}

// Immutable renderer: add a new version instead of changing this payload.
function renderConfirmationEmailV1_(claim) {
  // Keep every v1 payload value local to this renderer. Future templates must
  // get their own constants so an already-claimed v1 retry stays byte-identical.
  const from = 'Lisette & Bjarty <rsvp@lisetteenbjarty.nl>';
  const replyTo = 'rsvp@lisetteenbjarty.nl';
  const siteUrl = 'https://lisetteenbjarty.nl/#rsvp';
  const rsvpDeadline = '10 april 2027';
  const text = [
    'Hallo,',
    '',
    'Je RSVP voor de bruiloft van Lisette & Bjarty is opgeslagen.',
    '',
    `Bevestigingsnummer: ${claim.receiptNumber}`,
    '',
    `Je kunt je reactie tot en met ${rsvpDeadline} aanpassen via ${siteUrl}`,
    'Gebruik daarvoor dezelfde persoonlijke huishoudcode of uitnodigingslink als op de uitnodiging.',
    'Het bevestigingsnummer is geen toegangscode.',
    '',
    'Hartelijke groet,',
    'Lisette & Bjarty',
  ].join('\n');
  const html = [
    '<p>Hallo,</p>',
    '<p>Je RSVP voor de bruiloft van Lisette &amp; Bjarty is opgeslagen.</p>',
    `<p><strong>Bevestigingsnummer:</strong> ${escapeHtml_(claim.receiptNumber)}</p>`,
    `<p>Je kunt je reactie tot en met ${rsvpDeadline} aanpassen via `,
    `<a href="${siteUrl}">${siteUrl}</a>. `,
    'Gebruik daarvoor dezelfde persoonlijke huishoudcode of uitnodigingslink als op de uitnodiging. ',
    'Het bevestigingsnummer is geen toegangscode.</p>',
    '<p>Hartelijke groet,<br>Lisette &amp; Bjarty</p>',
  ].join('');
  const payload = {
    from,
    to: [claim.recipientEmail],
    subject: 'Je RSVP is opgeslagen',
    html,
    text,
    reply_to: replyTo,
  };
  return payload;
}

function finalizeConfirmationEmailAttempt_(claim, outcome) {
  return withScriptLock_(() => {
    const spreadsheet = getReadySpreadsheet_();
    const sheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);
    const hasCandidateLocation = Number.isInteger(claim.outboxRowNumber)
      && Number.isInteger(claim.submitRowNumber);
    const row = hasCandidateLocation
      ? readObjectRowAt_(sheet, claim.outboxRowNumber)
      : findUniqueRow_(sheet, 'deliveryId', claim.deliveryId);
    if (!row) throw new Error('Claimed confirmation outbox row disappeared.');
    if (String(row.values.deliveryId || '') !== claim.deliveryId) {
      throw new Error('Claimed confirmation outbox row changed.');
    }
    let validationOptions;
    if (hasCandidateLocation) {
      const submitRow = readObjectRowAt_(
        spreadsheet.getSheetByName(SHEETS_.idempotency),
        claim.submitRowNumber,
      );
      validationOptions = {
        submitRowsByIdempotencyKey: new Map([[String(submitRow.values.idempotencyKey), submitRow]]),
      };
    }
    const current = readAndValidateConfirmationOutboxRow_(spreadsheet, row, validationOptions);
    if (current.status !== 'sending'
        || current.attemptCount !== claim.attemptCount
        || current.claimedAt !== claim.claimedAt) {
      throw new Error('Confirmation outbox claim changed unexpectedly.');
    }

    const now = new Date();
    let target;
    if (outcome.classification === 'sent') {
      target = {
        ...current,
        status: 'sent',
        claimedAt: '',
        nextAttemptAt: '',
        sentAt: now.toISOString(),
        providerMessageId: outcome.providerMessageId,
        lastErrorCode: '',
      };
    } else {
      const ambiguityExpired = current.firstAttemptAt
        && now.getTime() - Date.parse(current.firstAttemptAt)
          >= EMAIL_AMBIGUITY_CUTOFF_MILLISECONDS_;
      const manualReview = outcome.classification === 'manual_review' || ambiguityExpired;
      target = {
        ...current,
        status: manualReview ? 'manual_review' : 'retry',
        claimedAt: '',
        nextAttemptAt: manualReview
          ? ''
          : new Date(now.getTime() + confirmationEmailRetryDelayMilliseconds_(current.attemptCount))
            .toISOString(),
        sentAt: '',
        providerMessageId: '',
        lastErrorCode: manualReview && ambiguityExpired
          ? 'ambiguity_window_expired'
          : outcome.code,
      };
    }
    writeConfirmationEmailState_(spreadsheet, row, target, validationOptions);
    return { status: target.status };
  });
}

function confirmationEmailRetryDelayMilliseconds_(attemptCount) {
  return Math.min(60 * 60 * 1000, (2 ** Math.min(Math.max(attemptCount, 1) - 1, 6)) * 60 * 1000);
}

function writeConfirmationEmailState_(spreadsheet, row, value, validationOptions) {
  const sheet = spreadsheet.getSheetByName(SHEETS_.emailOutbox);
  const target = prepareConfirmationEmailState_(value);
  const columns = headerIndex_(HEADERS_.EmailOutbox);
  const stateHeaders = HEADERS_.EmailOutbox.slice(columns.status);
  sheet.getRange(row.rowNumber, columns.status + 1, 1, stateHeaders.length)
    .setValues([confirmationEmailStateCells_(target)]);
  SpreadsheetApp.flush();
  const durable = validationOptions
    ? readObjectRowAt_(sheet, row.rowNumber)
    : findUniqueRow_(sheet, 'deliveryId', target.deliveryId);
  if (!durable) throw new Error('Confirmation outbox state was not persisted.');
  return readAndValidateConfirmationOutboxRow_(spreadsheet, durable, validationOptions);
}

function prepareConfirmationEmailState_(value) {
  const target = { ...value, stateMac: '' };
  target.stateMac = computeEmailStateMac_(target);
  return target;
}

function confirmationEmailStateCells_(value) {
  const columns = headerIndex_(HEADERS_.EmailOutbox);
  return HEADERS_.EmailOutbox.slice(columns.status).map((header) => {
    const cellValue = value[header];
    if (['firstAttemptAt', 'claimedAt', 'lastAttemptAt', 'nextAttemptAt', 'sentAt'].includes(header)
        && cellValue) {
      return new Date(cellValue);
    }
    return cellValue;
  });
}

function confirmationEmailOutboxCells_(value) {
  return HEADERS_.EmailOutbox.map((header) => {
    if (header === 'recipientEmail') return escapeForSheet_(value[header]);
    if (['createdAt', 'expiresAt', 'firstAttemptAt', 'claimedAt', 'lastAttemptAt', 'nextAttemptAt', 'sentAt']
      .includes(header) && value[header]) {
      return new Date(value[header]);
    }
    return value[header];
  });
}

function readAndValidateConfirmationOutboxRow_(spreadsheet, row, options) {
  if (!row) throw new Error('Confirmation outbox row is missing.');
  const value = {
    deliveryId: String(row.values.deliveryId || ''),
    idempotencyKey: String(row.values.idempotencyKey || ''),
    submitIntentMac: String(row.values.submitIntentMac || ''),
    templateVersion: String(row.values.templateVersion || ''),
    recipientEmail: String(row.values.recipientEmail || ''),
    receiptNumber: String(row.values.receiptNumber || ''),
    revision: asInteger_(row.values.revision, 1, 1000001),
    createdAt: toIsoTimestamp_(row.values.createdAt),
    expiresAt: toIsoTimestamp_(row.values.expiresAt),
    contentMac: String(row.values.contentMac || ''),
    status: String(row.values.status || ''),
    attemptCount: asInteger_(row.values.attemptCount, 0, 1000000),
    firstAttemptAt: optionalIsoTimestamp_(row.values.firstAttemptAt),
    claimedAt: optionalIsoTimestamp_(row.values.claimedAt),
    lastAttemptAt: optionalIsoTimestamp_(row.values.lastAttemptAt),
    nextAttemptAt: optionalIsoTimestamp_(row.values.nextAttemptAt),
    sentAt: optionalIsoTimestamp_(row.values.sentAt),
    providerMessageId: String(row.values.providerMessageId || ''),
    lastErrorCode: String(row.values.lastErrorCode || ''),
    stateMac: String(row.values.stateMac || ''),
  };
  if (!options || !options.formulasAlreadyChecked) {
    const recipientColumn = headerIndex_(HEADERS_.EmailOutbox).recipientEmail + 1;
    if (spreadsheet.getSheetByName(SHEETS_.emailOutbox)
      .getRange(row.rowNumber, recipientColumn, 1, 1).getFormulas()[0][0] !== '') {
      throw new Error('Confirmation recipient unexpectedly contains a formula.');
    }
  }
  if (!TOKEN_HASH_PATTERN_.test(value.deliveryId)
      || !IDEMPOTENCY_KEY_PATTERN_.test(value.idempotencyKey)
      || !TOKEN_HASH_PATTERN_.test(value.submitIntentMac)
      || !SUPPORTED_EMAIL_TEMPLATE_VERSIONS_.has(value.templateVersion)
      || value.recipientEmail !== value.recipientEmail.trim().toLowerCase()
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.recipientEmail)
      || value.recipientEmail.length > 254
      || !RECEIPT_NUMBER_PATTERN_.test(value.receiptNumber)
      || value.expiresAt !== new Date(RETENTION_DELETE_BY_).toISOString()
      || !TOKEN_HASH_PATTERN_.test(value.contentMac)
      || !['queued', 'sending', 'retry', 'sent', 'manual_review'].includes(value.status)
      || !TOKEN_HASH_PATTERN_.test(value.stateMac)
      || value.lastErrorCode.length > 80
      || (value.providerMessageId && !PROVIDER_MESSAGE_ID_PATTERN_.test(value.providerMessageId))) {
    throw new Error('Confirmation outbox row is invalid.');
  }
  if (!constantTimeEqual_(value.contentMac, computeEmailContentMac_(value))
      || !constantTimeEqual_(value.stateMac, computeEmailStateMac_(value))) {
    throw new Error('Confirmation outbox MAC is invalid.');
  }
  validateConfirmationEmailState_(value);

  const submitRow = options && options.submitRowsByIdempotencyKey
    ? options.submitRowsByIdempotencyKey.get(value.idempotencyKey) || null
    : findUniqueRow_(
      spreadsheet.getSheetByName(SHEETS_.idempotency),
      'idempotencyKey',
      value.idempotencyKey,
    );
  if (!submitRow || submitRow.values.operation !== 'submit' || submitRow.values.status !== 'completed') {
    throw new Error('Confirmation outbox is not bound to a completed submit.');
  }
  const intent = readAndValidateSubmitIntent_(submitRow);
  const expectedDeliveryId = hmacSha256Base64Url_(
    JSON.stringify([
      EMAIL_DELIVERY_ID_DOMAIN_,
      intent.idempotencyKey,
      String(submitRow.values.intentMac),
    ]),
    getRequiredProperty_('WRITER_HMAC_SECRET'),
  );
  if (!constantTimeEqual_(value.deliveryId, expectedDeliveryId)
      || !constantTimeEqual_(value.submitIntentMac, String(submitRow.values.intentMac))
      || value.recipientEmail !== intent.response.email
      || value.receiptNumber !== intent.result.receiptNumber
      || value.revision !== intent.result.revision
      || value.createdAt !== intent.result.savedAt) {
    throw new Error('Confirmation outbox binding is invalid.');
  }
  value.householdId = intent.householdId;
  return value;
}

function validateConfirmationEmailState_(value) {
  if (value.status === 'queued') {
    if (value.attemptCount !== 0 || value.firstAttemptAt || value.claimedAt || value.lastAttemptAt
        || !value.nextAttemptAt || value.sentAt || value.providerMessageId || value.lastErrorCode) {
      throw new Error('Queued confirmation outbox state is invalid.');
    }
  } else if (value.status === 'sending') {
    if (value.attemptCount < 1 || !value.claimedAt
        || value.claimedAt !== value.lastAttemptAt || value.nextAttemptAt
        || value.sentAt || value.providerMessageId || value.lastErrorCode) {
      throw new Error('Sending confirmation outbox state is invalid.');
    }
  } else if (value.status === 'retry') {
    if (value.attemptCount < 1 || value.claimedAt
        || !value.nextAttemptAt || value.sentAt || value.providerMessageId || !value.lastErrorCode) {
      throw new Error('Retry confirmation outbox state is invalid.');
    }
  } else if (value.status === 'sent') {
    if (value.attemptCount < 1 || value.claimedAt || !value.lastAttemptAt
        || value.nextAttemptAt || !value.sentAt || !value.providerMessageId || value.lastErrorCode) {
      throw new Error('Sent confirmation outbox state is invalid.');
    }
  } else if (value.attemptCount < 0 || value.claimedAt || value.nextAttemptAt
      || value.sentAt || value.providerMessageId || !value.lastErrorCode) {
    throw new Error('Manual-review confirmation outbox state is invalid.');
  }
  const hasAttemptTimestamps = Boolean(value.firstAttemptAt && value.lastAttemptAt);
  if ((value.attemptCount === 0 && (value.firstAttemptAt || value.lastAttemptAt))
      || (value.attemptCount > 0 && !hasAttemptTimestamps)) {
    throw new Error('Confirmation provider-attempt state is invalid.');
  }
  if (Date.parse(value.createdAt) >= Date.parse(value.expiresAt)
      || (value.firstAttemptAt && Date.parse(value.firstAttemptAt) < Date.parse(value.createdAt))
      || (value.lastAttemptAt && Date.parse(value.lastAttemptAt) < Date.parse(value.createdAt))
      || (value.firstAttemptAt && value.lastAttemptAt
        && Date.parse(value.lastAttemptAt) < Date.parse(value.firstAttemptAt))
      || (value.sentAt && Date.parse(value.sentAt) < Date.parse(value.createdAt))) {
    throw new Error('Confirmation outbox timestamps are invalid.');
  }
}

function computeEmailContentMac_(value) {
  return hmacSha256Base64Url_(JSON.stringify([
    EMAIL_CONTENT_MAC_DOMAIN_,
    value.deliveryId,
    value.idempotencyKey,
    value.submitIntentMac,
    value.templateVersion,
    value.recipientEmail,
    value.receiptNumber,
    value.revision,
    toIsoTimestamp_(value.createdAt),
    toIsoTimestamp_(value.expiresAt),
  ]), getRequiredProperty_('WRITER_HMAC_SECRET'));
}

function computeEmailStateMac_(value) {
  return hmacSha256Base64Url_(JSON.stringify([
    EMAIL_STATE_MAC_DOMAIN_,
    value.contentMac,
    value.status,
    Number(value.attemptCount),
    optionalIsoTimestamp_(value.firstAttemptAt),
    optionalIsoTimestamp_(value.claimedAt),
    optionalIsoTimestamp_(value.lastAttemptAt),
    optionalIsoTimestamp_(value.nextAttemptAt),
    optionalIsoTimestamp_(value.sentAt),
    value.providerMessageId || '',
    value.lastErrorCode || '',
  ]), getRequiredProperty_('WRITER_HMAC_SECRET'));
}

function optionalIsoTimestamp_(value) {
  return value === '' || value === null || value === undefined ? '' : toIsoTimestamp_(value);
}

function readAllObjectRows_(sheet) {
  const headers = HEADERS_[sheet.getName()];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map((cells, index) => {
    const values = {};
    headers.forEach((header, column) => { values[header] = cells[column]; });
    return { rowNumber: index + 2, values };
  });
}

function readObjectRowAt_(sheet, rowNumber) {
  if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > sheet.getLastRow()) {
    throw new Error(`${sheet.getName()} candidate row is invalid.`);
  }
  const headers = HEADERS_[sheet.getName()];
  const cells = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  if (cells.every((value) => value === '' || value === null || value === undefined)) {
    throw new Error(`${sheet.getName()} candidate row is empty.`);
  }
  const values = {};
  headers.forEach((header, column) => { values[header] = cells[column]; });
  return { rowNumber, values };
}

function assertEmailOutboxRecipientFormulasEmpty_(sheet, rowCount) {
  if (rowCount < 1) return;
  const recipientColumn = headerIndex_(HEADERS_.EmailOutbox).recipientEmail + 1;
  const formulas = sheet.getRange(2, recipientColumn, rowCount, 1).getFormulas();
  if (formulas.some((row) => row[0] !== '')) {
    throw new Error('Confirmation recipient unexpectedly contains a formula.');
  }
}

function assertResponseFormulasEmpty_(sheet, rowCount) {
  if (rowCount < 1) return;
  const columns = headerIndex_(HEADERS_.Responses);
  const firstColumn = Math.min(columns.email, columns.message) + 1;
  const formulas = sheet.getRange(2, firstColumn, rowCount, 2).getFormulas();
  if (formulas.some((row) => row.some((formula) => formula !== ''))) {
    throw new Error('Response text cell unexpectedly contains a formula.');
  }
}

function parseProviderJson_(value) {
  try {
    const parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function escapeHtml_(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function doGet() {
  return errorOutput_('invalid', 'WRITER_BUSY');
}

function doPost(event) {
  let responseRequestId = extractResponseRequestId_(event);
  try {
    const envelope = readAndVerifyEnvelope_(event);
    responseRequestId = envelope.requestId;
    const writerPayload = readWriterPayload_(envelope);
    let data;
    if (writerPayload.operation === 'resolve') {
      const resolveData = validateResolveData_(writerPayload.data);
      data = resolveHousehold_(
        resolveData,
        sha256Hex_(JSON.stringify(resolveData)),
        envelope,
      );
    } else {
      const submitData = validateSubmitData_(writerPayload.data);
      data = submitResponse_(
        submitData,
        hashCanonicalSubmitData_(submitData),
        envelope,
      );
    }

    return jsonOutput_({
      version: PROTOCOL_VERSION_,
      requestId: responseRequestId,
      ok: true,
      data,
    });
  } catch (error) {
    const code = error instanceof ApiError_ && PUBLIC_ERROR_CODES_.has(error.code)
      ? error.code
      : 'WRITER_BUSY';
    if (!(error instanceof ApiError_)) {
      // Never log request bodies, token hashes, names, email or messages.
      console.error('RSVP writer failed with an internal error.');
    }
    return errorOutput_(responseRequestId, code);
  }
}

function readAndVerifyEnvelope_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') {
    throw new ApiError_('WRITER_BUSY');
  }
  if (event.postData.contents.length > MAX_ENCODED_PAYLOAD_LENGTH_ + 2000) {
    throw new ApiError_('WRITER_BUSY');
  }

  const envelope = parseJsonObject_(event.postData.contents);
  assertExactKeys_(envelope, ['version', 'timestamp', 'requestId', 'payload', 'signature']);
  if (envelope.version !== PROTOCOL_VERSION_) throw new ApiError_('WRITER_BUSY');
  if (!Number.isInteger(envelope.timestamp) || envelope.timestamp <= 0) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (typeof envelope.requestId !== 'string' || !REQUEST_ID_PATTERN_.test(envelope.requestId)) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (typeof envelope.payload !== 'string'
      || envelope.payload.length === 0
      || envelope.payload.length > MAX_ENCODED_PAYLOAD_LENGTH_
      || !/^[A-Za-z0-9_-]+$/.test(envelope.payload)) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (typeof envelope.signature !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(envelope.signature)) {
    throw new ApiError_('WRITER_BUSY');
  }

  const clockSkew = getIntegerProperty_(
    'MAX_CLOCK_SKEW_SECONDS',
    DEFAULT_CLOCK_SKEW_SECONDS_,
    60,
    900,
  );
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - envelope.timestamp) > clockSkew) {
    throw new ApiError_('RATE_LIMITED');
  }

  const signingInput = `${PROTOCOL_VERSION_}.${envelope.timestamp}.${envelope.requestId}.${envelope.payload}`;
  const expectedSignature = hmacSha256Base64Url_(
    signingInput,
    getRequiredProperty_('WRITER_HMAC_SECRET'),
  );
  if (!constantTimeEqual_(envelope.signature, expectedSignature)) {
    throw new ApiError_('WRITER_BUSY');
  }
  return envelope;
}

function readWriterPayload_(envelope) {
  const payload = parseJsonObject_(decodeBase64UrlUtf8_(envelope.payload));
  assertExactKeys_(payload, ['version', 'operation', 'requestId', 'data']);
  if (payload.version !== PROTOCOL_VERSION_
      || !['resolve', 'submit'].includes(payload.operation)
      || payload.requestId !== envelope.requestId
      || !payload.data
      || typeof payload.data !== 'object'
      || Array.isArray(payload.data)) {
    throw new ApiError_('WRITER_BUSY');
  }
  return payload;
}

function validateCredentialHashData_(data, allowedOtherKeys) {
  const actualKeys = Object.keys(data);
  const allowed = new Set(['tokenHash', 'accessCodeHash'].concat(allowedOtherKeys));
  if (actualKeys.some((key) => !allowed.has(key))) throw new ApiError_('WRITER_BUSY');
  const hasTokenHash = Object.prototype.hasOwnProperty.call(data, 'tokenHash');
  const hasAccessCodeHash = Object.prototype.hasOwnProperty.call(data, 'accessCodeHash');
  if (hasTokenHash === hasAccessCodeHash) throw new ApiError_('INVITATION_INVALID');
  return hasTokenHash
    ? { tokenHash: normalizeTokenHash_(data.tokenHash) }
    : { accessCodeHash: normalizeTokenHash_(data.accessCodeHash) };
}

function validateResolveData_(data) {
  return validateCredentialHashData_(data, []);
}

function validateSubmitData_(data) {
  assertAllowedAndRequiredKeys_(
    data,
    ['idempotencyKey', 'revision', 'attending', 'guests'],
    ['tokenHash', 'accessCodeHash', 'email', 'message'],
  );

  const credential = validateCredentialHashData_(data, [
    'idempotencyKey', 'revision', 'attending', 'guests', 'email', 'message',
  ]);
  if (typeof data.idempotencyKey !== 'string'
      || !IDEMPOTENCY_KEY_PATTERN_.test(data.idempotencyKey)) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (!Number.isSafeInteger(data.revision) || data.revision < 0) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (typeof data.attending !== 'boolean') throw new ApiError_('WRITER_BUSY');
  if (!Array.isArray(data.guests) || data.guests.length < 1 || data.guests.length > 20) {
    throw new ApiError_('WRITER_BUSY');
  }

  const guests = data.guests.map((guest) => {
    if (!guest || typeof guest !== 'object' || Array.isArray(guest)) {
      throw new ApiError_('WRITER_BUSY');
    }
    assertAllowedAndRequiredKeys_(guest, ['guestId', 'attending'], ['mealChoice']);
    if (typeof guest.guestId !== 'string' || !OPAQUE_ID_PATTERN_.test(guest.guestId)) {
      throw new ApiError_('WRITER_BUSY');
    }
    if (typeof guest.attending !== 'boolean') throw new ApiError_('WRITER_BUSY');
    if (guest.attending) {
      if (guest.mealChoice !== undefined
          && (typeof guest.mealChoice !== 'string' || !MEAL_CHOICES_.has(guest.mealChoice))) {
        throw new ApiError_('WRITER_BUSY');
      }
      return guest.mealChoice === undefined
        ? { guestId: guest.guestId, attending: true }
        : { guestId: guest.guestId, attending: true, mealChoice: guest.mealChoice };
    }
    if (guest.mealChoice !== undefined) throw new ApiError_('WRITER_BUSY');
    return { guestId: guest.guestId, attending: false };
  });

  if (new Set(guests.map((guest) => guest.guestId)).size !== guests.length) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (data.attending !== guests.some((guest) => guest.attending)) {
    throw new ApiError_('WRITER_BUSY');
  }

  const normalized = {
    ...credential,
    idempotencyKey: data.idempotencyKey,
    revision: data.revision,
    attending: data.attending,
    guests,
  };
  const email = normalizeOptionalString_(data.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError_('WRITER_BUSY');
  }
  const message = normalizeOptionalString_(data.message, 1000);
  if (email) normalized.email = email;
  if (message) normalized.message = message;
  return normalized;
}

function hashCanonicalSubmitData_(data) {
  const canonical = {
    ...(data.tokenHash ? { tokenHash: data.tokenHash } : { accessCodeHash: data.accessCodeHash }),
    idempotencyKey: data.idempotencyKey,
    revision: data.revision,
    attending: data.attending,
    guests: data.guests
      .slice()
      .sort((left, right) => left.guestId.localeCompare(right.guestId))
      .map((guest) => {
        if (!guest.attending) return { guestId: guest.guestId, attending: false };
        return guest.mealChoice === undefined
          ? { guestId: guest.guestId, attending: true }
          : { guestId: guest.guestId, attending: true, mealChoice: guest.mealChoice };
      }),
  };
  if (data.email) canonical.email = data.email;
  if (data.message) canonical.message = data.message;
  return sha256Hex_(JSON.stringify(canonical));
}

function resolveHousehold_(data, payloadHash, envelope) {
  return withScriptLock_(() => {
    const spreadsheet = getReadySpreadsheet_();
    const candidateInvitation = getInvitationByCredentialHash_(spreadsheet, data);
    recoverPendingIntentsForHousehold_(spreadsheet, candidateInvitation.householdId);
    assertRsvpOpen_();
    rejectReplayedRequestId_(spreadsheet, envelope.requestId);
    const invitation = getActiveInvitation_(spreadsheet, data);
    const guests = getPresetGuests_(spreadsheet, invitation.householdId);
    assertGuestCapacity_(guests, invitation.maxGuests);
    const currentRsvp = getCurrentRsvp_(spreadsheet, invitation, guests);

    appendIdempotencyRow_(spreadsheet, {
      requestId: envelope.requestId,
      operation: 'resolve',
      idempotencyKey: '',
      payloadHash,
      householdId: invitation.householdId,
      baseRevision: invitation.currentRevision,
      targetRevision: invitation.currentRevision,
      status: 'observed',
      intentJson: '',
      intentMac: '',
      responseJson: '',
      completionMac: '',
      requestTimestamp: new Date(envelope.timestamp * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(RETENTION_DELETE_BY_),
    });
    SpreadsheetApp.flush();

    return {
      householdId: invitation.householdId,
      displayName: invitation.displayName,
      invitationVariant: invitation.invitationVariant,
      mealChoiceRequired: invitation.mealChoiceRequired,
      maxGuests: invitation.maxGuests,
      guests: guests.map((guest) => ({ guestId: guest.guestId, displayName: guest.displayName })),
      currentRsvp,
    };
  });
}

function submitResponse_(data, payloadHash, envelope) {
  let confirmationDeliveryId = '';
  const result = withScriptLock_(() => {
    const spreadsheet = getReadySpreadsheet_();
    const candidateInvitation = getInvitationByCredentialHash_(spreadsheet, data);
    recoverPendingIntentsForHousehold_(spreadsheet, candidateInvitation.householdId);
    const idempotencySheet = spreadsheet.getSheetByName(SHEETS_.idempotency);
    const priorRequest = findUniqueRow_(idempotencySheet, 'idempotencyKey', data.idempotencyKey);
    if (priorRequest) {
      if (priorRequest.values.operation !== 'submit'
          || !constantTimeEqual_(String(priorRequest.values.payloadHash), payloadHash)) {
        throw new ApiError_('IDEMPOTENCY_CONFLICT');
      }
      const priorIntent = readAndValidateSubmitIntent_(priorRequest);
      if (priorRequest.values.status !== 'completed') {
        throw new Error('Recovered idempotency intent is not completed.');
      }
      confirmationDeliveryId = trySynchronizeConfirmationEmail_(spreadsheet, priorRequest);
      return priorIntent.result;
    }

    // A confirmed write remains safely retryable even after RSVP closes. Only
    // new logical submissions are subject to the close time.
    assertRsvpOpen_();
    rejectReplayedRequestId_(spreadsheet, envelope.requestId);
    const invitation = getActiveInvitation_(spreadsheet, data);
    if (data.revision !== invitation.currentRevision) {
      throw new ApiError_('REVISION_CONFLICT');
    }

    const presetGuests = getPresetGuests_(spreadsheet, invitation.householdId);
    assertGuestCapacity_(presetGuests, invitation.maxGuests);
    assertExactPresetGuestIds_(presetGuests, data.guests);
    assertMealPolicy_(invitation, data.guests);
    const attendingCount = data.guests.filter((guest) => guest.attending).length;
    if (attendingCount > invitation.maxGuests) throw new ApiError_('INVITATION_INVALID');

    const responsesSheet = spreadsheet.getSheetByName(SHEETS_.responses);
    const existingResponse = findUniqueRow_(responsesSheet, 'householdId', invitation.householdId);
    if (invitation.currentRevision > 0 && !existingResponse) {
      throw new Error('Invitation revision has no matching response.');
    }
    if (existingResponse
        && asInteger_(existingResponse.values.revision, 0, 1000000) !== invitation.currentRevision) {
      throw new Error('Response and invitation revisions differ.');
    }
    if (existingResponse) assertResponseRowHasNoFormulas_(responsesSheet, existingResponse);

    const now = new Date();
    const nextRevision = invitation.currentRevision + 1;
    const responseId = existingResponse
      ? normalizeOpaqueId_(existingResponse.values.responseId)
      : generateUniqueUuid_(responsesSheet, 'responseId');
    const receiptNumber = existingResponse
      ? normalizeReceiptNumber_(existingResponse.values.receiptNumber)
      : generateReceiptNumber_(responsesSheet);
    const submittedAt = existingResponse ? toIsoTimestamp_(existingResponse.values.submittedAt) : now.toISOString();
    const base = buildSubmitBaseState_(invitation, existingResponse, presetGuests);
    const baseStateHash = sha256Hex_(JSON.stringify(base));

    const result = {
      revision: nextRevision,
      savedAt: now.toISOString(),
      idempotencyKey: data.idempotencyKey,
      receiptNumber,
    };
    const submittedById = new Map(data.guests.map((guest) => [guest.guestId, guest]));
    const intent = {
      version: PROTOCOL_VERSION_,
      kind: 'submit',
      requestId: envelope.requestId,
      idempotencyKey: data.idempotencyKey,
      payloadHash,
      householdId: invitation.householdId,
      baseRevision: invitation.currentRevision,
      targetRevision: nextRevision,
      policy: {
        invitationVariant: invitation.invitationVariant,
        mealChoiceRequired: invitation.mealChoiceRequired,
      },
      base,
      baseStateHash,
      response: {
        responseId,
        receiptNumber,
        householdId: invitation.householdId,
        revision: nextRevision,
        attending: data.attending,
        guestCount: attendingCount,
        email: data.email || '',
        message: data.message || '',
        submittedAt,
        updatedAt: now.toISOString(),
      },
      guests: presetGuests.map((guest) => {
        const submitted = submittedById.get(guest.guestId);
        return submitted.attending
          ? {
            guestId: guest.guestId,
            attending: true,
            mealChoice: invitation.mealChoiceRequired ? submitted.mealChoice : '',
            revision: nextRevision,
            updatedAt: now.toISOString(),
          }
          : {
            guestId: guest.guestId,
            attending: false,
            mealChoice: '',
            revision: nextRevision,
            updatedAt: now.toISOString(),
          };
      }),
      invitation: {
        householdId: invitation.householdId,
        currentRevision: nextRevision,
        updatedAt: now.toISOString(),
      },
      audit: {
        auditId: generateUniqueUuid_(spreadsheet.getSheetByName(SHEETS_.audit), 'auditId'),
        occurredAt: now.toISOString(),
        operation: existingResponse ? 'response.updated' : 'response.created',
        outcome: 'saved',
        householdId: invitation.householdId,
        responseId,
        revision: nextRevision,
        idempotencyKey: data.idempotencyKey,
        requestId: envelope.requestId,
      },
      result,
    };
    validateSubmitIntentBody_(intent);
    if (!constantTimeEqual_(baseStateHash, sha256Hex_(JSON.stringify(intent.base)))) {
      throw new Error('Locally constructed intent base-state hash is invalid.');
    }
    const intentJson = JSON.stringify(intent);
    if (intentJson.length > MAX_INTENT_JSON_LENGTH_) {
      throw new Error('Submit intent exceeds the safe Sheet cell limit.');
    }
    const intentRowValues = {
      requestId: envelope.requestId,
      operation: 'submit',
      idempotencyKey: data.idempotencyKey,
      payloadHash,
      householdId: invitation.householdId,
      baseRevision: invitation.currentRevision,
      targetRevision: nextRevision,
      status: 'pending',
      intentJson,
      intentMac: '',
      responseJson: '',
      completionMac: '',
      requestTimestamp: new Date(envelope.timestamp * 1000),
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(RETENTION_DELETE_BY_),
    };
    intentRowValues.intentMac = computeIntentMac_(intentRowValues, intentJson);
    appendIdempotencyRow_(spreadsheet, intentRowValues);
    // Durability boundary: no RSVP data mutation occurs before this flush.
    SpreadsheetApp.flush();
    const durableIntentRow = findUniqueRow_(idempotencySheet, 'idempotencyKey', data.idempotencyKey);
    if (!durableIntentRow) throw new Error('Write-ahead intent was not persisted.');
    const completedResult = applyPendingIntent_(spreadsheet, durableIntentRow);
    const completedRow = findUniqueRow_(idempotencySheet, 'idempotencyKey', data.idempotencyKey);
    confirmationDeliveryId = trySynchronizeConfirmationEmail_(spreadsheet, completedRow);
    return completedResult;
  });
  // Provider I/O is deliberately outside the RSVP ScriptLock. A mail/config
  // failure is isolated from the already durable RSVP and never changes the
  // successful API result returned to the guest.
  if (confirmationDeliveryId) {
    tryProcessConfirmationEmail_(confirmationDeliveryId);
  }
  return result;
}

function recoverPendingIntentsForHousehold_(spreadsheet, householdId) {
  const rows = findRows_(
    spreadsheet.getSheetByName(SHEETS_.idempotency),
    'householdId',
    householdId,
  );
  const pendingRows = [];
  for (const row of rows) {
    if (row.values.operation !== 'submit') continue;
    if (!['pending', 'completed'].includes(String(row.values.status))) {
      throw new Error('Submit idempotency row has an unknown status.');
    }
    if (row.values.status === 'pending') pendingRows.push(row);
  }
  if (pendingRows.length > 1) {
    throw new Error('More than one pending intent exists for a household.');
  }
  if (pendingRows.length === 1) applyPendingIntent_(spreadsheet, pendingRows[0]);
}

function applyPendingIntent_(spreadsheet, intentRow) {
  const intent = readAndValidateSubmitIntent_(intentRow);
  if (intentRow.values.status === 'completed') return intent.result;
  if (intentRow.values.status !== 'pending') throw new Error('Intent is not recoverable.');
  assertPendingRecoveryBeforeRetention_();

  let inspection = inspectSubmitIntentState_(spreadsheet, intent);
  if (inspection.invitationState === 'target') {
    assertEntireIntentTarget_(inspection);
  } else {
    if (inspection.responseState === 'base') {
      writeResponseTarget_(spreadsheet, intent, inspection.responseRow);
    }
    SpreadsheetApp.flush();
    inspection = inspectSubmitIntentState_(spreadsheet, intent);
    if (inspection.responseState !== 'target') {
      throw new Error('Response target was not durably persisted.');
    }

    writeGuestTargets_(spreadsheet, intent, inspection);
    SpreadsheetApp.flush();
    inspection = inspectSubmitIntentState_(spreadsheet, intent);
    if (inspection.guestStates.some((state) => state !== 'target')) {
      throw new Error('Guest targets were not durably persisted.');
    }

    if (inspection.auditState === 'base') writeAuditTarget_(spreadsheet, intent);
    SpreadsheetApp.flush();
    inspection = inspectSubmitIntentState_(spreadsheet, intent);
    if (inspection.auditState !== 'target') {
      throw new Error('Audit target was not durably persisted.');
    }

    // currentRevision is the commit pointer and is deliberately the final
    // domain write, after Response, every guest and Audit are durable.
    if (inspection.invitationState !== 'target') writeInvitationTarget_(spreadsheet, intent, inspection);
    SpreadsheetApp.flush();
    inspection = inspectSubmitIntentState_(spreadsheet, intent);
    assertEntireIntentTarget_(inspection);
  }

  const sheet = spreadsheet.getSheetByName(SHEETS_.idempotency);
  const durableRow = findUniqueRow_(sheet, 'idempotencyKey', intent.idempotencyKey);
  if (!durableRow) throw new Error('Pending intent disappeared before completion.');
  const durableIntent = readAndValidateSubmitIntent_(durableRow);
  if (durableRow.values.status === 'completed') return durableIntent.result;
  if (durableRow.values.status !== 'pending') throw new Error('Pending intent status changed unexpectedly.');

  const columns = headerIndex_(HEADERS_.Idempotency);
  const responseJson = JSON.stringify(durableIntent.result);
  const completionMac = computeCompletionMac_(durableRow.values.intentMac, responseJson);
  // Completion material is a separately authenticated durability boundary.
  // Rewriting it is safe after a crash between any of these cells.
  sheet.getRange(durableRow.rowNumber, columns.responseJson + 1).setValue(responseJson);
  sheet.getRange(durableRow.rowNumber, columns.completionMac + 1).setValue(completionMac);
  sheet.getRange(durableRow.rowNumber, columns.updatedAt + 1).setValue(new Date());
  SpreadsheetApp.flush();

  const preparedCompletionRow = findUniqueRow_(sheet, 'idempotencyKey', intent.idempotencyKey);
  if (!preparedCompletionRow || preparedCompletionRow.values.status !== 'pending') {
    throw new Error('Intent completion material was not durably prepared.');
  }
  readAndValidateSubmitIntent_(preparedCompletionRow);
  if (!hasCompleteCompletionMaterial_(preparedCompletionRow)) {
    throw new Error('Intent completion material failed readback.');
  }

  // Status is the completion commit pointer and the only cell in this final
  // write boundary.
  sheet.getRange(durableRow.rowNumber, columns.status + 1).setValue('completed');
  SpreadsheetApp.flush();

  const completedRow = findUniqueRow_(sheet, 'idempotencyKey', intent.idempotencyKey);
  if (!completedRow || completedRow.values.status !== 'completed') {
    throw new Error('Intent completion was not durably persisted.');
  }
  const completedIntent = readAndValidateSubmitIntent_(completedRow);
  assertEntireIntentTarget_(inspectSubmitIntentState_(spreadsheet, completedIntent));
  return completedIntent.result;
}

function buildSubmitBaseState_(invitation, existingResponse, presetGuests) {
  const base = {
    invitation: {
      householdId: invitation.householdId,
      currentRevision: invitation.currentRevision,
      updatedAt: toIsoTimestamp_(invitation.updatedAt),
    },
    response: existingResponse ? responseStateFromValues_(existingResponse.values) : null,
    guests: presetGuests.map((guest) => guestStateFromValues_(guest, invitation.mealChoiceRequired)),
  };

  if (base.response && base.response.revision !== invitation.currentRevision) {
    throw new Error('Base response revision differs from the invitation.');
  }
  if (!base.response && invitation.currentRevision !== 0) {
    throw new Error('A revised invitation must have a base response.');
  }
  for (const guest of base.guests) {
    if (guest.revision !== invitation.currentRevision) {
      throw new Error('Base guest revision differs from the invitation.');
    }
    if (invitation.currentRevision === 0 && guest.attending !== null) {
      throw new Error('An initial guest row already contains RSVP state.');
    }
    if (invitation.currentRevision > 0 && typeof guest.attending !== 'boolean') {
      throw new Error('A revised guest row is missing attendance state.');
    }
  }
  return base;
}

function computeIntentMac_(rowValues, intentJson) {
  const signingInput = [
    INTENT_MAC_DOMAIN_,
    rowValues.requestId,
    rowValues.idempotencyKey,
    rowValues.payloadHash,
    rowValues.householdId,
    rowValues.baseRevision,
    rowValues.targetRevision,
    intentJson,
  ].join('|');
  return hmacSha256Base64Url_(signingInput, getRequiredProperty_('WRITER_HMAC_SECRET'));
}

function computeCompletionMac_(intentMac, responseJson) {
  return hmacSha256Base64Url_(
    [COMPLETION_MAC_DOMAIN_, intentMac, responseJson].join('|'),
    getRequiredProperty_('WRITER_HMAC_SECRET'),
  );
}

function readAndValidateSubmitIntent_(row) {
  if (!row || row.values.operation !== 'submit') throw new Error('Row is not a submit intent.');
  const status = String(row.values.status);
  if (!['pending', 'completed'].includes(status)) throw new Error('Submit intent status is invalid.');
  const requestId = String(row.values.requestId);
  const idempotencyKey = String(row.values.idempotencyKey);
  const payloadHash = String(row.values.payloadHash);
  const householdId = String(row.values.householdId);
  const baseRevision = asInteger_(row.values.baseRevision, 0, 1000000);
  const targetRevision = asInteger_(row.values.targetRevision, 1, 1000001);
  const intentJson = String(row.values.intentJson || '');
  const intentMac = String(row.values.intentMac || '');
  if (!REQUEST_ID_PATTERN_.test(requestId)
      || !IDEMPOTENCY_KEY_PATTERN_.test(idempotencyKey)
      || !/^[0-9a-f]{64}$/.test(payloadHash)
      || !OPAQUE_ID_PATTERN_.test(householdId)
      || targetRevision !== baseRevision + 1
      || intentJson.length < 2
      || intentJson.length > MAX_INTENT_JSON_LENGTH_
      || !TOKEN_HASH_PATTERN_.test(intentMac)) {
    throw new Error('Submit intent row binding is invalid.');
  }
  const expectedMac = computeIntentMac_(row.values, intentJson);
  if (!constantTimeEqual_(intentMac, expectedMac)) throw new Error('Submit intent MAC is invalid.');

  const intent = parseInternalJsonObject_(intentJson);
  const legacyIntentKeys = [
    'version', 'kind', 'requestId', 'idempotencyKey', 'payloadHash', 'householdId',
    'baseRevision', 'targetRevision', 'base', 'baseStateHash', 'response', 'guests',
    'invitation', 'audit', 'result',
  ];
  const currentIntentKeys = legacyIntentKeys.concat('policy');
  const isLegacyIntent = arraysEqual_(Object.keys(intent).sort(), legacyIntentKeys.slice().sort());
  if (!isLegacyIntent) assertInternalExactKeys_(intent, currentIntentKeys);
  if (isLegacyIntent) {
    // Legacy intents predate invitation variants. They were only valid when a
    // meal was required for every attending guest, so this implicit policy is
    // both backward-compatible and fail-closed.
    intent.policy = { invitationVariant: 'day', mealChoiceRequired: true };
  }
  if (intent.version !== PROTOCOL_VERSION_
      || intent.kind !== 'submit'
      || intent.requestId !== requestId
      || intent.idempotencyKey !== idempotencyKey
      || intent.payloadHash !== payloadHash
      || intent.householdId !== householdId
      || intent.baseRevision !== baseRevision
      || intent.targetRevision !== targetRevision) {
    throw new Error('Submit intent does not match its row binding.');
  }

  validateSubmitIntentBody_(intent);
  if (!constantTimeEqual_(intent.baseStateHash, sha256Hex_(JSON.stringify(intent.base)))) {
    throw new Error('Submit intent base-state hash is invalid.');
  }
  const responseJson = String(row.values.responseJson || '');
  const completionMac = String(row.values.completionMac || '');
  const expectedResponseJson = JSON.stringify(intent.result);
  const expectedCompletionMac = computeCompletionMac_(intentMac, expectedResponseJson);
  if (responseJson !== '' && !constantTimeEqual_(responseJson, expectedResponseJson)) {
    throw new Error('Intent completion result is invalid.');
  }
  if (completionMac !== '' && !constantTimeEqual_(completionMac, expectedCompletionMac)) {
    throw new Error('Intent completion MAC is invalid.');
  }
  if (status === 'completed'
      && (!constantTimeEqual_(responseJson, expectedResponseJson)
        || !constantTimeEqual_(completionMac, expectedCompletionMac))) {
    throw new Error('Completed intent is not authenticated.');
  }
  const requestTimestamp = toIsoTimestamp_(row.values.requestTimestamp);
  const createdAt = toIsoTimestamp_(row.values.createdAt);
  const updatedAt = toIsoTimestamp_(row.values.updatedAt);
  const expiresAt = toIsoTimestamp_(row.values.expiresAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt)
      || expiresAt !== new Date(RETENTION_DELETE_BY_).toISOString()
      || Math.abs(Date.parse(createdAt) - Date.parse(requestTimestamp))
      > (getIntegerProperty_(
        'MAX_CLOCK_SKEW_SECONDS',
        DEFAULT_CLOCK_SKEW_SECONDS_,
        60,
        900,
      ) * 1000) + 60000) {
    throw new Error('Submit intent timestamps are invalid.');
  }
  return intent;
}

function hasCompleteCompletionMaterial_(row) {
  const intent = readAndValidateSubmitIntent_(row);
  const responseJson = JSON.stringify(intent.result);
  return constantTimeEqual_(String(row.values.responseJson || ''), responseJson)
    && constantTimeEqual_(
      String(row.values.completionMac || ''),
      computeCompletionMac_(String(row.values.intentMac), responseJson),
    );
}

function validateSubmitIntentBody_(intent) {
  assertInternalExactKeys_(intent.policy, ['invitationVariant', 'mealChoiceRequired']);
  validateInvitationPolicy_(intent.policy.invitationVariant, intent.policy.mealChoiceRequired);
  assertInternalExactKeys_(intent.base, ['invitation', 'response', 'guests']);
  assertInternalExactKeys_(intent.base.invitation, ['householdId', 'currentRevision', 'updatedAt']);
  if (intent.base.invitation.householdId !== intent.householdId
      || intent.base.invitation.currentRevision !== intent.baseRevision) {
    throw new Error('Intent base invitation is invalid.');
  }
  assertCanonicalIso_(intent.base.invitation.updatedAt);
  if (intent.base.response !== null) validateIntentResponse_(intent.base.response, intent, false);
  if ((intent.baseRevision === 0) !== (intent.base.response === null)) {
    throw new Error('Intent base response presence is invalid.');
  }
  if (!Array.isArray(intent.base.guests) || !Array.isArray(intent.guests)
      || intent.guests.length < 1 || intent.guests.length > 20
      || intent.base.guests.length !== intent.guests.length) {
    throw new Error('Intent guest arrays are invalid.');
  }

  validateIntentResponse_(intent.response, intent, true);
  assertInternalExactKeys_(intent.invitation, ['householdId', 'currentRevision', 'updatedAt']);
  if (intent.invitation.householdId !== intent.householdId
      || intent.invitation.currentRevision !== intent.targetRevision) {
    throw new Error('Intent target invitation is invalid.');
  }
  assertCanonicalIso_(intent.invitation.updatedAt);
  if (intent.invitation.updatedAt !== intent.response.updatedAt) {
    throw new Error('Intent commit timestamps differ.');
  }

  const baseGuestIds = new Set();
  const targetGuestIds = new Set();
  intent.base.guests.forEach((guest) => {
    validateIntentGuest_(guest, intent.baseRevision, true, intent.policy.mealChoiceRequired);
    if (baseGuestIds.has(guest.guestId)) throw new Error('Intent base guests are duplicated.');
    baseGuestIds.add(guest.guestId);
  });
  intent.guests.forEach((guest) => {
    validateIntentGuest_(guest, intent.targetRevision, false, intent.policy.mealChoiceRequired);
    if (guest.updatedAt !== intent.response.updatedAt) {
      throw new Error('Intent guest timestamp differs from the response.');
    }
    if (targetGuestIds.has(guest.guestId)) throw new Error('Intent target guests are duplicated.');
    targetGuestIds.add(guest.guestId);
  });
  if (baseGuestIds.size !== targetGuestIds.size
      || [...baseGuestIds].some((guestId) => !targetGuestIds.has(guestId))) {
    throw new Error('Intent base and target guests differ.');
  }
  const attendingCount = intent.guests.filter((guest) => guest.attending).length;
  if (intent.response.attending !== (attendingCount > 0)
      || intent.response.guestCount !== attendingCount) {
    throw new Error('Intent response attendance is inconsistent.');
  }
  if (intent.base.response) {
    const baseAttendingCount = intent.base.guests.filter((guest) => guest.attending).length;
    if (intent.base.response.attending !== (baseAttendingCount > 0)
        || intent.base.response.guestCount !== baseAttendingCount
        || intent.response.responseId !== intent.base.response.responseId
        || intent.response.receiptNumber !== intent.base.response.receiptNumber
        || intent.response.submittedAt !== intent.base.response.submittedAt) {
      throw new Error('Intent response does not preserve its authenticated base identity.');
    }
  }

  assertInternalExactKeys_(intent.audit, HEADERS_.Audit);
  if (!REQUEST_ID_PATTERN_.test(intent.audit.auditId)
      || intent.audit.householdId !== intent.householdId
      || intent.audit.responseId !== intent.response.responseId
      || intent.audit.revision !== intent.targetRevision
      || intent.audit.idempotencyKey !== intent.idempotencyKey
      || intent.audit.requestId !== intent.requestId
      || !['response.created', 'response.updated'].includes(intent.audit.operation)
      || intent.audit.outcome !== 'saved') {
    throw new Error('Intent audit target is invalid.');
  }
  assertCanonicalIso_(intent.audit.occurredAt);
  if (intent.audit.occurredAt !== intent.response.updatedAt) {
    throw new Error('Intent audit timestamp differs from the response.');
  }
  if ((intent.base.response === null) !== (intent.audit.operation === 'response.created')) {
    throw new Error('Intent audit operation does not match its base state.');
  }

  assertInternalExactKeys_(intent.result, ['revision', 'savedAt', 'idempotencyKey', 'receiptNumber']);
  if (intent.result.revision !== intent.targetRevision
      || intent.result.savedAt !== intent.response.updatedAt
      || intent.result.idempotencyKey !== intent.idempotencyKey
      || intent.result.receiptNumber !== intent.response.receiptNumber) {
    throw new Error('Intent result is invalid.');
  }
}

function validateIntentResponse_(response, intent, isTarget) {
  assertInternalExactKeys_(response, HEADERS_.Responses);
  const expectedRevision = isTarget ? intent.targetRevision : intent.baseRevision;
  if (!OPAQUE_ID_PATTERN_.test(response.responseId)
      || !RECEIPT_NUMBER_PATTERN_.test(response.receiptNumber)
      || response.householdId !== intent.householdId
      || response.revision !== expectedRevision
      || typeof response.attending !== 'boolean'
      || !Number.isSafeInteger(response.guestCount)
      || response.guestCount < 0
      || response.guestCount > 20
      || typeof response.email !== 'string'
      || response.email.length > 254
      || typeof response.message !== 'string'
      || response.message.length > 1000
      || response.email.normalize('NFC') !== response.email
      || response.message.normalize('NFC') !== response.message
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(response.email)
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(response.message)) {
    throw new Error('Intent response state is invalid.');
  }
  assertStoredResponseTextValid_(response);
  assertCanonicalIso_(response.submittedAt);
  assertCanonicalIso_(response.updatedAt);
}

function validateIntentGuest_(guest, revision, isBase, mealChoiceRequired) {
  assertInternalExactKeys_(guest, ['guestId', 'attending', 'mealChoice', 'revision', 'updatedAt']);
  if (!OPAQUE_ID_PATTERN_.test(guest.guestId) || guest.revision !== revision) {
    throw new Error('Intent guest binding is invalid.');
  }
  if (isBase && revision === 0) {
    if (guest.attending !== null || guest.mealChoice !== '' || guest.updatedAt !== '') {
      throw new Error('Initial intent guest base is invalid.');
    }
  } else if (typeof guest.attending !== 'boolean'
      || (guest.attending && mealChoiceRequired && !MEAL_CHOICES_.has(guest.mealChoice))
      || (guest.attending && !mealChoiceRequired && guest.mealChoice !== '')
      || (!guest.attending && guest.mealChoice !== '')) {
    throw new Error('Intent guest RSVP state is invalid.');
  }
  if (!(isBase && revision === 0)) assertCanonicalIso_(guest.updatedAt);
}

function inspectSubmitIntentState_(spreadsheet, intent) {
  const invitationSheet = spreadsheet.getSheetByName(SHEETS_.invitations);
  const invitationRow = findUniqueRow_(invitationSheet, 'householdId', intent.householdId);
  if (!invitationRow) throw new Error('Intent invitation is missing.');
  const storedPolicy = invitationPolicyFromValues_(invitationRow.values);
  if (!statesEqual_(storedPolicy, intent.policy)) {
    throw new Error('Invitation policy differs from the authenticated submit intent.');
  }
  const actualInvitation = invitationStateFromValues_(invitationRow.values);
  const preparedInvitation = {
    householdId: intent.householdId,
    currentRevision: intent.baseRevision,
    updatedAt: intent.invitation.updatedAt,
  };
  let invitationState;
  if (statesEqual_(actualInvitation, intent.invitation)) invitationState = 'target';
  else if (statesEqual_(actualInvitation, preparedInvitation)) invitationState = 'prepared';
  else if (statesEqual_(actualInvitation, intent.base.invitation)) invitationState = 'base';
  else throw new Error('Invitation is neither the authenticated base, prepared nor target state.');

  const responseSheet = spreadsheet.getSheetByName(SHEETS_.responses);
  const responseRow = findUniqueRow_(responseSheet, 'householdId', intent.householdId);
  const responseById = findUniqueRow_(responseSheet, 'responseId', intent.response.responseId);
  const responseByReceipt = findUniqueRow_(responseSheet, 'receiptNumber', intent.response.receiptNumber);
  for (const identityRow of [responseById, responseByReceipt]) {
    if (identityRow && identityRow.values.householdId !== intent.householdId) {
      throw new Error('Intent response identity belongs to another household.');
    }
  }
  if (responseRow) assertResponseRowHasNoFormulas_(responseSheet, responseRow);
  const actualResponse = responseRow ? responseStateFromValues_(responseRow.values) : null;
  const responseState = classifyIntentState_(
    actualResponse,
    intent.base.response,
    intent.response,
    'Response',
  );

  const guestRows = findRows_(
    spreadsheet.getSheetByName(SHEETS_.guestDetails),
    'householdId',
    intent.householdId,
  );
  if (guestRows.length !== intent.guests.length) throw new Error('Intent guest row count changed.');
  const guestRowsById = new Map();
  for (const row of guestRows) {
    const guestId = normalizeOpaqueId_(row.values.guestId);
    if (guestRowsById.has(guestId)) throw new Error('Intent guest row is duplicated.');
    guestRowsById.set(guestId, row);
  }
  const baseGuestsById = new Map(intent.base.guests.map((guest) => [guest.guestId, guest]));
  const guestStates = intent.guests.map((targetGuest) => {
    const row = guestRowsById.get(targetGuest.guestId);
    if (!row) throw new Error('Intent guest row is missing.');
    return classifyIntentState_(
      guestStateFromValues_(row.values, intent.policy.mealChoiceRequired),
      baseGuestsById.get(targetGuest.guestId),
      targetGuest,
      `Guest ${targetGuest.guestId}`,
    );
  });

  const auditSheet = spreadsheet.getSheetByName(SHEETS_.audit);
  const auditByKey = findUniqueRow_(auditSheet, 'idempotencyKey', intent.idempotencyKey);
  const auditById = findUniqueRow_(auditSheet, 'auditId', intent.audit.auditId);
  if (auditByKey && auditById && auditByKey.rowNumber !== auditById.rowNumber) {
    throw new Error('Intent audit identities point to different rows.');
  }
  const auditRow = auditByKey || auditById;
  const actualAudit = auditRow ? auditStateFromValues_(auditRow.values) : null;
  const auditState = classifyIntentState_(actualAudit, null, intent.audit, 'Audit');

  if (invitationState === 'target') {
    const partial = [responseState, auditState].concat(guestStates);
    if (partial.some((state) => state !== 'target')) {
      throw new Error('Committed invitation points at an incomplete target state.');
    }
  }
  return {
    invitationRow,
    invitationState,
    responseRow,
    responseState,
    guestRowsById,
    guestStates,
    auditRow,
    auditState,
  };
}

function classifyIntentState_(actual, base, target, label) {
  if (statesEqual_(actual, target)) return 'target';
  if (statesEqual_(actual, base)) return 'base';
  throw new Error(`${label} is neither the authenticated base nor target state.`);
}

function assertEntireIntentTarget_(inspection) {
  if (inspection.invitationState !== 'target'
      || inspection.responseState !== 'target'
      || inspection.auditState !== 'target'
      || inspection.guestStates.some((state) => state !== 'target')) {
    throw new Error('Submit intent target state is incomplete.');
  }
}

function writeResponseTarget_(spreadsheet, intent, existingRow) {
  const sheet = spreadsheet.getSheetByName(SHEETS_.responses);
  const rowNumber = existingRow ? existingRow.rowNumber : sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, HEADERS_.Responses.length)
    .setValues([HEADERS_.Responses.map((header) => ['email', 'message'].includes(header)
      ? escapeForSheet_(intent.response[header])
      : intent.response[header])]);
}

function assertResponseRowHasNoFormulas_(sheet, row) {
  const columns = headerIndex_(HEADERS_.Responses);
  const firstColumn = Math.min(columns.email, columns.message) + 1;
  const formulas = sheet.getRange(row.rowNumber, firstColumn, 1, 2).getFormulas()[0];
  if (formulas.some((formula) => formula !== '')) {
    throw new Error('Response text cell unexpectedly contains a formula.');
  }
}

function writeGuestTargets_(spreadsheet, intent, inspection) {
  const sheet = spreadsheet.getSheetByName(SHEETS_.guestDetails);
  const columns = headerIndex_(HEADERS_.GuestDetails);
  intent.guests.forEach((guest, index) => {
    if (inspection.guestStates[index] === 'target') return;
    const row = inspection.guestRowsById.get(guest.guestId);
    sheet.getRange(row.rowNumber, columns.attending + 1, 1, 4).setValues([[
      guest.attending,
      guest.mealChoice,
      guest.revision,
      new Date(guest.updatedAt),
    ]]);
  });
}

function writeAuditTarget_(spreadsheet, intent) {
  appendObjectRow_(spreadsheet.getSheetByName(SHEETS_.audit), HEADERS_.Audit, intent.audit);
}

function writeInvitationTarget_(spreadsheet, intent, inspection) {
  const sheet = spreadsheet.getSheetByName(SHEETS_.invitations);
  const columns = headerIndex_(HEADERS_.Invitations);
  if (inspection.invitationState === 'base') {
    sheet.getRange(inspection.invitationRow.rowNumber, columns.updatedAt + 1)
      .setValue(new Date(intent.invitation.updatedAt));
    SpreadsheetApp.flush();
    const prepared = inspectSubmitIntentState_(spreadsheet, intent);
    if (prepared.invitationState !== 'prepared') {
      throw new Error('Invitation commit metadata was not durably prepared.');
    }
  } else if (inspection.invitationState !== 'prepared') {
    throw new Error('Invitation is not ready for its commit pointer.');
  }
  // Literally the final domain cell: all other target state, including the
  // invitation timestamp, has already crossed a verified flush boundary.
  sheet.getRange(inspection.invitationRow.rowNumber, columns.currentRevision + 1)
    .setValue(intent.targetRevision);
}

function invitationStateFromValues_(values) {
  return {
    householdId: normalizeOpaqueId_(values.householdId),
    currentRevision: values.currentRevision === '' ? 0 : asInteger_(values.currentRevision, 0, 1000001),
    updatedAt: toIsoTimestamp_(values.updatedAt),
  };
}

function responseStateFromValues_(values) {
  return {
    responseId: normalizeOpaqueId_(values.responseId),
    receiptNumber: normalizeReceiptNumber_(values.receiptNumber),
    householdId: normalizeOpaqueId_(values.householdId),
    revision: asInteger_(values.revision, 1, 1000001),
    attending: asBooleanStrict_(values.attending),
    guestCount: asInteger_(values.guestCount, 0, 20),
    email: String(values.email || ''),
    message: String(values.message || ''),
    submittedAt: toIsoTimestamp_(values.submittedAt),
    updatedAt: toIsoTimestamp_(values.updatedAt),
  };
}

function assertStoredResponseTextValid_(response) {
  if (response.email.length > 254
      || (response.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(response.email))
      || response.message.length > 1000
      || response.email.normalize('NFC') !== response.email
      || response.message.normalize('NFC') !== response.message
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(response.email)
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(response.message)) {
    throw new Error('Stored response text is invalid.');
  }
}

function guestStateFromValues_(values, mealChoiceRequired) {
  const attending = values.attending === '' ? null : asBooleanStrict_(values.attending);
  const mealChoice = String(values.mealChoice || '');
  if (attending === true && mealChoiceRequired && !MEAL_CHOICES_.has(mealChoice)) {
    throw new Error('Stored attending guest has an invalid meal choice.');
  }
  if (attending === true && !mealChoiceRequired && mealChoice !== '') {
    throw new Error('Stored evening guest unexpectedly has a meal choice.');
  }
  if (attending !== true && mealChoice !== '') {
    throw new Error('Stored absent or unanswered guest has a meal choice.');
  }
  return {
    guestId: normalizeOpaqueId_(values.guestId),
    attending,
    mealChoice,
    revision: values.revision === '' ? 0 : asInteger_(values.revision, 0, 1000001),
    updatedAt: values.updatedAt === '' ? '' : toIsoTimestamp_(values.updatedAt),
  };
}

function auditStateFromValues_(values) {
  return {
    auditId: normalizeOpaqueId_(values.auditId),
    occurredAt: toIsoTimestamp_(values.occurredAt),
    operation: String(values.operation),
    outcome: String(values.outcome),
    householdId: normalizeOpaqueId_(values.householdId),
    responseId: normalizeOpaqueId_(values.responseId),
    revision: asInteger_(values.revision, 1, 1000001),
    idempotencyKey: String(values.idempotencyKey),
    requestId: String(values.requestId),
  };
}

function statesEqual_(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseInternalJsonObject_(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Intent JSON must contain an object.');
    }
    return parsed;
  } catch (error) {
    throw new Error('Intent JSON is invalid.');
  }
}

function assertInternalExactKeys_(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || !arraysEqual_(Object.keys(value).sort(), keys.slice().sort())) {
    throw new Error('Intent object has unexpected fields.');
  }
}

function assertCanonicalIso_(value) {
  if (typeof value !== 'string' || toIsoTimestamp_(value) !== value) {
    throw new Error('Intent timestamp is not canonical ISO-8601.');
  }
}

function getActiveInvitation_(spreadsheet, credential) {
  const invitation = getInvitationByCredentialHash_(spreadsheet, credential);
  if (!invitation.active) throw new ApiError_('INVITATION_INVALID');
  return invitation;
}

function getInvitationByCredentialHash_(spreadsheet, credential) {
  const hasTokenHash = Object.prototype.hasOwnProperty.call(credential, 'tokenHash');
  const hasAccessCodeHash = Object.prototype.hasOwnProperty.call(credential, 'accessCodeHash');
  if (hasTokenHash === hasAccessCodeHash) throw new ApiError_('INVITATION_INVALID');
  const columnName = hasTokenHash ? 'tokenHash' : 'accessCodeHash';
  const expectedHash = hasTokenHash ? credential.tokenHash : credential.accessCodeHash;
  const row = findUniqueRow_(spreadsheet.getSheetByName(SHEETS_.invitations), columnName, expectedHash);
  if (!row) throw new ApiError_('INVITATION_INVALID');

  const tokenHash = normalizeStoredCredentialHash_(row.values.tokenHash, true);
  const accessCodeHash = normalizeStoredCredentialHash_(row.values.accessCodeHash, true);
  if (tokenHash === '' && accessCodeHash === '') throw new Error('Invitation has no credential hash.');
  const policy = invitationPolicyFromValues_(row.values);
  return {
    rowNumber: row.rowNumber,
    householdId: normalizeOpaqueId_(row.values.householdId),
    tokenHash,
    accessCodeHash,
    displayName: normalizeStoredDisplayName_(row.values.displayName),
    ...policy,
    maxGuests: asInteger_(row.values.maxGuests, 1, 20),
    active: asBoolean_(row.values.active),
    currentRevision: row.values.currentRevision === ''
      ? 0
      : asInteger_(row.values.currentRevision, 0, 1000000),
    createdAt: toIsoTimestamp_(row.values.createdAt),
    updatedAt: toIsoTimestamp_(row.values.updatedAt),
  };
}

function getPresetGuests_(spreadsheet, householdId) {
  const rows = findRows_(spreadsheet.getSheetByName(SHEETS_.guestDetails), 'householdId', householdId);
  if (rows.length < 1 || rows.length > 20) {
    throw new Error('Household must have between one and twenty preset guests.');
  }

  const guests = rows.map((row) => ({
    rowNumber: row.rowNumber,
    guestId: normalizeOpaqueId_(row.values.guestId),
    displayName: normalizeStoredDisplayName_(row.values.displayName),
    attending: row.values.attending,
    mealChoice: row.values.mealChoice,
    revision: row.values.revision,
    updatedAt: row.values.updatedAt,
  }));
  if (new Set(guests.map((guest) => guest.guestId)).size !== guests.length) {
    throw new Error('GuestDetails contains duplicate guest IDs for a household.');
  }
  return guests;
}

function assertGuestCapacity_(presetGuests, maxGuests) {
  if (presetGuests.length > maxGuests) {
    throw new Error('Provisioning invalid: preset guest count exceeds maxGuests.');
  }
}

function getCurrentRsvp_(spreadsheet, invitation, presetGuests) {
  const responseSheet = spreadsheet.getSheetByName(SHEETS_.responses);
  const response = findUniqueRow_(responseSheet, 'householdId', invitation.householdId);
  if (invitation.currentRevision === 0) {
    if (response) throw new Error('Initial invitation unexpectedly has a response row.');
    for (const guest of presetGuests) {
      const state = guestStateFromValues_(guest, invitation.mealChoiceRequired);
      if (state.revision !== 0
          || state.attending !== null
          || state.mealChoice !== ''
          || state.updatedAt !== '') {
        throw new Error('Initial GuestDetails contains unexpected RSVP state.');
      }
    }
    return null;
  }

  if (!response
      || asInteger_(response.values.revision, 0, 1000000) !== invitation.currentRevision) {
    throw new Error('Current response is missing or has a different revision.');
  }
  assertResponseRowHasNoFormulas_(responseSheet, response);
  const storedResponse = responseStateFromValues_(response.values);
  if (storedResponse.householdId !== invitation.householdId
      || storedResponse.revision !== invitation.currentRevision) {
    throw new Error('Stored response binding does not match the invitation.');
  }
  assertStoredResponseTextValid_(storedResponse);

  const guests = presetGuests.map((guest) => {
    const state = guestStateFromValues_(guest, invitation.mealChoiceRequired);
    if (state.revision !== invitation.currentRevision
        || typeof state.attending !== 'boolean'
        || state.updatedAt === '') {
      throw new Error('GuestDetails does not match the current revision.');
    }
    if (state.attending) {
      return invitation.mealChoiceRequired
        ? { guestId: guest.guestId, attending: true, mealChoice: state.mealChoice }
        : { guestId: guest.guestId, attending: true };
    }
    return { guestId: guest.guestId, attending: false };
  });

  const attending = storedResponse.attending;
  const attendingCount = guests.filter((guest) => guest.attending).length;
  if (attending !== guests.some((guest) => guest.attending)) {
    throw new Error('Response attendance does not match GuestDetails.');
  }
  if (storedResponse.guestCount !== attendingCount) {
    throw new Error('Response guestCount does not match GuestDetails.');
  }

  const current = {
    revision: invitation.currentRevision,
    receiptNumber: storedResponse.receiptNumber,
    attending,
    guests,
    updatedAt: storedResponse.updatedAt,
  };
  const email = storedResponse.email;
  const message = storedResponse.message;
  if (email) current.email = email;
  if (message) current.message = message;
  return current;
}

function assertExactPresetGuestIds_(presetGuests, submittedGuests) {
  if (presetGuests.length !== submittedGuests.length) {
    throw new ApiError_('INVITATION_INVALID');
  }
  const presetIds = new Set(presetGuests.map((guest) => guest.guestId));
  if (submittedGuests.some((guest) => !presetIds.has(guest.guestId))) {
    throw new ApiError_('INVITATION_INVALID');
  }
}

function assertMealPolicy_(invitation, submittedGuests) {
  for (const guest of submittedGuests) {
    if (!guest.attending) continue;
    const hasMealChoice = typeof guest.mealChoice === 'string';
    if ((invitation.mealChoiceRequired && !hasMealChoice)
        || (!invitation.mealChoiceRequired && hasMealChoice)) {
      throw new ApiError_('INVITATION_INVALID');
    }
  }
}

function validateInvitationPolicy_(invitationVariant, mealChoiceRequired) {
  if (!INVITATION_VARIANTS_.has(invitationVariant)
      || typeof mealChoiceRequired !== 'boolean'
      || (invitationVariant === 'day') !== mealChoiceRequired) {
    throw new Error('Invitation variant and meal policy are invalid.');
  }
  return { invitationVariant, mealChoiceRequired };
}

function invitationPolicyFromValues_(values) {
  const invitationVariant = String(values.invitationVariant || '').trim();
  const mealChoiceRequired = asBooleanStrict_(values.mealChoiceRequired);
  return validateInvitationPolicy_(invitationVariant, mealChoiceRequired);
}

function generateReceiptNumber_(responsesSheet) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `RSVP-${Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
    if (!findUniqueRow_(responsesSheet, 'receiptNumber', candidate)) return candidate;
  }
  throw new Error('Could not generate a unique receipt number.');
}

function generateUniqueUuid_(sheet, columnName) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = Utilities.getUuid();
    if (!findUniqueRow_(sheet, columnName, candidate)) return candidate;
  }
  throw new Error(`Could not generate a unique ${sheet.getName()}.${columnName} value.`);
}

function normalizeReceiptNumber_(value) {
  const normalized = String(value || '').trim();
  if (!RECEIPT_NUMBER_PATTERN_.test(normalized)) {
    throw new Error('Stored receipt number is invalid.');
  }
  return normalized;
}

function rejectReplayedRequestId_(spreadsheet, requestId) {
  const existing = findUniqueRow_(
    spreadsheet.getSheetByName(SHEETS_.idempotency),
    'requestId',
    requestId,
  );
  if (existing) throw new ApiError_('RATE_LIMITED');
}

function appendIdempotencyRow_(spreadsheet, values) {
  appendObjectRow_(
    spreadsheet.getSheetByName(SHEETS_.idempotency),
    HEADERS_.Idempotency,
    values,
  );
}

function getReadySpreadsheet_() {
  const spreadsheet = getConfiguredSpreadsheet_();
  assertExpectedOwner_(spreadsheet);
  assertSchema_(spreadsheet);
  return spreadsheet;
}

function getConfiguredSpreadsheet_() {
  const spreadsheetId = getRequiredProperty_('SPREADSHEET_ID');
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throw new Error('SPREADSHEET_ID is inaccessible or invalid.');
  }
}

function assertExpectedOwner_(spreadsheet) {
  const expectedOwner = getRequiredProperty_('SHEET_OWNER_EMAIL').trim().toLowerCase();
  const actualOwner = spreadsheet.getOwner().getEmail().trim().toLowerCase();
  if (!actualOwner || actualOwner !== expectedOwner) {
    throw new Error('The configured spreadsheet has an unexpected owner.');
  }
}

function assertRsvpOpen_() {
  const now = Date.now();
  const closeAt = Date.parse(getRequiredProperty_('RSVP_CLOSE_AT'));
  if (!Number.isFinite(closeAt)) throw new Error('RSVP_CLOSE_AT must be an ISO-8601 timestamp.');
  getEnvironment_();
  if (now >= closeAt || now >= Date.parse(RETENTION_DELETE_BY_)) {
    throw new ApiError_('RSVP_CLOSED');
  }
}

function assertPendingRecoveryBeforeRetention_() {
  getEnvironment_();
  if (Date.now() >= Date.parse(RETENTION_DELETE_BY_)) {
    throw new ApiError_('RSVP_CLOSED');
  }
}

function getEnvironment_() {
  const environment = getRequiredProperty_('ENVIRONMENT').trim().toLowerCase();
  if (environment !== 'production') {
    throw new Error('ENVIRONMENT must be production.');
  }
  return environment;
}

function buildSheetClearPreview_(spreadsheet, now) {
  const environment = getEnvironment_();
  const rowCounts = {};
  for (const sheetName of Object.values(SHEETS_)) {
    rowCounts[sheetName] = Math.max(0, spreadsheet.getSheetByName(sheetName).getLastRow() - 1);
  }
  return {
    environment,
    spreadsheetId: spreadsheet.getId(),
    permanentDeleteBy: RETENTION_DELETE_BY_,
    permanentDeletionOverdue: now.getTime() >= Date.parse(RETENTION_DELETE_BY_),
    eligibleNow: now.getTime() >= Date.parse(PRODUCTION_SHEET_CLEAR_EARLIEST_),
    rowCounts,
    confirmationValue: `CLEAR:${environment}:${spreadsheet.getId()}:ALL_RSVP_CELLS`,
  };
}

function assertSchema_(spreadsheet) {
  for (const sheetName of Object.values(SHEETS_)) {
    const sheet = spreadsheet.getSheetByName(sheetName);
    const headers = HEADERS_[sheetName];
    if (!sheet) throw new Error(`Missing required sheet ${sheetName}.`);
    const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
    if (!arraysEqual_(actualHeaders, headers)) {
      throw new Error(`Sheet ${sheetName} has unexpected headers.`);
    }
  }
}

function findUniqueRow_(sheet, columnName, expectedValue) {
  const matches = findRows_(sheet, columnName, expectedValue);
  if (matches.length > 1) {
    throw new Error(`${sheet.getName()}.${columnName} contains duplicate values.`);
  }
  return matches[0] || null;
}

function findRows_(sheet, columnName, expectedValue) {
  const headers = HEADERS_[sheet.getName()];
  const columnIndex = headerIndex_(headers)[columnName];
  if (columnIndex === undefined) {
    throw new Error(`Unknown ${sheet.getName()} column ${columnName}.`);
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const expected = String(expectedValue);
  const matches = [];
  rows.forEach((row, index) => {
    if (String(row[columnIndex]) === expected) {
      const values = {};
      headers.forEach((header, headerPosition) => {
        values[header] = row[headerPosition];
      });
      matches.push({ rowNumber: index + 2, values });
    }
  });
  return matches;
}

function appendObjectRow_(sheet, headers, values) {
  const row = headers.map((header) => values[header] === undefined ? '' : values[header]);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
}

function withScriptLock_(callback) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_TIMEOUT_MILLISECONDS_)) throw new ApiError_('WRITER_BUSY');
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function parseJsonObject_(value) {
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new ApiError_('WRITER_BUSY');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError_('WRITER_BUSY');
  }
  return parsed;
}

function extractResponseRequestId_(event) {
  try {
    if (!event || !event.postData || typeof event.postData.contents !== 'string') return 'invalid';
    const envelope = JSON.parse(event.postData.contents);
    return envelope
      && typeof envelope === 'object'
      && !Array.isArray(envelope)
      && typeof envelope.requestId === 'string'
      && REQUEST_ID_PATTERN_.test(envelope.requestId)
      ? envelope.requestId
      : 'invalid';
  } catch (error) {
    return 'invalid';
  }
}

function assertExactKeys_(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (!arraysEqual_(actual, expected)) throw new ApiError_('WRITER_BUSY');
}

function assertAllowedAndRequiredKeys_(value, required, optional) {
  const actual = Object.keys(value);
  const allowed = new Set(required.concat(optional));
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
      || actual.some((key) => !allowed.has(key))) {
    throw new ApiError_('WRITER_BUSY');
  }
}

function normalizeTokenHash_(value) {
  if (typeof value !== 'string' || !TOKEN_HASH_PATTERN_.test(value)) {
    throw new ApiError_('INVITATION_INVALID');
  }
  return value;
}

function normalizeStoredCredentialHash_(value, allowEmpty) {
  const normalized = String(value === undefined || value === null ? '' : value).trim();
  if (allowEmpty && normalized === '') return '';
  if (!TOKEN_HASH_PATTERN_.test(normalized)) throw new Error('Stored credential hash is invalid.');
  return normalized;
}

function normalizeOpaqueId_(value) {
  const normalized = String(value || '').trim();
  if (!OPAQUE_ID_PATTERN_.test(normalized)) throw new Error('Stored opaque ID is invalid.');
  return normalized;
}

function normalizeStoredDisplayName_(value) {
  const normalized = unescapeFromSheet_(value).trim();
  if (!normalized || normalized.length > 160) throw new Error('Stored display name is invalid.');
  return normalized;
}

function normalizeOptionalString_(value, maxLength) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string') throw new ApiError_('WRITER_BUSY');
  const normalized = value.normalize('NFC').replace(/\r\n?/g, '\n').trim();
  if (normalized.length > maxLength
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(normalized)) {
    throw new ApiError_('WRITER_BUSY');
  }
  return normalized;
}

function escapeForSheet_(value) {
  const text = String(value === undefined || value === null ? '' : value);
  // Prefix every potentially interpreted value, including a literal leading
  // apostrophe. Sheets consumes exactly this one text prefix; getValues then
  // returns the original logical string without heuristic unescaping.
  return /^\s*[=+\-@']/.test(text) ? `'${text}` : text;
}

function unescapeFromSheet_(value) {
  return String(value === undefined || value === null ? '' : value);
}

function asBoolean_(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function asBooleanStrict_(value) {
  if (value === true || value === false) return value;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  throw new Error('Stored boolean is invalid.');
}

function asInteger_(value, minimum, maximum) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new Error(`Stored integer must be between ${minimum} and ${maximum}.`);
  }
  return numeric;
}

function toIsoTimestamp_(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error('Stored timestamp is invalid.');
  return parsed.toISOString();
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value || !value.trim()) throw new Error(`Missing required Script Property ${name}.`);
  if (name === 'WRITER_HMAC_SECRET' && value.length < 32) {
    throw new Error('WRITER_HMAC_SECRET must contain at least 32 characters.');
  }
  return value;
}

function getIntegerProperty_(name, fallback, minimum, maximum) {
  const raw = PropertiesService.getScriptProperties().getProperty(name);
  if (raw === null || raw === '') return fallback;
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return numeric;
}

function setTextColumnFormats_(sheet, headers, columnNames) {
  const columns = headerIndex_(headers);
  const rowCount = Math.max(1, sheet.getMaxRows() - 1);
  for (const columnName of columnNames) {
    sheet.getRange(2, columns[columnName] + 1, rowCount, 1).setNumberFormat('@');
  }
}

function ensureColumnCapacity_(sheet, requiredColumns) {
  if (sheet.getMaxColumns() < requiredColumns) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredColumns - sheet.getMaxColumns());
  }
}

function headerIndex_(headers) {
  const result = {};
  headers.forEach((header, index) => { result[header] = index; });
  return result;
}

function arraysEqual_(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256Hex_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8,
  );
  return bytes.map((byte) => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
}

function hmacSha256Base64Url_(value, secret) {
  const bytes = Utilities.computeHmacSha256Signature(
    value,
    secret,
    Utilities.Charset.UTF_8,
  );
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function decodeBase64UrlUtf8_(value) {
  try {
    return Utilities.newBlob(Utilities.base64DecodeWebSafe(value)).getDataAsString('UTF-8');
  } catch (error) {
    throw new ApiError_('WRITER_BUSY');
  }
}

function constantTimeEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index % Math.max(left.length, 1)) || 0)
      ^ (right.charCodeAt(index % Math.max(right.length, 1)) || 0);
  }
  return difference === 0;
}

function errorOutput_(requestId, code) {
  return jsonOutput_({
    version: PROTOCOL_VERSION_,
    requestId,
    ok: false,
    error: { code },
  });
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
