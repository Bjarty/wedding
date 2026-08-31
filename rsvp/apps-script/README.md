# Google Apps Script RSVP-writer

Deze map bevat de private Google Sheets-writer achter de serverless RSVP-API.
De browser roept deze web-app nooit rechtstreeks aan.

```text
browser -> Cloudflare Worker -> gesigneerde Apps Script-web-app -> private Sheet
                                                        |
                                                        v
                                             EmailOutbox -> Resend HTTPS
```

De code maakt of wijzigt geen Google-account, Sheet, deployment of
toegangsinstelling. Test en productie worden bewust handmatig ingericht.

## Privacy- en eigendomsgrens

- Test- en productie-Sheet zijn eigendom van het vooraf afgesproken
  Google-eigenaaraccount. Het adres daarvan blijft buiten Git.
- Beide Sheets houden **Algemene toegang: Beperkt** en worden niet publiek
  gedeeld.
- Alleen keyed credential-hashes komen in Sheets en server-to-server requests.
  Ruwe uitnodigingstokens en persoonlijke codes worden niet naar Apps Script
  gestuurd.
- Vooraf ingestelde `guestId`-waarden en namen komen uit de private Sheet;
  submit accepteert nooit een naam vanuit de browser.
- E-mail en bericht zijn optioneel. Als de afzonderlijke mailfunctie actief is,
  verstuurt de writer via Resend HTTPS een privacyarme bevestiging. Gmail- en
  Mail-scopes zijn niet nodig; de manifest vraagt alleen de begrensde
  `script.external_request`-scope voor deze uitgaande HTTPS-call.
- Een nog niet afgeronde `Idempotency.intentJson` bevat de optionele e-mail en
  het bericht als hersteldata. Behandel de hele `Idempotency`-tab daarom als
  RSVP-detaildata/PII: niet exporteren, niet loggen en alleen toegankelijk
  maken voor dezelfde beperkte Sheet-beheerders.
- `EmailOutbox` bevat tijdelijk het bestemmingsadres, ontvangstnummer en
  technische afleverstatus. Behandel ook deze hele tab als RSVP-detaildata/PII.
  De mail bevat geen naam, aanwezigheid, maaltijdkeuze, bericht, leesbare
  huishoudcode of ruwe uitnodigingstoken. Providertracking blijft uit.
- Er is geen telefoonveld en geen vrij tekstveld voor aanvullende
  dieetwensen; `mealChoice` is alleen voor aanwezige daggasten verplicht en
  blijft voor avondgasten leeg. Onbekende velden worden geweigerd.
- Execution logs en `Audit` bevatten geen credential(hash), naam, e-mailadres,
  bericht of maaltijdkeuze.

Apps Script stelt custom requestheaders niet betrouwbaar beschikbaar aan
`doPost`. De authenticatie staat daarom in een HMAC-gesigneerde JSON-envelope.
De web-app moet technisch voor anonieme HTTP-toegang worden gedeployed; HMAC,
timestamp en `requestId` bewaken de server-to-server grens. Publiceer de
deployment-URL nooit in frontendcode.

## Sheet-schema en initialisatie

`initSheet()` maakt ontbrekende tabs en exacte headers aan, zet tekstkolommen
op tekstnotatie en controleert de eigenaar. De functie verwijdert geen data en
stopt bij afwijkende bestaande headers.

| Tab | Doel | Kolommen |
| --- | --- | --- |
| `Invitations` | Huishouden, credential-hashes, uitnodigingsbeleid en revisie | `householdId`, `tokenHash`, `accessCodeHash`, `displayName`, `invitationVariant`, `mealChoiceRequired`, `maxGuests`, `active`, `currentRevision`, `createdAt`, `updatedAt` |
| `Responses` | Actuele reactie en vast ontvangstnummer | `responseId`, `receiptNumber`, `householdId`, `revision`, `attending`, `guestCount`, `email`, `message`, `submittedAt`, `updatedAt` |
| `GuestDetails` | Vooraf ingestelde personen en actuele keuze | `householdId`, `guestId`, `displayName`, `attending`, `mealChoice`, `revision`, `updatedAt` |
| `Idempotency` | Veilige retries, write-ahead intents en replaycontrole | `requestId`, `operation`, `idempotencyKey`, `payloadHash`, `householdId`, `baseRevision`, `targetRevision`, `status`, `intentJson`, `intentMac`, `responseJson`, `completionMac`, `requestTimestamp`, `createdAt`, `updatedAt`, `expiresAt` |
| `Audit` | Minimale mutatiehistorie | `auditId`, `occurredAt`, `operation`, `outcome`, `householdId`, `responseId`, `revision`, `idempotencyKey`, `requestId` |
| `EmailOutbox` | Duurzame, deduplicerende afleverstatus voor privacyarme ontvangstmail | `deliveryId`, `idempotencyKey`, `submitIntentMac`, `templateVersion`, `recipientEmail`, `receiptNumber`, `revision`, `createdAt`, `expiresAt`, `contentMac`, `status`, `attemptCount`, `firstAttemptAt`, `claimedAt`, `lastAttemptAt`, `nextAttemptAt`, `sentAt`, `providerMessageId`, `lastErrorCode`, `stateMac` |

Provisioning vult per huishouden één `Invitations`-rij en één of meer
`GuestDetails`-rijen. Gebruik URL-veilige, niet-voorspelbare IDs van maximaal
64 tekens. Vul de initiële waarden exact zo in:

- Vul voor een oude persoonlijke fragmentlink alleen `tokenHash` in en voor
  een persoonlijke huishoudcode alleen `accessCodeHash`. Tijdens een
  gecontroleerde overgang mogen beide hashes op dezelfde rij staan. Minstens
  één hash is verplicht; iedere ingevulde hash heeft exact 43 base64url-tekens.
