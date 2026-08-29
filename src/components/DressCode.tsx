import { motion } from 'motion/react';
import { Palette } from 'lucide-react';
import { siteContent } from '../content/siteContent';

export default function DressCode() {
  const content = siteContent.dressCode;

  return (
    <section id={content.sectionId} className="scroll-mt-24 bg-cream py-32">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          className="overflow-hidden rounded-[2.5rem] border border-gold/20 bg-white/70 p-8 shadow-2xl md:p-16"
        >
          <div className="mx-auto max-w-3xl text-center">
            <Palette aria-hidden="true" className="mx-auto mb-6 h-10 w-10 text-gold" />
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-gold">
              {content.eyebrow}
            </p>
            <h2 className="mb-6 text-6xl font-serif">{content.heading}</h2>
            <p className="text-lg font-light leading-relaxed text-stone-dark/70">
              {content.introduction}
            </p>
          </div>

          <div className="mt-14">
            <h3 className="sr-only">{content.colorsLabel}</h3>
            <ul
              aria-label={content.colorsLabel}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
            >
              {content.colors.map((color) => (
                <li
                  key={color.id}
                  className="flex min-h-24 items-end rounded-2xl border border-stone-dark/10 p-4 shadow-sm"
                  style={{ backgroundColor: color.color }}
                >
                  <span
                    className={color.foreground === 'light'
                      ? 'break-words text-[10px] font-bold uppercase tracking-[0.08em] text-white sm:text-xs sm:tracking-wider'
                      : 'break-words text-[10px] font-bold uppercase tracking-[0.08em] text-stone-dark sm:text-xs sm:tracking-wider'}
                  >
                    {color.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center font-accent text-xl italic text-taupe">
            {content.printNote}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
