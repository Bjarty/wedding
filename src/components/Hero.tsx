import { motion } from 'motion/react';

export default function Hero() {
  return (
    <section className="relative h-screen w-full flex items-center justify-center overflow-hidden mesh-gradient">
      <div className="absolute inset-0 z-0">
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--color-gold)_0%,_transparent_70%)]"
        />
      </div>

      <div className="relative z-10 text-center px-4">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="font-accent italic text-3xl md:text-4xl text-taupe mb-8 drop-shadow-sm"
        >
          To have and to hold
        </motion.p>
        
        <motion.h1
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-7xl md:text-9xl lg:text-[13rem] font-serif tracking-tighter leading-none mb-10 text-stone-dark"
        >
          Arthur <span className="text-gold italic text-glow">&</span> <br /> 
          Beatrice
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-px w-24 bg-gold mb-4" />
          <p className="uppercase tracking-[0.4em] text-sm md:text-base font-bold">
            September 12th, 2026 • Florence, Italy
          </p>
          <div className="h-px w-24 bg-gold mt-4" />
        </motion.div>
      </div>

      <motion.div 
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-50"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <span className="text-[10px] uppercase tracking-widest font-bold">Scroll to Explore</span>
        <div className="w-[1px] h-12 bg-stone-dark" />
      </motion.div>
    </section>
  );
}
