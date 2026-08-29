import { createHmac, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULT_ORIGIN = 'https://lisetteenbjarty.nl';
const LOCAL_BROWSER_TEST_ORIGIN = 'http://localhost:3000';
const HOUSEHOLD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const createInvitation = ({ householdId, origin = DEFAULT_ORIGIN, secret, random = randomBytes }) => {
  if (!HOUSEHOLD_ID_PATTERN.test(householdId)) {
    throw new Error('householdId must contain 1-64 letters, digits, underscores, or hyphens');
  }
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('INVITATION_TOKEN_HASH_SECRET must contain at least 32 characters');
  }

  let parsedOrigin;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new Error('origin must be a valid HTTPS origin');
  }
  const isExactLocalBrowserTest = origin === LOCAL_BROWSER_TEST_ORIGIN;
  if (
    parsedOrigin.origin !== origin ||
    (parsedOrigin.protocol !== 'https:' && !isExactLocalBrowserTest)
  ) {
    throw new Error('origin must be an HTTPS origin or exact local test origin without a path');
  }

  const token = random(32).toString('base64url');
  const tokenHash = createHmac('sha256', secret).update(token, 'utf8').digest('base64url');
  return {
    householdId,
    invitationLink: `${origin}/#rsvp/${token}`,
    tokenHash,
  };
};

const parseArguments = (args) => {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--household-id' || argument === '--origin') {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      values[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unsupported argument: ${argument}`);
  }
  return values;
};

const main = () => {
  try {
    const args = parseArguments(process.argv.slice(2));
    if (!args['household-id']) throw new Error('--household-id is required');
    const result = createInvitation({
      householdId: args['household-id'],
      origin: args.origin ?? DEFAULT_ORIGIN,
      secret: process.env.INVITATION_TOKEN_HASH_SECRET,
    });

    // This single JSON object is the explicit sensitive output. The link contains
    // the raw bearer token; store only tokenHash in the Sheet and distribute the
    // link privately. Never run this command in CI or redirect it into the repo.
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'invitation provisioning failed';
    process.stderr.write(`Provisioning failed: ${message}\n`);
    process.exitCode = 1;
  }
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
