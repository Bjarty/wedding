import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { siteContent } from '../content/siteContent';

export default function OurStory() {
  const content = siteContent.story;
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
      offset: ["start start", "end end"]
  });

  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-80%']);

  return (
    <section id={content.sectionId} ref={targetRef} className="relative h-[300vh] bg-stone-dark text-cream scroll-mt-24">
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <motion.div style={{ x }} className="flex gap-12 px-20">
          <div className="flex-shrink-0 w-[50vw] flex flex-col justify-center pr-20">
            <h2 className="text-8xl font-serif mb-8 text-gold italic">{content.heading}</h2>
            <p className="text-xl font-accent leading-relaxed opacity-80 max-w-lg">
              {content.introduction}
            </p>
          </div>
          
          {content.items.map((node) => (
            <div key={node.id} className="flex-shrink-0 w-[80vw] md:w-[65vw] h-[75vh] flex flex-col md:flex-row gap-10 items-center bg-white/5 p-10 rounded-[2.5rem] backdrop-blur-md border border-gold/10 shadow-3xl">
              <div className="w-full md:w-1/2 h-full overflow-hidden rounded-[2rem] shadow-2xl relative group border border-cream/5">
                <img 
                  src={node.image}
                  alt={node.title} 
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
                />
                <div className="absolute top-6 left-6 bg-gold text-white px-6 py-2 rounded-full text-xs font-bold uppercase tracking-[0.3em] shadow-lg">
                  {node.year}
                </div>
              </div>
              <div className="w-full md:w-1/2 flex flex-col justify-center px-4">
                <h3 className="text-5xl font-serif mb-8 text-gold italic leading-tight">{node.title}</h3>
                <p className="text-xl font-sans leading-relaxed opacity-60 font-light">
                  {node.text}
                </p>
              </div>
            </div>
          ))}

          <div className="flex-shrink-0 w-[40vw] flex flex-col justify-center items-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              className="text-center"
            >
              <h3 className="text-6xl font-serif mb-4">{content.endingHeading}</h3>
              <p className="text-2xl italic font-accent text-gold">{content.endingText}</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
