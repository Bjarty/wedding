import { createHmac, randomInt } from 'node:crypto';
import { open, realpath, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ACCESS_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ACCESS_CODE_LENGTH = 20;
export const PUBLIC_DEMO_ACCESS_CODE = '7K3MP9TWX4HCQ2RDV6FN';
export const SHARED_RSVP_URL = 'https://lisetteenbjarty.nl/#rsvp';

const ACCESS_CODE_HASH_DOMAIN = 'rsvp-access-code-v1\0';
const HOUSEHOLD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ACCESS_CODE_PATTERN = new RegExp(`^[${ACCESS_CODE_ALPHABET}]{${ACCESS_CODE_LENGTH}}$`);
const SECRET_PATTERN = /^[A-Za-z0-9_-]{64}$/;
const UNSAFE_CONTROL_PATTERN = /[\u0000-\u001F\u007F]/u;
const SPREADSHEET_FORMULA_PREFIX = /^[=+\-@]/u;
const scriptDirectory = fileURLToPath(new URL('.', import.meta.url));
const repositoryDirectory = resolve(scriptDirectory, '..', '..', '..');

const normalizeText = (value) => value.normalize('NFC').trim();

export const normalizeAccessCode = (value) =>
  typeof value === 'string' ? normalizeText(value).toUpperCase().replace(/[ -]/g, '') : '';

export const formatAccessCode = (value) => {
  const normalized = normalizeAccessCode(value);
  if (!ACCESS_CODE_PATTERN.test(normalized)) throw new Error('access code has an invalid format');
  return normalized.match(/.{5}/g).join('-');
};

export const hashAccessCode = (accessCode, secret) => {
  const normalized = normalizeAccessCode(accessCode);
  if (!ACCESS_CODE_PATTERN.test(normalized)) throw new Error('access code has an invalid format');
  if (normalized === PUBLIC_DEMO_ACCESS_CODE) {
    throw new Error('the public demo access code must never be provisioned');
  }
  if (typeof secret !== 'string' || !SECRET_PATTERN.test(secret) || new Set(secret).size < 16) {
    throw new Error('ACCESS_CODE_HASH_SECRET must be 48 random bytes encoded as 64 base64url characters');
  }
  return createHmac('sha256', secret)
    .update(`${ACCESS_CODE_HASH_DOMAIN}${normalized}`, 'utf8')
    .digest('base64url');
};

export const generateAccessCode = (randomIndex = (maximum) => randomInt(maximum)) => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < ACCESS_CODE_LENGTH; index += 1) {
      const selected = randomIndex(ACCESS_CODE_ALPHABET.length);
      if (!Number.isSafeInteger(selected) || selected < 0 || selected >= ACCESS_CODE_ALPHABET.length) {
        throw new Error('random source returned an out-of-range index');
      }
      code += ACCESS_CODE_ALPHABET[selected];
    }
    if (code !== PUBLIC_DEMO_ACCESS_CODE) return code;
  }
  throw new Error('could not generate a non-demo access code');
};

const validateMetadata = ({ householdId, displayName, invitationVariant, maxGuests }) => {
  if (typeof householdId !== 'string' || !HOUSEHOLD_ID_PATTERN.test(householdId)) {
    throw new Error('householdId must contain 1-64 letters, digits, underscores, or hyphens');
  }
  if (typeof displayName !== 'string') throw new Error('displayName is required');
  const normalizedDisplayName = normalizeText(displayName);
  if (
    normalizedDisplayName.length < 1 ||
    normalizedDisplayName.length > 160 ||
    UNSAFE_CONTROL_PATTERN.test(normalizedDisplayName) ||
    SPREADSHEET_FORMULA_PREFIX.test(normalizedDisplayName)
  ) {
    throw new Error('displayName must contain 1-160 safe characters');
  }
  if (invitationVariant !== 'day' && invitationVariant !== 'evening') {
    throw new Error('invitationVariant must be day or evening');
  }
  if (!Number.isSafeInteger(maxGuests) || maxGuests < 1 || maxGuests > 20) {
    throw new Error('maxGuests must be an integer from 1 through 20');
  }
  return { householdId, displayName: normalizedDisplayName, invitationVariant, maxGuests };
};

