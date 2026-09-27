import { ArrowUpRight, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { siteContent } from '../content/siteContent';

export default function RsvpUnavailable({ isLocalPreview }: { isLocalPreview: boolean }) {
  const { contacts, rsvp } = siteContent;
  const Icon = isLocalPreview ? ArrowUpRight : Mail;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="card-glass mx-auto max-w-2xl rounded-[2.5rem] p-10 text-center shadow-2xl md:p-16"
    >
      <Icon aria-hidden="true" className="mx-auto mb-6 h-12 w-12 text-olive" />
      <h3 className="mb-4 text-4xl font-serif text-stone-dark">
        {isLocalPreview ? rsvp.localPreview.heading : rsvp.statusHeading}
      </h3>
      <p className="mx-auto max-w-lg text-base font-light leading-relaxed text-stone-dark/70">
        {isLocalPreview ? rsvp.localPreview.message : rsvp.statusMessage}
      </p>
      <a
        href={isLocalPreview ? rsvp.localPreview.href : `mailto:${contacts.rsvpEmail}`}
        className="mt-8 inline-flex items-center gap-3 rounded-full bg-stone-dark px-8 py-4 text-xs font-bold uppercase tracking-[0.2em] text-cream transition-colors hover:bg-jade focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
      >
        <Icon aria-hidden="true" className="h-4 w-4" />
        {isLocalPreview ? rsvp.localPreview.linkLabel : rsvp.contactLabel}
      </a>
    </motion.div>
  );
}