- `invitationVariant` is exact `day` of `evening`. In deze versie is het
  bijbehorende beleid onveranderlijk: `day` vereist de echte boolean `TRUE`
  voor `mealChoiceRequired`; `evening` vereist `FALSE`.
- `Invitations.active` is een echte boolean, `currentRevision` is het getal
  `0`, en `createdAt` én `updatedAt` zijn geldige datums of canonical
  ISO-8601-tijdstippen (bijvoorbeeld `2026-08-29T12:00:00.000Z`).
- Iedere `GuestDetails`-rij heeft revision `0`; `attending`, `mealChoice` en
  `updatedAt` zijn leeg. `householdId` verwijst naar exact één Invitation.
- `Responses`, `Idempotency`, `Audit` en `EmailOutbox` blijven vóór de eerste
  request leeg.

Een lege of ongeldige Invitation-`updatedAt`, vooraf ingevulde gastkeuze of
afwijkende basisrevision faalt gesloten voordat RSVP-data wordt gewijzigd.

Bij `day`/`mealChoiceRequired=TRUE` is per aanwezige gast `mealChoice`
verplicht met exact één van `fish`, `meat`, `vegetarian`, `vegan`. Bij
`evening`/`FALSE` blijft `mealChoice` ook voor aanwezige gasten leeg. Bij een
afwezige gast is de waarde altijd leeg. Submit moet alle vooraf ingestelde
`guestId`-waarden exact één keer bevatten en mag geen andere IDs toevoegen.

`maxGuests` begrenst het aantal personen dat tegelijk aanwezig kan zijn. De
expliciete provisioning-invariant is `aantal GuestDetails-rijen <= maxGuests`:
iedere vooraf ingestelde gast moet dus aanwezig kunnen zijn. Resolve en submit
controleren dit voordat RSVP-data wordt teruggegeven of gewijzigd. Een fout
ingericht huishouden faalt daardoor veilig als writer-configuratiefout en kan
geen formulier opleveren dat pas bij submit wordt afgewezen. Alle uit requests
afkomstige tekst wordt genormaliseerd en tegen spreadsheet-formule-injectie
beschermd. Voor logische tekst die na optionele witruimte begint met `=`, `+`,
`-`, `@` of een apostrof schrijft de writer één extra tekstprefix. Google
Sheets consumeert precies die prefix; `getValues()` levert daarna de originele
logische tekst terug en `getFormulas()` moet leeg blijven. De tekstnotatie
beschermt ook namen die tijdens provisioning worden ingevoerd.

### Veilige migratie van de legacy Invitations-header

Gebruik voor test en productie bij voorkeur een nieuwe private Sheet en voer
`initSheet()` uit. De meegeleverde beheerfunctie
`migrateInvitationSchemaV1ToV2()` is alleen bedoeld voor een Sheet met de
exacte acht legacy `Invitations`-kolommen en de huidige exacte headers op de
overige aanwezige RSVP-tabs. Zij:

1. neemt de globale `ScriptLock`;
2. controleert eigenaar, omgeving en alle headers;
3. weigert zonder enige schemawijziging zodra een `submit`-intent de status
   `pending` heeft;
4. valideert alle legacy Invitation-rijen en duplicaten vóór de eerste write;
5. behoudt iedere cel, voegt een lege `accessCodeHash` toe en zet het historisch
   correcte beleid `day` plus `mealChoiceRequired=TRUE`;
6. schrijft en controleert daarna de exacte v2-header.

De functie is idempotent: op een al geldig v2-schema retourneert zij
`migrated: false` en verandert zij niets. Zij genereert geen codes en wijzigt
geen Responses, GuestDetails, Idempotency, Audit of EmailOutbox. Voer haar
nooit blind uit:

1. zet nieuwe Worker-writes backend-side stil;
2. maak een afgeschermde backup;
3. inspecteer en herstel iedere pending intent;
4. voer de migratiefunctie één keer handmatig uit en controleer resultaat,
   headers, rijenaantallen, revisions en ontvangstnummers;
5. provision daarna pas access-codehashes en voer de volledige testmatrix uit.

Een legacy pending intent dat vóór de upgrade al duurzaam was vastgelegd kan
na de migratie nog veilig worden hersteld. Zo'n intent heeft nog geen expliciet
policy-object en wordt uitsluitend geïnterpreteerd als het toen geldende
`day`/maaltijd-verplichtbeleid. Nieuwe intents bevatten variant en maaltijdregel
in de geauthenticeerde `intentJson`; herstel stopt als de private Invitation-rij
later handmatig naar een ander beleid is veranderd.

## Duurzame writes en herstel

Een submit wordt niet als één optimistische reeks losse Sheet-writes
behandeld. Onder `ScriptLock` schrijft de writer eerst een `pending`
write-ahead intent naar `Idempotency` en forceert een flush. De opnieuw
ingelezen rij wordt vóór iedere domeinmutatie gecontroleerd met een
domeingescheiden HMAC die request/idempotency key, payloadhash, huishouden,
basis-/doelrevision en de exacte `intentJson`-bytes bindt. De intent bevat een
hash van de volledige basisstaat en de canonieke doelstaat van Response, alle
GuestDetails, Audit, Invitation en het stabiele submitresultaat.

Herstel accepteert een bestaande rij alleen als die exact de geauthenticeerde
basis- of doelstaat heeft. Het zoekt op stabiele IDs, nooit op eerder bewaarde
rijnummers, en schrijft in deze volgorde:

1. Response, flush en readback;
2. alle GuestDetails, flush en readback;
3. exact één Audit-record, flush en readback;
4. Invitation-`updatedAt`, eigen flush en readback;
5. Invitation-`currentRevision` als enige en laatste domein-commitpointer,
   eigen flush en volledige readback;
6. geauthenticeerd `responseJson` plus `completionMac`, flush en readback;
7. `status=completed` als enige completion-commitpointer, flush en readback.

