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

De automatische mail is in productie actief. De Apps Script-writer zet een
bevestiging pas na een duurzame RSVP-write in een eigen `EmailOutbox` en
verstuurt haar via Resend HTTPS met afzender en antwoordadres
`rsvp@lisetteenbjarty.nl`. De Cloudflare Worker en het publieke
submitcontract blijven daarbij ongewijzigd. De mail bevat geen persoonlijke
huishoudcode, ruwe uitnodigingstoken of volledige RSVP-keuzes. Het
ontvangstnummer is alleen een referentie en nooit een credential om een reactie
te bekijken of wijzigen; daarvoor blijft dezelfde persoonlijke huishoudcode
nodig.

De concrete generatie-, Sheet- en distributiewerkwijze staat in
[`INVITATION-DISTRIBUTION.md`](./INVITATION-DISTRIBUTION.md). De backend blijft
apart uitzetbaar. De Pages-workflow zet de bevestigingsmailtekst expliciet aan
omdat de productie-outbox en Resend-route end-to-end zijn gecontroleerd.

## Production-only beheer

Er is geen externe RSVP-testomgeving meer. Gewone unit-, contract- en
securitytests draaien lokaal met mocks en raken Cloudflare, Apps Script,
Google Sheets of Resend niet. Nieuwe end-to-end controles gebruiken uitsluitend
een herkenbaar synthetisch smokehuishouden in productie, na een private backup
en vóór het provisionen van echte huishoudens.

1. Voer lokaal `npm ci`, `npm run check` en `npm run build` uit en controleer
   `dist/CNAME`.
2. Controleer productie-eigenaar, Sheet-ID, Apps Script-deployment, Worker,
   Turnstile-hostname, sluitingsdatum en de vijf server-side secrets zonder
   waarden te loggen of te kopiëren.
3. Provision één synthetisch daghuishouden, controleer resolve, eerste submit,
   wijziging, revision, stabiel ontvangstnummer, Sheetrijen en precies één
   afgeleverde bevestigingsmail. Trek de code daarna in en verwijder de
   synthetische persoonsgegevens volgens het runbook.
4. Controleer dat Sheet, outbox, browser en logs geen leesbare huishoudcode,
   uitnodigingstoken of secret bevatten.
5. Beheer de vier openbare productievariabelen onder **GitHub → Settings →
   Secrets and variables → Actions → Variables**:
   `VITE_RSVP_ENABLED=true`, `VITE_RSVP_HOUSEHOLD_CODES_ENABLED=true`,
   `VITE_RSVP_API_BASE_URL` en `VITE_TURNSTILE_SITE_KEY`. De beoordeelde
   Pages-workflow zet de bevestigingsmailtekst expliciet aan.
6. Bouw en beoordeel de productie-artifact voordat een wijziging naar `main`
   gaat.

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
