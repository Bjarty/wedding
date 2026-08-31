import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./Code.gs', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');
const TEST_NOW_MILLISECONDS = Date.parse('2026-08-29T12:00:00.000Z');
let testNowMilliseconds = TEST_NOW_MILLISECONDS;
const tickTestClock = () => { testNowMilliseconds += 1000; };
const faults = {
  flushCount: 0,
  failAtFlush: null,
  rangeWrite: null,
  rangeWrites: [],
};
const urlFetch = {
  requests: [],
  responses: [],
};
const sheetReadMetrics = { getValues: new Map(), bulkGetValues: new Map() };

const resetSheetReadMetrics = () => {
  sheetReadMetrics.getValues.clear();
  sheetReadMetrics.bulkGetValues.clear();
};

const queueUrlFetchResponse = (statusCode, body) => {
  urlFetch.responses.push({ statusCode, body });
};

const resetUrlFetch = () => {
  urlFetch.requests = [];
  urlFetch.responses = [];
};

const resetFaults = () => {
  faults.flushCount = 0;
  faults.failAtFlush = null;
  faults.rangeWrite = null;
  faults.rangeWrites = [];
};

const failAtFlush = (number) => {
  faults.flushCount = 0;
  faults.failAtFlush = number;
};

const failBeforeRangeWrite = (sheetName, row, column) => {
  faults.rangeWrite = { sheetName, row, column };
};

class FixedDate extends Date {
  constructor(...arguments_) {
    if (arguments_.length === 0) {
      super(testNowMilliseconds);
    } else {
      super(...arguments_);
    }
  }

  static now() {
    return testNowMilliseconds;
  }
}

class MockRange {
  constructor(sheet, row, column, rowCount, columnCount) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  getValues() {
    sheetReadMetrics.getValues.set(
      this.sheet.name,
      (sheetReadMetrics.getValues.get(this.sheet.name) ?? 0) + 1,
    );
    if (this.rowCount > 1) {
      sheetReadMetrics.bulkGetValues.set(
        this.sheet.name,
        (sheetReadMetrics.bulkGetValues.get(this.sheet.name) ?? 0) + 1,
      );
    }
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.getCell(this.row + rowOffset, this.column + columnOffset)));
  }

  getDisplayValues() {
    return this.getValues().map((row) => row.map((value) => value === '' ? '' : String(value)));
  }

  getFormulas() {
    return Array.from({ length: this.rowCount }, (_, rowOffset) =>
      Array.from({ length: this.columnCount }, (_, columnOffset) =>
        this.sheet.getFormula(this.row + rowOffset, this.column + columnOffset)));
  }

  setValues(values) {
    assert.equal(values.length, this.rowCount);
    faults.rangeWrites.push({
      sheetName: this.sheet.name,
      row: this.row,
      column: this.column,
      rowCount: this.rowCount,
      columnCount: this.columnCount,
    });
    if (faults.rangeWrite
        && faults.rangeWrite.sheetName === this.sheet.name
        && faults.rangeWrite.row === this.row
        && faults.rangeWrite.column === this.column) {
      faults.rangeWrite = null;
      throw new Error('Injected range-write failure');
    }
    values.forEach((row, rowOffset) => {
      assert.equal(row.length, this.columnCount);
      row.forEach((value, columnOffset) => {
        this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, value);
      });
    });
    return this;
  }

  setValue(value) {
    assert.equal(this.rowCount, 1);
    assert.equal(this.columnCount, 1);
    if (faults.rangeWrite
        && faults.rangeWrite.sheetName === this.sheet.name
        && faults.rangeWrite.row === this.row
        && faults.rangeWrite.column === this.column) {
      faults.rangeWrite = null;
      throw new Error('Injected range-write failure');
    }
    this.sheet.setCell(this.row, this.column, value);
    return this;
  }

  clearContent() {
    for (let rowOffset = 0; rowOffset < this.rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < this.columnCount; columnOffset += 1) {
        this.sheet.setCell(this.row + rowOffset, this.column + columnOffset, '');
      }
    }
    return this;
  }

  setFontWeight() { return this; }
  setBackground() { return this; }
  setFontColor() { return this; }
  setNumberFormat() { return this; }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this.maxColumns = 26;
    this.formulas = new Map();
  }

  getName() { return this.name; }
  getMaxRows() { return 1000; }
  getMaxColumns() { return this.maxColumns; }
  getLastColumn() {
    return Math.max(1, ...this.rows.map((row) => row.length));
  }
  insertColumnsAfter(_after, count) { this.maxColumns += count; }
  setFrozenRows() {}
  autoResizeColumns() {}

  getCell(row, column) {
    return this.rows[row - 1]?.[column - 1] ?? '';
  }

  getFormula(row, column) {
    return this.formulas.get(`${row}:${column}`) ?? '';
  }

  setCell(row, column, value) {
    while (this.rows.length < row) this.rows.push([]);
    while (this.rows[row - 1].length < column) this.rows[row - 1].push('');
    const key = `${row}:${column}`;
    if (typeof value === 'string' && /^'\s*[=+\-@']/.test(value)) {
      // Google Sheets consumes one leading apostrophe as its text prefix.
      this.rows[row - 1][column - 1] = value.slice(1);
      this.formulas.delete(key);
    } else {
      this.rows[row - 1][column - 1] = value;
      if (typeof value === 'string' && /^\s*[=+\-@]/.test(value)) {
        this.formulas.set(key, value);
      } else {
        this.formulas.delete(key);
      }
    }
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    return new MockRange(this, row, column, rowCount, columnCount);
  }

  getLastRow() {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      if (this.rows[index].some((value) => value !== '' && value !== null && value !== undefined)) {
        return index + 1;
      }
    }
    return 0;
  }
}

class MockSpreadsheet {
  constructor(id, ownerEmail) {
    this.id = id;
    this.ownerEmail = ownerEmail;
    this.sheets = new Map();
  }

  getId() { return this.id; }
  getOwner() { return { getEmail: () => this.ownerEmail }; }
  getSheetByName(name) { return this.sheets.get(name) ?? null; }
  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
  setSpreadsheetTimeZone() {}
  setSpreadsheetLocale() {}
}

const properties = new Map([
  ['ENVIRONMENT', 'production'],
  ['SPREADSHEET_ID', 'sheet-test-123'],
  ['SHEET_OWNER_EMAIL', 'sheet-owner@example.test'],
  ['WRITER_HMAC_SECRET', 'writer-secret-that-is-longer-than-thirty-two-characters'],
  ['RSVP_CLOSE_AT', '2099-01-01T00:00:00+01:00'],
]);
const spreadsheet = new MockSpreadsheet('sheet-test-123', 'sheet-owner@example.test');
const writerLogMessages = [];
const scriptLock = {
  held: false,
  tryLock() {
    if (this.held) return false;
    this.held = true;
    return true;
  },
  releaseLock() { this.held = false; },
};

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url');
const context = vm.createContext({
  console: { error: (message) => writerLogMessages.push(String(message)) },
  Date: FixedDate,
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (name) => properties.get(name) ?? null,
      setProperty: (name, value) => properties.set(name, value),
      deleteProperty: (name) => properties.delete(name),
    }),
  },
  SpreadsheetApp: {
    openById: (id) => {
      if (id !== spreadsheet.id) throw new Error('not found');
      return spreadsheet;
    },
    flush: () => {
      faults.flushCount += 1;
      if (faults.failAtFlush === faults.flushCount) {
        faults.failAtFlush = null;
        throw new Error(`Injected flush failure ${faults.flushCount}`);
      }
    },
  },
  UrlFetchApp: {
    fetch: (url, options) => {
      urlFetch.requests.push({ url, options: structuredClone(options) });
      const response = urlFetch.responses.shift();
      if (!response) throw new Error('Unexpected UrlFetchApp.fetch call');
      if (response instanceof Error) throw response;
      return {
        getResponseCode: () => response.statusCode,
        getContentText: () => JSON.stringify(response.body),
      };
    },
  },
  LockService: { getScriptLock: () => scriptLock },
  Utilities: {
    Charset: { UTF_8: 'UTF-8' },
    DigestAlgorithm: { SHA_256: 'SHA-256' },
    computeDigest: (_algorithm, value) => [...createHash('sha256').update(value, 'utf8').digest()],
    computeHmacSha256Signature: (value, secret) => [
      ...createHmac('sha256', secret).update(value, 'utf8').digest(),
    ],
    base64EncodeWebSafe: (bytes) => toBase64Url(bytes),
    base64DecodeWebSafe: (value) => [...Buffer.from(value, 'base64url')],
    newBlob: (bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf8') }),
    getUuid: () => randomUUID(),
  },
  ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text) => ({
      text,
      setMimeType() { return this; },
    }),
  },
});
vm.runInContext(source, context, { filename: scriptPath });
const run = (expression) => vm.runInContext(expression, context);
const hostValue = (value) => JSON.parse(JSON.stringify(value));

run('initSheet()');

const invitationHeaders = [
  'householdId', 'tokenHash', 'accessCodeHash', 'displayName',
  'invitationVariant', 'mealChoiceRequired', 'maxGuests', 'active',
  'currentRevision', 'createdAt', 'updatedAt',
];
const legacyInvitationHeaders = [
  'householdId', 'tokenHash', 'displayName', 'maxGuests', 'active',
  'currentRevision', 'createdAt', 'updatedAt',
];
const guestHeaders = [
  'householdId', 'guestId', 'displayName', 'attending', 'mealChoice',
  'revision', 'updatedAt',
];
assert.deepEqual(spreadsheet.getSheetByName('GuestDetails').rows[0], guestHeaders);
assert.deepEqual(spreadsheet.getSheetByName('EmailOutbox').rows[0], [
  'deliveryId', 'idempotencyKey', 'submitIntentMac', 'templateVersion', 'recipientEmail',
  'receiptNumber', 'revision', 'createdAt', 'expiresAt', 'contentMac',
  'status', 'attemptCount', 'firstAttemptAt', 'claimedAt', 'lastAttemptAt', 'nextAttemptAt',
  'sentAt', 'providerMessageId', 'lastErrorCode', 'stateMac',
]);

