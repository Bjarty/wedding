# RSVP met huishoudcodes

Deze map bevat de fail-closed RSVP-keten. De aanbevolen uitnodigingsstroom
gebruikt één gedeelde QR en één persoonlijke code per huishouden; bestaande
persoonlijke fragmentlinks blijven tijdens de overgang ondersteund.

```text
gedeelde QR -> #rsvp -> persoonlijke code (alleen in browsergeheugen)
legacy fragmentlink -----------------------------|
                                                  v
GitHub Pages -> Cloudflare Worker -> gesigneerde Apps Script-writer -> private Google Sheet
                                                              |
                                                              v
                                                   duurzame EmailOutbox -> Resend
```

De browser spreekt nooit rechtstreeks met Google Apps Script. Een leesbare
huishoudcode of ruwe legacy-token staat niet in een queryparameter, permanente
browseropslag of Google Sheet. De Worker valideert Turnstile, invoer,
rate-limits, herhaalde verzendingen en revisies en stuurt alleen een keyed hash
naar de writer.

## Functies

- Eén gedeelde QR naar `https://lisetteenbjarty.nl/#rsvp`, plus een unieke
  persoonlijke code per huishouden met vooraf ingestelde namen.
- Aanwezigheid per persoon.
- Voor iedere aanwezige daggast één keuze: vis, vlees, vega of vegan;
  avondgasten krijgen geen maaltijdvraag.
- Optioneel e-mailadres voor praktische informatie en, na afzonderlijke
  activering, een automatisch ontvangstbericht.
- Optioneel bericht en bewust geen telefoonnummer.
- Een stabiel ontvangstnummer na bevestigde opslag.
- Een privacyarm ontvangstbericht met hetzelfde stabiele ontvangstnummer.
- Verwijdering van RSVP-detailgegevens uiterlijk 1 augustus 2027.

De automatische mail staat standaard uit. De Apps Script-writer zet een
bevestiging pas na een duurzame RSVP-write in een eigen `EmailOutbox` en
verstuurt haar via Resend HTTPS met afzender en antwoordadres
`rsvp@lisetteenbjarty.nl`. De Cloudflare Worker en het publieke
submitcontract blijven daarbij ongewijzigd. De mail bevat geen persoonlijke
huishoudcode, ruwe uitnodigingstoken of volledige RSVP-keuzes. Het
ontvangstnummer is alleen een referentie en nooit een credential om een reactie
te bekijken of wijzigen; daarvoor blijft dezelfde persoonlijke huishoudcode
nodig.

De concrete generatie-, Sheet- en distributiewerkwijze staat in
[`INVITATION-DISTRIBUTION.md`](./INVITATION-DISTRIBUTION.md). De code in Git
activeert niets vanzelf; zowel backend als Pages blijven achter afzonderlijke
featureflags staan.

## Veilige activeringsvolgorde

1. Beoordeel en merge alleen de lokale foundation en de tests.
2. Maak onder het vooraf afgesproken Google-eigenaaraccount een aparte private test-Sheet en
   een aparte Apps Script-testdeployment volgens
   [`apps-script/README.md`](apps-script/README.md).
3. Maak een Cloudflare-test-Worker en Turnstile-widget volgens
   [`worker/README.md`](worker/README.md). Maak daarbij expliciet een
   test-only `workers.dev`-preview-URL of reviewed testroute: de ingecheckte
   configuratie staat bewust op `workers_dev = false` en is dus niet direct
   bereikbaar. Gebruik eigen rate-limit namespace-ID's en andere secrets dan
   in productie.
4. Test fictieve dag- én avondhuishoudens volledig via de gedeelde QR en een
   echte, uitsluitend voor test gegenereerde code: eerste reactie, opnieuw
   openen met dezelfde code, wijziging, alle maaltijdregels, afmelding,
   optionele velden, retry, conflict, ingetrokken en ongeldige code. Doe de
   browsertest lokaal vanaf exact `http://localhost:3000` met Cloudflares
   officiële testkeys en uitsluitend de aparte test-Worker, testwriter en
   test-Sheet; wijzig hiervoor geen live Pages-variabelen.
5. Richt voor uitsluitend de testomgeving een afzonderlijke Resend-inrichting
   in volgens het
   [Apps Script-runbook](./apps-script/README.md#veilige-resend-migratie-en-activering),
   laat tracking uit en test de duurzame outbox met fictieve adressen.
6. Controleer handmatig dat Sheet, outbox en logs geen ruwe tokens, secrets of
   onnodige persoonsgegevens bevatten.
7. Maak daarna pas afzonderlijke productie-Sheet, Apps Script-deployment,
   Worker, Turnstile-widget, rate-limit namespaces en secrets. Provision de
   echte huishoudens uitsluitend in die private productie-Sheet.
8. Zet pas na een geslaagde productiecontrole de openbare
   repositoryvariabelen onder **GitHub → Settings → Secrets and variables →
   Actions → Variables**: `VITE_RSVP_ENABLED=true`,
   `VITE_RSVP_HOUSEHOLD_CODES_ENABLED=true`, `VITE_RSVP_API_BASE_URL` en
   `VITE_TURNSTILE_SITE_KEY`. Zet
   `VITE_RSVP_CONFIRMATION_EMAIL_ENABLED=true` pas nadat de writerflag, het
   activeringstijdstip en de echte mailroute end-to-end zijn gecontroleerd. De
   build-job leest geen variabelen die alleen in de `github-pages`-environment
   staan.
9. Bouw en beoordeel de productie-artifact voordat de configuratiewijziging
   naar `main` gaat.

Zonder `VITE_RSVP_ENABLED=true` én beide endpointwaarden blijft “RSVP opent
binnenkort” zichtbaar. Zonder `VITE_RSVP_HOUSEHOLD_CODES_ENABLED=true` blijft
de code-invoer verborgen. Beide zijn uitsluitend UI-/presentatiestops;
een bestaande client kan de Workerroute nog steeds rechtstreeks aanroepen.
Voor een echte write-stop volg je eerst het
[Apps Script-runbook](./apps-script/README.md#backend-stop-en-rollback): zet
`RSVP_CLOSE_AT` in het verleden, inspecteer/herstel pending intents vóór de
retentiedeadline en deactiveer of verwijder daarna de Workerroute/deployment.
Zet pas vervolgens de enabled-vlag op `false` en bouw Pages opnieuw. Deze
stappen verwijderen opgeslagen Sheetgegevens niet; daarvoor geldt de aparte
definitieve retentieprocedure in hetzelfde runbook.

Voor de RSVP-API hoeft de bestaande TransIP-DNS niet te worden aangepast. Voor
Resend worden uitsluitend de actuele, domeinspecifieke verificatie- en
verzendrecords uit het Resend-dashboard toegevoegd. Vervang daarbij nooit de
bestaande rootrecords voor website of inkomende mail: A, `www`-CNAME, MX, SPF,
TransIP-DKIM en DMARC blijven staan. Beslis apart of de API ooit een eigen
Cloudflare-domein krijgt; een Worker-URL kan zonder nameservermigratie worden
gebruikt.
