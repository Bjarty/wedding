import assert from 'node:assert/strict';
import test from 'node:test';
import { siteContent } from '../../content/siteContent';
import {
  getEmailConfirmationNote,
  getPrivacyMessage,
  getReceiptHelperText,
} from './confirmationEmailCopy';

const { rsvp } = siteContent;

test('belooft alleen in de geactiveerde live-ervaring een bevestigingsmail', () => {
  const enabled = getEmailConfirmationNote(rsvp, {
    confirmationEmailEnabled: true,
    demo: false,
  });
  assert.match(enabled, /bevestigingsnummer ook automatisch naar dit adres/u);
  assert.match(enabled, /huishoudcode of persoonlijke uitnodigingslink/u);
  assert.match(enabled, /tot en met 10 april 2027/u);

  const disabled = getEmailConfirmationNote(rsvp, {
    confirmationEmailEnabled: false,
    demo: false,
  });
  assert.match(disabled, /nog geen automatische bevestigingsmail/u);

  const demo = getEmailConfirmationNote(rsvp, {
    confirmationEmailEnabled: true,
    demo: true,
  });
  assert.match(demo, /lokale demonstratie/u);
  assert.match(demo, /geen e-mail verstuurd/u);
  assert.match(demo, /alleen tijdelijk in dit tabblad/u);
  assert.doesNotMatch(demo, /10 april 2027/u);
  assert.doesNotMatch(demo, /persoonlijke uitnodigingslink/u);
});

test('legt onder het bevestigingsnummer de mailkeuze en echte aanpassingsroute uit', () => {
  const withEmail = getReceiptHelperText(rsvp, {
    confirmationEmailEnabled: true,
    demo: false,
    email: 'gast@example.nl',
  });
  assert.match(withEmail, /ditzelfde bevestigingsnummer ook naar het hierboven ingevulde e-mailadres/u);
  assert.match(withEmail, /dezelfde huishoudcode of persoonlijke uitnodigingslink/u);
  assert.match(withEmail, /tot en met 10 april 2027/u);

  const withoutEmail = getReceiptHelperText(rsvp, {
    confirmationEmailEnabled: true,
    demo: false,
    email: '   ',
  });
  assert.match(withoutEmail, /Zonder e-mailadres sturen we geen bevestigingsmail/u);
  assert.doesNotMatch(withoutEmail, /naar dat adres/u);

  const disabled = getReceiptHelperText(rsvp, {
    confirmationEmailEnabled: false,
    demo: false,
    email: 'gast@example.nl',
  });
  assert.match(disabled, /nog geen automatische bevestigingsmail/u);
  assert.doesNotMatch(disabled, /naar dat adres/u);

  for (const copy of [withEmail, withoutEmail, disabled]) {
    assert.doesNotMatch(copy, /met (?:dit|het) bevestigingsnummer .*aanpassen/iu);
  }
});

test('de demonstratie belooft nooit mail of live toegang', () => {
  const demo = getReceiptHelperText(rsvp, {
    confirmationEmailEnabled: true,
    demo: true,
    email: 'gast@example.nl',
  });
  assert.match(demo, /lokale demonstratie/u);
  assert.match(demo, /geen e-mail verstuurd/u);
  assert.doesNotMatch(demo, /naar dat adres/u);
  assert.doesNotMatch(demo, /persoonlijke uitnodigingslink/u);
});

test('privacyteksten onderscheiden live verzending van lokale demodata', () => {
  assert.match(rsvp.form.privacyMessage, /uit je RSVP alleen je e-mailadres en bevestigingsnummer/u);
  assert.match(rsvp.form.privacyMessage, /Aanwezigheid, maaltijdkeuzes en je vrije bericht worden niet meegestuurd/u);
  assert.match(rsvp.form.privacyMessage, /verzendmetadata, het onderwerp en de inhoud/u);

  assert.match(rsvp.form.privacyEmailDisabledMessage, /nog geen automatische bevestigingsmail/u);
  assert.match(rsvp.form.privacyEmailDisabledMessage, /niet met een maildienst gedeeld/u);
  assert.doesNotMatch(rsvp.form.privacyEmailDisabledMessage, /verzendmetadata/u);

  assert.match(rsvp.form.demoPrivacyMessage, /alleen tijdelijk in dit tabblad/u);
  assert.match(rsvp.form.demoPrivacyMessage, /niet naar Google Sheets of een maildienst/u);
  assert.match(rsvp.form.demoPrivacyMessage, /geen e-mail verstuurd/u);

  assert.equal(getPrivacyMessage(rsvp, {
    confirmationEmailEnabled: true,
    demo: false,
  }), rsvp.form.privacyMessage);
  assert.equal(getPrivacyMessage(rsvp, {
    confirmationEmailEnabled: false,
    demo: false,
  }), rsvp.form.privacyEmailDisabledMessage);
  assert.equal(getPrivacyMessage(rsvp, {
    confirmationEmailEnabled: true,
    demo: true,
  }), rsvp.form.demoPrivacyMessage);
});
