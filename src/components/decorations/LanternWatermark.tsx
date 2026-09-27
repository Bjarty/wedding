interface LanternWatermarkProps {
  className?: string;
}

export default function LanternWatermark({
  className = '',
}: LanternWatermarkProps) {
  return (
    <img
      aria-hidden="true"
      alt=""
      src="/images/decorations/lampion-watermark.png"
      draggable={false}
      className={`lantern-watermark pointer-events-none absolute select-none object-contain ${className}`}
      style={{
        clipPath: 'inset(0 0 0 4px)',
        filter: 'grayscale(1) brightness(0.75) contrast(2.5)',
        mixBlendMode: 'multiply',
        maskImage: 'radial-gradient(ellipse 50% 50% at 50% 45%, black 70%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 50% 50% at 50% 45%, black 70%, transparent 100%)',
      }}
    />
  );
}
