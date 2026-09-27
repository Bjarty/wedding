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
    ['rgba(245, 239, 229, 0)', 'rgba(245, 239, 229, 0.9)']
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
          <Heart className="h-5 w-5 fill-olive/10 text-olive" />
          <span className="font-serif text-xl tracking-widest uppercase">{navigation.monogram}</span>
        </motion.div>

        <div className="hidden lg:flex items-center gap-12">
          {navigation.items.map((item) => (
            <motion.a
              key={item.id}
              href={item.href}
              className="group relative text-[10px] font-bold uppercase tracking-[0.3em] text-stone-dark/60 outline-none transition-colors hover:text-jade focus-visible:text-jade focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-4 focus-visible:ring-offset-cream"
              whileHover={{ y: -1 }}
            >
              {item.label}
              <span className="absolute -bottom-1 left-0 h-px w-0 bg-olive transition-all group-hover:w-full" />
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
            className="flex h-11 w-11 items-center justify-center rounded-full border border-olive/20 bg-paper/85 text-stone-dark shadow-sm outline-none transition-colors hover:text-jade focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-cream lg:hidden"
          >
            {isMenuOpen
              ? <X aria-hidden="true" className="h-5 w-5" />
              : <Menu aria-hidden="true" className="h-5 w-5" />}
          </button>

          <motion.a
            href={navigation.ctaHref}
            onClick={() => setIsMenuOpen(false)}
            className="rounded-full border border-olive/30 bg-stone-dark px-6 py-3.5 text-[10px] font-bold uppercase tracking-[0.3em] text-cream shadow-lg outline-none transition-all hover:bg-jade focus-visible:ring-2 focus-visible:ring-jade focus-visible:ring-offset-2 focus-visible:ring-offset-cream active:scale-95 lg:px-10"
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
          className="absolute left-6 right-6 top-full mt-2 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain rounded-3xl border border-olive/15 bg-paper/95 p-3 shadow-2xl backdrop-blur-xl lg:hidden"
        >
          {navigation.items.map((item) => (
            <a
              key={item.id}
              href={item.href}
              onClick={() => setIsMenuOpen(false)}
              className="block rounded-2xl px-5 py-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-dark/70 outline-none transition-colors hover:bg-jade/10 hover:text-jade focus-visible:bg-jade/10 focus-visible:text-jade focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-jade"
            >
              {item.label}
            </a>
          ))}
        </motion.div>
      )}
    </motion.nav>
  );
}
