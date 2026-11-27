# RSVP starten met je naam

## Gastflow en bewuste toegangskeuze

De gast typt een voornaam of familienaam, kiest de eigen groep en vult voor iedere
persoon aanwezigheid en, bij daggasten, vis/vlees/vega/vegan in. Ook zoeken op de
naam van een ander groepslid leidt naar dezelfde groep. Later wijzigen gaat via
dezelfde naamzoeker. Er is geen zichtbare code, account of e-mailverificatie.

Dit is bewust laagdrempelige toegang, **geen identiteitscontrole**. Iemand die een
gastnaam kent kan passende groepen vinden en hun RSVP bekijken of wijzigen,
inclusief eventueel ingevuld e-mailadres en bericht. Deel daarom geen gevoelige
informatie in het vrije bericht. De beheer-Sheet blijft privé, maar zoekresultaten
en de naamgebaseerde gasttoegang zijn niet geheim. Turnstile en begrensde
zoekresultaten beperken misbruik; zij maken een naam niet tot een wachtwoord.

De openbare website bevat geen gastenbestand. Zoekopdrachten gaan als POST naar
de bestaande Worker. Alleen passende groepslabels worden teruggestuurd, maximaal
acht; bij meer resultaten moet de gast specifieker zoeken. Hoofdletters en accenten
maken bij het zoeken niet uit. Een gekozen resultaat draagt tijdelijk een intern
ondertekend selectiebewijs in het tabgeheugen. Dat bewijs wordt niet getoond,
opgeslagen in de URL/browseropslag of naar de Sheet doorgestuurd. Het verloopt na
een uur; opnieuw zoeken geeft toegang zonder een code te onthouden.
Als het formulier dan nog openstaat, blijven niet-opgeslagen antwoorden zichtbaar.
De gast kiest dezelfde groep opnieuw en verstuurt daarna zelf; bij een intussen
gewijzigde reactie vraagt het formulier expliciet om de opgeslagen versie te laden.

## Eén bronrij is één groep

De private bron-JSON heeft `version: 1` en een lijst `groups`. Per groep:

- `householdId`: vaste unieke ID, niet afgeleid van een naam;
- `guests`: één item per persoon met vaste `guestId` en `firstName`;
- `familyNames`: lijst van familie-/achternamen die bij de groep horen;
- `invitationVariant`: `day` of `evening` voor de hele groep;
- `searchEnabled`: expliciet `true` of `false`;
- `reviewNote`: leeg als alles bevestigd is; anders een private beheeropmerking.

Familienamen zijn **groepsaliassen**. We wijzen niet op basis van volgorde of
een aanname een achternaam aan een persoon toe. Een familienaam maakt de groep
vindbaar; de maaltijdkeuze blijft gekoppeld aan de afzonderlijke persoons-ID.
Ontbrekende achternamen mogen leeg blijven: zoeken op voornaam blijft mogelijk.
Een groep met een reviewopmerking of `searchEnabled=false` wordt niet gepubliceerd.
Identieke actieve groepslabels worden geweigerd in plaats van samengevoegd.

Bewaar echte namen en importbestanden buiten Git. De lokale map `.local/rsvp/`
is expliciet genegeerd en wordt niet meegebouwd. Maak zelf een afgeschermde back-up;
Git bewaart deze bestanden niet. Voeg ze ook niet toe aan PR-teksten of CI-logs.
Adressen zijn niet nodig voor RSVP en horen niet in deze import.
De ontwikkelserver luistert alleen op deze computer en blokkeert `.local/` en
`output/` expliciet; alleen `.gitignore` zou deze bestanden niet tegen HTTP-
toegang beschermen. Zet deze directories nooit onder `public/`.

### Importbestand voorbereiden

Gebruik Node.js 22. De helper valideert de lijst en schrijft één nieuw tabgescheiden
plakbestand met één persoon per rij. Hij overschrijft niets en logt alleen aantallen:

```powershell
npm run prepare:rsvp-roster -- --input ".local/rsvp/guest-roster-v1.json" --out ".local/rsvp/GuestRoster-v1-paste.txt"
```

Gebruik een nieuwe uitvoernaam bij een volgende versie. De kopregel is exact:

```text
householdId	guestId	firstName	familyNames	invitationVariant	searchEnabled	reviewNote
```

In de private Sheet gaat dit uitsluitend naar **GuestRoster**, niet rechtstreeks
naar `Invitations`, `GuestDetails`, `Responses` of `NameDirectory`. Houd kolom F
als echte booleans of de tekst `TRUE`/`FALSE`. Familienamen blijven dezelfde
komma-gescheiden groepsaliassen op iedere persoonsrij van een groep.

De eerste aangeleverde versie heeft 36 groepen/58 personen, waarvan
32 groepen/53 personen importeerbaar en 4 groepen/5 personen in review zijn.
De open punten staan in het private bronbestand; echte namen staan niet in dit
runbook. Los deze op door de juiste gegevens te bevestigen, de reviewopmerking
leeg te maken en `searchEnabled` aan te zetten. Verzin geen onderscheid voor
twee gelijknamige personen.

## Bestaande gegevens en latere aanvullingen

Voor de eerste import: vergelijk met bestaande productie-uitnodigingen en
reacties. Nieuwe bron-IDs zijn alleen voorstellen. Als er al een echte groep
bestaat, neem haar bestaande `householdId` en persoons-IDs over; maak geen tweede
groep met nieuwe IDs. Match nooit automatisch uitsluitend op een naam.

Nieuwe groepen kunnen later met nieuwe, blijvende IDs worden toegevoegd.
Een ongewijzigde herimport is een no-op. Weglaten uit de nieuwe lijst verwijdert
geen bestaande groepen of reacties. Een ingetrokkene wordt niet stilzwijgend
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
   aanvankelijk met `NAME_LOOKUP_ENABLED=false`. Gebruik de bestaande secrets;
   de interne naamtickets gebruiken een afzonderlijk HMAC-domein. Roteer geen
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
   ontstaat. Verifieer geen naam, query of selectiebewijs in URL/logs/Git.
   Gebruik hiervoor geen echte gast en stuur geen ongevraagde mail.

De gewijzigde mailtemplate vertelt bij naamgebaseerde reacties hoe je opnieuw op
naam zoekt. Bestaande uitgaande berichten met de oude template blijven intact;
pas hun inhoud/MACs niet handmatig aan. Zie het bijgewerkte
[Apps Script-runbook](apps-script/README.md) voor de import- en maildetails.

### Rollback

Zet eerst Worker en Apps Script `NAME_LOOKUP_ENABLED=false`, zodat reeds uitgegeven
naamtickets ook geen toegang meer geven. Zet daarna de frontendnaamvlag uit en
publiceer opnieuw. De oude codeflow werkt alleen voor groepen die echt een
bestaande code hebben; nieuw geïmporteerde naam-only groepen hebben die niet en
moeten tijdelijk contact opnemen. Trek geen oude codes in en verwijder geen
antwoord-, import- of directoryrijen om terug te schakelen. Voor herstel van
gegevens gebruik je de back-up en een apart beoordeeld herstelplan.
