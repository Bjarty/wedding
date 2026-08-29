# RSVP-foundation

Deze map bereidt versie 1 van de RSVP voor zonder de huidige site, DNS of
mailafhandeling direct te wijzigen.

```text
persoonlijke link in URL-fragment
        |
        v
GitHub Pages -> Cloudflare Worker -> gesigneerde Apps Script-writer -> private Google Sheet
```

De browser spreekt nooit rechtstreeks met Google Apps Script. De ruwe
uitnodigingstoken staat niet in een queryparameter, wordt niet in
browseropslag gezet en gaat niet naar Google Sheets. De Worker valideert
Turnstile, invoer, herhaalde verzendingen en revisies voordat een keyed hash
van de uitnodiging naar de writer gaat.

## Versie 1

- Eén persoonlijke link per huishouden met vooraf ingestelde namen.
- Aanwezigheid per persoon.
- Voor iedere aanwezige persoon één keuze: vis, vlees, vega of vegan.
- Optioneel e-mailadres voor praktische informatie over de bruiloft.
- Optioneel bericht en bewust geen telefoonnummer.
- Een stabiel ontvangstnummer na bevestigde opslag.
- Geen bevestigingsmail in deze versie.
- Verwijdering van RSVP-detailgegevens uiterlijk 1 augustus 2027.

Versie 2 kan een bevestiging versturen vanaf
`rsvp@lisetteenbjarty.nl`. Activeer dit pas nadat dit adres in het verzendende
Google-account als geverifieerd afzenderadres is ingesteld en een end-to-end
test SPF, DKIM, DMARC, antwoordadres en bezorging heeft gecontroleerd.

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
4. Test een fictief huishouden volledig: link openen, alle maaltijdkeuzes,
   afmelding, optionele velden, retry, conflict en ongeldig token. Doe de
   browsertest lokaal vanaf exact `http://localhost:3000` met Cloudflares
   officiële testkeys en uitsluitend de aparte test-Worker, testwriter en
   test-Sheet; wijzig hiervoor geen live Pages-variabelen.
5. Controleer handmatig dat Sheet en logs geen ruwe tokens, secrets of
   onnodige persoonsgegevens bevatten.
6. Maak daarna pas afzonderlijke productieresources en zet de drie openbare
   repositoryvariabelen onder **GitHub → Settings → Secrets and variables →
   Actions → Variables**: `VITE_RSVP_ENABLED=true`,
   `VITE_RSVP_API_BASE_URL` en `VITE_TURNSTILE_SITE_KEY`. De build-job leest
   geen variabelen die alleen in de `github-pages`-environment staan.
7. Bouw en beoordeel de productie-artifact voordat de configuratiewijziging
   naar `main` gaat.

Zonder de expliciete waarde `VITE_RSVP_ENABLED=true` én beide openbare
frontendvariabelen blijft de huidige melding “RSVP opent binnenkort”
zichtbaar. `VITE_RSVP_ENABLED=false` is uitsluitend een UI-/presentatiestop;
een bestaande client kan de Workerroute nog steeds rechtstreeks aanroepen.
Voor een echte write-stop volg je eerst het
[Apps Script-runbook](./apps-script/README.md#backend-stop-en-rollback): zet
`RSVP_CLOSE_AT` in het verleden, inspecteer/herstel pending intents vóór de
retentiedeadline en deactiveer of verwijder daarna de Workerroute/deployment.
Zet pas vervolgens de enabled-vlag op `false` en bouw Pages opnieuw. Deze
stappen verwijderen opgeslagen Sheetgegevens niet; daarvoor geldt de aparte
definitieve retentieprocedure in hetzelfde runbook.

Voor versie 1 hoeft de bestaande TransIP-DNS voor de website en mail niet te
worden aangepast. Beslis pas later of de API een eigen Cloudflare-domein krijgt;
een test- of productie-Worker-URL kan eerst zonder nameservermigratie worden
gebruikt.
