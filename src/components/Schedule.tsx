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
    <section id={schedule.sectionId} className="paper-surface scroll-mt-24 py-28 sm:py-32">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-24">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            className="text-6xl font-serif mb-4"
          >
            {schedule.heading}
          </motion.h2>
          <div className="mx-auto mb-6 h-px w-20 bg-gold/75" />
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
                  <span className="font-serif text-3xl text-olive">{event.time}</span>
                  <EventIcon className="w-5 h-5 text-taupe mt-2 group-hover:scale-125 transition-transform" />
                </div>

                <div className="relative hidden w-px self-stretch bg-olive/20 md:block">
                  <div className="absolute left-1/2 top-4 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-olive bg-cream transition-colors group-hover:bg-olive" />
                </div>

                <div className="card-glass flex-1 rounded-[2rem] p-8 transition-colors duration-300 group-hover:border-olive/35 md:p-10">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-3xl font-serif italic text-stone-dark">{event.title}</h3>
                    <div className="rounded-xl bg-olive/10 p-2">
                      <EventIcon className="h-5 w-5 text-olive" />
                    </div>
                  </div>
                  <div className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.25em] text-bronze">
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