const tokenHash = createHmac('sha256', 'separate-token-hash-secret-with-32-chars')
  .update('raw-token-that-never-reaches-the-writer')
  .digest('base64url');
const accessCodeHash = createHmac('sha256', 'separate-access-code-secret-with-32-chars')
  .update('7K3MP9TWX4HCQ2RDV6FN')
  .digest('base64url');
assert.equal(tokenHash.length, 43);
assert.equal(accessCodeHash.length, 43);

// Recreate the exact legacy Invitations layout and prove migration refuses a
// pending durable write before changing any header or data cell.
const invitationSheet = spreadsheet.getSheetByName('Invitations');
invitationSheet.getRange(1, 1, 1, invitationHeaders.length).setValues([[
  ...legacyInvitationHeaders,
  ...Array(invitationHeaders.length - legacyInvitationHeaders.length).fill(''),
]]);
invitationSheet.getRange(2, 1, 1, invitationHeaders.length).setValues([[
  'household_1', tokenHash, 'Familie Voorbeeld', 2, true, 0,
  '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z',
  ...Array(invitationHeaders.length - legacyInvitationHeaders.length).fill(''),
]]);
const idempotencySheetForMigration = spreadsheet.getSheetByName('Idempotency');
const idempotencyHeadersForMigration = idempotencySheetForMigration.rows[0];
idempotencySheetForMigration.getRange(2, 1, 1, idempotencyHeadersForMigration.length).setValues([[
  ...idempotencyHeadersForMigration.map((header) => ({ operation: 'submit', status: 'pending' })[header] ?? ''),
]]);
assert.throws(() => run('migrateInvitationSchemaV1ToV2()'), /pending submit intent/);
assert.deepEqual(invitationSheet.rows[0].slice(0, legacyInvitationHeaders.length), legacyInvitationHeaders);
idempotencySheetForMigration.getRange(2, 1, 1, idempotencyHeadersForMigration.length).clearContent();

faults.rangeWrites = [];
failBeforeRangeWrite('Invitations', 1, 1);
assert.throws(() => run('migrateInvitationSchemaV1ToV2()'), /Injected range-write failure/);
assert.deepEqual(invitationSheet.rows[0].slice(0, legacyInvitationHeaders.length), legacyInvitationHeaders);
assert.equal(invitationSheet.rows[1][2], 'Familie Voorbeeld');
assert.deepEqual(faults.rangeWrites, [{
  sheetName: 'Invitations',
  row: 1,
  column: 1,
  rowCount: 2,
  columnCount: invitationHeaders.length,
}]);

faults.rangeWrites = [];
const migration = hostValue(run('migrateInvitationSchemaV1ToV2()'));
assert.deepEqual(migration, { migrated: true, schemaVersion: 2, invitationRows: 1 });
assert.deepEqual(faults.rangeWrites, [{
  sheetName: 'Invitations',
  row: 1,
  column: 1,
  rowCount: 2,
  columnCount: invitationHeaders.length,
}]);
assert.deepEqual(invitationSheet.rows[0], invitationHeaders);
assert.deepEqual(invitationSheet.rows[1], [
  'household_1', tokenHash, '', 'Familie Voorbeeld', 'day', true, 2, true, 0,
  '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z',
]);
assert.deepEqual(hostValue(run('migrateInvitationSchemaV1ToV2()')), {
  migrated: false,
  schemaVersion: 2,
  invitationRows: 1,
});

spreadsheet.getSheetByName('GuestDetails').getRange(2, 1, 2, 7).setValues([
  ['household_1', 'guest_1', 'Gast Eén', '', '', 0, ''],
  ['household_1', 'guest_2', 'Gast Twee', '', '', 0, ''],
]);

const writerSecret = properties.get('WRITER_HMAC_SECRET');
const makeEnvelope = (operation, data, options = {}) => {
  const requestId = options.requestId ?? randomUUID();
  const payloadRequestId = options.payloadRequestId ?? requestId;
  const timestamp = options.timestamp ?? Math.floor(testNowMilliseconds / 1000);
  const payloadObject = { version: 'v1', operation, requestId: payloadRequestId, data };
  const payload = Buffer.from(JSON.stringify(payloadObject), 'utf8').toString('base64url');
  const signingInput = `v1.${timestamp}.${requestId}.${payload}`;
  const signature = createHmac('sha256', writerSecret).update(signingInput, 'utf8').digest('base64url');
  return { version: 'v1', timestamp, requestId, payload, signature };
};

const post = (envelope) => {
  context.__event = { postData: { contents: JSON.stringify(envelope) } };
  const output = run('doPost(__event)');
  return JSON.parse(output.text);
};

const invitationUpdatedAtColumn = invitationHeaders.indexOf('updatedAt') + 1;
const invitationActiveColumn = invitationHeaders.indexOf('active') + 1;
const invitationVariantColumn = invitationHeaders.indexOf('invitationVariant') + 1;
const invitationMealPolicyColumn = invitationHeaders.indexOf('mealChoiceRequired') + 1;
const validProvisioningTimestamp = invitationSheet.getCell(2, invitationUpdatedAtColumn);
invitationSheet.setCell(2, invitationUpdatedAtColumn, '');
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
assert.equal(spreadsheet.getSheetByName('Idempotency').getLastRow(), 1);
invitationSheet.setCell(2, invitationUpdatedAtColumn, validProvisioningTimestamp);

const provisioningResponseSheet = spreadsheet.getSheetByName('Responses');
provisioningResponseSheet.getRange(2, 1, 1, 10).setValues([[
  randomUUID(), 'RSVP-STRAY123', 'household_1', 1, false, 0, '', '',
  new FixedDate(), new FixedDate(),
]]);
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
assert.equal(spreadsheet.getSheetByName('Idempotency').getLastRow(), 1);
provisioningResponseSheet.getRange(2, 1, 1, 10).clearContent();

const provisioningGuestSheet = spreadsheet.getSheetByName('GuestDetails');
provisioningGuestSheet.setCell(2, 4, true);
provisioningGuestSheet.setCell(2, 5, 'fish');
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
assert.equal(spreadsheet.getSheetByName('Idempotency').getLastRow(), 1);
provisioningGuestSheet.setCell(2, 4, '');
provisioningGuestSheet.setCell(2, 5, '');

const resolveEnvelope = makeEnvelope('resolve', { tokenHash });
assert.equal(Buffer.from(resolveEnvelope.payload, 'base64url').toString('utf8').includes('raw-token'), false);
const firstResolve = post(resolveEnvelope);
assert.equal(firstResolve.ok, true);
assert.deepEqual(firstResolve.data, {
  householdId: 'household_1',
  displayName: 'Familie Voorbeeld',
  invitationVariant: 'day',
  mealChoiceRequired: true,
  maxGuests: 2,
  guests: [
    { guestId: 'guest_1', displayName: 'Gast Eén' },
    { guestId: 'guest_2', displayName: 'Gast Twee' },
  ],
  currentRsvp: null,
});
assert.equal(post(resolveEnvelope).error.code, 'RATE_LIMITED');

const idempotencyKey = randomUUID();
const submitData = {
  tokenHash,
  idempotencyKey,
  revision: 0,
  attending: true,
  guests: [
    { guestId: 'guest_1', attending: true, mealChoice: 'vegetarian' },
    { guestId: 'guest_2', attending: false },
  ],
  email: 'gast@example.nl',
  message: '=IMPORTXML("https://example.invalid")',
};
properties.set('CONFIRMATION_EMAIL_ENABLED', 'TRUE');
const firstSubmit = post(makeEnvelope('submit', submitData));
assert.equal(firstSubmit.ok, true);
assert.equal(firstSubmit.data.revision, 1);
assert.match(firstSubmit.data.receiptNumber, /^RSVP-[A-Z0-9]{6,20}$/);
assert.equal(firstSubmit.data.idempotencyKey, idempotencyKey);
assert.equal(spreadsheet.getSheetByName('EmailOutbox').getLastRow(), 1);
assert.equal(urlFetch.requests.length, 0);
properties.delete('CONFIRMATION_EMAIL_ENABLED');

const responseSheet = spreadsheet.getSheetByName('Responses');
const responseHeader = responseSheet.rows[0];
const response = Object.fromEntries(responseHeader.map((header, index) => [header, responseSheet.rows[1][index]]));
assert.equal(response.revision, 1);
assert.equal(response.receiptNumber, firstSubmit.data.receiptNumber);
assert.equal(response.message, submitData.message);
assert.deepEqual(responseSheet.getRange(2, 7, 1, 2).getFormulas()[0], ['', '']);
assert.equal(spreadsheet.getSheetByName('GuestDetails').rows[1][2], 'Gast Eén');
assert.equal(spreadsheet.getSheetByName('GuestDetails').rows[1][3], true);
assert.equal(spreadsheet.getSheetByName('GuestDetails').rows[1][4], 'vegetarian');
assert.equal(spreadsheet.getSheetByName('GuestDetails').rows[2][3], false);
assert.equal(spreadsheet.getSheetByName('GuestDetails').rows[2][4], '');

const countsBeforeRetry = Object.fromEntries(
  ['Responses', 'GuestDetails', 'Idempotency', 'Audit'].map((name) => [name, spreadsheet.getSheetByName(name).getLastRow()]),
);
const retrySubmit = post(makeEnvelope('submit', submitData));
assert.deepEqual(retrySubmit.data, firstSubmit.data);
const reorderedRetry = post(makeEnvelope('submit', {
  ...submitData,
  guests: [...submitData.guests].reverse(),
}));
assert.deepEqual(reorderedRetry.data, firstSubmit.data);
assert.deepEqual(
  Object.fromEntries(
    ['Responses', 'GuestDetails', 'Idempotency', 'Audit'].map((name) => [name, spreadsheet.getSheetByName(name).getLastRow()]),
  ),
  countsBeforeRetry,
);

