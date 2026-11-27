# RSVP starten met je naam

## Gastflow en bewuste toegangskeuze

De gast typt een voornaam of familienaam, kiest de eigen groep en vult voor iedere
persoon aanwezigheid en, bij daggasten, vis/vlees/vega/vegan in. Ook zoeken op de
naam van een ander groepslid leidt naar dezelfde groep. Later wijzigen gaat via
dezelfde naamzoeker. Er is geen zichtbare code, account of e-mailverificatie.

Dit is bewust laagdrempelige toegang, **geen identiteitscontrole**. Iemand die een
gastnaam kent kan passende groepen vinden en hun RSVP bekijken of wijzigen,
inclusief eventueel ingevuld e-mailadres en bericht. Deel daarom geen gevoelige
informatie in het vrije bericht. De beheer-Sheet blijft privé. De vaste lijst
met namen, groepsindeling en dag-/avondtype staat op verzoek openbaar in Git en
de websitebundle en is volledig downloadbaar. Turnstile en serverlimieten
beperken geautomatiseerde toegang tot antwoorden; zij maken een naam niet tot
een wachtwoord.

De gast zoekt lokaal in `src/content/rsvpRoster.json`, zonder zoek-API of
beveiligingscontrole tijdens het typen. Vanaf twee letters verschijnen maximaal
acht passende groepen; bij meer resultaten vraagt de interface om een specifiekere
naam. Dit maximum dient het overzicht, niet de geheimhouding. Hoofdletters en
accenten maken niet uit. Na keuze gaat alleen de publieke groeps-ID als
`publicGroupId` in het POST-verzoek naar de Worker. Openen en opslaan behouden
Turnstile, servervalidatie en de bestaande Google-opslag. De server controleert
de actieve groep en groepsleden; de publieke lijst verleent geen beheertoegang.
De selectie blijft in tabgeheugen, nooit in de URL of browseropslag, en vereist
geen zichtbaar of verlopen selectieticket. Bij gelijktijdige wijzigingen vraagt
het formulier expliciet om de nieuw opgeslagen versie te laden.

## Eén bronrij is één groep

**Namen aanpassen:** bewerk `src/content/rsvpRoster.json`. Dit is de bron voor
zowel de zichtbare keuzelijst als de export naar Google. Het bestand heeft
`version: 1` en een lijst `groups`. Per groep:

- `householdId`: vaste unieke ID, niet afgeleid van een naam;
- `guests`: één item per persoon met vaste `guestId` en `firstName`;
- `familyNames`: lijst van familie-/achternamen die bij de groep horen;
- `invitationVariant`: `day` of `evening` voor de hele groep.

Familienamen zijn **groepsaliassen**. We wijzen niet op basis van volgorde of
een aanname een achternaam aan een persoon toe. Een familienaam maakt de groep
vindbaar; de maaltijdkeuze blijft gekoppeld aan de afzonderlijke persoons-ID.
Ontbrekende achternamen mogen leeg blijven: zoeken op voornaam blijft mogelijk.
Neem alleen bevestigde groepen op. Onzekere groepen en reviewopmerkingen blijven
in het private bronbestand; ze horen niet in deze publieke lijst. Identieke
groepslabels worden geweigerd in plaats van samengevoegd.

Zet nooit codes, tokens, e-mailadressen, antwoorden, berichten, adressen of
beheernotities in de publieke lijst. Bewaar die en importbestanden buiten Git.
De lokale map `.local/rsvp/` is expliciet genegeerd en wordt niet meegebouwd.
Maak zelf een afgeschermde back-up; Git bewaart deze private bestanden niet.
De ontwikkelserver luistert alleen op deze computer en blokkeert `.local/` en
`output/` expliciet; alleen `.gitignore` zou deze bestanden niet tegen HTTP-
toegang beschermen. Zet deze directories nooit onder `public/`.

### Importbestand voorbereiden

Gebruik Node.js 22. De helper valideert de vaste publieke lijst en schrijft één
nieuw tabgescheiden plakbestand met één persoon per rij. Hij voegt voor deze
bevestigde groepen `searchEnabled=TRUE` en een lege reviewopmerking toe,
overschrijft niets en logt alleen aantallen:

