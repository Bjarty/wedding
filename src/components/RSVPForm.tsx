import { motion } from 'motion/react';
import { CalendarClock, Mail } from 'lucide-react';
import { siteContent } from '../content/siteContent';

export default function RSVPForm() {
  const { contacts, rsvp } = siteContent;

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
      </div>
    </section>
  );
}
