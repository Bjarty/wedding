# RSVP Worker foundation

This directory contains the browser-facing v1 RSVP API. It is intentionally
isolated from the GitHub Pages application and does not provision or modify any
Cloudflare, Google, DNS, Sheet, or GitHub resource.

The trust path is:

```text
GitHub Pages -> Cloudflare Worker -> signed Apps Script writer -> private Sheet
```

The browser never calls Apps Script directly. The Worker never logs request
bodies and never forwards a raw invitation token. All responses use
`Cache-Control: no-store`.

## Personal invitation token

The personal link should carry its high-entropy token in the URL fragment, not
in a query parameter. The frontend reads the fragment, removes it from the
visible URL, keeps it in memory, and sends it only in a JSON request body.

Before calling Apps Script, the Worker calculates:

```text
tokenHash = base64url(HMAC-SHA256(INVITATION_TOKEN_HASH_SECRET, UTF-8 inviteToken))
```

The same algorithm and secret must be used by the offline invitation
provisioning process. `Invitations` stores `tokenHash`, never the raw token.

## Public v1 endpoints

Both endpoints accept only `POST` with `Content-Type: application/json`, require
the exact configured `Origin`, and validate a single-use Turnstile token on the
server. Cookies and browser credentials are not used. Before Turnstile, a
per-token-hash Cloudflare rate limit is checked: 10 resolve attempts and 5
submit attempts per 60 seconds. The keyed hash is used as the limit key; raw IP
addresses and raw invitation tokens are not used as keys.

### `POST /v1/households/resolve`

Turnstile action: `rsvp_resolve`.

```json
{
  "inviteToken": "a-high-entropy-base64url-token",
  "turnstileToken": "turnstile-response"
}
```

Success:

```json
{
  "version": "v1",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "data": {
    "householdId": "hh_example",
    "displayName": "Familie Voorbeeld",
    "maxGuests": 2,
    "guests": [
      { "guestId": "guest_1", "displayName": "Gast één" },
      { "guestId": "guest_2", "displayName": "Gast twee" }
    ],
    "currentRsvp": null
  }
}
```

When a response already exists, `currentRsvp` contains `revision`, stable
`receiptNumber`, `attending`, all guest decisions, optional `email` and
`message`, and `updatedAt`.

### `POST /v1/rsvps/submit`

Turnstile action: `rsvp_submit`.

```json
{
  "inviteToken": "a-high-entropy-base64url-token",
  "idempotencyKey": "11111111-1111-4111-8111-111111111111",
  "revision": 0,
  "attending": true,
  "guests": [
    { "guestId": "guest_1", "attending": true, "mealChoice": "vegetarian" },
    { "guestId": "guest_2", "attending": false }
  ],
  "email": "gast@example.nl",
  "message": "Optioneel bericht",
  "turnstileToken": "turnstile-response"
}
```

`mealChoice` is required for each attending guest and forbidden for each guest
who is not attending. Its v1 values are `fish`, `meat`, `vegetarian`, and
`vegan`. The browser sends every guest returned by resolve exactly once. Names
are never accepted from the browser. Provisioning must satisfy
`guests.length <= maxGuests`: every preset guest must be able to attend. The
writer checks this before returning resolve data, and the Worker rejects any
upstream response that violates it, so the browser never renders an impossible
form.

`revision` is the expected current revision (`0` for the first response). A
successful new write increments it. The browser creates one idempotency UUID
per logical submit and reuses that UUID after a timeout or network retry. An
idempotent retry must return the original revision and receipt number.
The Worker accepts writer success only when the returned revision is exactly
the submitted expected revision plus one.

Success:

```json
{
  "version": "v1",
  "requestId": "00000000-0000-4000-8000-000000000001",
  "data": {
    "revision": 1,
    "savedAt": "2027-01-02T12:34:56.000Z",
    "idempotencyKey": "11111111-1111-4111-8111-111111111111",
    "receiptNumber": "RSVP-8K2M4P"
  }
}
```

No confirmation email is sent in v1. The optional address is stored only for
wedding information and can be returned to the same personal invitation link.

## Error contract

Errors never include input values, token hashes, upstream messages, Sheet data,
or stack traces.

```json
{
  "version": "v1",
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Deze reactie is intussen gewijzigd. Laad de nieuwste versie en probeer opnieuw.",
    "requestId": "00000000-0000-4000-8000-000000000001",
    "fields": [{ "path": "guests[0].mealChoice", "code": "required" }]
  }
}
```

Stable public mappings include:

- `403 CHALLENGE_FAILED`
- `404 INVITATION_INVALID`
- `409 REVISION_CONFLICT` or `IDEMPOTENCY_CONFLICT`
- `410 RSVP_CLOSED`
- `413 PAYLOAD_TOO_LARGE`
- `422 VALIDATION_FAILED`
- `429 RATE_LIMITED`
- `503 UPSTREAM_UNAVAILABLE`

The frontend shows success only after the submit endpoint returns `200` and can
then display `receiptNumber`.

Rate limiting is an abuse-control layer only. Cloudflare's rate-limit counters
are permissive/eventually consistent and never replace the writer's durable
idempotency table, revision check, or script lock. A rejected attempt returns
`429 RATE_LIMITED` with `Retry-After: 60`; an unavailable rate-limit binding
fails closed before Turnstile or Apps Script is called.