```powershell
npm run prepare:rsvp-static-roster -- --out ".local/rsvp/GuestRoster-public-v1.txt"
```

Gebruik een nieuwe uitvoernaam bij een volgende versie. De kopregel is exact:

```text
householdId	guestId	firstName	familyNames	invitationVariant	searchEnabled	reviewNote
```

In de private Sheet gaat dit uitsluitend naar **GuestRoster**, niet rechtstreeks
naar `Invitations`, `GuestDetails`, `Responses` of `NameDirectory`. Houd kolom F
als echte booleans of de tekst `TRUE`/`FALSE`. Familienamen blijven dezelfde
komma-gescheiden groepsaliassen op iedere persoonsrij van een groep.

De publieke eerste versie bevat 32 bevestigde groepen/53 personen. De overige
4 groepen/5 personen uit de aangeleverde versie blijven privé in review. Voeg
ze pas toe als persoon, dag-/avondtype en eventueel onderscheid zijn bevestigd.
De oude `prepare:rsvp-roster`-helper blijft beschikbaar voor private reviewlijsten.

## Bestaande gegevens en latere aanvullingen

Voor de eerste import: vergelijk met bestaande productie-uitnodigingen en
reacties. Nieuwe bron-IDs zijn alleen voorstellen. Als er al een echte groep
bestaat, neem haar bestaande `householdId` en persoons-IDs over; maak geen tweede
groep met nieuwe IDs. Match nooit automatisch uitsluitend op een naam.

Nieuwe groepen kunnen later met nieuwe, blijvende IDs worden toegevoegd. Na
wijzigingen: exporteer de publieke bron opnieuw, plak in `GuestRoster`, draai
`previewGuestRosterImport()` en voer de bestaande gecontroleerde import uit
vóór publicatie van de aangepaste website. Alleen de website wijzigen maakt
nieuwe groepen nog niet geldig voor opslag. `GuestRoster` is bij deze variant
de importtussenstap; wijzigingen daar veranderen de vaste websitekeuzelijst niet.
Een ongewijzigde herimport is een no-op. Weglaten uit de nieuwe lijst verwijdert
geen bestaande groepen of reacties. Uit de publieke lijst verwijderen trekt
toegang niet in: zet ook de betreffende `NameDirectory.active` op `false`.
Een oude websiteversie kan de publieke ID immers nog bevatten. Een ingetrokkene wordt niet stilzwijgend
gereactiveerd. Een al gepubliceerde groep in review zetten vereist eerst een
bewuste uitschakeling, zodat een typefout geen RSVP onbedoeld onbereikbaar maakt.

Voor- en familienamen/zoekaliassen mogen later worden aangevuld of gecorrigeerd,
ook na een reactie, zolang de groeps-/persoons-IDs, het gasttype en de capaciteit
gelijk blijven. De import wijzigt dan alleen namen/zoekvelden, niet de antwoorden,
revisies, ontvangstnummers of bestaande mails.

De import weigert bij een al beantwoorde groep wijzigingen in groepsleden,
gasttype of capaciteit. Daarvoor is een aparte, vooraf beoordeelde datamigratie
nodig, zodat bestaande antwoorden niet ongeldig worden. Vul groepen bij voorkeur
volledig aan vóór hun eerste reactie; nieuwe aparte groepen kunnen wel later
worden toegevoegd.

## Exacte productiestappen — eerst beoordelen, niet automatisch uitvoeren

1. Beoordeel de code-diff, controles en de naam-only toegangskeuze. Maak een
   afgeschermde back-up van de productie-Sheet en bewaar de vorige Apps Script-
   en Worker-versies plus huidige featureflags en `RSVP_CLOSE_AT` voor rollback.
2. Zorg voor een korte beheerperiode. Zet Worker `NAME_LOOKUP_ENABLED=false`;
   zet dezelfde Script Property op `false`, pauzeer `CONFIRMATION_EMAIL_ENABLED`
   (bewaar de eerdere instelling) en zet `RSVP_CLOSE_AT` tijdelijk op een
   expliciet tijdstip in het verleden. Herstel eventuele pending writes volgens
   het bestaande Apps Script-runbook. Frontend verbergen alleen stopt writes niet.
