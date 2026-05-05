import { motion, useScroll, useTransform } from 'motion/react';
import { Compass, Camera, MapPin, Sun, Wind } from 'lucide-react';
import { useRef } from 'react';

const stops = [
  { day: 1, loc: 'Tokyo, Japan', title: 'Neon Dreams', icon: Sun, img: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&q=80&w=1000' },
  { day: 4, loc: 'Kyoto', title: 'Ancient Echoes', icon: Wind, img: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=1000' },
  { day: 8, loc: 'Mount Fuji', title: 'The Silent Peak', icon: Camera, img: 'https://images.unsplash.com/photo-1509023464722-18d996393ca8?auto=format&fit=crop&q=80&w=1000' },
  { day: 12, loc: 'Okinawa', title: 'Soul of the Sea', icon: MapPin, img: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&q=80&w=1000' },
];

export default function HoneymoonTracker() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  });

  const pathProgress = useTransform(scrollYProgress, [0.1, 0.9], [0, 100]);

  return (
    <section id="honeymoon" className="py-32 bg-cream overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-end mb-24 gap-8">
          <div>
            <span className="text-gold font-bold uppercase tracking-[0.3em] text-xs mb-4 block">The Odyssey</span>
            <h2 className="text-7xl font-serif leading-tight">Follow Our <br /><span className="italic">Honeymoon</span></h2>
          </div>
          <div className="max-w-md">
            <p className="text-taupe italic font-accent text-2xl mb-4">"Not all those who wander are lost."</p>
            <p className="text-sm uppercase tracking-widest font-bold opacity-60">Starting September 20th, 2026</p>
          </div>
        </div>

        <div ref={containerRef} className="relative">
          {/* Timeline Path */}
          <div className="absolute left-[39px] md:left-1/2 top-0 bottom-0 w-px bg-stone-dark/10 -translate-x-1/2">
             <motion.div 
               style={{ height: `${pathProgress.get()}%` }} 
               className="w-full bg-gold shadow-[0_0_10px_rgba(202,138,4,0.5)]" 
             />
          </div>

          <div className="space-y-32">
            {stops.map((stop, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-100px" }}
                className={`flex flex-col md:flex-row items-center gap-12 ${index % 2 === 0 ? '' : 'md:flex-row-reverse'}`}
              >
                <div className="w-full md:w-1/2 relative group">
                  <div className="aspect-[4/3] overflow-hidden rounded-3xl shadow-2xl">
                    <img src={stop.img} alt={stop.loc} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                  </div>
                  <div className="absolute inset-0 bg-stone-dark/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-3xl backdrop-blur-sm">
                    <Compass className="w-12 h-12 text-gold animate-spin-slow" />
                  </div>
                </div>

                <div className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-cream border-2 border-gold z-10 hidden md:block" />

                <div className="w-full md:w-1/2 text-center md:text-left">
                  <div className={`flex items-center gap-4 mb-4 justify-center ${index % 2 === 0 ? 'md:justify-start' : 'md:justify-end'}`}>
                    <span className="text- gold font-serif text-5xl opacity-20">0{stop.day}</span>
                    <stop.icon className="w-6 h-6 text-gold" />
                  </div>
                  <h3 className="text-4xl font-serif mb-2">{stop.title}</h3>
                  <p className="font-accent italic text-2xl text-taupe mb-4">{stop.loc}</p>
                  <p className="text-warm-black/60 font-sans leading-relaxed max-w-md mx-auto md:mx-0">
                    Exploring the juxtaposition of tradition and technology in the heart of Japan. From hidden shrines to neon-lit streets.
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