Een gemengde maar herkenbare basis-/doelstaat wordt deterministisch afgemaakt.
Een onbekende waarde, ongeldige MAC, dubbele/conflicterende Audit of revision
nieuwer dan het intentdoel faalt gesloten zonder terugrollen. Er kan maximaal
één pending intent per huishouden bestaan. Resolve en submit herstellen alleen
het huishouden van de aangeboden credential-hash, zodat een beschadigd ander
huishouden geen globale storing veroorzaakt. Een intent die al vóór sluiting
duurzaam was geaccepteerd wordt ook na sluiting of deactivatie afgemaakt, maar
alleen vóór de harde retentiedeadline; een nieuwe submit blijft geblokkeerd.

`recoverAllPendingIntents()` is een expliciete handmatige beheerfunctie. Zij
valideert eerst alle pending intents en herstelt ze daarna onder één
`ScriptLock`. Installeer hiervoor geen automatische trigger. Gebruik haar in
test na foutinjectie en in productie alleen na inspectie van de private Sheet;
een fout betekent stoppen en onderzoeken, niet rijen handmatig op completed
zetten.

### Duurzame bevestigingsmail

Een bevestigingsmail is een vervolgactie op een reeds duurzaam opgeslagen
RSVP, nooit de commitpointer van die RSVP. Een mailfout draait de Response,
GuestDetails, Audit, revision of het ontvangstnummer dus niet terug. De site
toont het ontvangstnummer altijd direct; dat nummer is een referentie en geen
credential. Alleen dezelfde persoonlijke huishoudcode geeft later toegang tot
bekijken of wijzigen.

Voor iedere succesvolle eerste submit of wijziging met e-mailadres maakt de
writer hooguit één outboxitem voor die logische idempotency key. Een identieke
submitretry gebruikt zolang de interne idempotencyrij wordt bewaard dezelfde
opgeslagen uitkomst en maakt geen tweede outboxitem. Iedere Resend-call gebruikt
daarnaast dezelfde provider-idempotencykey. Het 24-uursvenster begint pas bij
de eerste duurzaam vastgelegde providerpoging (`firstAttemptAt`): een nog nooit
geprobeerd `queued` item verloopt dus niet door ontbrekende providerconfiguratie.
Automatische vervolgverzending blijft binnen dat venster; daarna gaat een
onopgelost item naar `manual_review` in plaats van mogelijk dubbel te verzenden. De outbox
blijft na de request duurzaam bestaan. De submit probeert het item na vrijgave
van `ScriptLock`
direct te verzenden; de éénminuuttrigger
`processConfirmationEmailOutbox()` verwerkt retries en achtergebleven items.
Het Workercontract en de Workerconfiguratie veranderen hierdoor niet.

Bij een nieuwere RSVP-revisie zet de writer oudere nog niet verzonden
`queued`/`retry`-mail voor hetzelfde huishouden op `manual_review` met reden
`superseded`. Dit gebeurt ook als het adres wordt verwijderd. Een reeds actieve
`sending`-claim blijft vanwege de mogelijke provider-race tijdens zijn lease
ongemoeid. Als die claim na de lease verlaten blijkt, zet reconciliation hem
alsnog op `manual_review/superseded` en wordt het oude adres niet opnieuw
aangeboden; de nieuwere bevestiging is daarna de actuele mail.

De verzendroutine reserveert een item duurzaam vóór de HTTPS-call en bewaart de
afleverstatus daarna. Een bevestigde Resend-respons wordt `sent`. Netwerkfouten,
HTTP 429 en 5xx worden binnen Resends idempotencyvenster met exact dezelfde
payload en provider-idempotencykey begrensd opnieuw aangeboden; ook een
onzekere netwerkuitslag kan daardoor niet dubbel verzenden. Een expliciet
idempotencyconflict van de provider, een definitieve afwijzing of een na 24 uur
nog onopgelost item gaat naar `manual_review` en wordt niet blind opnieuw
verstuurd. Controleer zo'n item in het beperkte Resend-dashboard en de private
Sheet zonder adres of andere gastdata naar een operationeel log te kopiëren.
Zet de status nooit handmatig op `sent` of terug naar een automatisch
verzendbare status zonder een afzonderlijk beoordeelde beheerprocedure.

Ieder outboxitem bindt een onveranderlijke `templateVersion` in zijn content-
MAC en provider-idempotencykey. Wijzig renderer `rsvp_confirmation_v1` nooit;
voeg voor nieuwe mailcopy een nieuwe versie en aparte renderer toe. Stop vóór
een deployment die mailpayloads raakt de trigger, laat verzendbare outboxitems
uitlopen of beoordeel ze handmatig en hervat pas na controle. Zo kan een retry
niet met dezelfde providerkey maar andere payload bij Resend aankomen.

De mail wordt verstuurd als **Lisette & Bjarty** vanaf en met antwoordadres
`rsvp@lisetteenbjarty.nl`. Zij noemt alleen dat de reactie is opgeslagen, het
stabiele ontvangstnummer, de uiterste wijzigingsdatum en de publieke
RSVP-pagina. Zij
bevat geen persoonlijke code of token en ook geen volledige reactie. Schakel
open-, click- en overige tracking in Resend uit. Gebruik providerlogs niet als
gastadministratie en neem Resend en de bewaartermijnen op in de
privacydocumentatie/verwerkersafspraken.

## Credential-hashes en secrets

Maak uitnodigingstokens met minimaal 32 cryptografisch willekeurige bytes. De
Worker en het provisioningproces berekenen exact:

```text
tokenHash = base64url_no_padding(
  HMAC-SHA256(INVITATION_TOKEN_HASH_SECRET, UTF8(rawInviteToken))
)
```

