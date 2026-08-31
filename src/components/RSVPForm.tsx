import { motion } from 'motion/react';
import { CalendarClock, Mail } from 'lucide-react';
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

const rsvpConfig = getRsvpConfig();
const invitationDemoConfig = {
  apiBaseUrl: 'https://local-demo.invalid',
  turnstileSiteKey: 'local-demo',
  householdCodesEnabled: true,
  confirmationEmailEnabled: false,
};

export default function RSVPForm() {
  const { contacts, rsvp } = siteContent;
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
    <section id={rsvp.sectionId} className="scroll-mt-24 bg-stone-dark py-32 text-cream relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-10" aria-hidden="true">
        <div className="absolute top-10 left-10 w-64 h-64 border border-gold rounded-full" />
        <div className="absolute bottom-10 right-10 w-96 h-96 border border-gold rounded-full" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-6">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-6xl font-serif md:text-7xl">
            {rsvp.headingPrefix}{' '}
            <span className="italic text-gold">{rsvp.headingEmphasis}</span>
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
                    className="min-h-11 rounded-full border border-cream/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-cream outline-none hover:border-gold hover:text-gold focus-visible:ring-4 focus-visible:ring-gold/30"
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
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="card-glass mx-auto max-w-2xl rounded-[2.5rem] p-10 text-center shadow-2xl md:p-16"
          >
            <CalendarClock aria-hidden="true" className="mx-auto mb-6 h-12 w-12 text-gold" />
            <h3 className="mb-4 text-4xl font-serif text-stone-dark">{rsvp.statusHeading}</h3>
            <p className="mx-auto max-w-lg text-base font-light leading-relaxed text-stone-dark/70">
              {rsvp.statusMessage}
            </p>
            <a
              href={`mailto:${contacts.rsvpEmail}`}
              className="mt-8 inline-flex items-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-cream transition-colors hover:bg-gold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold/40"
            >
              <Mail aria-hidden="true" className="h-4 w-4" />
              {rsvp.contactLabel}
            </a>
          </motion.div>
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
                  className="min-h-11 rounded-full border border-cream/25 px-5 py-3 text-xs font-bold uppercase tracking-[0.15em] text-cream outline-none hover:border-gold hover:text-gold focus-visible:ring-4 focus-visible:ring-gold/30"
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