properties.set('RSVP_CLOSE_AT', '2000-01-01T00:00:00+01:00');
assert.deepEqual(post(makeEnvelope('submit', submitData)).data, firstSubmit.data);
assert.equal(post(makeEnvelope('submit', {
  ...submitData,
  idempotencyKey: randomUUID(),
  revision: 1,
})).error.code, 'RSVP_CLOSED');
properties.set('RSVP_CLOSE_AT', '2099-01-01T00:00:00+01:00');

assert.equal(post(makeEnvelope('submit', { ...submitData, message: 'anders' })).error.code, 'IDEMPOTENCY_CONFLICT');
assert.equal(post(makeEnvelope('submit', {
  ...submitData,
  idempotencyKey: randomUUID(),
})).error.code, 'REVISION_CONFLICT');

const guestCountColumn = responseHeader.indexOf('guestCount') + 1;
const emailColumn = responseHeader.indexOf('email') + 1;
const messageIntegrityColumn = responseHeader.indexOf('message') + 1;
const submittedAtColumn = responseHeader.indexOf('submittedAt') + 1;
responseSheet.setCell(2, guestCountColumn, 2);
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
responseSheet.setCell(2, guestCountColumn, 1);
responseSheet.setCell(2, submittedAtColumn, 'geen-datum');
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
responseSheet.setCell(2, submittedAtColumn, response.submittedAt);
responseSheet.setCell(2, emailColumn, 'ongeldig-adres');
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
responseSheet.setCell(2, emailColumn, response.email);
responseSheet.setCell(2, messageIntegrityColumn, 'x'.repeat(1001));
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
responseSheet.setCell(2, messageIntegrityColumn, `'${response.message}`);

const currentResolve = post(makeEnvelope('resolve', { tokenHash }));
assert.equal(currentResolve.data.currentRsvp.revision, 1);
assert.equal(currentResolve.data.currentRsvp.receiptNumber, firstSubmit.data.receiptNumber);
assert.equal(currentResolve.data.currentRsvp.message, submitData.message);
assert.deepEqual(currentResolve.data.currentRsvp.guests, submitData.guests);

const updateData = {
  tokenHash,
  idempotencyKey: randomUUID(),
  revision: 1,
  attending: false,
  guests: [
    { guestId: 'guest_1', attending: false },
    { guestId: 'guest_2', attending: false },
  ],
};
const updated = post(makeEnvelope('submit', updateData));
assert.equal(updated.data.revision, 2);
assert.equal(updated.data.receiptNumber, firstSubmit.data.receiptNumber);

// A v2 access-code household is resolved by accessCodeHash only. Its evening
// policy is returned to the browser and is enforced again by the writer.
invitationSheet.getRange(3, 1, 1, invitationHeaders.length).setValues([[
  'household_evening', '', accessCodeHash, 'Familie Avond', 'evening', false,
  1, true, 0, '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z',
]]);
spreadsheet.getSheetByName('GuestDetails').getRange(4, 1, 1, 7).setValues([[
  'household_evening', 'guest_evening_1', 'Avondgast Eén', '', '', 0, '',
]]);

assert.equal(post(makeEnvelope('resolve', { tokenHash, accessCodeHash })).error.code, 'INVITATION_INVALID');
assert.equal(post(makeEnvelope('resolve', {})).error.code, 'INVITATION_INVALID');
assert.equal(post(makeEnvelope('submit', {
  ...updateData,
  accessCodeHash,
  idempotencyKey: randomUUID(),
  revision: 2,
})).error.code, 'INVITATION_INVALID');
const eveningResolve = post(makeEnvelope('resolve', { accessCodeHash }));
assert.equal(eveningResolve.ok, true);
assert.deepEqual(eveningResolve.data, {
  householdId: 'household_evening',
  displayName: 'Familie Avond',
  invitationVariant: 'evening',
  mealChoiceRequired: false,
  maxGuests: 1,
  guests: [{ guestId: 'guest_evening_1', displayName: 'Avondgast Eén' }],
  currentRsvp: null,
});

const eveningFirstData = {
  accessCodeHash,
  idempotencyKey: randomUUID(),
  revision: 0,
  attending: true,
  guests: [{ guestId: 'guest_evening_1', attending: true }],
};
const eveningFirst = post(makeEnvelope('submit', eveningFirstData));
assert.equal(eveningFirst.ok, true);
assert.equal(eveningFirst.data.revision, 1);
const eveningCurrent = post(makeEnvelope('resolve', { accessCodeHash }));
assert.deepEqual(eveningCurrent.data.currentRsvp.guests, [
  { guestId: 'guest_evening_1', attending: true },
]);

const eveningResponseBeforeUpdate = rowsAsObjects('Responses')
  .find((row) => row.values.householdId === 'household_evening').values;
const eveningSecond = post(makeEnvelope('submit', {
  ...eveningFirstData,
  idempotencyKey: randomUUID(),
  revision: 1,
  attending: false,
  guests: [{ guestId: 'guest_evening_1', attending: false }],
}));
assert.equal(eveningSecond.data.revision, 2);
assert.equal(eveningSecond.data.receiptNumber, eveningFirst.data.receiptNumber);
const eveningResponses = rowsAsObjects('Responses')
  .filter((row) => row.values.householdId === 'household_evening');
assert.equal(eveningResponses.length, 1);
assert.equal(eveningResponses[0].values.responseId, eveningResponseBeforeUpdate.responseId);
assert.equal(eveningResponses[0].values.submittedAt, eveningResponseBeforeUpdate.submittedAt);

assert.equal(post(makeEnvelope('submit', {
  tokenHash,
  idempotencyKey: randomUUID(),
  revision: 2,
  attending: true,
  guests: [
    { guestId: 'guest_1', attending: true },
    { guestId: 'guest_2', attending: false },
  ],
})).error.code, 'INVITATION_INVALID');
assert.equal(post(makeEnvelope('submit', {
  accessCodeHash,
  idempotencyKey: randomUUID(),
  revision: 2,
  attending: true,
  guests: [{ guestId: 'guest_evening_1', attending: true, mealChoice: 'fish' }],
})).error.code, 'INVITATION_INVALID');

const unknownNameData = {
  ...updateData,
  idempotencyKey: randomUUID(),
  revision: 2,
  guests: [
    { guestId: 'guest_1', name: 'Niet toegestaan', attending: false },
    { guestId: 'guest_2', attending: false },
  ],
};
assert.equal(post(makeEnvelope('submit', unknownNameData)).error.code, 'WRITER_BUSY');
assert.equal(post(makeEnvelope('submit', {
  ...updateData,
  idempotencyKey: randomUUID(),
  revision: 2,
  dietaryRequirements: 'niet toegestaan',
})).error.code, 'WRITER_BUSY');
assert.equal(post(makeEnvelope('submit', {
  ...updateData,
  idempotencyKey: randomUUID(),
  revision: 2,
  phone: 'niet toegestaan',
})).error.code, 'WRITER_BUSY');
assert.equal(post(makeEnvelope('submit', {
  ...updateData,
  idempotencyKey: randomUUID(),
  revision: 2,
  guests: [
    { guestId: 'guest_1', attending: false },
    { guestId: 'guest_unknown', attending: false },
  ],
})).error.code, 'INVITATION_INVALID');

function rowsAsObjects(sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  const [headers, ...rows] = sheet.rows;
  return rows
    .filter((row) => row.some((value) => value !== '' && value !== undefined && value !== null))
    .map((row, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
    }));
}
const rowsMatching = (sheetName, column, value) =>
  rowsAsObjects(sheetName).filter((row) => String(row.values[column]) === String(value));
const invitationRevision = () => Number(rowsAsObjects('Invitations')[0].values.currentRevision);
const responseRevision = () => Number(rowsAsObjects('Responses')[0].values.revision);
const makeDurableSubmit = (revision, idempotencyKeyValue = randomUUID()) => ({
  tokenHash,
  idempotencyKey: idempotencyKeyValue,
  revision,
  attending: revision % 2 === 0,
  guests: revision % 2 === 0
    ? [
      { guestId: 'guest_1', attending: true, mealChoice: 'fish' },
      { guestId: 'guest_2', attending: false },
    ]
    : [
      { guestId: 'guest_1', attending: false },
      { guestId: 'guest_2', attending: false },
    ],
  email: `revision-${revision}@example.nl`,
  message: `duurzame wijziging ${revision}`,
});
const expectSingleDurableResult = (data, expectedResult) => {
  const retry = post(makeEnvelope('submit', data));
  assert.equal(retry.ok, true);
  assert.deepEqual(retry.data, expectedResult);
  assert.equal(invitationRevision(), expectedResult.revision);
  assert.equal(responseRevision(), expectedResult.revision);
  assert.equal(rowsMatching('Idempotency', 'idempotencyKey', data.idempotencyKey).length, 1);
  assert.equal(rowsMatching('Audit', 'idempotencyKey', data.idempotencyKey).length, 1);
  for (const guest of rowsMatching('GuestDetails', 'householdId', 'household_1')) {
    assert.equal(Number(guest.values.revision), expectedResult.revision);
  }
  return retry.data;
};

