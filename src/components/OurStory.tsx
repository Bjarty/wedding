import { motion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';

const storyNodes = [
  {
    year: '2019',
    title: 'The First Encounter',
    text: 'A chance meeting at a small bookstore in London. It started with a debate over a rare edition of Dickens and ended with coffee that lasted until closing time.',
    img: 'https://images.unsplash.com/photo-1516972810927-80185027ca84?auto=format&fit=crop&q=80&w=1000',
  },
  {
    year: '2021',
    title: 'The First Journey',
    text: 'Our first trip together to the coast of Cornwall. Lost in the mist, we found a shared love for the wild landscapes and stormy seas.',
    img: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=1000',
  },
  {
    year: '2023',
    title: 'The Proposal',
    text: 'Under the starlit sky of the Scottish Highlands. No fancy dinner, just a campfire, a quiet promise, and a ring that felt like home.',
    img: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&q=80&w=1000',
  },
  {
    year: '2024',
    title: 'Building Our Nest',
    text: 'A year of painting walls, choosing curtains, and realizing that home isn\'t a place, but a person. We started our life together officially.',
    img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&q=80&w=1000',
  },
];

export default function OurStory() {
  const targetRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: targetRef,
  });

  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-75%']);

  return (
    <section id="story" ref={targetRef} className="relative h-[300vh] bg-stone-dark text-cream scroll-mt-24">
      <div className="sticky top-0 h-screen flex items-center overflow-hidden">
        <motion.div style={{ x }} className="flex gap-12 px-20">
          <div className="flex-shrink-0 w-[50vw] flex flex-col justify-center pr-20">
            <h2 className="text-8xl font-serif mb-8 text-gold italic">Our Story</h2>
            <p className="text-xl font-accent leading-relaxed opacity-80 max-w-lg">
              A journey of thousand miles began with a single chapter. 
              Swipe or scroll to see how we found our way to each other.
            </p>
          </div>
          
          {storyNodes.map((node, index) => (
            <div key={index} className="flex-shrink-0 w-[80vw] md:w-[65vw] h-[75vh] flex flex-col md:flex-row gap-10 items-center bg-white/5 p-10 rounded-[2.5rem] backdrop-blur-md border border-gold/10 shadow-3xl">
              <div className="w-full md:w-1/2 h-full overflow-hidden rounded-[2rem] shadow-2xl relative group border border-cream/5">
                <img 
                  src={node.img} 
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
              <h3 className="text-6xl font-serif mb-4">And the best is...</h3>
              <p className="text-2xl italic font-accent text-gold">Yet to come.</p>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
