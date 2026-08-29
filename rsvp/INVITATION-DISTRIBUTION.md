# Uitnodigingen met één gedeelde QR-code

## Aanbevolen model

Gebruik één gedeelde QR-code op alle uitnodigingen. Deze verwijst uitsluitend
naar `https://lisetteenbjarty.nl/#rsvp` en bevat geen naam, gasttype of geheim.
Print daarnaast op iedere uitnodiging één unieke, hoofdletterongevoelige code
per huishouden, bijvoorbeeld `7K3M-P9TW-X4HC-Q2RD`.

Na het scannen voert de gast die code in. De backend zoekt het huishouden op en
geeft uitsluitend de vooraf ingestelde namen en uitnodigingsvariant terug. De
variant staat in de private Sheet en is bijvoorbeeld:

- `day`: het volledige programma en een maaltijdkeuze per aanwezige gast;
- `evening`: alleen de avondinformatie en geen maaltijdkeuze.

De website mag de variant nooit uit de QR-code, URL of formulierinvoer
vertrouwen. Ook wanneer iemand de avond-URL verandert in een dag-URL, bepaalt
de backend nog steeds welke informatie en vragen bij het huishouden horen.

## Waarom één QR-code plus een persoonlijke code

- Er hoeven maar één QR-afbeelding en één algemene uitleg te worden gedrukt.
- Namen zijn niet openbaar doorzoekbaar en hoeven niet in een URL te staan.
- Een code kan per huishouden worden ingetrokken of vervangen.
- Eén huishouden behoudt dezelfde code voor een latere wijziging van de RSVP.
- Dag- en avondrechten blijven centraal en server-side beheerd.

Een tweede gedeelde QR-code voor avondgasten is optioneel. Deze mag alleen een
andere introductietekst openen, bijvoorbeeld `#rsvp/avond`; na invoer van de
persoonlijke code wint altijd de server-side uitnodigingsvariant. Twee QR-codes
geven dus gemak, geen extra toegangsrecht.

Volledig gedeelde QR-codes zonder een persoonlijke code kunnen huishoudens niet
veilig onderscheiden. Een zoekfunctie op naam, e-mailadres of postcode wordt
niet gebruikt: die gegevens zijn te raden, kunnen dubbele resultaten geven en
maken het mogelijk de gastenlijst te onderzoeken.

## Praktisch drukwerk

- Maak één definitieve QR-afbeelding van de stabiele site-URL en gebruik die in
  iedere drukwerkvariant.
- Voeg de persoonlijke code als gewone tekst toe via mail merge. Zo blijven er
  één QR-bestand en hoogstens twee kaarttemplates over, terwijl iedere kaart wel
  veilig aan een huishouden is gekoppeld.
- Zet onder de QR ook de korte site-URL en de tekst “Gebruik daarna jullie
  persoonlijke code”, zodat een gast ook zonder werkende camera verder kan.
- Encodeer de huishoudcode niet in de gedeelde QR; dan zou alsnog voor ieder
  huishouden een andere QR nodig zijn.
- Test één gedrukte proef op meerdere telefoons en bij matig licht voordat alle
  uitnodigingen worden besteld.

## Minimale beveiliging

- Genereer codes offline uit minimaal 80 bits cryptografische willekeur en
  formatteer ze als vier groepen van vier Crockford-Base32-tekens.
- Bewaar in de Sheet alleen een keyed hash onder een afzonderlijk secret; nooit
  de leesbare code.
- Bewaar de koppeling tussen huishouden en leesbare code uitsluitend in een
  versleuteld distributiebestand buiten Git, Sheets, CI, chat en logs.
- Verstuur de code nooit in een queryparameter. De gast voert hem na het scannen
  handmatig in; de browser houdt hem alleen zo lang als nodig in geheugen.
- Gebruik Turnstile, limieten per keyed codefingerprint, per tijdelijke client-
  of netwerksleutel en voor het endpoint als geheel. Vertrouw niet uitsluitend
  op een IP-adres. Gebruik daarnaast een langere tijdelijke blokkade na
  herhaalde fouten en één generieke foutmelding voor onbekende, ingetrokken of
  verkeerd getypte codes.
- Log geen code, codehash, naam of uitnodigingsvariant.
- Maak codes intrekbaar en geef een vervangen code nooit opnieuw uit.

## Gegevensmodel

Breid `Invitations` in een volgende, afzonderlijke migratie uit met:

| Veld | Betekenis |
| --- | --- |
| `accessCodeHash` | Keyed hash van de persoonlijke code |
| `invitationVariant` | Exact `day` of `evening` |
| `mealChoiceRequired` | Boolean, normaal `TRUE` voor dag en `FALSE` voor avond |
| `active` | Bestaande intrekbare status |
| `currentRevision` | Bestaande revisie voor conflictbeveiliging |

De backend retourneert de variant en toegestane velden pas na een geldige
code. Bij submit controleert de backend of writer opnieuw de opgeslagen variant;
een clientwaarde mag maaltijdregels of programma nooit verruimen.

De huidige site bevat het volledige dagprogramma nog in de publieke
JavaScriptbundle. Verschillende RSVP-vragen kunnen veilig per variant worden
afgedwongen, maar het dagprogramma is daarmee nog niet geheim voor avondgasten.
Als dat programma afgeschermd moet worden, moet de backend na authenticatie ook
de toegestane programmatekst leveren en mag de afgeschermde tekst niet statisch
in de repository of bundle staan.

## UX-stroom

1. Gast scant de gedeelde QR-code.
2. De site vraagt: “Vul de code van jullie uitnodiging in.”
3. Na Turnstile en servercontrole verschijnen uitsluitend de juiste namen.
4. Daggasten zien het volledige programma en maaltijdkeuzes.
5. Avondgasten zien hun eigen aanvangstijd en krijgen geen maaltijdvraag.
6. Na opslag verschijnt hetzelfde stabiele ontvangstnummer als in de huidige
   RSVP-foundation; met dezelfde code kan de reactie later worden gewijzigd.

Maak de code geschikt voor plakken, verwijder spaties en streepjes alleen voor
normalisatie en toon een duidelijke `O/0`- en `I/1`-vrije voorbeeldcode. Laat de
site nooit bevestigen dat een gedeeltelijk ingevoerde code of naam bestaat.

## Gefaseerde invoering

1. Behoud de huidige persoonlijke fragmentlinks als werkende en geteste basis.
2. Voeg schema, provisioning en tests eerst toe aan een nieuwe private
   test-Sheet; wijzig de bestaande testdata niet handmatig.
3. Voeg aparte resolve- en submitondersteuning voor toegangscodes toe achter een
   standaard uitgeschakelde featureflag.
4. Test minimaal dag, avond, verkeerde QR-hint, ingetrokken code, typefout,
   brute-forcebegrenzing, retry, conflict, revisiewijziging en heruitgifte.
5. Maak daarna pas een versleuteld mail-mergebestand met echte namen en codes.
6. Activeer productie pas na beoordeling van de gedrukte proef, backendregels,
   privacytekst, rate limits en herstelprocedure.

Deze wijziging hoort in een aparte implementatie-PR. De huidige foundation
blijft ondertussen fail-closed en gebruikt alleen de al geteste persoonlijke
fragmenttokens.
