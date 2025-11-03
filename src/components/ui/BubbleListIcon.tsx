interface BubbleListIconProps {
  className?: string;
  size?: number;
}

export function BubbleListIcon({ className = '', size = 16 }: BubbleListIconProps) {
  return (
    <img
      src="/bubblelist.svg"
      alt="BubbleList"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