De uitkomst is 43 URL-veilige tekens en komt in `Invitations.tokenHash`.
`INVITATION_TOKEN_HASH_SECRET` staat alleen in de Worker secret store en het
beveiligde provisioningproces; niet in Apps Script of Git. Gebruik een ander
secret dan `WRITER_HMAC_SECRET`.

Persoonlijke huishoudcodes gebruiken dezelfde HMAC-constructie na de exact
gedocumenteerde code-normalisatie, maar met een afzonderlijk
`ACCESS_CODE_HASH_SECRET`; de uitkomst komt in `Invitations.accessCodeHash`.
Apps Script kent geen van beide hashsecrets en ontvangt uitsluitend de hash.
Zet een leesbare code nooit in de Sheet, Script Properties, een requestlog of
een URL. De Worker stuurt bij resolve en submit exact één hashsoort mee.

Open in Apps Script **Projectinstellingen -> Script Properties**:

| Property | Vereist | Waarde |
| --- | --- | --- |
| `ENVIRONMENT` | ja | Exact `test` of `production` |
| `SPREADSHEET_ID` | ja | ID van de private Sheet voor deze omgeving |
| `SHEET_OWNER_EMAIL` | ja | E-mailadres van het Sheet-eigenaaraccount; uitsluitend als private Script Property |
| `WRITER_HMAC_SECRET` | ja | Willekeurig secret van minimaal 32 tekens; identiek aan de Worker-secret van uitsluitend deze omgeving |
| `RSVP_CLOSE_AT` | ja | ISO-8601 tijdstip met offset, bijvoorbeeld `2027-04-11T00:00:00+02:00` als 10 april de laatste RSVP-dag is |
| `MAX_CLOCK_SKEW_SECONDS` | nee | Standaard `300`; toegestaan `60` t/m `900` |
| `CONFIRMATION_EMAIL_ENABLED` | nee | Standaard/fail-closed `false`; uitsluitend exact `true` activeert het aanmaken en verwerken van bevestigingsmail |
| `CONFIRMATION_EMAIL_ACTIVATED_AT` | bij mailactivering | ISO-8601 tijdstip met offset; alleen submits die op of na deze beoordeelde cutoff worden opgeslagen mogen mail opleveren |
| `RESEND_API_KEY` | bij mailactivering | Alleen in Script Properties: aparte sending-only, zo mogelijk domeinbeperkte sleutel voor exact deze omgeving; nooit in Sheet, Git, logs of `VITE_` |
| `RSVP_SHEET_CLEAR_CONFIRMATION` | tijdelijk | Alleen vlak voor de expliciete defense-in-depth Sheet-clear; zie Retentie |

Genereer een writer-secret bijvoorbeeld lokaal met
`openssl rand -base64 48`. Zet secrets nooit in Git, Vite-variabelen,
screenshots, tickets, logs of de Sheet.

De ingecheckte manifest bevat `script.external_request` zodat Apps Script het
Resend-HTTPS-endpoint mag aanroepen. Voeg geen Gmail-, Mail-, Drive- of bredere
OAuth-scope toe. Bij een manifestwijziging moet een beheerder de nieuwe scope
expliciet opnieuw beoordelen en autoriseren.

## Exact writercontract

De envelope bevat exact:

```json
{
  "version": "v1",
  "timestamp": 1788000000,
  "requestId": "00000000-0000-4000-8000-000000000000",
  "payload": "base64url-zonder-padding",
  "signature": "base64url-hmac-zonder-padding"
}
```

`payload` is base64url zonder padding van UTF-8:

```json
{
  "version": "v1",
  "operation": "resolve",
  "requestId": "dezelfde-worker-uuid",
  "data": {}
}
```

De signature gebruikt exact punten, geen newlines of extra spaties:

```text
signingInput = "v1." + timestamp + "." + requestId + "." + payload
signature = base64url_no_padding(
  HMAC-SHA256(UTF8(WRITER_HMAC_SECRET), UTF8(signingInput))
)
```

De writer controleert HMAC constant-time, een standaard klokvenster van vijf
minuten, een Worker-UUID als `requestId`, en dat version/requestId in payload
en envelope gelijk zijn. Hergebruik van een requestId voor resolve of een
nieuwe logische submit wordt als replay geweigerd. Een reeds bevestigde submit
mag via zijn idempotency key wel veilig hetzelfde opgeslagen resultaat
teruggeven. `ScriptLock` serialiseert resolve/submit en maakt de revision-check
plus verhoging veilig tegen gelijktijdige writes.

### Resolve

Data bevat exact één van deze twee vormen:

```json
{ "tokenHash": "43-base64url-tekens" }
```

```json
{ "accessCodeHash": "43-base64url-tekens" }
```

Geen hash, beide hashes tegelijk of een extra veld wordt geweigerd. Een
onbekende, ingetrokken of verkeerd gekozen credential levert dezelfde veilige
`INVITATION_INVALID`-categorie op.

Succes bevat exact de volgende vorm:

```json
{
  "version": "v1",
  "requestId": "worker-uuid",
  "ok": true,
  "data": {
    "householdId": "hh_voorbeeld",
    "displayName": "Familie Voorbeeld",
    "invitationVariant": "day",
    "mealChoiceRequired": true,
    "maxGuests": 2,
    "guests": [
      { "guestId": "guest_1", "displayName": "Gast Eén" }
    ],
    "currentRsvp": null
  }
}
```

Na een eerdere reactie bevat `currentRsvp` exact revision, het stabiele
`receiptNumber`, top-level `attending`, alle gasten met `guestId`, `attending`
en alleen wanneer het opgeslagen maaltijdbeleid dit vereist `mealChoice`,
optioneel `email`/`message`, en `updatedAt` als ISO-tijdstip.

### Submit

Data bevat exact de volgende velden; `email` en `message` zijn optioneel en
`tokenHash` mag uitsluitend één-op-één worden vervangen door
`accessCodeHash`:

