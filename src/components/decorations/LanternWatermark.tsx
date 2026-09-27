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
      src="/images/decorations/lampion-watermark.svg"
      width={237}
      height={404}
      draggable={false}
      className={`lantern-watermark pointer-events-none absolute select-none object-contain ${className}`}
    />
  );
}
