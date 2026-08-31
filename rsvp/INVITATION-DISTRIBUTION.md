# Uitnodigingen met één gedeelde QR en persoonlijke codes

## Definitief model

Gebruik op alle fysieke uitnodigingen dezelfde QR-code. Deze verwijst exact
naar:

```text
https://lisetteenbjarty.nl/#rsvp
```

De QR bevat geen naam, gasttype, code of ander geheim. Iedere uitnodiging krijgt
daarnaast als gewone tekst één unieke code van vier groepen van vijf tekens.
De gast scant de QR, voert de code in en ziet daarna alleen het vooraf
ingerichte huishouden:

- `day`: welkom vanaf 14.30 uur en een maaltijdkeuze per aanwezige gast;
- `evening`: welkom vanaf 20.00 uur en geen maaltijdvraag.

De private Sheet is leidend. De QR, URL en browser mogen de variant of
maaltijdregel niet bepalen.

## Een code veilig genereren

Vereist: Node.js 22 en dezelfde `ACCESS_CODE_HASH_SECRET` van exact 64
base64url-tekens als de bijbehorende Worker-omgeving. Gebruik voor test en
productie verschillende secrets. Haal het secret lokaal op via een beveiligde,
niet-gelogde methode en maak het alleen tijdelijk beschikbaar als
`ACCESS_CODE_HASH_SECRET`; zet de waarde nooit in een commando, document,
chatbericht, screenshot of repositorybestand.

Genereer dit secret één keer per omgeving, bewaar het in de afgesproken
passwordmanager/secretkluis en configureer dezelfde waarde als encrypted
Worker-secret. Cloudflare toont een opgeslagen secret later niet opnieuw. Bij
verlies of rotatie veranderen alle codehashes en moeten alle nog actieve codes
opnieuw worden gegenereerd en uitgegeven.

Kies vooraf twee nog niet bestaande doelbestanden in een bestaande beveiligde
map **buiten de repository**:

- `--sheet-out`: hash en metadata voor de private RSVP-Sheet;
- `--delivery-out`: de leesbare code voor de fysieke uitnodiging/mail merge.

Voorbeeld met uitsluitend placeholders:

```powershell
$env:ACCESS_CODE_HASH_SECRET = Read-Host -MaskInput 'Access-code hashsecret uit de secretkluis'
try {
  npm run provision:household-code -- `
    --household-id hh_familie_voorbeeld `
    --display-name "Familie Voorbeeld" `
    --invitation-variant day `
    --max-guests 2 `
    --sheet-out "C:\beveiligd\rsvp\hh_familie_voorbeeld-sheet.json" `
    --delivery-out "C:\beveiligd\rsvp\hh_familie_voorbeeld-uitgifte.json"
} finally {
  Remove-Item Env:ACCESS_CODE_HASH_SECRET -ErrorAction SilentlyContinue
}
```

De doelmap moet al bestaan. De helper:

- gebruikt cryptografische willekeur en het alfabet zonder `0`, `1`, `I`, `L`,
  `O` en `U`;
- weigert de publieke lokale demo-code;
- berekent de domeingescheiden keyed hash;
- schrijft met exclusieve bestandscreatie en overschrijft nooit een bestand;
- schrijft de leesbare code niet naar stdout;
- weigert ieder uitvoerpad binnen de repository.

Verwijder `ACCESS_CODE_HASH_SECRET` direct na de run uit de lokale
procesomgeving. Genereer bij heruitgifte een nieuwe code en trek de oude hash
in; geef een oude code nooit opnieuw uit.

## Twee strikt gescheiden outputs

Het `sheet-out`-bestand bevat metadata zonder leesbare code. Neem uit dit
bestand alleen de velden voor de `Invitations`-rij over; `schemaVersion` is
metadata en geen Sheet-kolom. Het bestand bevat onder meer:

- `householdId`;
- lege `tokenHash` en de 43 tekens lange `accessCodeHash`;
- `displayName`, `invitationVariant`, `mealChoiceRequired` en `maxGuests`;
- `active=true`, `currentRevision=0`, `createdAt` en `updatedAt`.