```json
{
  "tokenHash": "43-base64url-tekens",
  "idempotencyKey": "00000000-0000-4000-8000-000000000000",
  "revision": 0,
  "attending": true,
  "guests": [
    { "guestId": "guest_1", "attending": true, "mealChoice": "vegetarian" },
    { "guestId": "guest_2", "attending": false }
  ],
  "email": "optioneel@example.nl",
  "message": "Optioneel bericht"
}
```

`revision` is de verwachte huidige revision. De eerste submit stuurt `0`; een
geldige write vergelijkt die waarde onder `ScriptLock` en slaat revision `1`
op. Top-level `attending` moet gelijk zijn aan “minstens één gast aanwezig”.
De browser stuurt geen variant of maaltijdregel. De writer haalt die opnieuw
uit de private Invitation-rij en weigert een ontbrekende dagmaaltijd of een
aanwezige avondmaaltijd voordat een intent wordt geschreven.

Succes bevat:

```json
{
  "version": "v1",
  "requestId": "worker-uuid",
  "ok": true,
  "data": {
    "revision": 1,
    "savedAt": "2026-08-29T12:00:00.000Z",
    "idempotencyKey": "00000000-0000-4000-8000-000000000000",
    "receiptNumber": "RSVP-12AB34CD56EF"
  }
}
```

Het ontvangstnummer blijft bij latere wijzigingen gelijk. Dezelfde
idempotency key plus identieke logische submitdata retourneert exact het eerder
opgeslagen resultaat, ook als de Worker-retry een nieuw requestId gebruikt.
Dezelfde key met andere data geeft `IDEMPOTENCY_CONFLICT`. Een nieuwe key met
een verouderde revision geeft `REVISION_CONFLICT`.

Een fout bevat geen message, stack of Sheet-inhoud:

```json
{
  "version": "v1",
  "requestId": "worker-uuid",
  "ok": false,
  "error": { "code": "REVISION_CONFLICT" }
}
```

Publieke codes zijn `INVITATION_INVALID`, `RSVP_CLOSED`,
`REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED` en
`WRITER_BUSY`. Apps Script `ContentService` antwoordt doorgaans met HTTP 200;
de Worker valideert de JSON-vorm en vertaalt codes naar veilige publieke
HTTP-statussen en Nederlandse meldingen.

## Veilige Resend-migratie en activering

Deze repositorywijziging maakt geen Resend-account, DNS-record, trigger,
deployment, Script Property of Pages-variabele aan. Voer eerst de volledige
route uit in een strikt gescheiden testomgeving en laat diff, tests en
migratiestappen beoordelen. Herhaal daarna gecontroleerd voor productie:

1. Maak of selecteer een organisatie-eigendom Resend-account en kies de
   beschikbare EU-verzendroute/regio. Die regio bepaalt de verzendroute en is
   **geen garantie voor EU-dataresidentie**: accountgegevens, berichtinhoud en
   providerlogs kunnen volgens de provider in de Verenigde Staten worden
   verwerkt of bewaard. Leg eigenaarschap, hersteltoegang en minimale
   beheerders vast; gebruik geen persoonlijk wegwerpaccount.
2. Beoordeel en sluit de toepasselijke verwerkersovereenkomst/DPA en de
   doorgiftegrondslag/SCC's. Documenteer Resend als verwerker, datacategorieën,
   EU-route, feitelijke opslaglocaties, subverwerkers en bewaartermijnen.
   Controleer vóór activering dat de actuele providerretentie (op het gratis
   plan momenteel 30 dagen) de publieke verwijderbelofte uiterlijk 1 augustus
   2027 niet kan overschrijden en leg ook het verwijderen van providerlogs en
   exports in de retentiecheck vast. Activeer niet als die voorwaarde niet
   aantoonbaar klopt. Zet open-, click- en overige tracking uit voordat een
   echte ontvanger wordt gebruikt.
3. Voeg in Resend alleen het bedoelde verzenddomein of een afzonderlijk
   verzendsubdomein toe. Neem de DNS-records **letter voor letter en op dat
   moment** over uit het Resend-dashboard; verzin geen host, type, prioriteit of
   waarde uit dit document.
4. Voeg die Resend-records in TransIP toe, maar vervang of verwijder geen
   bestaand rootrecord. De vier GitHub Pages-A-records, het `www`-CNAME, de
   inkomende TransIP-MX, het bestaande SPF-record, de TransIP-DKIM-records en
   `_dmarc` blijven intact. Stop bij een SPF-conflict: er mag op één host niet
   ongemerkt een tweede SPF-record ontstaan. Wijzig DNSSEC of nameservers niet.
5. Wacht tot Resend alle vereiste records als geverifieerd toont en controleer
   vanaf een onafhankelijke DNS-check dat website én inkomende TransIP-mail nog
   werken. Stuur nog geen RSVP-mail.
6. Maak per omgeving een nieuwe API-key met uitsluitend verzendrecht en, als
   Resend dat aanbiedt, beperking tot het exacte verzenddomein. Zet de
   productiekey alleen als `RESEND_API_KEY` in de productie-Script Properties;
   toon of kopieer haar nooit naar Git, Sheet, Pages, Cloudflare, screenshots of
   testconfiguratie.
7. Stop tijdelijk nieuwe RSVP-writes, maak een afgeschermde Sheetbackup,
   inspecteer en herstel eerst iedere pending `Idempotency`-intent. Kopieer de
   beoordeelde nieuwe writercode en manifest. Voer vervolgens `initSheet()` één
   keer handmatig uit: dit voegt de ontbrekende `EmailOutbox` plus exacte headers
   toe zonder bestaande RSVP-rijen te verwijderen. Controleer headers,
   rijenaantallen, revisions en ontvangstnummers vóór writes worden hervat.