let durableRevision = 2;
for (const logicalMessage of ['+SUM(1,1)', '-10+20', '@tekst', "'=letterlijke-apostrof", "  '=na-spaties"]) {
  tickTestClock();
  const formulaSafeData = {
    ...makeDurableSubmit(durableRevision),
    message: logicalMessage,
  };
  const formulaSafeResult = post(makeEnvelope('submit', formulaSafeData));
  assert.equal(formulaSafeResult.ok, true);
  const storedResponse = rowsAsObjects('Responses')[0];
  assert.equal(storedResponse.values.message, logicalMessage.trim());
  assert.deepEqual(responseSheet.getRange(storedResponse.rowNumber, 7, 1, 2).getFormulas()[0], ['', '']);
  durableRevision += 1;
}

// Every durable boundary may throw after its Sheet writes. A logical retry
// must recover the authenticated target exactly once and return its first
// receipt/result, including when the completion flush itself was ambiguous.
for (const boundary of [1, 2, 3, 4, 5, 6, 7, 8]) {
  tickTestClock();
  resetFaults();
  const data = makeDurableSubmit(durableRevision);
  failAtFlush(boundary);
  const failed = post(makeEnvelope('submit', data));
  assert.equal(failed.ok, false, `flush boundary ${boundary} must fail closed`);
  assert.equal(failed.error.code, 'WRITER_BUSY');
  const [intentRow] = rowsMatching('Idempotency', 'idempotencyKey', data.idempotencyKey);
  assert.ok(intentRow, `flush boundary ${boundary} must leave a durable intent`);
  const expectedResult = JSON.parse(intentRow.values.intentJson).result;
  resetFaults();
  expectSingleDurableResult(data, expectedResult);
  assert.equal(expectedResult.receiptNumber, firstSubmit.data.receiptNumber);
  durableRevision += 1;
}

// Envelope verification and durable-intent metadata use the same configured
// clock window. An accepted 850-second-old request remains recoverable.
resetFaults();
tickTestClock();
properties.set('MAX_CLOCK_SKEW_SECONDS', '900');
const wideSkewData = makeDurableSubmit(durableRevision);
failAtFlush(2);
const wideSkewEnvelope = makeEnvelope('submit', wideSkewData, {
  timestamp: Math.floor(testNowMilliseconds / 1000) - 850,
});
assert.equal(post(wideSkewEnvelope).error.code, 'WRITER_BUSY');
const wideSkewIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', wideSkewData.idempotencyKey)[0].values.intentJson,
);
resetFaults();
expectSingleDurableResult(wideSkewData, wideSkewIntent.result);
properties.delete('MAX_CLOCK_SKEW_SECONDS');
durableRevision += 1;

// A crash in the middle of per-guest writes leaves a mixed base/target set;
// recovery recognizes each row independently without duplicating the audit.
resetFaults();
tickTestClock();
const midGuestData = makeDurableSubmit(durableRevision);
failBeforeRangeWrite('GuestDetails', 3, 4);
assert.equal(post(makeEnvelope('submit', midGuestData)).error.code, 'WRITER_BUSY');
const midGuestIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', midGuestData.idempotencyKey)[0].values.intentJson,
);
expectSingleDurableResult(midGuestData, midGuestIntent.result);
durableRevision += 1;

// A pending intent written by the legacy writer has no policy field. Its
// authenticated day/meal-required semantics remain recoverable after schema
// migration and are never reinterpreted as evening policy.
resetFaults();
tickTestClock();
const legacyIntentData = makeDurableSubmit(durableRevision);
failAtFlush(1);
assert.equal(post(makeEnvelope('submit', legacyIntentData)).error.code, 'WRITER_BUSY');
const legacyIntentRow = rowsMatching('Idempotency', 'idempotencyKey', legacyIntentData.idempotencyKey)[0];
const legacyIntentBody = JSON.parse(legacyIntentRow.values.intentJson);
delete legacyIntentBody.policy;
const legacyIntentJson = JSON.stringify(legacyIntentBody);
const legacyIntentMacInput = [
  'rsvp-intent-v1',
  legacyIntentRow.values.requestId,
  legacyIntentRow.values.idempotencyKey,
  legacyIntentRow.values.payloadHash,
  legacyIntentRow.values.householdId,
  legacyIntentRow.values.baseRevision,
  legacyIntentRow.values.targetRevision,
  legacyIntentJson,
].join('|');
const legacyIntentMac = createHmac('sha256', writerSecret)
  .update(legacyIntentMacInput, 'utf8')
  .digest('base64url');
const idempotencyHeader = spreadsheet.getSheetByName('Idempotency').rows[0];
const legacyIntentJsonColumn = idempotencyHeader.indexOf('intentJson') + 1;
const legacyIntentMacColumn = idempotencyHeader.indexOf('intentMac') + 1;
spreadsheet.getSheetByName('Idempotency')
  .setCell(legacyIntentRow.rowNumber, legacyIntentJsonColumn, legacyIntentJson);
spreadsheet.getSheetByName('Idempotency')
  .setCell(legacyIntentRow.rowNumber, legacyIntentMacColumn, legacyIntentMac);
resetFaults();
expectSingleDurableResult(legacyIntentData, legacyIntentBody.result);
durableRevision += 1;

// New intent policy is inside the authenticated JSON and must also still
// match the current private Invitation row during recovery.
resetFaults();
tickTestClock();
const policyBindingData = makeDurableSubmit(durableRevision);
failAtFlush(1);
assert.equal(post(makeEnvelope('submit', policyBindingData)).error.code, 'WRITER_BUSY');
const policyBindingRow = rowsMatching('Idempotency', 'idempotencyKey', policyBindingData.idempotencyKey)[0];
const policyBindingIntent = JSON.parse(policyBindingRow.values.intentJson);
invitationSheet.setCell(2, invitationVariantColumn, 'evening');
invitationSheet.setCell(2, invitationMealPolicyColumn, false);
resetFaults();
assert.equal(post(makeEnvelope('submit', policyBindingData)).error.code, 'WRITER_BUSY');
assert.equal(invitationRevision(), durableRevision);
invitationSheet.setCell(2, invitationVariantColumn, 'day');
invitationSheet.setCell(2, invitationMealPolicyColumn, true);
expectSingleDurableResult(policyBindingData, policyBindingIntent.result);
durableRevision += 1;

// A changed retry cannot take over an existing key, even if its original
// request first needs recovery.
resetFaults();
tickTestClock();
const conflictPendingData = makeDurableSubmit(durableRevision);
failAtFlush(2);
assert.equal(post(makeEnvelope('submit', conflictPendingData)).error.code, 'WRITER_BUSY');
const conflictIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', conflictPendingData.idempotencyKey)[0].values.intentJson,
);
resetFaults();
assert.equal(post(makeEnvelope('submit', {
  ...conflictPendingData,
  message: 'andere logische payload',
})).error.code, 'IDEMPOTENCY_CONFLICT');
expectSingleDurableResult(conflictPendingData, conflictIntent.result);
durableRevision += 1;

// A new key first recovers the household's accepted pending write and then
// receives the normal stale-revision conflict; it cannot bypass the WAL.
resetFaults();
tickTestClock();
const pendingBeforeNewKey = makeDurableSubmit(durableRevision);
failAtFlush(3);
assert.equal(post(makeEnvelope('submit', pendingBeforeNewKey)).error.code, 'WRITER_BUSY');
const pendingBeforeNewIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', pendingBeforeNewKey.idempotencyKey)[0].values.intentJson,
);
resetFaults();
assert.equal(post(makeEnvelope('submit', {
  ...pendingBeforeNewKey,
  idempotencyKey: randomUUID(),
})).error.code, 'REVISION_CONFLICT');
expectSingleDurableResult(pendingBeforeNewKey, pendingBeforeNewIntent.result);
durableRevision += 1;

// Resolve is also a recovery entrypoint and must observe the committed target.
resetFaults();
tickTestClock();
const resolveRecoveryData = makeDurableSubmit(durableRevision);
failAtFlush(4);
assert.equal(post(makeEnvelope('submit', resolveRecoveryData)).error.code, 'WRITER_BUSY');
const resolveRecoveryIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', resolveRecoveryData.idempotencyKey)[0].values.intentJson,
);
resetFaults();
const resolvedAfterRecovery = post(makeEnvelope('resolve', { tokenHash }));
assert.equal(resolvedAfterRecovery.ok, true);
assert.equal(resolvedAfterRecovery.data.currentRsvp.revision, resolveRecoveryIntent.result.revision);
expectSingleDurableResult(resolveRecoveryData, resolveRecoveryIntent.result);
durableRevision += 1;

// An already accepted intent is recoverable after close and deactivation. A
// new submission would still be blocked after this recovery completes.
resetFaults();
tickTestClock();
const closedRecoveryData = makeDurableSubmit(durableRevision);
failAtFlush(2);
assert.equal(post(makeEnvelope('submit', closedRecoveryData)).error.code, 'WRITER_BUSY');
const closedRecoveryIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', closedRecoveryData.idempotencyKey)[0].values.intentJson,
);
const invitationsSheet = spreadsheet.getSheetByName('Invitations');
invitationsSheet.setCell(2, invitationActiveColumn, false);
properties.set('RSVP_CLOSE_AT', '2000-01-01T00:00:00+01:00');
resetFaults();
expectSingleDurableResult(closedRecoveryData, closedRecoveryIntent.result);
invitationsSheet.setCell(2, invitationActiveColumn, true);
properties.set('RSVP_CLOSE_AT', '2099-01-01T00:00:00+01:00');
durableRevision += 1;

