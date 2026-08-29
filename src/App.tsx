import { motion, useScroll, useSpring } from 'motion/react';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import OurStory from './components/OurStory';
import Schedule from './components/Schedule';
import DressCode from './components/DressCode';
import Location from './components/Location';
import HoneymoonTracker from './components/HoneymoonTracker';
import GiftTips from './components/GiftTips';
import RSVPForm from './components/RSVPForm';
import Footer from './components/Footer';
import { siteContent } from './content/siteContent';

export default function App() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <div className="relative min-h-screen">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gold z-[100] origin-left"
        style={{ scaleX }}
      />

      <Navbar />

      <main>
        <Hero />
        {siteContent.story.enabled && <OurStory />}
        <Schedule />
        <DressCode />
        <Location />
        {siteContent.honeymoon.enabled && <HoneymoonTracker />}
        {siteContent.gifts.enabled && <GiftTips />}
        <RSVPForm />
      </main>

      <Footer />
    </div>
  );
}
