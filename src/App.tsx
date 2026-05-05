import { motion, useScroll, useSpring } from 'motion/react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import OurStory from './components/OurStory';
import Schedule from './components/Schedule';
import Location from './components/Location';
import HoneymoonTracker from './components/HoneymoonTracker';
import RSVPForm from './components/RSVPForm';
import Footer from './components/Footer';

export default function App() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="relative overflow-x-hidden">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gold z-[100] origin-left"
        style={{ scaleX }}
      />

      <Navbar />

      <main>
        <Hero />
        <OurStory />
        <Schedule />
        <Location />
        <HoneymoonTracker />
        <RSVPForm />
      </main>

      <Footer />
    </div>
  );
}