// MAC tampering fails before any domain write. Restoring the authenticated
// value demonstrates that the original intent remains recoverable.
resetFaults();
tickTestClock();
const macTamperData = makeDurableSubmit(durableRevision);
failAtFlush(1);
assert.equal(post(makeEnvelope('submit', macTamperData)).error.code, 'WRITER_BUSY');
const macRow = rowsMatching('Idempotency', 'idempotencyKey', macTamperData.idempotencyKey)[0];
const macSheet = spreadsheet.getSheetByName('Idempotency');
const macColumn = macSheet.rows[0].indexOf('intentMac') + 1;
const statusColumn = macSheet.rows[0].indexOf('status') + 1;
const originalMac = macRow.values.intentMac;
const alteredMac = `${originalMac.slice(0, -1)}${originalMac.endsWith('A') ? 'B' : 'A'}`;
macSheet.setCell(macRow.rowNumber, macColumn, alteredMac);
const revisionBeforeMacFailure = invitationRevision();
resetFaults();
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
assert.equal(invitationRevision(), revisionBeforeMacFailure);
macSheet.setCell(macRow.rowNumber, macColumn, originalMac);
const macIntent = JSON.parse(macRow.values.intentJson);
expectSingleDurableResult(macTamperData, macIntent.result);
durableRevision += 1;

// Copying the expected result and flipping status cannot forge completion:
// the writer-only completion MAC is mandatory before any completed retry.
resetFaults();
tickTestClock();
const completionForgeryData = makeDurableSubmit(durableRevision);
failAtFlush(1);
assert.equal(post(makeEnvelope('submit', completionForgeryData)).error.code, 'WRITER_BUSY');
const completionForgeryRow = rowsMatching(
  'Idempotency',
  'idempotencyKey',
  completionForgeryData.idempotencyKey,
)[0];
const completionForgeryIntent = JSON.parse(completionForgeryRow.values.intentJson);
const responseJsonColumn = macSheet.rows[0].indexOf('responseJson') + 1;
macSheet.setCell(
  completionForgeryRow.rowNumber,
  responseJsonColumn,
  JSON.stringify(completionForgeryIntent.result),
);
macSheet.setCell(completionForgeryRow.rowNumber, statusColumn, 'completed');
const revisionBeforeCompletionForgery = invitationRevision();
resetFaults();
assert.equal(post(makeEnvelope('submit', completionForgeryData)).error.code, 'WRITER_BUSY');
assert.equal(invitationRevision(), revisionBeforeCompletionForgery);
macSheet.setCell(completionForgeryRow.rowNumber, responseJsonColumn, '');
macSheet.setCell(completionForgeryRow.rowNumber, statusColumn, 'pending');
expectSingleDurableResult(completionForgeryData, completionForgeryIntent.result);
durableRevision += 1;

// An unexpected partially-written target is never overwritten. Once the
// exact authenticated cell is restored, deterministic recovery may continue.
resetFaults();
tickTestClock();
const targetTamperData = makeDurableSubmit(durableRevision);
failAtFlush(2);
assert.equal(post(makeEnvelope('submit', targetTamperData)).error.code, 'WRITER_BUSY');
const targetIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', targetTamperData.idempotencyKey)[0].values.intentJson,
);
const messageColumn = responseSheet.rows[0].indexOf('message') + 1;
responseSheet.setCell(2, messageColumn, 'onverwachte handmatige wijziging');
resetFaults();
assert.equal(post(makeEnvelope('submit', targetTamperData)).error.code, 'WRITER_BUSY');
assert.equal(invitationRevision(), durableRevision);
responseSheet.setCell(2, messageColumn, targetIntent.response.message);
expectSingleDurableResult(targetTamperData, targetIntent.result);
durableRevision += 1;

// A pre-existing exact audit row is reused; a conflicting row fails closed.
resetFaults();
tickTestClock();
const auditTamperData = makeDurableSubmit(durableRevision);
failAtFlush(4);
assert.equal(post(makeEnvelope('submit', auditTamperData)).error.code, 'WRITER_BUSY');
const auditIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', auditTamperData.idempotencyKey)[0].values.intentJson,
);
const auditRow = rowsMatching('Audit', 'idempotencyKey', auditTamperData.idempotencyKey)[0];
const auditSheet = spreadsheet.getSheetByName('Audit');
const outcomeColumn = auditSheet.rows[0].indexOf('outcome') + 1;
auditSheet.setCell(auditRow.rowNumber, outcomeColumn, 'tampered');
resetFaults();
assert.equal(post(makeEnvelope('submit', auditTamperData)).error.code, 'WRITER_BUSY');
assert.equal(invitationRevision(), durableRevision);
auditSheet.setCell(auditRow.rowNumber, outcomeColumn, auditIntent.audit.outcome);
expectSingleDurableResult(auditTamperData, auditIntent.result);
durableRevision += 1;

// The manual recovery entrypoint validates all pending intents before writes.
resetFaults();
tickTestClock();
const manualRecoveryData = makeDurableSubmit(durableRevision);
failAtFlush(1);
assert.equal(post(makeEnvelope('submit', manualRecoveryData)).error.code, 'WRITER_BUSY');
const manualIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', manualRecoveryData.idempotencyKey)[0].values.intentJson,
);
resetFaults();
const manualRecovery = hostValue(run('recoverAllPendingIntents()'));
assert.equal(manualRecovery.recovered, 1);
assert.deepEqual(manualRecovery.results[0], manualIntent.result);
expectSingleDurableResult(manualRecoveryData, manualIntent.result);
durableRevision += 1;

// The privacy delete-by deadline is a harder boundary than ordinary RSVP
// close: after it, neither request-path nor manual recovery may write data.
resetFaults();
tickTestClock();
const retentionBoundaryData = makeDurableSubmit(durableRevision);
failAtFlush(1);
assert.equal(post(makeEnvelope('submit', retentionBoundaryData)).error.code, 'WRITER_BUSY');
const retentionBoundaryIntent = JSON.parse(
  rowsMatching('Idempotency', 'idempotencyKey', retentionBoundaryData.idempotencyKey)[0].values.intentJson,
);
const beforeRetentionBoundaryRevision = invitationRevision();
const preBoundaryTestNow = testNowMilliseconds;
testNowMilliseconds = Date.parse('2027-07-31T22:00:00.000Z');
resetFaults();
assert.equal(post(makeEnvelope('submit', retentionBoundaryData)).error.code, 'RSVP_CLOSED');
assert.equal(invitationRevision(), beforeRetentionBoundaryRevision);
assert.throws(() => run('recoverAllPendingIntents()'), /RSVP_CLOSED/);
assert.equal(invitationRevision(), beforeRetentionBoundaryRevision);
testNowMilliseconds = preBoundaryTestNow;
expectSingleDurableResult(retentionBoundaryData, retentionBoundaryIntent.result);
durableRevision += 1;

// Confirmation email delivery is separately durable and fail-safe. It uses a
// new household so the first save, updates, removal of an address and retries
// can be verified without changing the earlier WAL scenarios.
const emailAccessCodeHash = createHmac('sha256', 'separate-access-code-secret-with-32-chars')
  .update('EMAIL-TEST-CODE-NOT-SENT')
  .digest('base64url');
invitationSheet.getRange(4, 1, 1, invitationHeaders.length).setValues([[
  'household_email', '', emailAccessCodeHash, 'Familie Mailtest', 'evening', false,
  1, true, 0, new FixedDate(), new FixedDate(),
]]);
spreadsheet.getSheetByName('GuestDetails').getRange(5, 1, 1, 7).setValues([[
  'household_email', 'guest_email_1', 'Geheime Gastnaam', '', '', 0, '',
]]);
properties.set('CONFIRMATION_EMAIL_ENABLED', 'true');
properties.set('CONFIRMATION_EMAIL_ACTIVATED_AT', '2027-01-01T00:00:00+01:00');
assert.equal(run('getConfirmationEmailActivationIso_()'), '2026-12-31T23:00:00.000Z');
for (const invalidActivation of [
  '2027-01-01T00:00:00',
  '2027-02-29T00:00:00+01:00',
  '2027-01-01T00:00:00+15:00',
  '2027-01-01T00:00:00+02:60',
]) {
  properties.set('CONFIRMATION_EMAIL_ACTIVATED_AT', invalidActivation);
  assert.throws(() => run('getConfirmationEmailActivationIso_()'), /time zone|valid zoned/);
}
properties.set(
  'CONFIRMATION_EMAIL_ACTIVATED_AT',
  new FixedDate(testNowMilliseconds - 1000).toISOString(),
);
properties.set('RESEND_API_KEY', 're_test_key_that_is_long_enough_123456');
resetUrlFetch();

const makeEmailSubmit = (revision, email, idempotencyKeyValue = randomUUID()) => ({
  accessCodeHash: emailAccessCodeHash,
  idempotencyKey: idempotencyKeyValue,
  revision,
  attending: true,
  guests: [{ guestId: 'guest_email_1', attending: true }],
  ...(email ? { email } : {}),
  message: 'PRIVE BERICHT DAT NOOIT IN DE MAIL MAG STAAN',
});

const firstEmailKey = randomUUID();
const firstEmailData = makeEmailSubmit(0, '=gast.mail@example.nl', firstEmailKey);
const firstProviderId = randomUUID();
queueUrlFetchResponse(200, { id: firstProviderId });
const firstEmailSubmit = post(makeEnvelope('submit', firstEmailData));
assert.equal(firstEmailSubmit.ok, true);
assert.equal(firstEmailSubmit.data.revision, 1);
assert.equal(urlFetch.requests.length, 1);
let emailOutboxRows = rowsMatching('EmailOutbox', 'idempotencyKey', firstEmailKey);
assert.equal(emailOutboxRows.length, 1);
assert.equal(emailOutboxRows[0].values.status, 'sent');
assert.equal(emailOutboxRows[0].values.providerMessageId, firstProviderId);