3. Werk het bestaande Apps Script-project bij met de beoordeelde `Code.gs`.
   Voer `initNameLookupSheets()` uit: dit maakt alleen `GuestRoster` en
   `NameDirectory` aan en behoudt bestaande gegevens. Er zijn geen nieuwe OAuth-
   scopes, DNS-records of mailaccounts nodig.
4. Controleer de bron-IDs tegen productie. Plak het private importbestand in
   `GuestRoster`, inclusief kopregel, en controleer de reviewrijen en booleans.
   Voer `previewGuestRosterImport()` uit en beoordeel de aantallen/wijzigingen.
5. Voer pas daarna `importGuestRoster()` uit. De functie weigert open writes,
   onherstelde transacties en onveilige aanpassingen. Bij een gedeeltelijke fout:
   laat alles gesloten, verander de staginglijst niet en hervat dezelfde import.
   Verwijder nooit handmatig de checkpoint-property om een fout te omzeilen.
6. Publiceer een nieuwe versie van het bestaande Apps Script-webapp-deployment.
   Deploy daarna de beoordeelde Worker naar het bestaande productie-endpoint,
   aanvankelijk met `NAME_LOOKUP_ENABLED=false`. Gebruik de bestaande secrets
   en controleer dat de versie `publicGroupId` ondersteunt. Roteer geen
   secrets en wijzig geen bestaande codes als onderdeel van deze omschakeling.
7. Controleer de geïmporteerde rijen, activeer Script Property
   `NAME_LOOKUP_ENABLED=true`, herstel de bewaarde RSVP-deadline en mailinstelling en zet daarna
   Worker `NAME_LOOKUP_ENABLED=true`. De normale sluiting is na 10 april 2027
   (gebruik het bestaande expliciete `RSVP_CLOSE_AT`, niet een gegokte tijdzone).
8. Zet GitHub Actions-repositoryvariabele `VITE_RSVP_NAME_LOOKUP_ENABLED=true`.
   Behoud de bestaande werkende `VITE_RSVP_ENABLED`, API-URL, sitekey en mailvlag.
   Merge/publiceer de beoordeelde frontend. Naamzoeken heeft voorrang op de
   oudere code-invoer; bestaande backendcodes hoeven niet ingetrokken te worden.
9. Voer met een herkenbare fictieve productiegroep de afgesproken smokecheck
   uit: zoeken op voornaam/achternaam/accentloze variant, selecteren, dag/avond,
   eerste reactie, bevestigingsmail, opnieuw zoeken en aanpassen. Controleer
   dat dezelfde groep/ontvangstnummer wordt bijgewerkt en geen tweede reactie
   ontstaat. Verifieer geen naam, antwoord of selectie in URL/logs en geen
   antwoorden of credentials in Git. Namen staan bewust in de publieke lijst.
   Gebruik hiervoor geen echte gast en stuur geen ongevraagde mail.

De gewijzigde mailtemplate vertelt bij naamgebaseerde reacties hoe je opnieuw op
naam zoekt. Bestaande uitgaande berichten met de oude template blijven intact;
pas hun inhoud/MACs niet handmatig aan. Zie het bijgewerkte
[Apps Script-runbook](apps-script/README.md) voor de import- en maildetails.

### Rollback

Zet eerst Worker en Apps Script `NAME_LOOKUP_ENABLED=false`, zodat publieke
groeps-IDs en bestaande naamtickets geen toegang meer geven. Zet daarna de frontendnaamvlag uit en
publiceer opnieuw. De oude codeflow werkt alleen voor groepen die echt een
bestaande code hebben; nieuw geïmporteerde naam-only groepen hebben die niet en
moeten tijdelijk contact opnemen. Trek geen oude codes in en verwijder geen
antwoord-, import- of directoryrijen om terug te schakelen. Voor herstel van
gegevens gebruik je de back-up en een apart beoordeeld herstelplan.
