import { motion } from 'motion/react';
import { siteContent } from '../content/siteContent';
import LanternWatermark from './decorations/LanternWatermark';

export default function Hero() {
  const { hero } = siteContent;

  return (
    <section className="paper-surface relative flex min-h-screen w-full items-center justify-center overflow-hidden">
      <LanternWatermark className="-left-12 -top-10 w-44 opacity-80 sm:left-3 sm:w-56 lg:w-64" />
      <LanternWatermark className="-right-12 top-16 w-36 opacity-60 sm:right-5 sm:w-48 lg:w-56" />
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-olive/[0.07] to-transparent"
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mb-10 text-xs font-semibold uppercase tracking-[0.42em] text-stone-dark/70 sm:text-sm"
        >
          {hero.eyebrow}
        </motion.p>
        
        <motion.h1
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 font-serif text-6xl leading-[0.95] tracking-[-0.045em] text-stone-dark sm:text-7xl md:text-8xl lg:text-[8.5rem]"
        >
          {hero.firstName} <span className="font-accent font-normal italic text-olive">&</span>{' '}
          <span className="whitespace-nowrap">{hero.secondName}</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="mb-4 h-px w-20 bg-gold/80" />
          <p className="font-accent text-2xl italic tracking-[0.04em] text-stone-dark/75 sm:text-3xl">
            {hero.dateLine}
          </p>
          <div className="mt-4 h-px w-20 bg-gold/80" />
        </motion.div>
      </div>

      <motion.div 
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-stone-dark/45"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <span className="text-[10px] uppercase tracking-widest font-bold">{hero.scrollLabel}</span>
        <div className="h-10 w-px bg-olive/60" />
      </motion.div>
    </section>
  );
}