const firstRequest = urlFetch.requests[0];
assert.equal(firstRequest.url, 'https://api.resend.com/emails');
assert.equal(firstRequest.options.timeoutSeconds, 10);
assert.equal(firstRequest.options.muteHttpExceptions, true);
assert.equal(firstRequest.options.headers['User-Agent'], 'LisetteBjarty-RSVP/1.0');
assert.match(firstRequest.options.headers.Authorization, /^Bearer re_/);
assert.match(firstRequest.options.headers['Idempotency-Key'], /^[A-Za-z0-9_-]{43}$/);
assert.equal(firstRequest.options.headers['Idempotency-Key'].includes(firstEmailKey), false);
const firstMailPayload = JSON.parse(firstRequest.options.payload);
assert.equal(firstMailPayload.from, 'Lisette & Bjarty <rsvp@lisetteenbjarty.nl>');
assert.equal(firstMailPayload.reply_to, 'rsvp@lisetteenbjarty.nl');
assert.deepEqual(firstMailPayload.to, ['=gast.mail@example.nl']);
assert.equal(firstMailPayload.text.includes(firstEmailSubmit.data.receiptNumber), true);
assert.equal(firstMailPayload.text.includes('10 april 2027'), true);
assert.equal(firstMailPayload.text.includes('https://lisetteenbjarty.nl/'), true);
assert.equal(firstMailPayload.text.includes('geen toegangscode'), true);
assert.equal(emailOutboxRows[0].values.templateVersion, 'rsvp_confirmation_v1');
for (const forbidden of [
  'EMAIL-TEST-CODE-NOT-SENT', emailAccessCodeHash, firstEmailKey,
  'household_email', 'Familie Mailtest', 'Geheime Gastnaam',
  'PRIVE BERICHT', 'guest_email_1', 'evening',
]) {
  assert.equal(firstRequest.options.payload.includes(forbidden), false, `${forbidden} leaked into mail`);
}
const firstEmailOutboxRow = rowsMatching('EmailOutbox', 'idempotencyKey', firstEmailKey)[0];
const outboxRecipientColumn = spreadsheet.getSheetByName('EmailOutbox').rows[0]
  .indexOf('recipientEmail') + 1;
assert.equal(
  spreadsheet.getSheetByName('EmailOutbox')
    .getRange(firstEmailOutboxRow.rowNumber, outboxRecipientColumn, 1, 1).getFormulas()[0][0],
  '',
);
context.__templateClaim = {
  templateVersion: 'rsvp_confirmation_v1',
  recipientEmail: 'snapshot@example.nl',
  receiptNumber: 'RSVP-ABC123',
};
assert.deepEqual(hostValue(run('renderConfirmationEmail_(__templateClaim)')), {
  from: 'Lisette & Bjarty <rsvp@lisetteenbjarty.nl>',
  to: ['snapshot@example.nl'],
  subject: 'Je RSVP is opgeslagen',
  html: '<p>Hallo,</p><p>Je RSVP voor de bruiloft van Lisette &amp; Bjarty is opgeslagen.</p><p><strong>Bevestigingsnummer:</strong> RSVP-ABC123</p><p>Je kunt je reactie tot en met 10 april 2027 aanpassen via <a href="https://lisetteenbjarty.nl/#rsvp">https://lisetteenbjarty.nl/#rsvp</a>. Gebruik daarvoor dezelfde persoonlijke huishoudcode of uitnodigingslink als op de uitnodiging. Het bevestigingsnummer is geen toegangscode.</p><p>Hartelijke groet,<br>Lisette &amp; Bjarty</p>',
  text: 'Hallo,\n\nJe RSVP voor de bruiloft van Lisette & Bjarty is opgeslagen.\n\nBevestigingsnummer: RSVP-ABC123\n\nJe kunt je reactie tot en met 10 april 2027 aanpassen via https://lisetteenbjarty.nl/#rsvp\nGebruik daarvoor dezelfde persoonlijke huishoudcode of uitnodigingslink als op de uitnodiging.\nHet bevestigingsnummer is geen toegangscode.\n\nHartelijke groet,\nLisette & Bjarty',
  reply_to: 'rsvp@lisetteenbjarty.nl',
});
context.__templateClaim.templateVersion = 'unknown';
assert.throws(() => run('renderConfirmationEmail_(__templateClaim)'), /unsupported/);

// An exact API retry returns the same durable result and never sends again.
assert.deepEqual(post(makeEnvelope('submit', firstEmailData)).data, firstEmailSubmit.data);
assert.equal(urlFetch.requests.length, 1);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', firstEmailKey).length, 1);

tickTestClock();
const updateEmailKey = randomUUID();
const updateEmailData = makeEmailSubmit(1, 'nieuw-adres@example.nl', updateEmailKey);
queueUrlFetchResponse(200, { id: randomUUID() });
const updateEmailSubmit = post(makeEnvelope('submit', updateEmailData));
assert.equal(updateEmailSubmit.data.revision, 2);
assert.equal(updateEmailSubmit.data.receiptNumber, firstEmailSubmit.data.receiptNumber);
assert.equal(urlFetch.requests.length, 2);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', updateEmailKey)[0].values.status, 'sent');

// Removing the optional address creates no outbox item and sends nothing.
tickTestClock();
const removedEmailKey = randomUUID();
const removedEmailSubmit = post(makeEnvelope('submit', makeEmailSubmit(2, '', removedEmailKey)));
assert.equal(removedEmailSubmit.data.revision, 3);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', removedEmailKey).length, 0);
assert.equal(urlFetch.requests.length, 2);

// A submit older than the explicit activation boundary is never backfilled.
properties.set(
  'CONFIRMATION_EMAIL_ACTIVATED_AT',
  new FixedDate(testNowMilliseconds + 10000).toISOString(),
);
const historicEmailKey = randomUUID();
const historicSubmit = post(makeEnvelope('submit', makeEmailSubmit(3, 'historisch@example.nl', historicEmailKey)));
assert.equal(historicSubmit.data.revision, 4);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', historicEmailKey).length, 0);
testNowMilliseconds += 11000;

// Unauthenticated Idempotency timestamps cannot move an older authenticated
// savedAt across the activation boundary.
const historicIntentRow = rowsMatching('Idempotency', 'idempotencyKey', historicEmailKey)[0];
const idempotencyTimestampColumns = ['requestTimestamp', 'createdAt', 'updatedAt']
  .map((header) => idempotencyHeader.indexOf(header) + 1);
const historicTimestampValues = idempotencyTimestampColumns
  .map((column) => macSheet.getCell(historicIntentRow.rowNumber, column));
const forgedAfterActivation = new FixedDate().toISOString();
for (const column of idempotencyTimestampColumns) {
  macSheet.setCell(historicIntentRow.rowNumber, column, forgedAfterActivation);
}
const requestsBeforeTimestampTamper = urlFetch.requests.length;
run('processConfirmationEmailOutbox()');
assert.equal(urlFetch.requests.length, requestsBeforeTimestampTamper);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', historicEmailKey).length, 0);
idempotencyTimestampColumns.forEach((column, index) => {
  macSheet.setCell(historicIntentRow.rowNumber, column, historicTimestampValues[index]);
});

// Missing provider credentials affect only the mail attempt. The RSVP stays
// successful and the durable outbox can be retried after configuration.
const missingConfigKey = randomUUID();
const requestsBeforeMissingConfig = urlFetch.requests.length;
properties.delete('RESEND_API_KEY');
const missingConfigSubmit = post(makeEnvelope(
  'submit',
  makeEmailSubmit(4, 'config@example.nl', missingConfigKey),
));
assert.equal(missingConfigSubmit.ok, true);
assert.equal(missingConfigSubmit.data.revision, 5);
assert.equal(urlFetch.requests.length, requestsBeforeMissingConfig);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', missingConfigKey)[0].values.status, 'queued');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', missingConfigKey)[0].values.firstAttemptAt, '');
properties.set('RESEND_API_KEY', 're_test_key_that_is_long_enough_123456');
const beforeQueuedAgeTest = testNowMilliseconds;
testNowMilliseconds = Date.parse(
  rowsMatching('EmailOutbox', 'idempotencyKey', missingConfigKey)[0].values.createdAt,
) + (24 * 60 * 60 * 1000) + 1;
queueUrlFetchResponse(200, { id: randomUUID() });
assert.equal(hostValue(run('processConfirmationEmailOutbox()')).sent, 1);
testNowMilliseconds = beforeQueuedAgeTest + 61000;

// If enqueue itself fails after the RSVP completion commit, the API remains
// successful and the public processor reconciles the missing row later.
const reconciliationKey = randomUUID();
const outboxSheet = spreadsheet.getSheetByName('EmailOutbox');
failBeforeRangeWrite('EmailOutbox', outboxSheet.getLastRow() + 1, 1);
const reconciliationSubmit = post(makeEnvelope(
  'submit',
  makeEmailSubmit(5, 'reconcile@example.nl', reconciliationKey),
));
assert.equal(reconciliationSubmit.ok, true);
assert.equal(reconciliationSubmit.data.revision, 6);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', reconciliationKey).length, 0);
queueUrlFetchResponse(200, { id: randomUUID() });
const reconciliationRun = hostValue(run('processConfirmationEmailOutbox()'));
assert.equal(reconciliationRun.sent, 1);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', reconciliationKey)[0].values.status, 'sent');

// Retryable provider failures are recorded without failing the RSVP and are
// retried with the same opaque provider idempotency key after backoff.
tickTestClock();
const retryEmailKey = randomUUID();
urlFetch.responses.push(new Error('Injected provider network failure'));
const retryEmailSubmit = post(makeEnvelope('submit', makeEmailSubmit(6, 'retry@example.nl', retryEmailKey)));
assert.equal(retryEmailSubmit.ok, true);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', retryEmailKey)[0].values.status, 'retry');
const retryProviderKey = urlFetch.requests.at(-1).options.headers['Idempotency-Key'];
testNowMilliseconds += 61000;
queueUrlFetchResponse(200, { id: randomUUID() });
resetSheetReadMetrics();
const retryRun = hostValue(run('processConfirmationEmailOutbox()'));
assert.equal(retryRun.sent, 1);
assert.equal(sheetReadMetrics.bulkGetValues.get('Idempotency'), 2);
assert.equal(sheetReadMetrics.bulkGetValues.get('Responses'), 2);
assert.equal(sheetReadMetrics.bulkGetValues.get('EmailOutbox'), 2);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', retryEmailKey)[0].values.status, 'sent');
assert.equal(urlFetch.requests.at(-1).options.headers['Idempotency-Key'], retryProviderKey);

