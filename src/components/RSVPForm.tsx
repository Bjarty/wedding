import { motion } from 'motion/react';
import React, { useState } from 'react';
import { Send, Heart, Wine, Users } from 'lucide-react';
import { siteContent } from '../content/siteContent';

export default function RSVPForm() {
  const { rsvp } = siteContent;
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    attending: rsvp.attendance.yes.value,
    guests: 1,
    message: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setTimeout(() => setStatus('success'), 1500);
  };

  if (status === 'success') {
    return (
      <section id={rsvp.sectionId} className="py-32 bg-cream text-center">
        <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           className="max-w-md mx-auto p-12 bg-white rounded-3xl border border-gold/20 shadow-2xl"
        >
          <Heart className="w-16 h-16 text-gold mx-auto mb-6 fill-gold" />
          <h2 className="text-4xl font-serif mb-4">{rsvp.successHeading}</h2>
          <p className="font-accent italic text-xl text-taupe leading-relaxed">
            {rsvp.successMessage}
          </p>
          <button 
            onClick={() => setStatus('idle')}
            className="mt-8 text-xs uppercase tracking-widest font-bold text-gold hover:text-stone-dark transition-colors"
          >
            {rsvp.resetLabel}
          </button>
        </motion.div>
      </section>
    );
  }

  return (
    <section id={rsvp.sectionId} className="py-32 bg-stone-dark relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-10">
         <div className="absolute top-10 left-10 w-64 h-64 border border-gold rounded-full" />
         <div className="absolute bottom-10 right-10 w-96 h-96 border border-gold rounded-full" />
      </div>

      <div className="max-w-4xl mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <h2 className="text-7xl font-serif text-cream mb-4">{rsvp.headingPrefix} <span className="text-gold italic">{rsvp.headingEmphasis}</span></h2>
          <p className="text-cream/60 uppercase tracking-[0.3em] font-bold text-sm">{rsvp.deadline}</p>
        </div>

        <motion.form 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="card-glass p-10 md:p-20 rounded-[4rem] shadow-4xl space-y-12 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-64 h-64 border-t border-r border-gold/10 -mr-32 -mt-32 rounded-full" />
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-bold text-taupe ml-1">{rsvp.nameLabel}</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full bg-white border-b-2 border-stone-dark/10 py-3 px-4 focus:border-gold outline-none transition-colors font-sans"
                placeholder={rsvp.namePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-widest font-bold text-taupe ml-1">{rsvp.emailLabel}</label>
              <input 
                required
                type="email" 
                value={formData.email}
                onChange={e => setFormData({...formData, email: e.target.value})}
                className="w-full bg-white border-b-2 border-stone-dark/10 py-3 px-4 focus:border-gold outline-none transition-colors font-sans"
                placeholder={rsvp.emailPlaceholder}
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className="text-xs uppercase tracking-widest font-bold text-taupe ml-1">{rsvp.attendanceLabel}</label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, attending: rsvp.attendance.yes.value})}
                  className={`flex-1 py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${formData.attending === rsvp.attendance.yes.value ? 'border-gold bg-gold/5 text-gold' : 'border-stone-dark/5 bg-white text-taupe'}`}
                >
                  <Wine className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-widest">{rsvp.attendance.yes.label}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, attending: rsvp.attendance.no.value})}
                  className={`flex-1 py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${formData.attending === rsvp.attendance.no.value ? 'border-gold bg-gold/5 text-gold' : 'border-stone-dark/5 bg-white text-taupe'}`}
                >
                  <Wine className="w-5 h-5 opacity-40 rotate-180" />
                  <span className="text-xs font-bold uppercase tracking-widest">{rsvp.attendance.no.label}</span>
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <label className="text-xs uppercase tracking-widest font-bold text-taupe ml-1">{rsvp.guestsLabel}</label>
              <div className="flex items-center gap-4 bg-white border-2 border-stone-dark/5 p-2 rounded-2xl">
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, guests: Math.max(1, formData.guests - 1)})}
                  className="w-10 h-10 rounded-xl bg-stone-dark/5 flex items-center justify-center hover:bg-gold hover:text-white transition-colors"
                >-</button>
                <div className="flex-1 text-center font-serif text-xl flex items-center justify-center gap-2">
                   <Users className="w-4 h-4 opacity-40" />
                   {formData.guests}
                </div>
                <button 
                  type="button"
                  onClick={() => setFormData({...formData, guests: formData.guests + 1})}
                  className="w-10 h-10 rounded-xl bg-stone-dark/5 flex items-center justify-center hover:bg-gold hover:text-white transition-colors"
                >+</button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs uppercase tracking-widest font-bold text-taupe ml-1">{rsvp.messageLabel}</label>
            <textarea 
              value={formData.message}
              onChange={e => setFormData({...formData, message: e.target.value})}
              className="w-full bg-white border-b-2 border-stone-dark/10 py-3 px-4 focus:border-gold outline-none transition-colors font-sans min-h-[100px] resize-none"
              placeholder={rsvp.messagePlaceholder}
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={status === 'submitting'}
            className="w-full bg-stone-dark text-cream py-6 rounded-2xl text-sm uppercase tracking-[0.4em] font-bold shadow-2xl hover:bg-gold transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {status === 'submitting' ? (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              >
                <Heart className="w-5 h-5 fill-cream" />
              </motion.div>
            ) : (
              <>
                {rsvp.submitLabel} <Send className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </motion.form>
      </div>
    </section>
  );
}
