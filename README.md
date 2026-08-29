# Lisette & Bjarty

De broncode voor `lisetteenbjarty.nl`. De statische React-site wordt vanaf
`main` met GitHub Pages gepubliceerd. De RSVP-integratie is standaard
uitgeschakeld en wordt pas zichtbaar wanneer de publieke frontendconfiguratie
voor de geteste API is ingevuld.

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
test- of productieomgeving worden geprovisioned.

## RSVP-configuratie

Kopieer `.env.example` naar `.env.local` en vul uitsluitend de publieke
waarden in wanneer de testomgeving gereed is:

```text
VITE_RSVP_ENABLED=false
VITE_RSVP_HOUSEHOLD_CODES_ENABLED=false
VITE_RSVP_API_BASE_URL=https://...
VITE_TURNSTILE_SITE_KEY=...
```

Zet `VITE_RSVP_ENABLED` en `VITE_RSVP_HOUSEHOLD_CODES_ENABLED` uitsluitend voor
een goedgekeurde lokale test of productieactivering exact op `true`. Zonder de
eerste vlag én beide endpointwaarden blijft “RSVP opent binnenkort” staan;
zonder de tweede vlag verschijnt geen invoer voor huishoudcodes.
Een Turnstile-sitekey en API-URL zijn openbaar; writer-URL's, HMAC-sleutels,
Turnstile-secrets en uitnodigingstoken-secrets horen nooit in een `VITE_`
variabele of in Git.

Voor Pages leest de build deze vier waarden als repositoryvariabelen onder
**Settings → Secrets and variables → Actions → Variables**. Ze komen bewust
niet uit secrets of alleen uit de `github-pages`-environment. Stel ze pas in
nadat de afzonderlijke testomgeving end-to-end is goedgekeurd.

De serveronderdelen en handmatige inrichtingsstappen staan in
[`rsvp/worker`](rsvp/worker) en [`rsvp/apps-script`](rsvp/apps-script).
De werkwijze voor één gedeelde QR, persoonlijke codes en het beheren van
huishoud- en gastgegevens staat in
[`rsvp/INVITATION-DISTRIBUTION.md`](rsvp/INVITATION-DISTRIBUTION.md).

## Publiceren

Pull requests worden eerst gebouwd. Een merge naar `main` maakt daarna een
GitHub Pages-artifact en publiceert dat via de ingestelde Pages-omgeving. Voer
`npm run deploy` niet handmatig uit; de bestaande `gh-pages`-branch blijft
onaangeraakt.