// Resend's concurrent-idempotency conflict is retryable with the exact same
// provider key once the concurrent request has settled.
const concurrentConflictEmailKey = randomUUID();
queueUrlFetchResponse(409, { name: 'concurrent_idempotent_requests' });
assert.equal(post(makeEnvelope(
  'submit',
  makeEmailSubmit(7, 'provider-concurrent@example.nl', concurrentConflictEmailKey),
)).ok, true);
assert.equal(
  rowsMatching('EmailOutbox', 'idempotencyKey', concurrentConflictEmailKey)[0].values.status,
  'retry',
);
const concurrentConflictProviderKey = urlFetch.requests.at(-1)
  .options.headers['Idempotency-Key'];
testNowMilliseconds += 61000;
queueUrlFetchResponse(200, { id: randomUUID() });
assert.equal(hostValue(run('processConfirmationEmailOutbox()')).sent, 1);
assert.equal(
  urlFetch.requests.at(-1).options.headers['Idempotency-Key'],
  concurrentConflictProviderKey,
);

// Resend reports a payload mismatch for an idempotency key as permanent. It
// must enter manual review and never be offered to the provider again.
const invalidConflictEmailKey = randomUUID();
queueUrlFetchResponse(409, { name: 'invalid_idempotent_request' });
assert.equal(post(makeEnvelope(
  'submit',
  makeEmailSubmit(8, 'provider-invalid@example.nl', invalidConflictEmailKey),
)).ok, true);
const invalidConflictRow = rowsMatching(
  'EmailOutbox',
  'idempotencyKey',
  invalidConflictEmailKey,
)[0];
assert.equal(invalidConflictRow.values.status, 'manual_review');
assert.equal(invalidConflictRow.values.lastErrorCode, 'provider_idempotency_conflict');
const requestsAfterInvalidConflict = urlFetch.requests.length;
testNowMilliseconds += 61000;
assert.deepEqual(hostValue(run('processConfirmationEmailOutbox()')), {
  processed: 0,
  sent: 0,
  retry: 0,
  manualReview: 0,
});
assert.equal(urlFetch.requests.length, requestsAfterInvalidConflict);

// A durable sending claim prevents concurrent delivery. If its worker dies,
// it is safely reclaimed after the lease with the same provider key.
const concurrencyEmailKey = randomUUID();
queueUrlFetchResponse(429, { name: 'rate_limit_exceeded' });
assert.equal(post(makeEnvelope(
  'submit',
  makeEmailSubmit(9, 'concurrent@example.nl', concurrencyEmailKey),
)).ok, true);
testNowMilliseconds += 61000;
context.__deliveryId = rowsMatching('EmailOutbox', 'idempotencyKey', concurrencyEmailKey)[0]
  .values.deliveryId;
const abandonedClaim = hostValue(run('claimConfirmationEmail_(__deliveryId)'));
assert.equal(abandonedClaim.status, 'sending');
assert.equal(run('claimConfirmationEmail_(__deliveryId)'), null);
testNowMilliseconds += 61000;
queueUrlFetchResponse(200, { id: randomUUID() });
assert.equal(hostValue(run('processConfirmationEmailOutbox()')).sent, 1);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', concurrencyEmailKey)[0].values.status, 'sent');

// Invalid idempotency semantics are never blindly retried.
const permanentEmailKey = randomUUID();
queueUrlFetchResponse(200, { unexpected: 'malformed-success-body' });
assert.equal(post(makeEnvelope(
  'submit',
  makeEmailSubmit(10, 'manual@example.nl', permanentEmailKey),
)).ok, true);
assert.equal(
  rowsMatching('EmailOutbox', 'idempotencyKey', permanentEmailKey)[0].values.status,
  'manual_review',
);

// Any outbox tampering fails closed before a provider request. Restoring the
// authenticated value lets the retry proceed normally.
const tamperEmailKey = randomUUID();
queueUrlFetchResponse(500, { name: 'internal_server_error' });
assert.equal(post(makeEnvelope(
  'submit',
  makeEmailSubmit(11, 'tamper@example.nl', tamperEmailKey),
)).ok, true);
testNowMilliseconds += 61000;
const tamperRow = rowsMatching('EmailOutbox', 'idempotencyKey', tamperEmailKey)[0];
const recipientColumn = outboxSheet.rows[0].indexOf('recipientEmail') + 1;
outboxSheet.setCell(tamperRow.rowNumber, recipientColumn, 'aanvaller@example.nl');
const requestsBeforeTamper = urlFetch.requests.length;
assert.throws(() => run('processConfirmationEmailOutbox()'), /MAC|binding/);
assert.equal(urlFetch.requests.length, requestsBeforeTamper);
outboxSheet.setCell(tamperRow.rowNumber, recipientColumn, 'tamper@example.nl');
queueUrlFetchResponse(200, { id: randomUUID() });
assert.equal(hostValue(run('processConfirmationEmailOutbox()')).sent, 1);

// An unresolved ambiguous delivery is never resent after Resend's 24-hour
// idempotency window; operators must inspect it manually.
const ambiguityEmailKey = randomUUID();
queueUrlFetchResponse(500, { name: 'internal_server_error' });
assert.equal(post(makeEnvelope(
  'submit',
  makeEmailSubmit(12, 'ambiguity@example.nl', ambiguityEmailKey),
)).ok, true);
const ambiguityRow = rowsMatching('EmailOutbox', 'idempotencyKey', ambiguityEmailKey)[0];
const beforeAmbiguityCutoff = testNowMilliseconds;
testNowMilliseconds = Date.parse(ambiguityRow.values.firstAttemptAt) + (24 * 60 * 60 * 1000) + 1;
const requestsBeforeCutoff = urlFetch.requests.length;
const ambiguitySummary = hostValue(run('processConfirmationEmailOutbox()'));
assert.equal(urlFetch.requests.length, requestsBeforeCutoff);
assert.equal(ambiguitySummary.manualReview, 1);
assert.equal(
  rowsMatching('EmailOutbox', 'idempotencyKey', ambiguityEmailKey)[0].values.status,
  'manual_review',
);
testNowMilliseconds = beforeAmbiguityCutoff;

// A newer revision supersedes retryable mail for the same household, including
// when the address is removed. Another household's queued mail is untouched.
const supersedeAccessCodeHash = createHmac('sha256', 'separate-access-code-secret-with-32-chars')
  .update('SUPERSEDE-TEST-CODE')
  .digest('base64url');
const unrelatedAccessCodeHash = createHmac('sha256', 'separate-access-code-secret-with-32-chars')
  .update('UNRELATED-MAIL-CODE')
  .digest('base64url');
invitationSheet.getRange(5, 1, 2, invitationHeaders.length).setValues([
  ['household_supersede', '', supersedeAccessCodeHash, 'Supersede', 'evening', false,
    1, true, 0, new FixedDate(), new FixedDate()],
  ['household_unrelated', '', unrelatedAccessCodeHash, 'Unrelated', 'evening', false,
    1, true, 0, new FixedDate(), new FixedDate()],
]);
spreadsheet.getSheetByName('GuestDetails').getRange(6, 1, 2, 7).setValues([
  ['household_supersede', 'guest_supersede', 'Supersede gast', '', '', 0, ''],
  ['household_unrelated', 'guest_unrelated', 'Unrelated gast', '', '', 0, ''],
]);
const makeSingleGuestEmailSubmit = (hash, guestId, revision, email, key = randomUUID()) => ({
  accessCodeHash: hash,
  idempotencyKey: key,
  revision,
  attending: true,
  guests: [{ guestId, attending: true }],
  ...(email ? { email } : {}),
});

properties.delete('RESEND_API_KEY');
const unrelatedKey = randomUUID();
assert.equal(post(makeEnvelope('submit', makeSingleGuestEmailSubmit(
  unrelatedAccessCodeHash, 'guest_unrelated', 0, 'unrelated@example.nl', unrelatedKey,
))).ok, true);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0].values.status, 'queued');
properties.set('RESEND_API_KEY', 're_test_key_that_is_long_enough_123456');

const supersededWrongKey = randomUUID();
queueUrlFetchResponse(500, { name: 'internal_server_error' });
assert.equal(post(makeEnvelope('submit', makeSingleGuestEmailSubmit(
  supersedeAccessCodeHash, 'guest_supersede', 0, 'fout@example.nl', supersededWrongKey,
))).ok, true);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededWrongKey)[0].values.status, 'retry');

const supersededNewKey = randomUUID();
queueUrlFetchResponse(500, { name: 'internal_server_error' });
assert.equal(post(makeEnvelope('submit', makeSingleGuestEmailSubmit(
  supersedeAccessCodeHash, 'guest_supersede', 1, 'nieuw@example.nl', supersededNewKey,
))).ok, true);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededWrongKey)[0].values.status, 'manual_review');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededWrongKey)[0].values.lastErrorCode, 'superseded');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededNewKey)[0].values.status, 'retry');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0].values.status, 'queued');

const removeSupersedeKey = randomUUID();
const requestsBeforeEmailRemoval = urlFetch.requests.length;
assert.equal(post(makeEnvelope('submit', makeSingleGuestEmailSubmit(
  supersedeAccessCodeHash, 'guest_supersede', 2, '', removeSupersedeKey,
))).ok, true);
assert.equal(urlFetch.requests.length, requestsBeforeEmailRemoval);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededNewKey)[0].values.status, 'manual_review');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededNewKey)[0].values.lastErrorCode, 'superseded');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', removeSupersedeKey).length, 0);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0].values.status, 'queued');