export const createHouseholdProvisioning = ({
  householdId,
  displayName,
  invitationVariant,
  maxGuests,
  secret,
  accessCode = generateAccessCode(),
  now = () => new Date(),
}) => {
  const metadata = validateMetadata({ householdId, displayName, invitationVariant, maxGuests });
  const normalizedAccessCode = normalizeAccessCode(accessCode);
  const accessCodeHash = hashAccessCode(normalizedAccessCode, secret);
  const createdAt = now().toISOString();
  const mealChoiceRequired = invitationVariant === 'day';

  return {
    sheetRecord: {
      schemaVersion: 2,
      householdId: metadata.householdId,
      tokenHash: '',
      accessCodeHash,
      displayName: metadata.displayName,
      invitationVariant: metadata.invitationVariant,
      mealChoiceRequired,
      maxGuests: metadata.maxGuests,
      active: true,
      currentRevision: 0,
      createdAt,
      updatedAt: createdAt,
    },
    deliveryRecord: {
      householdId: metadata.householdId,
      displayName: metadata.displayName,
      invitationVariant: metadata.invitationVariant,
      sharedRsvpUrl: SHARED_RSVP_URL,
      accessCode: formatAccessCode(normalizedAccessCode),
    },
  };
};

const isInside = (parent, candidate) => {
  const fromParent = relative(parent, candidate);
  return fromParent === '' || (!fromParent.startsWith('..') && !isAbsolute(fromParent));
};

const validateOutputPath = async (filePath, repositoryRealPath) => {
  if (typeof filePath !== 'string' || !isAbsolute(filePath)) {
    throw new Error('output paths must be absolute');
  }
  const parentRealPath = await realpath(dirname(filePath));
  const targetPath = resolve(parentRealPath, basename(filePath));
  if (isInside(repositoryRealPath, targetPath)) {
    throw new Error('output files must be outside the repository');
  }
  return targetPath;
};

const writeExclusive = async (filePath, value) => {
  const handle = await open(filePath, 'wx', 0o600);
  let completed = false;
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    completed = true;
  } finally {
    await handle.close();
    if (!completed) await unlink(filePath).catch(() => undefined);
  }
};

export const writeProvisioningFiles = async ({ sheetOut, deliveryOut, provisioning }) => {
  const repositoryRealPath = await realpath(repositoryDirectory);
  const sheetPath = await validateOutputPath(sheetOut, repositoryRealPath);
  const deliveryPath = await validateOutputPath(deliveryOut, repositoryRealPath);
  if (sheetPath === deliveryPath) throw new Error('sheet and delivery output paths must be different');

  let sheetCreated = false;
  try {
    await writeExclusive(sheetPath, provisioning.sheetRecord);
    sheetCreated = true;
    await writeExclusive(deliveryPath, provisioning.deliveryRecord);
  } catch (error) {
    if (sheetCreated) await unlink(sheetPath).catch(() => undefined);
    throw error;
  }
  return { sheetPath, deliveryPath };
};

const parseArguments = (args) => {
  const allowed = new Set([
    'household-id',
    'display-name',
    'invitation-variant',
    'max-guests',
    'sheet-out',
    'delivery-out',
  ]);
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/u, '');
    const value = args[index + 1];
    if (!key || !allowed.has(key) || value === undefined) {
      throw new Error('all supported arguments must be supplied exactly once as --name value');
    }
    if (Object.hasOwn(values, key)) throw new Error(`duplicate argument: --${key}`);
    values[key] = value;
  }
  if ([...allowed].some((key) => !Object.hasOwn(values, key))) {
    throw new Error(`required arguments: ${[...allowed].map((key) => `--${key}`).join(', ')}`);
  }
  return values;
};

const main = async () => {
  try {
    if (Number(process.versions.node.split('.')[0]) !== 22) {
      throw new Error('provisioning requires Node.js 22');
    }
    const args = parseArguments(process.argv.slice(2));
    const provisioning = createHouseholdProvisioning({
      householdId: args['household-id'],
      displayName: args['display-name'],
      invitationVariant: args['invitation-variant'],
      maxGuests: Number(args['max-guests']),
      secret: process.env.ACCESS_CODE_HASH_SECRET,
    });
    const written = await writeProvisioningFiles({
      sheetOut: args['sheet-out'],
      deliveryOut: args['delivery-out'],
      provisioning,
    });
    process.stdout.write(
      `Huishoudcode veilig aangemaakt. Sheet-record: ${written.sheetPath}; privé-uitgiftebestand: ${written.deliveryPath}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'household-code provisioning failed';
    process.stderr.write(`Provisioning geweigerd: ${message}\n`);
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
