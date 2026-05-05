import { motion, useScroll, useTransform } from 'motion/react';
import { Heart } from 'lucide-react';
import { useState, useEffect } from 'react';

const navItems = [
  { label: 'Story', href: '#story' },
  { label: 'Schedule', href: '#schedule' },
  { label: 'Location', href: '#location' },
  { label: 'Honeymoon', href: '#honeymoon' },
  { label: 'RSVP', href: '#rsvp' },
];

export default function Navbar() {
  const { scrollY } = useScroll();
  const [isScrolled, setIsScrolled] = useState(false);

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

  return (
    <motion.nav
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
          <span className="font-serif text-xl tracking-widest uppercase">A & B</span>
        </motion.div>

        <div className="hidden md:flex items-center gap-12">
          {navItems.map((item) => (
            <motion.a
              key={item.label}
              href={item.href}
              className="text-[10px] uppercase tracking-[0.3em] font-bold text-stone-dark/60 hover:text-gold transition-colors relative group"
              whileHover={{ y: -1 }}
            >
              {item.label}
              <span className="absolute -bottom-1 left-0 w-0 h-px bg-gold transition-all group-hover:w-full" />
            </motion.a>
          ))}
        </div>

        <motion.a
          href="#rsvp"
          className="bg-stone-dark text-cream px-10 py-3.5 rounded-full text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-gold transition-all shadow-xl active:scale-95 border border-gold/20"
          whileHover={{ scale: 1.05 }}
        >
          RSVP Now
        </motion.a>
      </div>
    </motion.nav>
  );
}
