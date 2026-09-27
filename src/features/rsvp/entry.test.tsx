import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import HouseholdCodeEntry from '../../components/HouseholdCodeEntry';
import RsvpUnavailable from '../../components/RsvpUnavailable';

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
  assert.match(html, /XXX-XXX/u);
  assert.match(html, /href="https:\/\/lisetteenbjarty\.nl\/#rsvp"/u);
  assert.doesNotMatch(html, /<form|<input|binnenkort/iu);
});

test('een productiebuild zonder configuratie blijft dicht met een contactmogelijkheid', () => {
  const html = renderToStaticMarkup(<RsvpUnavailable isLocalPreview={false} />);
  assert.match(html, /RSVP is tijdelijk niet beschikbaar/u);
  assert.match(html, /href="mailto:rsvp@lisetteenbjarty\.nl"/u);
  assert.doesNotMatch(html, /<form|<input|binnenkort|RSVP is geopend|Open de live RSVP/iu);
});