// Reconciliation consults only the current completed revision: removing old
// outbox rows cannot resurrect mail for superseded addresses.
const removedSupersededRows = [supersededWrongKey, supersededNewKey]
  .map((key) => rowsMatching('EmailOutbox', 'idempotencyKey', key)[0].rowNumber)
  .sort((left, right) => right - left);
for (const rowNumber of removedSupersededRows) outboxSheet.rows.splice(rowNumber - 1, 1);
run('reconcileConfirmationEmailOutbox_()');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededWrongKey).length, 0);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', supersededNewKey).length, 0);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0].values.status, 'queued');

// A currently active sending claim is not mutated during an address update,
// but once its lease expires reconciliation supersedes it instead of sending
// the stale address again.
const abandonedAccessCodeHash = createHmac('sha256', 'separate-access-code-secret-with-32-chars')
  .update('ABANDONED-SENDING-CODE')
  .digest('base64url');
invitationSheet.getRange(7, 1, 1, invitationHeaders.length).setValues([[
  'household_abandoned', '', abandonedAccessCodeHash, 'Abandoned', 'evening', false,
  1, true, 0, new FixedDate(), new FixedDate(),
]]);
spreadsheet.getSheetByName('GuestDetails').getRange(8, 1, 1, 7).setValues([[
  'household_abandoned', 'guest_abandoned', 'Abandoned gast', '', '', 0, '',
]]);
const abandonedOldKey = randomUUID();
queueUrlFetchResponse(500, { name: 'internal_server_error' });
assert.equal(post(makeEnvelope('submit', makeSingleGuestEmailSubmit(
  abandonedAccessCodeHash, 'guest_abandoned', 0, 'oud@example.nl', abandonedOldKey,
))).ok, true);
testNowMilliseconds += 61000;
context.__abandonedDeliveryId = rowsMatching('EmailOutbox', 'idempotencyKey', abandonedOldKey)[0]
  .values.deliveryId;
assert.equal(hostValue(run('claimConfirmationEmail_(__abandonedDeliveryId)')).status, 'sending');

const abandonedNewKey = randomUUID();
queueUrlFetchResponse(500, { name: 'internal_server_error' });
assert.equal(post(makeEnvelope('submit', makeSingleGuestEmailSubmit(
  abandonedAccessCodeHash, 'guest_abandoned', 1, 'actueel@example.nl', abandonedNewKey,
))).ok, true);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', abandonedOldKey)[0].values.status, 'sending');
const requestsBeforeAbandonedReconcile = urlFetch.requests.length;
testNowMilliseconds += 61000;
run('reconcileConfirmationEmailOutbox_()');
assert.equal(urlFetch.requests.length, requestsBeforeAbandonedReconcile);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', abandonedOldKey)[0].values.status, 'manual_review');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', abandonedOldKey)[0].values.lastErrorCode, 'superseded');
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', abandonedNewKey)[0].values.status, 'retry');

// Ambiguous Sheet flushes at claim and finalize boundaries remain recoverable:
// no provider call occurs before a durable claim, and a sent state written
// before an ambiguous finalize flush prevents a duplicate call.
context.__unrelatedDeliveryId = rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0]
  .values.deliveryId;
const requestsBeforeClaimFault = urlFetch.requests.length;
failAtFlush(1);
assert.throws(() => run('processOneConfirmationEmail_(__unrelatedDeliveryId)'), /Injected flush failure/);
assert.equal(urlFetch.requests.length, requestsBeforeClaimFault);
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0].values.status, 'sending');
resetFaults();
testNowMilliseconds += 61000;
queueUrlFetchResponse(200, { id: randomUUID() });
failAtFlush(2);
assert.throws(() => run('processOneConfirmationEmail_(__unrelatedDeliveryId)'), /Injected flush failure/);
assert.equal(urlFetch.requests.length, requestsBeforeClaimFault + 1);
resetFaults();
assert.equal(rowsMatching('EmailOutbox', 'idempotencyKey', unrelatedKey)[0].values.status, 'sent');
assert.equal(run('processOneConfirmationEmail_(__unrelatedDeliveryId)'), null);
assert.equal(urlFetch.requests.length, requestsBeforeClaimFault + 1);

properties.set('CONFIRMATION_EMAIL_ENABLED', 'false');

// A maliciously re-opened old intent must not roll the committed pointer back.
const oldCompleted = rowsMatching('Idempotency', 'idempotencyKey', idempotencyKey)[0];
macSheet.setCell(oldCompleted.rowNumber, statusColumn, 'pending');
const newestRevision = invitationRevision();
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
assert.equal(invitationRevision(), newestRevision);
macSheet.setCell(oldCompleted.rowNumber, statusColumn, 'completed');

const invalidSignature = makeEnvelope('resolve', { tokenHash });
invalidSignature.signature = `${invalidSignature.signature.slice(0, -1)}${invalidSignature.signature.endsWith('A') ? 'B' : 'A'}`;
assert.equal(post(invalidSignature).error.code, 'WRITER_BUSY');
const expired = makeEnvelope('resolve', { tokenHash }, {
  timestamp: Math.floor(testNowMilliseconds / 1000) - 301,
});
assert.equal(post(expired).error.code, 'RATE_LIMITED');
const mismatchedRequest = makeEnvelope('resolve', { tokenHash }, { payloadRequestId: randomUUID() });
assert.equal(post(mismatchedRequest).error.code, 'WRITER_BUSY');

context.__formula = '  =SUM(1,1)';
assert.equal(run('escapeForSheet_(__formula)'), "'  =SUM(1,1)");
context.__literal = 'gewone tekst';
assert.equal(run('escapeForSheet_(__literal)'), 'gewone tekst');

const preview = hostValue(run('previewRsvpSheetClear()'));
assert.equal(preview.environment, 'production');
assert.equal(preview.eligibleNow, false);
assert.equal(preview.permanentDeleteBy, '2027-08-01T00:00:00+02:00');
const rowsBeforeRejectedClear = Object.fromEntries(
  [...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()]),
);
properties.set('RSVP_SHEET_CLEAR_CONFIRMATION', preview.confirmationValue);
assert.throws(() => run('clearRsvpSheetDataWithConfirmation()'), /blocked until/);
assert.deepEqual(
  Object.fromEntries([...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()])),
  rowsBeforeRejectedClear,
);
properties.set('ENVIRONMENT', 'test');
assert.throws(() => run('previewRsvpSheetClear()'), /ENVIRONMENT must be production/);
properties.set('ENVIRONMENT', 'production');
properties.set('CONFIRMATION_EMAIL_ENABLED', 'true');
assert.throws(
  () => run('clearRsvpSheetDataWithConfirmation()'),
  /Disable confirmation email/,
);
assert.deepEqual(
  Object.fromEntries([...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()])),
  rowsBeforeRejectedClear,
);
properties.set('CONFIRMATION_EMAIL_ENABLED', 'false');
context.__clearRaceDeliveryId = rowsMatching('EmailOutbox', 'idempotencyKey', abandonedNewKey)[0]
  .values.deliveryId;
properties.set('CONFIRMATION_EMAIL_ENABLED', 'true');
testNowMilliseconds += 61000;
assert.equal(hostValue(run('claimConfirmationEmail_(__clearRaceDeliveryId)')).status, 'sending');
properties.set('CONFIRMATION_EMAIL_ENABLED', 'false');
assert.throws(
  () => run('clearRsvpSheetDataWithConfirmation()'),
  /still in flight/,
);
assert.deepEqual(
  Object.fromEntries([...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()])),
  rowsBeforeRejectedClear,
);
properties.set('CONFIRMATION_EMAIL_ENABLED', 'true');
testNowMilliseconds += 61000;
queueUrlFetchResponse(200, { id: randomUUID() });
assert.equal(hostValue(run('processOneConfirmationEmail_(__clearRaceDeliveryId)')).status, 'sent');
properties.set('CONFIRMATION_EMAIL_ENABLED', 'false');
testNowMilliseconds = Date.parse('2027-05-22T22:00:00.000Z');
const eligiblePreview = hostValue(run('previewRsvpSheetClear()'));
assert.equal(eligiblePreview.environment, 'production');
assert.equal(eligiblePreview.eligibleNow, true);
properties.set('RSVP_SHEET_CLEAR_CONFIRMATION', 'WRONG');
assert.throws(() => run('clearRsvpSheetDataWithConfirmation()'), /does not match/);
assert.deepEqual(
  Object.fromEntries([...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()])),
  rowsBeforeRejectedClear,
);
properties.set('RSVP_SHEET_CLEAR_CONFIRMATION', eligiblePreview.confirmationValue);
const sheetClear = hostValue(run('clearRsvpSheetDataWithConfirmation()'));
assert.equal(sheetClear.headersPreserved, true);
assert.equal(sheetClear.permanentDeletionCompleted, false);
for (const sheet of spreadsheet.sheets.values()) assert.equal(sheet.getLastRow(), 1);
assert.equal(properties.has('RSVP_SHEET_CLEAR_CONFIRMATION'), false);
assert.equal(typeof properties.get('LAST_RSVP_SHEET_CLEAR_AT'), 'string');

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('./appsscript.json', import.meta.url)), 'utf8'));
assert.equal(manifest.oauthScopes.some((scope) => /gmail|mail\.google/u.test(scope)), false);
assert.equal(
  manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.external_request'),
  true,
);
assert.equal(writerLogMessages.every((message) => [
  'RSVP writer failed with an internal error.',
  'RSVP confirmation email enqueue failed.',
  'RSVP confirmation email processing failed.',
].includes(message)), true);
assert.equal(writerLogMessages.join('\n').includes('gast.mail@example.nl'), false);
assert.equal(writerLogMessages.join('\n').includes(firstEmailSubmit.data.receiptNumber), false);

console.log('Apps Script writer tests passed.');
