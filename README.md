# Lisette & Bjarty

De broncode voor `lisetteenbjarty.nl`. De statische React-site wordt vanaf
`main` met GitHub Pages gepubliceerd. De live RSVP-keten gebruikt de
productie-Worker, Apps Script-writer en private productie-Sheet.

## Lokaal werken

Vereist: Node.js 22.

```sh
npm ci
npm run dev
```

Voer voor iedere overdracht uit:

```sh
npm run check
npm run build
```

`dist/CNAME` moet na de build exact `lisetteenbjarty.nl` bevatten.

## Lokale uitnodigingsdrukproef

Start de ontwikkelserver en open daarna de lokale drukproef:

```text
http://localhost:3000/?preview=invitation
```

De voor- en achterzijde gebruiken de actuele sitegegevens en één gedeelde QR
naar `https://lisetteenbjarty.nl/#rsvp`. Via **Test RSVP** opent een lokale
Familie Garcia-demonstratie. De zichtbare voorbeeldcode werkt alleen wanneer
Vite in ontwikkelmodus draait; reacties blijven in tabgeheugen en raken geen
Worker, Apps Script of Google Sheet. De code is synthetisch en mag nooit in een
externe omgeving worden geprovisioned.

## RSVP-configuratie

Zonder lokale RSVP-configuratie toont de websitevoorvertoning **RSVP is
geopend**, met een link naar de live RSVP. Daar kunnen gasten hun persoonlijke
code (`XXX-XXX`) invullen. Echte reacties worden alleen via de livewebsite
verstuurd; lokaal wordt niet automatisch een demonstratie gestart.

Kopieer `.env.example` alleen voor expliciet geconfigureerd lokaal ontwikkelen
naar `.env.local`. Gebruik geen verwijderde test-Worker of test-Sheet:

```text
VITE_RSVP_ENABLED=false
VITE_RSVP_HOUSEHOLD_CODES_ENABLED=false
VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=false
VITE_RSVP_API_BASE_URL=https://...
VITE_TURNSTILE_SITE_KEY=...
```

Een actieve RSVP-build vereist `VITE_RSVP_ENABLED=true` én beide publieke
endpointwaarden. Voor de invoer van persoonlijke codes moet ook
`VITE_RSVP_HOUSEHOLD_CODES_ENABLED=true` zijn ingesteld. Bij ontbrekende
configuratie in een productiebuild blijft het formulier veilig uit en verschijnt
**RSVP is tijdelijk niet beschikbaar**, met een contactlink.
Alleen de productievariabelen lokaal invullen is niet voldoende: de
productie-Worker en Turnstile accepteren uitsluitend `lisetteenbjarty.nl`,
niet localhost. Verruim deze beveiliging niet voor een lokale voorvertoning.
De openbare bevestigingsmailvlag past alleen de tekst bij het optionele
e-mailadres aan; zij activeert geen backendmail.
Een Turnstile-sitekey en API-URL zijn openbaar; writer-URL's, HMAC-sleutels,
Turnstile-secrets en uitnodigingstoken-secrets horen nooit in een `VITE_`
variabele of in Git. De `RESEND_API_KEY` hoort uitsluitend in Apps Script
Script Properties en nooit in Pages, Cloudflare, de Sheet of Git.

Voor Pages leest de build vier waarden als repositoryvariabelen onder
**Settings → Secrets and variables → Actions → Variables**. Ze komen bewust
niet uit secrets of alleen uit de `github-pages`-environment:
`VITE_RSVP_ENABLED`, `VITE_RSVP_HOUSEHOLD_CODES_ENABLED`,
`VITE_RSVP_API_BASE_URL` en `VITE_TURNSTILE_SITE_KEY`. De beoordeelde
Pages-workflow zet `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=true` expliciet omdat
de productie-outbox en Resend-route end-to-end zijn gecontroleerd.

De serveronderdelen en handmatige inrichtingsstappen staan in
[`rsvp/worker`](rsvp/worker) en [`rsvp/apps-script`](rsvp/apps-script).
De werkwijze voor één gedeelde QR, persoonlijke codes en het beheren van
huishoud- en gastgegevens staat in
[`rsvp/INVITATION-DISTRIBUTION.md`](rsvp/INVITATION-DISTRIBUTION.md).
De duurzame bevestigingsmail via Apps Script `EmailOutbox` en Resend, inclusief
DNS-behoud, privacyvoorwaarden, activeringscutoff en rollback, staat in het
[Apps Script-runbook](rsvp/apps-script/README.md#veilige-resend-migratie-en-activering).

## Publiceren

Pull requests worden eerst gebouwd. Een merge naar `main` maakt daarna een
GitHub Pages-artifact en publiceert dat via de ingestelde Pages-omgeving. Voer
`npm run deploy` niet handmatig uit; de bestaande `gh-pages`-branch blijft
onaangeraakt.
