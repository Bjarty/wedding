import { motion, useScroll, useTransform } from 'motion/react';
import { Heart, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { siteContent } from '../content/siteContent';

export default function Navbar() {
  const { navigation } = siteContent;
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const backgroundColor = useTransform(
    scrollY,
    [0, 100],
    ['rgba(250, 250, 249, 0)', 'rgba(250, 250, 249, 0.8)']
  );

  const backdropBlur = useTransform(
    scrollY,
    [0, 100],
    ['blur(0px)', 'blur(12px)']
  );

  useEffect(() => {
    return scrollY.on('change', (latest) => {
      setIsScrolled(latest > 50);
    });
  }, [scrollY]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <motion.nav
      aria-label="Hoofdnavigatie"
      style={{ backgroundColor, backdropFilter: backdropBlur }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'py-4 border-b border-stone-dark/10' : 'py-8'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
        <motion.div 
          className="flex items-center gap-2"
          whileHover={{ scale: 1.05 }}
        >
          <Heart className="w-5 h-5 text-gold fill-gold" />
          <span className="font-serif text-xl tracking-widest uppercase">{navigation.monogram}</span>
        </motion.div>

        <div className="hidden md:flex items-center gap-12">
          {navigation.items.map((item) => (
            <motion.a
              key={item.id}
              href={item.href}
              className="text-[10px] uppercase tracking-[0.3em] font-bold text-stone-dark/60 hover:text-gold transition-colors relative group"
              whileHover={{ y: -1 }}
            >
              {item.label}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-gold transition-all group-hover:w-full" />
            </motion.a>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={isMenuOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setIsMenuOpen((isOpen) => !isOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-stone-dark/10 bg-cream/80 text-stone-dark shadow-sm outline-none transition-colors hover:text-gold focus-visible:ring-4 focus-visible:ring-gold/30 md:hidden"
          >
            {isMenuOpen
              ? <X aria-hidden="true" className="h-5 w-5" />
              : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>

          <motion.a
            href={navigation.ctaHref}
            onClick={() => setIsMenuOpen(false)}
            className="bg-stone-dark text-cream px-6 md:px-10 py-3.5 rounded-full text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-gold transition-all shadow-xl active:scale-95 border border-gold/20"
            whileHover={{ scale: 1.05 }}
          >
            {navigation.ctaLabel}
          </motion.a>
        </div>
      </div>

      {isMenuOpen && (
        <motion.div
          id="mobile-navigation"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-6 right-6 top-full mt-2 rounded-3xl border border-stone-dark/10 bg-cream/95 p-3 shadow-2xl backdrop-blur-xl md:hidden"
        >
          {navigation.items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
              className="block rounded-2xl px-5 py-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-dark/70 outline-none transition-colors hover:bg-gold/10 hover:text-gold focus-visible:bg-gold/10 focus-visible:text-gold"
            >
              {item.label}
            </a>
          ))}
        </motion.div>
      )}
    </motion.nav>
  );
}
