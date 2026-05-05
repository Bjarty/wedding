import { motion } from 'motion/react';
import { Plane, Car, Train, Map as MapIcon } from 'lucide-react';

export default function Location() {
  return (
    <section id="location" className="py-32 bg-stone-dark text-cream relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/3 h-full bg-[radial-gradient(circle_at_top_right,_var(--color-gold)_0%,_transparent_70%)] opacity-10" />
      
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-20 items-center">
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           whileInView={{ opacity: 1, scale: 1 }}
           className="relative aspect-square rounded-3xl overflow-hidden shadow-2xl border border-cream/10"
        >
          <img 
            src="https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&q=80&w=1000" 
            alt="Florence Italy" 
            className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000"
          />
          <div className="absolute inset-0 bg-stone-dark/20 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <MapIcon className="w-16 h-16 text-gold mx-auto mb-4 animate-pulse" />
              <h3 className="text-4xl font-serif">Villa La Vedetta</h3>
              <p className="font-accent italic text-xl">Viale Michelangiolo, 70, Florence</p>
            </div>
          </div>
        </motion.div>

        <div>
          <h2 className="text-6xl font-serif mb-8 text-gold italic">Getting There</h2>
          <p className="text-lg opacity-70 mb-12 font-sans leading-relaxed">
            Florence is most magical when approached with patience. Whether flying into Peretola or arriving by train through the Tuscan hills, we can't wait to see you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="p-8 card-glass rounded-3xl border border-white/10 hover:border-gold/50 transition-all group">
              <Plane className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
              <h4 className="font-serif italic text-2xl mb-3 text-stone-dark">By Air</h4>
              <p className="text-sm opacity-60 font-light leading-relaxed">Florence Airport (FLR) is 20mins away. Pisa Airport (PSA) is 1hr by shuttle.</p>
            </div>
            <div className="p-8 card-glass rounded-3xl border border-white/10 hover:border-gold/50 transition-all group">
              <Train className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
              <h4 className="font-serif italic text-2xl mb-3 text-stone-dark">By Rail</h4>
              <p className="text-sm opacity-60 font-light leading-relaxed">Santa Maria Novella Station connects to all major Italian cities.</p>
            </div>
            <div className="p-8 card-glass rounded-3xl border border-white/10 hover:border-gold/50 transition-all group">
              <Car className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
              <h4 className="font-serif italic text-2xl mb-3 text-stone-dark">Parking</h4>
              <p className="text-sm opacity-60 font-light leading-relaxed">Valet parking is available at the villa for all guests throughout the event.</p>
            </div>
            <div className="p-8 bg-gold/10 rounded-3xl border border-gold/30 hover:bg-gold/20 transition-all cursor-pointer group">
              <MapIcon className="w-10 h-10 text-gold mb-6 group-hover:scale-110 transition-transform" />
              <h4 className="font-serif italic text-2xl mb-3 text-gold">Open in Maps</h4>
              <p className="text-sm opacity-80 font-light leading-relaxed text-gold/80">Get turn-by-turn directions directly to our celebration.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
