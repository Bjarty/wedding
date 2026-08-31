# RSVP Worker

This directory contains the browser-facing v1 RSVP API. It is intentionally
isolated from the GitHub Pages application and does not provision or modify any
Cloudflare, Google, DNS, Sheet, or GitHub resource.

The trust path is:

```text
GitHub Pages -> Cloudflare Worker -> signed Apps Script writer -> private Sheet
                                                        |
                                                        v
                                             EmailOutbox -> Resend HTTPS
```

The browser never calls Apps Script directly. The Worker never logs request
bodies and never forwards a raw invitation token, readable household code or
raw client IP. All responses use `Cache-Control: no-store`.

## Credentials and hashes

The personal link should carry its high-entropy token in the URL fragment, not
in a query parameter. The frontend reads the fragment, removes it from the
visible URL, keeps it in memory, and sends it only in a JSON request body.

Before calling Apps Script, the Worker calculates:

```text
tokenHash = base64url(HMAC-SHA256(INVITATION_TOKEN_HASH_SECRET, UTF-8 inviteToken))
```

The same algorithm and secret must be used by the offline invitation
provisioning process. `Invitations` stores `tokenHash`, never the raw token.

The recommended shared-QR flow accepts a 20-character household code from the
alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ`. Input is case-insensitive; ASCII
spaces and hyphens are removed. Before calling Apps Script, the Worker
calculates:

```text
accessCodeHash = base64url(HMAC-SHA256(
  ACCESS_CODE_HASH_SECRET,
  UTF-8 "rsvp-access-code-v1\0" + normalizedAccessCode
))
```

Every request contains exactly one credential: `inviteToken` for a legacy
fragmentlink or `accessCode` for the shared QR. The writer receives exactly one
corresponding hash. Readable codes remain only in browser memory and the
private distribution file outside the repository.

## Public v1 endpoints

Both endpoints accept only `POST` with `Content-Type: application/json`, require
the exact configured `Origin`, and validate a single-use Turnstile token on the
server. Cookies and browser credentials are not used. Before the body or a
credential is parsed, global (300/minute) and privacy-safe per-client
(30/minute) Cloudflare limits are checked. The client key is a
domain-separated HMAC of Cloudflare's client IP; the raw IP is never a key or
log value. Per-credential limits then allow 10 resolve attempts and 5 submit
attempts per 60 seconds.

### `POST /v1/households/resolve`

Turnstile action: `rsvp_resolve`.

```json
{
  "accessCode": "<persoonlijke-code-uit-privébestand>",
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
    "invitationVariant": "day",
    "mealChoiceRequired": true,
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
  "accessCode": "<persoonlijke-code-uit-privébestand>",
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

`mealChoice` is required for every attending `day` guest, omitted for every
`evening` guest and forbidden for each guest who is not attending. Its values
are `fish`, `meat`, `vegetarian`, and `vegan`. The Worker permits omission so
the writer can enforce the stored private policy definitively. The browser
sends every guest returned by resolve exactly once. Names
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

Confirmation email is an Apps Script concern after a durable RSVP write. The
Worker does not call Resend, hold its API key, add a mail endpoint, or change
this success contract. When separately enabled, the writer deduplicates by the
same logical idempotency key, queues a privacy-minimal message in its durable
`EmailOutbox`, attempts delivery outside the RSVP Sheet lock, and lets its
time-driven trigger continue retries and recovery. A mail/configuration failure
does not roll back the already committed RSVP; an exact client retry remains
idempotent.

The email contains the stable receipt number but no invitation token, readable
household code, attendance, meal choices, or free-text message. A receipt is a
reference, not a credential: modifying an RSVP still requires the same personal
household code.

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

Resolve data is exactly one of `{ tokenHash }` or `{ accessCodeHash }`. Submit
data starts with exactly one of those hashes, followed by `idempotencyKey`,
`revision`, `attending`, `guests`, `email?` and `message?`. Apps Script must compare the
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
- `HOUSEHOLD_CODES_ENABLED=false` until the matching writer schema and data are
  reviewed; set exact `true` only for an approved environment
- `TURNSTILE_EXPECTED_HOSTNAME=lisetteenbjarty.nl`

There is deliberately no Resend or confirmation-email variable in the Worker.
`CONFIRMATION_EMAIL_ENABLED`, `CONFIRMATION_EMAIL_ACTIVATED_AT` and
`RESEND_API_KEY` belong only to Apps Script Script Properties. The separate
public Pages variable `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED` controls truthful
UI copy and does not activate backend delivery.

Cloudflare rate-limit bindings:

- `GLOBAL_RATE_LIMITER`: 300 requests for the endpoint as a whole per 60 seconds
- `CLIENT_RATE_LIMITER`: 30 requests per HMAC-anonymized client per 60 seconds
- `RESOLVE_RATE_LIMITER`: 10 requests per credential hash per 60 seconds
- `SUBMIT_RATE_LIMITER`: 5 requests per credential hash per 60 seconds

The numeric namespace IDs in `wrangler.toml` are account-scoped. Confirm that
they are unused in the target Cloudflare account before the first deployment.

Encrypted Worker secrets:

- `TURNSTILE_SECRET`
- `WRITER_URL`
- `WRITER_HMAC_SECRET` (at least 32 random bytes)
- `INVITATION_TOKEN_HASH_SECRET` (a separate value of at least 32 random bytes)
- `ACCESS_CODE_HASH_SECRET` (48 random bytes encoded as exactly 64 base64url characters)

All three HMAC secrets must be different. Never put them in `wrangler.toml`, a
Vite variable, Git, a Sheet cell, or application logs. Roteer een mogelijk
gelekte waarde gecoördineerd aan Worker- en writerzijde.

## Local verification

No Cloudflare or Google resource is contacted by the tests. Fetch, Web Crypto
time, and request IDs are injected or mocked.

Voer deze commando's vanuit de repositoryroot uit. De expliciete prefix zorgt
dat de aparte Worker-lockfile en Worker-scripts worden gebruikt:

```powershell
npm ci --prefix rsvp/worker
npm --prefix rsvp/worker run check
npm --prefix rsvp/worker test
```

`wrangler.toml` is de fail-closed productieconfiguratie en bevat bewust geen
route, account-ID of secret. Er is geen externe test-Worker, previewupload of
Vite-proxy meer. De lokale tests gebruiken uitsluitend mocks en nemen geen
contact op met Cloudflare of Google.

Genereer `WRITER_HMAC_SECRET`, `INVITATION_TOKEN_HASH_SECRET` en
`ACCESS_CODE_HASH_SECRET` onafhankelijk van elkaar als 48 cryptografisch
willekeurige bytes, base64url-gecodeerd tot exact 64 tekens. Vervoer deze
waarden uitsluitend via een beveiligd lokaal proces; print of plak ze niet in
Git, Sheet, CI, chat, screenshots of tickets. Controleer accountbreed dat de
vier rate-limit namespace-ID's uitsluitend voor de productie-Worker worden
gebruikt.

## Fail-closed productieactivering

Deze procedure gebruikt uitsluitend productieresources en maakt de Worker pas
in een afzonderlijke, expliciet beoordeelde stap publiek. Voer de commando's vanuit
de repositoryroot uit met Node.js 22. Vervang alle placeholders uitsluitend in
lokale, genegeerde bestanden of de lokale shell; zet nooit een echte ID, URL of
secret in Git, een ticket, chat of screenshot.

### 1. Maak en controleer afzonderlijke productieresources

Maak handmatig en onder de afgesproken eigenaren:

1. een nieuwe private productie-Sheet en Apps Script-productiedeployment;
2. een nieuwe productie-Worker met exact de naam uit `wrangler.toml`, nog zonder
   route, custom domain of publiek `workers.dev`-endpoint;
3. een echte Turnstile-widget die uitsluitend `lisetteenbjarty.nl` toestaat;
4. vier ongebruikte, onderling verschillende productie-rate-limit namespaces
   voor global, client, resolve en submit;
5. vijf uitsluitend voor productie bestemde secrets: `TURNSTILE_SECRET`,
   `WRITER_URL`, `WRITER_HMAC_SECRET`, `INVITATION_TOKEN_HASH_SECRET` en
   `ACCESS_CODE_HASH_SECRET`.

Controleer eerst de Sheet-eigenaar, Apps Script-properties, `/exec`-URL,
Turnstile-hostname, sluitingsdatum en het ontbreken van pending intents. Voeg
een synthetisch productie-smokehuishouden toe; gebruik nog geen echte
uitnodigingscode en verspreid niets.

### 2. Maak een genegeerde productieconfiguratie

De ingecheckte `wrangler.toml` blijft de beoordeelbare fail-closed template.
Maak een lokale kopie; `.gitignore` sluit deze exacte bestandsnaam uit:

```powershell
Copy-Item rsvp/worker/wrangler.toml rsvp/worker/wrangler.production.local.toml
```

Wijzig in die lokale kopie uitsluitend de vier namespace-placeholders. Laat
`workers_dev = false`, laat route/custom-domain/account-ID/secrets afwezig en
houd `ALLOWED_ORIGIN` en `TURNSTILE_EXPECTED_HOSTNAME` exact op
`https://lisetteenbjarty.nl` respectievelijk `lisetteenbjarty.nl`. Laat
`HOUSEHOLD_CODES_ENABLED = "false"` totdat writer, schema en smokegegevens zijn
gecontroleerd. Controleer vóór iedere upload dat `git status --short` de lokale
config en het tijdelijke secretbestand niet toont.

### 3. Upload eerst alleen een Worker-versie

Maak buiten de repository een tijdelijk JSON-bestand met exact de vijf
productiesecrets. Een `--secrets-file` is additief: bestaande remote secrets
worden door weglaten niet verwijderd. Voor deze eerste inrichting worden alle
vijf waarden toch samen aangeleverd en na afloop lokaal verwijderd.

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<32-lowercase-hex-account-id>'
try {
  npm --prefix rsvp/worker exec -- wrangler versions upload `
    --strict `
    --experimental-provision=false `
    --experimental-auto-create=false `
    --config rsvp/worker/wrangler.production.local.toml `
    --keep-vars `
    --secrets-file '<absoluut-tijdelijk-productiesecrets-pad>' `
    --message 'Reviewed RSVP production candidate'
} finally {
  Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath '<absoluut-tijdelijk-productiesecrets-pad>' -ErrorAction SilentlyContinue
}
```

Dit uploadt een versie, maar verdeelt nog geen verkeer en maakt geen publiek
endpoint. Noteer de teruggegeven versie-ID in het beperkte operationele log
zonder secret- of gastdata. Controleer in Cloudflare dat de versie exact vijf
encrypted-secretbindings, vier rate-limitbindings en de verwachte publieke vars
heeft. Stop bij een conflict of onverwachte binding; gebruik geen
`--experimental-provision` of automatische resourcecreatie om dat te omzeilen.

### 4. Upload en deploy de beoordeelde actieve kandidaat

Zet `HOUSEHOLD_CODES_ENABLED = "true"` in de lokale productieconfiguratie pas
nadat de productie-writer, v2-Sheet en synthetische smokegegevens zijn
gecontroleerd. Upload opnieuw zoals in stap 3 en beoordeel de nieuwe versie-ID.
Deploy daarna uitsluitend die expliciet beoordeelde versie naar 100 procent;
laat de bevestigingsprompt staan:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID = '<32-lowercase-hex-account-id>'
try {
  npm --prefix rsvp/worker exec -- wrangler versions deploy `
    '<reviewed-version-id>@100' `
    --config rsvp/worker/wrangler.production.local.toml `
    --message 'Reviewed RSVP production activation'
} finally {
  Remove-Item Env:CLOUDFLARE_ACCOUNT_ID -ErrorAction SilentlyContinue
}
```

Ook deze deployment is nog niet vanaf internet bereikbaar zolang er geen domein
of route is gekoppeld. Bewaar de direct voorafgaande versie-ID voor een
code-rollback. Een versierollback herstelt nooit Sheetdata of writerstate.

### 5. Koppel pas daarna één publiek endpoint

Kies en beoordeel precies één bereikbare HTTPS-origin voor
`VITE_RSVP_API_BASE_URL`:

- voor de eerste livegang is het productie-`workers.dev`-endpoint de kleinste
  wijziging en vereist het geen TransIP-DNS- of nameserverwijziging;
- een eigen API-subdomein of Workerroute volgt alleen na een aparte
  Cloudflare-zone- en DNS-beoordeling. Voeg nooit een wildcard of route voor de
  volledige website toe en wijzig de bestaande website- en mailrecords niet.

Kies je `workers.dev`, wijzig dan in de lokale productieconfiguratie pas op dit
moment `workers_dev = true` en laat alle overige beoordeelde waarden staan. Zo
blijven latere `--strict` uploads in overeenstemming met het bewuste publieke
endpoint. Laat bij een handmatig beheerde custom domain/route
`workers_dev = false` staan.

Activeer de gekozen route of het `workers.dev`-endpoint handmatig onder
**Worker → Settings → Domains & Routes**, controleer letter voor letter dat
zij bij de productie-Worker hoort en registreer de uiteindelijke HTTPS-origin
zonder query, fragment of trailing pad. Controleer vanaf een niet-ingelogde
browser dat een `GET` of request zonder geldige origin/Turnstile/credential geen
data retourneert en dat responses `Cache-Control: no-store` hebben. Stop en
deactiveer het endpoint bij een onverwachte publieke route, redirect of
informatielek.

### 6. Activeer Pages en voer de smoke-test uit

Stel de vier openbare GitHub Actions-repositoryvariabelen in:

```text
VITE_RSVP_ENABLED=true
VITE_RSVP_HOUSEHOLD_CODES_ENABLED=true
VITE_RSVP_API_BASE_URL=<exact-beoordeelde-https-origin>
VITE_TURNSTILE_SITE_KEY=<publieke-productie-sitekey>
```

De Pages-workflow zet `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=true` expliciet
omdat de productie-outbox en Resend-route end-to-end zijn gecontroleerd. Deze
waarde verandert uitsluitend de Pages-tekst en niets in deze Worker.

Beoordeel de Pages-build en `dist/CNAME`, en test daarna via
`https://lisetteenbjarty.nl/#rsvp` uitsluitend het synthetische
smokehuishouden: resolve, eerste submit, opnieuw openen met dezelfde code,
wijziging met revisionverhoging, gelijk ontvangstnummer en de verwachte rijen
in `Responses`, `GuestDetails`, `Idempotency`, `Audit` en, wanneer mail
afzonderlijk is geactiveerd, `EmailOutbox`. Controleer tevens een
ongeldige code, avondbeleid, Turnstile-afwijzing en dat browser, Sheet en logs
geen leesbare code of secret bevatten. Trek de synthetische productiecode na de
smoke-test in voordat echte huishoudens worden geprovisioned.

### 7. Rollback

Bij een fout na publieke activering:

1. zet `RSVP_CLOSE_AT` in de writer onmiddellijk in het verleden; dit is de
   werkelijke write-stop;
2. inspecteer en herstel eventuele pending intents volgens het
   [Apps Script-runbook](../apps-script/README.md#backend-stop-en-rollback);
3. deactiveer daarna de Workerroute of het `workers.dev`-endpoint en verifieer
   vanaf een niet-ingelogde client dat resolve en submit niet meer bereikbaar
   zijn;
4. zet beide RSVP-enabled repositoryvariabelen op `false` en publiceer een
   beoordeelde Pages-build met de gesloten melding;
5. alleen bij een zuiver codeprobleem en compatibel writer-/Sheetschema: deploy
   de vooraf genoteerde vorige Worker-versie expliciet met `versions deploy`.

Een vorige Worker-versie, een frontendvlag of `HOUSEHOLD_CODES_ENABLED=false`
is op zichzelf geen volledige write-stop. Verwijder geen Sheetdata tijdens een
incident; volg daarvoor uitsluitend de afzonderlijke retentieprocedure.

## Offline household-code provisioning

Gebruik bij voorkeur de gedeelde QR plus de veilige huishoudcodehelper. Voer
deze vanuit de repositoryroot uit met Node.js 22, dezelfde tijdelijk geladen
`ACCESS_CODE_HASH_SECRET` als de doel-Worker en twee absolute uitvoerpaden in
een bestaande beveiligde map buiten de repository:

```powershell
npm run provision:household-code -- `
  --household-id hh_example `
  --display-name "Familie Voorbeeld" `
  --invitation-variant day `
  --max-guests 2 `
  --sheet-out "C:\beveiligd\hh_example-sheet.json" `
  --delivery-out "C:\beveiligd\hh_example-uitgifte.json"
```

Het Sheet-bestand bevat uitsluitend de codehash en `Invitations`-metadata. Het
privé-uitgiftebestand bevat de leesbare code en gedeelde URL voor drukwerk.
Beide worden met no-overwrite aangemaakt; de code verschijnt niet op stdout.
Zet alleen de hash/metadata in de private Sheet en alleen het uitgiftebestand in
de beveiligde drukwerkstroom. Codes en secrets horen nooit in Git, Google
Sheets, logs, CI, chat, screenshots of querystrings. Namen, variant, policy en
gastregels worden beheerd zoals beschreven in
[`../INVITATION-DISTRIBUTION.md`](../INVITATION-DISTRIBUTION.md).

## Legacy fragmentlink provisioning

Generate one link at a time on a trusted local machine with the same
`INVITATION_TOKEN_HASH_SECRET` configured for the Worker:

```text
npm --prefix rsvp/worker run provision:invitation -- --household-id hh_example
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
