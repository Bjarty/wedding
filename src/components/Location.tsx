import { motion } from 'motion/react';
import { Plane, Car, Train, Map as MapIcon } from 'lucide-react';
import { siteContent } from '../content/siteContent';

const travelIcons = {
  plane: Plane,
  train: Train,
  car: Car,
  map: MapIcon,
};

export default function Location() {
  const content = siteContent.location;

  return (
    <section id={content.sectionId} className="py-32 bg-stone-dark text-cream relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-[radial-gradient(circle_at_top_right,_var(--color-gold)_0%,_transparent_70%)] opacity-10" />
      
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-20 items-center">
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           whileInView={{ opacity: 1, scale: 1 }}
           className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl border border-cream/10"
        >
          <img 
            src={content.image}
            alt={content.imageAlt}
            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000"
          />
          <div className="absolute inset-0 bg-stone-dark/20 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <MapIcon className="w-16 h-16 text-gold mx-auto mb-4 animate-pulse" />
              <h3 className="text-4xl font-serif">{content.venueName}</h3>
              <p className="font-accent italic text-xl">{content.address}</p>
            </div>
          </div>
        </motion.div>

        <div>
          <h2 className="text-6xl font-serif mb-8 text-gold italic">{content.heading}</h2>
          <p className="text-lg opacity-70 mb-12 font-sans leading-relaxed">
            {content.introduction}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {content.travelOptions.map((option) => {
              const Icon = travelIcons[option.icon];
              const isMaps = option.variant === 'maps';

              return (
                <div
                  key={option.id}
                  className={isMaps
                    ? 'p-8 bg-gold/10 rounded-3xl border border-gold/30 hover:bg-gold/20 transition-all cursor-pointer group'
                    : 'p-8 card-glass rounded-3xl border border-white/10 hover:border-gold/50 transition-all group'}
                >
                  <Icon className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
                  <h4 className={isMaps
                    ? 'font-serif italic text-2xl mb-3 text-gold'
                    : 'font-serif italic text-2xl mb-3 text-stone-dark'}
                  >
                    {option.title}
                  </h4>
                  <p className={isMaps
                    ? 'text-sm opacity-80 font-light leading-relaxed text-gold/80'
                    : 'text-sm opacity-60 font-light leading-relaxed'}
                  >
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
