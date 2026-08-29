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
};

const resetFaults = () => {
  faults.flushCount = 0;
  faults.failAtFlush = null;
  faults.rangeWrite = null;
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
  ['ENVIRONMENT', 'test'],
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
  'householdId', 'tokenHash', 'displayName', 'maxGuests', 'active',
  'currentRevision', 'createdAt', 'updatedAt',
];
const guestHeaders = [
  'householdId', 'guestId', 'displayName', 'attending', 'mealChoice',
  'revision', 'updatedAt',
];
assert.deepEqual(spreadsheet.getSheetByName('Invitations').rows[0], invitationHeaders);
assert.deepEqual(spreadsheet.getSheetByName('GuestDetails').rows[0], guestHeaders);

const tokenHash = createHmac('sha256', 'separate-token-hash-secret-with-32-chars')
  .update('raw-token-that-never-reaches-the-writer')
  .digest('base64url');
assert.equal(tokenHash.length, 43);

spreadsheet.getSheetByName('Invitations').getRange(2, 1, 1, 8).setValues([[
  'household_1', tokenHash, 'Familie Voorbeeld', 2, true, 0,
  '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z',
]]);
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

const invitationSheet = spreadsheet.getSheetByName('Invitations');
const validProvisioningTimestamp = invitationSheet.getCell(2, 8);
invitationSheet.setCell(2, 8, '');
assert.equal(post(makeEnvelope('resolve', { tokenHash })).error.code, 'WRITER_BUSY');
assert.equal(spreadsheet.getSheetByName('Idempotency').getLastRow(), 1);
invitationSheet.setCell(2, 8, validProvisioningTimestamp);

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
const firstSubmit = post(makeEnvelope('submit', submitData));
assert.equal(firstSubmit.ok, true);
assert.equal(firstSubmit.data.revision, 1);
assert.match(firstSubmit.data.receiptNumber, /^RSVP-[A-Z0-9]{6,20}$/);
assert.equal(firstSubmit.data.idempotencyKey, idempotencyKey);

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

const rowsAsObjects = (sheetName) => {
  const sheet = spreadsheet.getSheetByName(sheetName);
  const [headers, ...rows] = sheet.rows;
  return rows
    .filter((row) => row.some((value) => value !== '' && value !== undefined && value !== null))
    .map((row, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ''])),
    }));
};
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
invitationsSheet.setCell(2, 5, false);
properties.set('RSVP_CLOSE_AT', '2000-01-01T00:00:00+01:00');
resetFaults();
expectSingleDurableResult(closedRecoveryData, closedRecoveryIntent.result);
invitationsSheet.setCell(2, 5, true);
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
properties.set('ENVIRONMENT', 'production');
testNowMilliseconds = Date.parse('2027-07-31T22:00:00.000Z');
resetFaults();
assert.equal(post(makeEnvelope('submit', retentionBoundaryData)).error.code, 'RSVP_CLOSED');
assert.equal(invitationRevision(), beforeRetentionBoundaryRevision);
assert.throws(() => run('recoverAllPendingIntents()'), /RSVP_CLOSED/);
assert.equal(invitationRevision(), beforeRetentionBoundaryRevision);
properties.set('ENVIRONMENT', 'test');
testNowMilliseconds = preBoundaryTestNow;
expectSingleDurableResult(retentionBoundaryData, retentionBoundaryIntent.result);
durableRevision += 1;

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
assert.equal(preview.environment, 'test');
assert.equal(preview.eligibleNow, true);
assert.equal(preview.permanentDeleteBy, '2027-08-01T00:00:00+02:00');
const rowsBeforeRejectedClear = Object.fromEntries(
  [...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()]),
);
properties.set('RSVP_SHEET_CLEAR_CONFIRMATION', 'WRONG');
assert.throws(() => run('clearRsvpSheetDataWithConfirmation()'), /does not match/);
assert.deepEqual(
  Object.fromEntries([...spreadsheet.sheets.entries()].map(([name, sheet]) => [name, sheet.getLastRow()])),
  rowsBeforeRejectedClear,
);
properties.set('RSVP_SHEET_CLEAR_CONFIRMATION', preview.confirmationValue);
const sheetClear = hostValue(run('clearRsvpSheetDataWithConfirmation()'));
assert.equal(sheetClear.headersPreserved, true);
assert.equal(sheetClear.permanentDeletionCompleted, false);
for (const sheet of spreadsheet.sheets.values()) assert.equal(sheet.getLastRow(), 1);
assert.equal(properties.has('RSVP_SHEET_CLEAR_CONFIRMATION'), false);
assert.equal(typeof properties.get('LAST_RSVP_SHEET_CLEAR_AT'), 'string');

properties.set('ENVIRONMENT', 'production');
const productionPreview = hostValue(run('previewRsvpSheetClear()'));
assert.equal(productionPreview.eligibleNow, false);
properties.set('RSVP_SHEET_CLEAR_CONFIRMATION', productionPreview.confirmationValue);
assert.throws(() => run('clearRsvpSheetDataWithConfirmation()'), /blocked until/);

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('./appsscript.json', import.meta.url)), 'utf8'));
assert.equal(manifest.oauthScopes.some((scope) => /gmail|mail\.google/u.test(scope)), false);
assert.equal(writerLogMessages.every((message) => message === 'RSVP writer failed with an internal error.'), true);

console.log('Apps Script writer tests passed.');
