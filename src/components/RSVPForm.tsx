import { useLayoutEffect, useState } from 'react';
import { siteContent } from '../content/siteContent';
import { invitationDemoServices } from '../features/rsvp/demoRsvp';
import RsvpExperience from '../features/rsvp/RsvpExperience';
import { getRsvpConfig } from '../features/rsvp/config';
import {
  readInviteToken,
  removeInviteFragment,
  shouldRemoveInviteFragment,
} from '../features/rsvp/inviteToken';
import HouseholdCodeEntry from './HouseholdCodeEntry';
import RsvpUnavailable from './RsvpUnavailable';

const rsvpConfig = getRsvpConfig();
const invitationDemoConfig = {
  apiBaseUrl: 'https://local-demo.invalid',
  turnstileSiteKey: 'local-demo',
  householdCodesEnabled: true,
  confirmationEmailEnabled: false,
};

export default function RSVPForm() {
  const { rsvp } = siteContent;
  const isLocalInvitationDemo =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('demo') === 'invitation';
  const [demoCredential, setDemoCredential] = useState<string | null>(null);
  const [householdCode, setHouseholdCode] = useState<string | null>(null);
  const [{ inviteToken, shouldRemoveFragment }] = useState(() => {
    if (typeof window === 'undefined') return { inviteToken: null, shouldRemoveFragment: false };
    return {
      inviteToken: readInviteToken(window.location.hash),
      shouldRemoveFragment: shouldRemoveInviteFragment(window.location.hash, rsvpConfig !== null),
    };
  });

  useLayoutEffect(() => {
    if (!shouldRemoveFragment) return;
    removeInviteFragment();
    document.getElementById(rsvp.sectionId)?.scrollIntoView({ block: 'start' });
  }, [rsvp.sectionId, shouldRemoveFragment]);

  return (
    <section id={rsvp.sectionId} className="relative scroll-mt-24 overflow-hidden bg-stone-dark py-28 text-cream sm:py-32">
      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-6xl font-serif md:text-7xl">
            {rsvp.headingPrefix}{' '}
            <span className="font-accent italic text-gold-soft">{rsvp.headingEmphasis}</span>
          </h2>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cream/65 md:tracking-[0.3em]">
            {rsvp.deadline}
          </p>
        </div>

        {isLocalInvitationDemo ? (
          <div>
            <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-relaxed text-amber-950" role="note">
              <p className="font-bold">Lokale demonstratie</p>
              <p className="mt-1">
                De Familie Garcia-code werkt alleen op deze computer. Testreacties blijven tijdelijk in dit tabblad en gaan niet naar Cloudflare of Google Sheets.
              </p>
              <a
                href="/?preview=invitation"
                className="mt-3 inline-block font-bold underline decoration-amber-700/50 underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
              >
                Bekijk de voorbeeld-uitnodiging
              </a>
            </div>
            {demoCredential === null ? (
              <HouseholdCodeEntry onAccepted={setDemoCredential} />
            ) : (
              <>
                <div className="mx-auto mb-5 flex max-w-3xl justify-end">
                  <button
                    type="button"
                    onClick={() => setDemoCredential(null)}
                    className="min-h-11 rounded-full border border-cream/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-cream outline-none hover:border-sage hover:text-sage focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-stone-dark"
                  >
                    Andere code proberen
                  </button>
                </div>
                <RsvpExperience
                  autoFocusHeading
                  config={invitationDemoConfig}
                  credential={{ type: 'accessCode', value: demoCredential }}
                  services={invitationDemoServices}
                  demo
                />
              </>
            )}
          </div>
        ) : rsvpConfig === null ? (
          <RsvpUnavailable isLocalPreview={import.meta.env.DEV} />
        ) : inviteToken !== null ? (
          <RsvpExperience
            config={rsvpConfig}
            credential={{ type: 'inviteToken', value: inviteToken }}
          />
        ) : rsvpConfig.householdCodesEnabled ? (
          householdCode === null ? (
            <HouseholdCodeEntry onAccepted={setHouseholdCode} />
          ) : (
            <>
              <div className="mx-auto mb-5 flex max-w-3xl justify-end">
                <button
                  type="button"
                  onClick={() => setHouseholdCode(null)}
                  className="min-h-11 rounded-full border border-cream/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-cream outline-none hover:border-sage hover:text-sage focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-stone-dark"
                >
                  {rsvp.codeEntry.switchLabel}
                </button>
              </div>
              <RsvpExperience
                autoFocusHeading
                config={rsvpConfig}
                credential={{ type: 'accessCode', value: householdCode }}
              />
            </>
          )
        ) : (
          <RsvpExperience config={rsvpConfig} credential={null} />
        )}
      </div>
    </section>
  );
}
