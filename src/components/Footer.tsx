import { Heart, Instagram, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="py-20 bg-cream border-t border-stone-dark/5 text-center">
      <div className="max-w-7xl mx-auto px-6">
        <Heart className="w-8 h-8 text-gold mx-auto mb-8 animate-pulse" />
        
        <h2 className="text-4xl font-serif mb-12">Arthur & Beatrice</h2>
        
        <div className="flex justify-center gap-12 mb-12">
          <a href="#" className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full border border-stone-dark/10 flex items-center justify-center group-hover:bg-gold group-hover:border-gold transition-all">
              <Instagram className="w-5 h-5 group-hover:text-white transition-colors" />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">#ArtieAndBea</span>
          </a>
          <a href="mailto:hello@wedding.com" className="flex flex-col items-center gap-2 group">
            <div className="w-12 h-12 rounded-full border border-stone-dark/10 flex items-center justify-center group-hover:bg-gold group-hover:border-gold transition-all">
              <Mail className="w-5 h-5 group-hover:text-white transition-colors" />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">Contact Us</span>
          </a>
        </div>

        <div className="h-px w-full bg-stone-dark/5 mb-8" />
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] uppercase tracking-[0.2em] font-bold text-taupe">
          <p>© 2026 Arthur & Beatrice Wedding Journey</p>
          <p>Handcrafted with Love & Motion</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-gold transition-colors">Privacy</a>
            <a href="#" className="hover:text-gold transition-colors">Registry</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