8. Autoriseer uitsluitend de in het manifest gevraagde scopes, waaronder
   `script.external_request`, maak een nieuwe Apps Script-versie en werk de
   bestaande web-appdeployment expliciet naar die versie bij. De Worker-URL,
   Workerconfiguratie en het publieke contract blijven ongewijzigd.
9. Laat `CONFIRMATION_EMAIL_ENABLED=false`. Zet een beoordeeld
   `CONFIRMATION_EMAIL_ACTIVATED_AT` in de toekomst als volledig ISO-8601-
   tijdstip met expliciete zone, bijvoorbeeld `2026-09-15T20:00:00+02:00`
   (intern wordt dit naar UTC genormaliseerd), configureer de testkey en
   maak één installable time-driven trigger die
   `processConfirmationEmailOutbox()` iedere minuut uitvoert. Installeer geen
   automatische trigger voor `recoverAllPendingIntents()`.
10. Zet uitsluitend in de geïsoleerde testomgeving, pas op of na de gekozen
    synthetische cutoff, tijdelijk `CONFIRMATION_EMAIL_ENABLED=true`. Test met
    synthetische dag- en avondhuishoudens: zonder adres,
    eerste submit met adres, wijziging, stabiel ontvangstnummer, identieke retry
    binnen Resends 24-uurs-idempotencyvenster, providerafwijzing, tijdelijke
    fout, een onzekere uitkomst met veilige retry en overgang naar
    `manual_review` na een expliciet conflict of het 24-uursvenster. Controleer
    één mail per logische submit, geen mail voor
    pre-cutoff submits, privacyarme inhoud, uitgeschakelde tracking en dat RSVP
    zelf bij een mailfout opgeslagen blijft. Zet daarna de testflag weer op
    `false` en schakel de testtrigger uit voordat productie wordt voorbereid.
11. Herhaal stappen 1–10 afzonderlijk voor productie. Kies daarna een toekomstig
    productietijdstip, zet `CONFIRMATION_EMAIL_ACTIVATED_AT` exact op die cutoff
    en pas pas op/na dat tijdstip `CONFIRMATION_EMAIL_ENABLED=true` toe. Controleer
    de eerste synthetische productiemail en de outbox voordat echte adressen
    worden gebruikt.
12. Zet als laatste de openbare GitHub Actions-repositoryvariabele
    `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=true` en publiceer een beoordeelde
    Pages-build. Deze publieke vlag verandert alleen de websitetekst en is niet
    technisch aan de backendflag gekoppeld; zij activeert geen backendmail.
    Coördineer beide waarden handmatig en houd rekening met een tijdelijk
    mismatchvenster tijdens deployment. Iedere andere publieke waarde houdt de
    geen-mailbelofte zichtbaar.

### Mailrollback

Bij afwijkende afzenderauthenticatie, privacy-inhoud, dubbele mail of
providerstoring:

1. zet backend-side `CONFIRMATION_EMAIL_ENABLED=false` en schakel de
   `processConfirmationEmailOutbox()`-trigger uit; RSVP-resolve en -submit mogen
   blijven werken en blijven het ontvangstnummer op het scherm tonen;
2. zet `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=false` en publiceer de beoordeelde
   Pages-fallback zodat de site geen mail belooft;
3. laat `queued`, `sending`, `retry` en `manual_review`-items staan, inspecteer
   ze onder beperkte toegang en verstuur onzekere items niet blind opnieuw;
4. trek bij mogelijk sleutelmisbruik de Resend-key in en maak later een nieuwe
   domeinbeperkte sending-only key; zet nooit een oude key terug;
5. herstel code alleen met een nieuwe beoordeelde Apps Script-versie. Verwijder
   tijdens een incident geen RSVP- of outboxdata en draai geen Sheetrevision
   terug;
6. verwijder DNS-records niet als snelle rollback. Doe dit alleen bij definitief
   uitfaseren, aan de hand van de dan actuele Resend-records en na een aparte
   controle dat website en inkomende TransIP-mail onaangetast blijven.

## Test- en productiedeployment

Richt eerst test volledig in en herhaal de stappen pas daarna voor productie:

1. Meld aan bij het vooraf afgesproken Google-eigenaaraccount en maak een lege Sheet.
2. Controleer onder **Delen** dat de eigenaar klopt, **Algemene toegang** op
   **Beperkt** staat en geen ongewenste personen of groepen toegang hebben.
3. Maak een apart standalone Apps Script-project onder hetzelfde account.
   Kopieer `Code.gs` en `appsscript.json` naar het project.
4. Vul omgevingsspecifieke Script Properties in. Hergebruik geen testsecret,
   Sheet of deployment in productie.
5. Voer `initSheet()` handmatig uit, autoriseer alleen de gevraagde scopes en
   controleer alle tabs en exacte headers, inclusief `EmailOutbox`.
6. Provision testhuishoudens en gasten. Sla alleen de juiste keyed hash op;
   nooit de ruwe token of huishoudcode. Vul variant en booleanbeleid exact in,
   controleer dat ieder huishouden hooguit `maxGuests` vooraf ingestelde
   `GuestDetails`-rijen heeft en voer voor iedere credential een geldige resolve
   uit voordat je hem verspreidt.
7. Kies **Implementeren -> Nieuwe implementatie -> Web-app**, uitvoeren als
   **ikzelf**, toegang **iedereen**. De Sheet zelf blijft Beperkt.
8. Bewaar de `/exec`-URL alleen in de overeenkomstige Worker-secret/config.
   Gebruik nooit een `/dev`-URL in productie.
