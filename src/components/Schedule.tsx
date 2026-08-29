import { motion } from 'motion/react';
import { CakeSlice, Clock3, Heart, MapPin, Music, Users, Utensils } from 'lucide-react';
import { siteContent } from '../content/siteContent';
import type { ScheduleIcon } from '../types';

const scheduleIcons = {
  clock: Clock3,
  heart: Heart,
  cake: CakeSlice,
  utensils: Utensils,
  users: Users,
  music: Music,
} satisfies Record<ScheduleIcon, typeof Clock3>;

export default function Schedule() {
  const { schedule } = siteContent;

  return (
    <section id={schedule.sectionId} className="scroll-mt-24 py-32 bg-cream">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-24">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-6xl font-serif mb-4"
          >
            {schedule.heading}
          </motion.h2>
          <div className="h-px w-24 bg-gold mx-auto mb-6" />
          <p className="font-accent italic text-2xl text-taupe">{schedule.dateLine}</p>
        </div>

        <div className="space-y-12">
          {schedule.events.map((event, index) => {
            const EventIcon = scheduleIcons[event.icon];

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col md:flex-row gap-8 items-center md:items-start group"
              >
                <div className="w-full md:w-32 flex flex-col items-center md:items-end justify-center">
                  <span className="text-3xl font-serif text-gold">{event.time}</span>
                  <EventIcon className="w-5 h-5 text-taupe mt-2 group-hover:scale-125 transition-transform" />
                </div>

                <div className="hidden md:block w-px self-stretch bg-stone-dark/10 relative">
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-cream border-2 border-gold group-hover:bg-gold transition-colors" />
                </div>

                <div className="flex-1 card-glass p-10 md:p-12 rounded-[2rem] shadow-2xl group-hover:-translate-y-2 transition-all duration-500">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-3xl font-serif italic text-stone-dark">{event.title}</h3>
                    <div className="bg-gold/10 p-2 rounded-xl">
                      <EventIcon className="w-5 h-5 text-gold group-hover:rotate-12 transition-transform" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-gold text-xs uppercase tracking-[0.25em] font-bold mb-6">
                    <MapPin className="w-4 h-4" />
                    {event.location}
                  </div>
                  <p className="text-stone-dark/60 leading-relaxed font-sans font-light text-lg">
                    {event.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
