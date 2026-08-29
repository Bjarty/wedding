import { Heart, Instagram, Mail } from 'lucide-react';
import { siteContent } from '../content/siteContent';

export default function Footer() {
  const { footer } = siteContent;

  return (
    <footer className="py-20 bg-cream border-t border-stone-dark/5 text-center">
      <div className="max-w-7xl mx-auto px-6">
        <Heart className="w-8 h-8 text-gold mx-auto mb-8 animate-pulse" />
        
        <h2 className="text-4xl font-serif mb-12">{footer.coupleLabel}</h2>
        
        <div className="flex justify-center gap-12 mb-12">
          <a href={footer.socialHref} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full border border-stone-dark/10 flex items-center justify-center group-hover:bg-gold group-hover:border-gold transition-all">
              <Instagram className="w-5 h-5 group-hover:text-white transition-colors" />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">{footer.socialLabel}</span>
          </a>
          <a href={footer.contactHref} className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full border border-stone-dark/10 flex items-center justify-center group-hover:bg-gold group-hover:border-gold transition-all">
              <Mail className="w-5 h-5 group-hover:text-white transition-colors" />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">{footer.contactLabel}</span>
          </a>
        </div>

        <div className="h-px w-full bg-stone-dark/5 mb-8" />
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-[0.2em] font-bold text-taupe">
          <p>{footer.copyright}</p>
          <p>{footer.credit}</p>
          <div className="flex gap-6">
            {footer.links.map((link) => (
              <a key={link.id} href={link.href} className="hover:text-gold transition-colors">{link.label}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