9. Laat bevestigingsmail standaard uit. Volg voor mail afzonderlijk de
   [Resend-migratie](#veilige-resend-migratie-en-activering); een gewone
   writerdeployment activeert geen mail.
10. Voer de volledige testmatrix uit. Maak daarna voor productie een nieuwe
   Sheet, Apps Script-project, deployment en eigen secrets.
11. Controleer vóór activatie nogmaals dat de productie-Sheet daadwerkelijk
    eigendom is van het afgesproken Google-eigenaaraccount. Maak in de agenda van die
    eigenaar een verplichte herinnering voor de definitieve verwijderprocedure,
    ruim vóór en uiterlijk op **1 augustus 2027 00:00 Europe/Amsterdam**.

Test daarnaast handmatig het herstelpad: laat uitsluitend in de testomgeving
een request na de durable intent mislukken, controleer `status=pending`, voer
`recoverAllPendingIntents()` uit en verifieer precies één Response, één Audit,
alle gastrevisions, de stabiele receipt en `status=completed`. Activeer geen
productie-Worker zolang een pending of ongeldige intent resteert.

Test de outbox afzonderlijk met een installable time-driven trigger van exact
één minuut. Eén trigger is genoeg; dubbele triggers vergroten het risico op
quota- en concurrencyproblemen. Controleer na inrichting onder **Triggers** dat
alleen de bedoelde eigenaar, functie en frequentie staan ingesteld.

Bij codewijzigingen maak je een nieuwe Apps Script-versie en werk je de
bestaande deployment expliciet bij. Controleer daarna URL, eigenaar,
properties en de end-to-end flow opnieuw. Secretrotatie gebeurt gecoördineerd
aan writer- en Workerzijde.

Voer vóór overdracht lokaal de Node-mocktests uit; hiervoor zijn geen externe
packages of Google-rechten nodig:

```powershell
node rsvp/apps-script/test.mjs
```

De test laadt `Code.gs` in een geïsoleerde VM met Apps Script-/Sheet-mocks en
controleert onder meer signing, replay, resolve, revision 0→1, preset gasten,
meal choices, echte Sheets-tekstprefix/formule-readback, stabiele receipts,
idempotente recovery en de bevestigde Sheet-clear. Foutinjectie dekt de intentflush,
Response, een breuk midden in de gastlus, Audit, Invitation-metadata,
Invitation-commitpointer, completionmateriaal en completionstatus.

## Backend-stop en rollback

`VITE_RSVP_ENABLED=false` of het verbergen van de site-UI is alleen een
presentatiestop. Een bestaande client of directe request kan de Workerroute
dan nog steeds bereiken. Een echte write-stop gebeurt backend-side:

1. Zet `RSVP_CLOSE_AT` op een tijdstip in het verleden. Nieuwe writes krijgen
   dan `RSVP_CLOSED`; reeds vóór de stop duurzaam geaccepteerde pending intents
   mogen vóór de retentiedeadline nog herstellen.
2. Inspecteer `Idempotency` en voer zo nodig `recoverAllPendingIntents()` uit.
   Verifieer daarna dat er geen pending intent resteert en dat iedere voltooide
   write precies één Audit heeft.
3. Verwijder of deactiveer daarna de publieke Workerroute/deployment. Alleen
   een frontendvlag wijzigen is niet voldoende.
4. Verifieer vanaf een niet-ingelogde client dat de route geen resolve of
   submit meer accepteert. Registreer tijdstip en uitvoerder zonder RSVP-data.

Alleen mail stoppen vereist geen RSVP-write-stop: volg daarvoor
[Mailrollback](#mailrollback). De backendmailflag en outboxtrigger zijn de echte
mailstop; de openbare Pages-vlag past alleen de tekst aan.

## Retentie, Sheet-clear en definitieve verwijdering

Actieve RSVP-detaildata wordt uiterlijk **1 augustus 2027 00:00
Europe/Amsterdam** definitief verwijderd. Vanaf dat tijdstip weigert de writer
ook herstel van pending intents: de privacydeadline is de harde bovengrens.
Er wordt bewust geen automatische delete-trigger, Drive-scope of externe
delete-actie aangemaakt. De eventuele éénminuuttrigger verwerkt uitsluitend de
`EmailOutbox` en verwijdert geen data.

`clearRsvpSheetDataWithConfirmation()` gebruikt `clearContent()`. Dat maakt de
actieve tabbladen leeg, maar is **geen definitieve verwijdering**: Google
Sheets-versiegeschiedenis en de Drive-prullenbak kunnen oudere data behouden.
De clear is uitsluitend defense-in-depth en een controleerbare tussenstap.

Voer de definitieve productieprocedure met het afgesproken
Google-eigenaaraccount ruim vóór en uiterlijk op de deadline uit:

1. Voer de backend-stop hierboven uit: `RSVP_CLOSE_AT` in het verleden, zet
   `CONFIRMATION_EMAIL_ENABLED=false`, schakel de éénminuuttrigger uit, herstel
   en controleer alle pending intents vóór de deadline, en verwijder/deactiveer
   daarna de Workerroute. Wacht daarna langer dan zowel de fetchtimeout als de
   claimlease (minimaal 61 seconden), controleer Apps Script Executions en
   bevestig dat `EmailOutbox` geen `sending`-item of actieve uitvoering bevat.
   De clearfunctie weigert fail-closed zolang de mailflag `true` is of een
   `sending`-item bestaat. Bevestig ten slotte dat nieuwe requests gesloten zijn.
2. Voer `previewRsvpSheetClear()` uit. Controleer environment, Spreadsheet ID,
   `permanentDeleteBy` en aantallen per tab.
3. Zet tijdelijk Script Property `RSVP_SHEET_CLEAR_CONFIRMATION` op exact de
   geretourneerde `confirmationValue` en voer
   `clearRsvpSheetDataWithConfirmation()` uit.
4. Lees alle tabs terug, inclusief `EmailOutbox`: alleen headers mogen
   resteren. Controleer dat ook
   alle `intentJson`, intent-/completion-MACs en overige hersteldata weg zijn.
   De functie registreert `LAST_RSVP_SHEET_CLEAR_AT`, maar retourneert bewust
   `permanentDeletionCompleted: false`.
5. Verwijder de **volledige productie-Sheet** als eigenaar uit Google Drive en
   verwijder haar vervolgens vóór/uiterlijk de deadline permanent uit de
   Prullenbak. Alleen “naar Prullenbak” is niet genoeg.
6. Verifieer readback: de oude Sheet-URL/ID mag niet meer openen en Apps Script
   `openById` mag de file niet meer kunnen lezen. Verwijder vervolgens het
   productie-Apps-Scriptdeployment/project en de bijbehorende Worker-secrets
   als die niet meer nodig zijn.
7. Registreer in een beperkt operationeel log zonder gastdata: eigenaar,
   uitvoerder, `LAST_RSVP_SHEET_CLEAR_AT`, tijdstip van permanente verwijdering
   en de geslaagde ontoegankelijkheidscontrole. Vink de kalenderherinnering af.

De productie-Sheet-clear is in code geblokkeerd tot de dag na de bruiloft. In
de testomgeving mag zij eerder worden uitgevoerd. Oefen clear én het definitief
verwijderen van een uitsluitend fictieve test-Sheet; zet die test-Sheet daarna
niet opnieuw als productiebron in.

## Verplichte testmatrix

1. Geldige resolve via zowel `tokenHash` als `accessCodeHash` geeft alleen het
   juiste huishouden, variant, maaltijdbeleid en vooraf ingestelde gastnamen
   terug; geen/beide hashes of een ongeldige/inactieve hash geeft
   `INVITATION_INVALID`.
   Een huishouden met meer preset gasten dan `maxGuests` faalt al bij resolve
   als writer-configuratiefout en levert geen RSVP-formulier op. Revision `0`
   faalt ook bij een verdwaalde Response of vooraf ingevulde gastkeuze.
2. Geldige eerste submit met expected revision `0` schrijft revision `1`, één
   Response, actuele GuestDetails, minimale Audit en Idempotency.
3. Exacte idempotente retry met nieuw requestId levert exact dezelfde data en
   hetzelfde `receiptNumber` zonder extra mutatie.
4. Zelfde idempotency key met andere data geeft `IDEMPOTENCY_CONFLICT`; nieuwe
   key met stale revision geeft `REVISION_CONFLICT`.
5. Ongeldige HMAC, gewijzigde payload, afwijkend payload-requestId, verlopen
   timestamp en hergebruikt requestId worden geweigerd.
6. Submit met ontbrekende, dubbele of onbekende guestId wordt geweigerd. Namen,
   `phone`, `dietaryRequirements` en andere onbekende velden worden geweigerd.
7. Bij `day` vereist aanwezig één geldige mealChoice; bij `evening` is zij ook
   bij aanwezigheid verboden/leeg. Afwezig mag nooit een mealChoice hebben.
   Top-level attending en aantal aanwezigen moeten kloppen met de gastkeuzes en
   `maxGuests`.
8. E-mail en bericht werken zowel afwezig als aanwezig. Met mail uit ontstaat
   geen verzendbare bevestiging; met mail aan ontstaat voor een post-cutoff
   submit met e-mailadres exact één duurzaam outboxitem. Resolve faalt bij
   afwijkende `guestCount`, ongeldige `submittedAt`, ongeldige e-mail of te
   lange/ongeldige opgeslagen tekst.
9. Waarden beginnend met `=`, `+`, `-`, `@` of een letterlijke apostrof
   round-trippen exact als logische tekst; `getFormulas()` blijft leeg.
10. Injecteer een fout na iedere durable grens (intent, Response,
    GuestDetails, Audit, Invitation-`updatedAt`, Invitation-revision,
    completionmateriaal en status) en midden in de gastlus. Retry/resolve en
    handmatig herstel leveren exact één revision/receipt/Audit en volledige
    doelstaat. Bewijs ook dat een nieuw intentbeleid aan de private
    Invitation-rij is gebonden en dat een legacy intent zonder policy alleen
    als `day`/maaltijd-verplicht kan herstellen.
11. Test dezelfde key met gewijzigde payload voor zowel pending als completed,
    een nieuwe key terwijl een intent pending is, recovery na close/inactivatie,
    een exacte en conflicterende bestaande Audit, MAC-tampering, onverwachte
    doelrij en een oude intent naast een nieuwere revision. Alles behalve de
    exacte herstelroute faalt gesloten zonder rollback.
    Test daarnaast dat pending recovery op/na `RETENTION_DELETE_BY_` zowel via
    request als beheerfunctie wordt geweigerd zonder domeinwrite.
12. Twee gelijktijdige submits met dezelfde expected revision leveren hooguit
    één revisionverhoging op.
13. Logs en Audit bevatten geen credential(hash), naam, e-mail, bericht of
    maaltijdkeuze.
14. Test de stabiele Resend-idempotencykey en het 24-uursvenster, eerste submit
    en wijziging, Resend-succes, tijdelijke of onzekere fout, begrensde retry
    met dezelfde sleutel, expliciet providerconflict en overgang naar
    `manual_review` na 24 uur. Bewijs dat een exacte submitretry nooit een
    tweede mail maakt, dat een mailfout de duurzame RSVP niet terugdraait en dat
    mail/logs geen code, token, keuzes of bericht bevatten.
15. Test de Sheet-clear-preview, verkeerde confirmation (geen wijziging),
    juiste testconfirmation (alle datarijen weg, headers behouden,
    `permanentDeletionCompleted=false`) en de productie-datumblokkade. Oefen
    daarnaast handmatig de volledige file-delete plus permanent verwijderen
    uit Prullenbak met een fictieve test-Sheet.
16. Test `migrateInvitationSchemaV1ToV2()` met een pending intent (geen enkele
    wijziging), een geldige legacyrij (alle waarden behouden plus
    `day`/`TRUE`) en een tweede aanroep (`migrated: false`).
