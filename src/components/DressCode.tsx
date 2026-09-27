import { motion } from 'motion/react';
import { siteContent } from '../content/siteContent';
import LanternWatermark from './decorations/LanternWatermark';

export default function DressCode() {
  const content = siteContent.dressCode;

  return (
    <section id={content.sectionId} className="paper-surface scroll-mt-24 py-28 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="relative isolate overflow-hidden rounded-[2.5rem] border border-olive/20 bg-paper/80 p-8 shadow-[0_24px_70px_rgba(48,36,30,0.10)] md:p-16"
        >
          <LanternWatermark className="-right-12 -top-20 -z-10 w-52 opacity-20 sm:right-4 sm:w-60" />
          <div className="relative z-10 mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-7 h-px w-16 bg-gold/70" aria-hidden="true" />
            <h2 className="mb-6 font-serif text-5xl sm:text-6xl">{content.heading}</h2>
            <p className="text-lg font-light leading-relaxed text-stone-dark/70">
              {content.introduction}
            </p>
          </div>

          <div className="mt-12" role="group" aria-labelledby="dresscode-inspiration-label">
            <h3 id="dresscode-inspiration-label" className="sr-only">
              {content.inspirationLabel}
            </h3>
            <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
              {content.inspiration.map((item) => (
                <li key={item.id} className="overflow-hidden rounded-2xl border border-stone-dark/10 bg-cream shadow-sm">
                  <img
                    src={item.image}
                    alt={item.alt}
                    width="960"
                    height="1200"
                    loading="lazy"
                    decoding="async"
                    className="aspect-[4/5] w-full object-cover"
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="relative z-10 mt-14">
            <h3 className="sr-only">{content.colorsLabel}</h3>
            <ul
              aria-label={content.colorsLabel}
              className="mx-auto grid max-w-3xl grid-cols-3 gap-x-3 gap-y-7 sm:gap-x-8 sm:gap-y-9"
            >
              {content.colors.map((color) => (
                <li
                  key={color.id}
                  className="flex min-w-0 flex-col items-center gap-3 text-center"
                >
                  <span
                    aria-hidden="true"
                    className="aspect-square w-full max-w-24 rounded-full border border-stone-dark/10 shadow-[0_8px_20px_rgba(48,36,30,0.10)] sm:max-w-28"
                    style={{ backgroundColor: color.color }}
                  />
                  <span
                    className="w-full break-words font-accent text-base leading-tight text-stone-dark/80 sm:text-lg"
                  >
                    {color.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative z-10 mx-auto mt-10 max-w-2xl text-center font-accent text-xl italic text-taupe">
            {content.printNote}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