Het `delivery-out`-bestand bevat de gedeelde RSVP-URL én de leesbare code. Dit
is het enige bestand dat voor het personaliseren van drukwerk wordt gebruikt.
Bewaar het versleuteld en beperkt toegankelijk buiten Git, cloud-sync,
Google Sheets, CI, tickets en chat. Als een drukker of mail merge tijdelijk een
Excel-/CSV-bestand vereist, maak dat lokaal uit de uitgiftebestanden, deel
uitsluitend via een afgesproken beveiligd kanaal en verwijder de tijdelijke
kopieën na controle en druk.

Een leesbare code of `ACCESS_CODE_HASH_SECRET` komt nooit in de RSVP-Sheet. Een
codehash komt juist alleen in de private Sheet en is niet geschikt voor het
drukwerk.

## Huishouden en namen beheren

Initialiseer eerst de private Sheet met `initSheet()` volgens
[`apps-script/README.md`](./apps-script/README.md). Beheer daarna:

| Tab/veld | Wat verschijnt of wordt afgedwongen |
| --- | --- |
| `Invitations.displayName` | Huishoudnaam boven het formulier |
| `Invitations.invitationVariant` | Exact `day` of `evening` |
| `Invitations.mealChoiceRequired` | Echte `TRUE` bij `day`, echte `FALSE` bij `evening` |
| `Invitations.maxGuests` | Maximaal aantal aanwezigen; minstens het aantal vooraf ingestelde gasten |
| `Invitations.active` | `FALSE` trekt de code onmiddellijk backend-side in |
| `Invitations.accessCodeHash` | Hash uit het private `sheet-out`-bestand; nooit de leesbare code |
| `GuestDetails.displayName` | Persoonsnaam die na geldige code-invoer verschijnt |
| `GuestDetails.guestId` | Stabiele, unieke ID; nooit aan de browser laten kiezen |

Maak per huishouden exact één `Invitations`-rij en één `GuestDetails`-rij per
uitgenodigde persoon. Nieuwe gastregels starten met `revision=0`; `attending`,
`mealChoice` en `updatedAt` blijven leeg. `Responses`, `Idempotency`, `Audit` en
`EmailOutbox` worden niet handmatig gevuld.

Richt namen, variant, maaltijdbeleid en capaciteit in vóór verspreiding en vóór
de eerste reactie. Wijzig `householdId`, `guestId`, credentialhashes of revision
nooit bij een bestaand antwoord. Stop bij een noodzakelijke latere
beleids-/gastenwijziging eerst backend-writes, herstel pending intents en volg
een apart beoordeelde datamigratie; handmatig wisselen tussen dag en avond kan
een bestaande reactie bewust fail-closed maken.

Publieke formulierteksten staan niet in de Sheet:

- variantlabels en aankomstteksten: `src/content/siteContent.ts`, onder
  `rsvp.form.dayVariantLabel`, `dayArrivalMessage`, `eveningVariantLabel` en
  `eveningArrivalMessage`;
- algemene planning, locatie en overige site-inhoud: eveneens
  `src/content/siteContent.ts`.

De volledige publieke dagplanning zit in de statische sitebundle en is dus niet
geheim voor technisch onderzoek. De Sheet bepaalt wel welke RSVP-vragen en
aankomstmelding de normale gastflow toont.

## Eerste reactie en later wijzigen

Bij iedere code-invoer doet de site opnieuw een server-side resolve. Bestaat al
een reactie, dan retourneert de writer de actuele `revision`, keuzes en het
stabiele ontvangstnummer. Het formulier wordt daarmee opnieuw gevuld. Een
wijziging gebruikt dezelfde persoonlijke code, een nieuwe idempotency key en
de actuele revision; na opslag wordt de revision precies één hoger terwijl het
ontvangstnummer gelijk blijft.

Als een e-mailadres is ingevuld én bevestigingsmail backend-side en op Pages
afzonderlijk is geactiveerd, zet de Apps Script-writer na duurzame opslag een
privacyarme bevestiging in `EmailOutbox`. Die mail bevat hetzelfde stabiele
ontvangstnummer en geen code, token, gastkeuzes of vrij bericht. Het
ontvangstnummer is geen wijzigingscredential: voor iedere latere wijziging blijft
de persoonlijke huishoudcode nodig. Een mailfout maakt de opgeslagen RSVP niet
ongedaan; het nummer blijft direct op het scherm staan.

