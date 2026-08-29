import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ExternalLink, Gift, MapPin, Plane } from 'lucide-react';
import { siteContent } from '../content/siteContent';

export default function GiftTips() {
  const content = siteContent.gifts;
  const shouldReduceMotion = useReducedMotion();
  const initialReveal = shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 };
  const revealTransition = shouldReduceMotion ? { duration: 0 } : undefined;

  return (
    <section id={content.sectionId} className="scroll-mt-24 overflow-hidden bg-cream py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={initialReveal}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={revealTransition}
          className="mx-auto max-w-4xl text-center"
        >
          <Gift aria-hidden="true" className="mx-auto mb-6 h-10 w-10 text-gold" />
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-[#8A5A03]">
            {content.eyebrow}
          </p>
          <h2 className="text-5xl leading-tight sm:text-6xl">
            {content.heading}
          </h2>
          <div className="mx-auto mt-8 max-w-3xl space-y-5 text-base font-light leading-relaxed text-stone-dark/70 sm:text-lg">
            {content.introduction.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={initialReveal}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={revealTransition}
          className="relative mt-16 overflow-hidden rounded-[2.5rem] bg-stone-dark px-6 py-12 text-cream shadow-2xl sm:px-10 lg:px-16"
        >
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative text-center">
            <Plane aria-hidden="true" className="mx-auto mb-5 h-8 w-8 text-gold" />
            <h3 className="text-4xl italic">{content.routeHeading}</h3>
            <p className="mt-3 text-xs font-bold uppercase tracking-[0.25em] text-gold">
              {content.travelDates}
            </p>
            <ol
              aria-label={`${content.routeHeading}, ${content.travelDates}`}
              className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-4 text-sm leading-relaxed text-cream/75"
            >
              {content.route.map((stop, index) => (
                <li key={`${stop}-${index}`} className="flex items-center gap-3">
                  <span>{stop}</span>
                  {index < content.route.length - 1 && (
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-gold" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </motion.div>

        <div className="mt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#8A5A03]">
              {content.contributionsEyebrow}
            </p>
            <h3 className="mt-4 text-4xl leading-tight sm:text-5xl">
              {content.contributionsHeading}
            </h3>
            {content.paymentLinksEnabled && content.paymentProvider && (
              <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-stone-dark/60">
                {content.externalPaymentNote}{' '}
                <a
                  href={content.paymentProvider.privacyHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="font-semibold text-stone-dark underline decoration-stone-dark/40 underline-offset-4 outline-none focus-visible:ring-4 focus-visible:ring-gold/30"
                >
                  Privacyinformatie van {content.paymentProvider.name}
                  <span className="sr-only"> (opent in een nieuw tabblad)</span>
                </a>
              </p>
            )}
          </div>

          <ul className="mt-12 grid gap-6 md:grid-cols-2">
            {content.contributions.map((contribution, index) => (
              <motion.li
                key={contribution.id}
                initial={initialReveal}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={shouldReduceMotion
                  ? { duration: 0 }
                  : { delay: Math.min(index % 2, 1) * 0.08 }}
                className="flex h-full flex-col rounded-3xl border border-gold/20 bg-white/70 p-7 shadow-lg sm:p-8"
              >
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#8A5A03]">
                  <MapPin aria-hidden="true" className="h-4 w-4 shrink-0" />
                  {contribution.location}
                </p>
                <h4 className="mt-4 text-3xl leading-tight">{contribution.title}</h4>
                <p className="mt-4 flex-1 text-sm font-light leading-relaxed text-stone-dark/65 sm:text-base">
                  {contribution.description}
                </p>

                <div className="mt-8 border-t border-stone-dark/10 pt-6">
                  {content.paymentLinksEnabled &&
                  content.paymentProvider &&
                  contribution.paymentHref &&
                  contribution.amountLabel &&
                  contribution.recipientLabel ? (
                    <>
                      <p className="mb-4 text-sm font-semibold text-stone-dark">
                        {contribution.amountLabel} · aan {contribution.recipientLabel} · via {content.paymentProvider.name}
                      </p>
                      <a
                        href={contribution.paymentHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        referrerPolicy="no-referrer"
                        aria-label={`${contribution.ctaLabel}, ${contribution.amountLabel}, via ${content.paymentProvider.name}; opent in een nieuw tabblad`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-stone-dark px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-cream outline-none transition-colors hover:bg-[#8A5A03] focus-visible:ring-4 focus-visible:ring-gold/30"
                      >
                        {contribution.ctaLabel}
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                      </a>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled
                        className="min-h-11 cursor-not-allowed rounded-full bg-stone-dark/10 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-dark/45"
                      >
                        {contribution.ctaLabel}
                      </button>
                      <p className="mt-3 text-xs text-taupe">
                        {content.paymentUnavailableLabel}
                      </p>
                    </>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        </div>

        <motion.div
          initial={initialReveal}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={revealTransition}
          className="mx-auto mt-24 max-w-3xl text-center"
        >
          <h3 className="text-4xl italic sm:text-5xl">{content.thanksHeading}</h3>
          <div className="mt-7 space-y-4 text-base font-light leading-relaxed text-stone-dark/70 sm:text-lg">
            {content.thanksText.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-8 font-accent text-3xl italic text-[#8A5A03]">{content.signature}</p>
        </motion.div>
      </div>
    </section>
  );
}
