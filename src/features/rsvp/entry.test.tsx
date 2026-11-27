import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import HouseholdCodeEntry from '../../components/HouseholdCodeEntry';
import RsvpUnavailable from '../../components/RsvpUnavailable';
import NameSearchEntry from '../../components/NameSearchEntry';

test('de code-invoer toont persoonlijke code en XXX-XXX zonder uitleg over langere codes', () => {
  const html = renderToStaticMarkup(<HouseholdCodeEntry onAccepted={() => {}} />);
  assert.match(html, /Persoonlijke code/u);
  assert.match(html, /placeholder="XXX-XXX"/u);
  assert.doesNotMatch(html, /huishoudcode|langere code|binnenkort/iu);
});

test('een lokale voorvertoning zonder configuratie verwijst eerlijk naar de live RSVP', () => {
  const html = renderToStaticMarkup(<RsvpUnavailable isLocalPreview />);
  assert.match(html, /RSVP is geopend/u);
  assert.match(html, /lokale websitevoorvertoning/u);
  assert.doesNotMatch(html, /XXX-XXX|persoonlijke code/u);
  assert.match(html, /href="https:\/\/lisetteenbjarty\.nl\/#rsvp"/u);
  assert.doesNotMatch(html, /<form|<input|binnenkort/iu);
});

test('naamzoeker vraagt alleen voornaam of achternaam met toegankelijke zoekknop', () => {
  const html = renderToStaticMarkup(<NameSearchEntry config={{
    apiBaseUrl: 'https://example.test',
    turnstileSiteKey: 'test-site-key',
    householdCodesEnabled: false,
    nameLookupEnabled: true,
    confirmationEmailEnabled: false,
  }} onSelected={() => {}} />);
  assert.match(html, /Voornaam of achternaam/u);
  assert.match(html, /type="search"/u);
  assert.match(html, /role="search"/u);
  assert.match(html, /aria-live="polite"/u);
  assert.match(html, />Zoeken<|Zoeken<\/button>/u);
  assert.doesNotMatch(html, /XXX-XXX|persoonlijke code|type="password"/u);
});

test('een productiebuild zonder configuratie blijft dicht met een contactmogelijkheid', () => {
  const html = renderToStaticMarkup(<RsvpUnavailable isLocalPreview={false} />);
  assert.match(html, /RSVP is tijdelijk niet beschikbaar/u);
  assert.match(html, /href="mailto:rsvp@lisetteenbjarty\.nl"/u);
  assert.doesNotMatch(html, /<form|<input|binnenkort|RSVP is geopend|Open de live RSVP/iu);
});