## Apps Script envelope

The Worker sends a JSON envelope:

```json
{
  "version": "v1",
  "timestamp": 1800000000,
  "requestId": "00000000-0000-4000-8000-000000000001",
  "payload": "base64url-without-padding",
  "signature": "base64url-without-padding"
}
```

`payload` is the base64url encoding of the exact UTF-8 bytes of:

```text
JSON.stringify({ version: "v1", operation, requestId, data })
```

The signature is base64url without padding of HMAC-SHA256 over the exact UTF-8
string below, using `WRITER_HMAC_SECRET`:

```text
v1.<timestamp>.<requestId>.<payload>
```

Resolve data is `{ tokenHash }`. Submit data is `{ tokenHash, idempotencyKey,
revision, attending, guests, email?, message? }`. Apps Script must compare the
signature in constant time, enforce a short timestamp window, verify the
decoded request ID, validate the complete guest set and revision under a lock,
neutralize spreadsheet formulas at the Sheet boundary, and durably implement
idempotency.

Writer success is `{ version: "v1", requestId, ok: true, data }`. Writer errors
are `{ version: "v1", requestId, ok: false, error: { code } }`; arbitrary
upstream error details are never forwarded to the browser.

## Configuration

Public, non-secret Worker variables:

- `ALLOWED_ORIGIN=https://lisetteenbjarty.nl`
- `TURNSTILE_EXPECTED_HOSTNAME=lisetteenbjarty.nl`

Cloudflare rate-limit bindings:

- `RESOLVE_RATE_LIMITER`: 10 requests per token hash per 60 seconds
- `SUBMIT_RATE_LIMITER`: 5 requests per token hash per 60 seconds

The numeric namespace IDs in `wrangler.toml` are account-scoped. Confirm that
they are unused in the target Cloudflare account before the first deployment.

Encrypted Worker secrets:

- `TURNSTILE_SECRET`
- `WRITER_URL`
- `WRITER_HMAC_SECRET` (at least 32 random bytes)
- `INVITATION_TOKEN_HASH_SECRET` (a separate value of at least 32 random bytes)

The two HMAC secrets must be different. Never put them in `wrangler.toml`, a
Vite variable, Git, a Sheet cell, or application logs. Use separate secrets and
Sheets for test and production.

## Local verification

No Cloudflare or Google resource is contacted by the tests. Fetch, Web Crypto
time, and request IDs are injected or mocked.

```text
npm ci
npm run check
npm test
```

`wrangler.toml` deliberately contains no route, account ID, or secret. External
provisioning and deployment require a separate reviewed change.

It also has `workers_dev = false`, so the checked-in fail-closed configuration
does not create a reachable test URL. For the separate test environment, make
a reviewed test-only Wrangler configuration that enables a `workers.dev`
preview URL (zie [Cloudflare Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/))
of adds an explicit test route, replace both rate-limit namespace
placeholders with unused IDs from that account, and deploy only after the test
secrets are present. This creates no TransIP DNS or nameserver change. Repeat
the decision separately for production; never reuse the test URL, namespace
IDs, secrets, Turnstile widget, writer deployment or Sheet.

Browser-E2E gebeurt vóór live activering vanaf exact
`http://localhost:3000`. Zet in uitsluitend die test-Worker
`ALLOWED_ORIGIN=http://localhost:3000` en
`TURNSTILE_EXPECTED_HOSTNAME=localhost`; `127.0.0.1`, wildcards en cookies zijn
niet toegestaan. Gebruik Cloudflares [officiële Turnstile-testkeys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/):
de always-pass combinatie voor de reproduceerbare succesflow en een aparte
failure-key voor het foutpad. De publieke `workers.dev`-preview bevat alleen synthetische
huishoudens en blijft rate-limited. Productie gebruikt een andere Worker,
widget, namespace-ID's, HMAC-secrets, token-hashsecret, writerdeployment en
Sheet, met exact `https://lisetteenbjarty.nl` als origin en hostname.
Start de lokale frontend met `VITE_RSVP_ENABLED=true`, de publieke preview-URL
en de testsitekey in de genegeerde `.env.local`; zet deze waarden niet als
live GitHub-repositoryvariabelen.

## Offline invitation provisioning

Generate one link at a time on a trusted local machine with the same
`INVITATION_TOKEN_HASH_SECRET` configured for the Worker:

```text
npm run provision:invitation -- --household-id hh_example
```

Gebruik voor uitsluitend de lokale browsertest expliciet
`--origin http://localhost:3000`; de helper weigert ander niet-HTTPS verkeer,
waaronder `127.0.0.1`. Productielinks gebruiken de standaard HTTPS-origin.

The command writes one explicit sensitive JSON object to stdout containing the
private `invitationLink` and its `tokenHash`. Copy only `tokenHash` into the
private `Invitations` Sheet row, add that household's preset guest IDs/names,
set `maxGuests` to at least the number of preset guest rows, and test resolve
before distributing the link. Never copy the raw token or link into the Sheet,
Git, CI output, chat logs, analytics, or a URL query parameter. The secret
itself is never printed.
