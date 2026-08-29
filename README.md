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

## RSVP-configuratie

Kopieer `.env.example` naar `.env.local` en vul uitsluitend de publieke
waarden in wanneer de testomgeving gereed is:

```text
VITE_RSVP_ENABLED=false
VITE_RSVP_API_BASE_URL=https://...
VITE_TURNSTILE_SITE_KEY=...
```

Zet `VITE_RSVP_ENABLED` uitsluitend voor een goedgekeurde lokale test of
productieactivering exact op `true`. Zonder die expliciete vlag én beide andere
waarden blijft de veilige melding “RSVP opent binnenkort” staan.
Een Turnstile-sitekey en API-URL zijn openbaar; writer-URL's, HMAC-sleutels,
Turnstile-secrets en uitnodigingstoken-secrets horen nooit in een `VITE_`
variabele of in Git.

Voor Pages leest de build deze drie waarden als repositoryvariabelen onder
**Settings → Secrets and variables → Actions → Variables**. Ze komen bewust
niet uit secrets of alleen uit de `github-pages`-environment. Stel ze pas in
nadat de afzonderlijke testomgeving end-to-end is goedgekeurd.

De serveronderdelen en handmatige inrichtingsstappen staan in
[`rsvp/worker`](rsvp/worker) en [`rsvp/apps-script`](rsvp/apps-script).

## Publiceren

Pull requests worden eerst gebouwd. Een merge naar `main` maakt daarna een
GitHub Pages-artifact en publiceert dat via de ingestelde Pages-omgeving. Voer
`npm run deploy` niet handmatig uit; de bestaande `gh-pages`-branch blijft
onaangeraakt.
