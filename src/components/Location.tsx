import { motion } from 'motion/react';
import { BedDouble, Car, CircleParking, Map as MapIcon, Navigation } from 'lucide-react';
import { siteContent } from '../content/siteContent';
import type { TravelIcon } from '../types';

const travelIcons = {
  car: Car,
  parking: CircleParking,
  bed: BedDouble,
  taxi: Navigation,
} satisfies Record<TravelIcon, typeof Car>;

export default function Location() {
  const content = siteContent.location;

  return (
    <section id={content.sectionId} className="scroll-mt-24 py-32 bg-stone-dark text-cream relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-[radial-gradient(circle_at_top_right,_var(--color-gold)_0%,_transparent_70%)] opacity-10" />
      
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-20 items-center">
        <motion.a
           href={content.mapHref}
           target="_blank"
           rel="noreferrer"
           aria-label={`${content.mapLabel}: ${content.venueName}, ${content.address}`}
           initial={{ opacity: 0, scale: 0.9 }}
           whileInView={{ opacity: 1, scale: 1 }}
           viewport={{ once: true }}
           className="mesh-gradient group relative flex min-h-[28rem] items-center justify-center overflow-hidden rounded-3xl border border-cream/10 text-stone-dark shadow-2xl outline-none focus-visible:ring-4 focus-visible:ring-gold/60 md:aspect-square md:min-h-0"
        >
          <div className="max-w-sm px-8 text-center">
            <MapIcon aria-hidden="true" className="mx-auto mb-6 h-16 w-16 text-gold transition-transform duration-500 group-hover:scale-110" />
            <h3 className="text-5xl font-serif">{content.venueName}</h3>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-taupe">
              {content.venueContext}
            </p>
            <address className="mt-6 font-accent text-2xl italic">
              {content.address}
            </address>
            <span className="mt-8 inline-flex items-center gap-2 rounded-full bg-stone-dark px-6 py-3 text-xs font-bold uppercase tracking-[0.2em] text-cream transition-colors group-hover:bg-gold">
              {content.mapLabel}
              <Navigation aria-hidden="true" className="h-4 w-4" />
            </span>
          </div>
        </motion.a>

        <div>
          <h2 className="text-6xl font-serif mb-8 text-gold italic">{content.heading}</h2>
          <p className="text-lg opacity-70 mb-12 font-sans leading-relaxed">
            {content.introduction}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {content.travelOptions.map((option) => {
              const Icon = travelIcons[option.icon];

              return (
                <div
                  key={option.id}
                  className="card-glass group rounded-3xl border border-white/10 p-8 transition-all hover:border-gold/50"
                >
                  <Icon className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
                  <h4 className="mb-3 font-serif text-2xl italic text-stone-dark">
                    {option.title}
                  </h4>
                  <p className="text-sm font-light leading-relaxed text-stone-dark/65">
                    {option.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