De code wordt niet permanent in de browser opgeslagen. Na sluiten of herladen
voert de gast haar opnieuw in. Een verouderd gelijktijdig formulier krijgt
`REVISION_CONFLICT` en moet eerst opnieuw resolven; zo overschrijft een oude
pagina geen nieuwere reactie.

## Drukwerkcontrole

- Gebruik één QR-afbeelding en zet er ook `lisetteenbjarty.nl` plus “Gebruik
  daarna jullie persoonlijke code” bij.
- Encodeer de persoonlijke code niet in de QR.
- Personaliseer alleen de gedrukte coderegel vanuit het private
  uitgiftebestand.
- Controleer vóór alle druk: één fictieve dagcode, één fictieve avondcode,
  meerdere telefoons, matig licht en handmatige invoer zonder camera.
- Provision de zichtbare lokale Familie Garcia-demo-code nooit extern.

## Production-only activering

Er is geen externe testomgeving meer. Draai de lokale mock- en contracttests en
gebruik daarna één herkenbaar synthetisch smokehuishouden in productie: resolve
via de gedeelde QR, eerste submit, opnieuw openen met dezelfde code, een
wijziging en de verwachte rijen in `Responses`, `GuestDetails`, `Idempotency`,
`Audit` en `EmailOutbox`. Bevestig dat nergens een leesbare code of secret staat
en dat iedere logische submit hooguit één mail oplevert. Trek de smokecredential
daarna in en verwijder de synthetische persoonsgegevens gecontroleerd.

De productieketen bestaat uit:

1. nieuwe private productie-Sheet en nieuw Apps Script-project/deployment;
2. nieuwe productie-Worker en Turnstile-widget;
3. nieuwe `WRITER_HMAC_SECRET`, `INVITATION_TOKEN_HASH_SECRET` en
   `ACCESS_CODE_HASH_SECRET`;
4. vier nieuwe rate-limit namespaces: global, client, resolve en submit;
5. productiehuishoudens en gasten uit de private provisioningoutputs;
6. Worker-var `HOUSEHOLD_CODES_ENABLED=true` pas nadat writer, schema en data
   zijn gecontroleerd;
7. upload en deploy eerst de beoordeelde Worker-versie zonder publieke route;
   koppel daarna expliciet één beoordeeld HTTPS-endpoint volgens het
   [productierunbook](./worker/README.md#fail-closed-productieactivering). Gebruik
   aanvankelijk bij voorkeur het productie-`workers.dev`-endpoint zodat TransIP-
   DNS en mailrecords niet wijzigen;
8. één productie-Resend-inrichting volgens de
   [veilige mailmigratie](./apps-script/README.md#veilige-resend-migratie-en-activering),
   met EU-verzendroute (niet verwarren met dataresidentie), tracking uit,
   DPA/SCC-, VS-verwerking- en retentiebeoordeling, beperkte API-key,
   uitsluitend de exacte DNS-records uit het Resend-dashboard en behoud van
   alle bestaande GitHub Pages- en TransIP-mailrecords;
9. backendmail vanaf een expliciete cutoff met
   `CONFIRMATION_EMAIL_ENABLED=true`; de beoordeelde Pages-workflow zet
   `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=true` expliciet;
10. GitHub Actions-repositoryvariabelen
   `VITE_RSVP_ENABLED=true`,
   `VITE_RSVP_HOUSEHOLD_CODES_ENABLED=true`,
   `VITE_RSVP_API_BASE_URL` en `VITE_TURNSTILE_SITE_KEY`;
11. een beoordeelde Pages-build en de bovengenoemde productie-smokecheck vóór
    echte uitnodigingsdata.

De Worker- en frontendvlag zijn twee aparte veiligheidsgrenzen. Alleen de
frontend verbergen stopt een bestaande client niet; gebruik voor een echte
stop het backend-stoprunbook in
[`apps-script/README.md`](./apps-script/README.md#backend-stop-en-rollback).

Laat iedere wijziging aan productie voorafgaan door een code-diff,
testresultaten, backup en exact beoordeelde externe stappen.
