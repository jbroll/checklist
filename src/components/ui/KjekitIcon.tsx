interface KjekitIconProps {
  className?: string;
  size?: number;
}

export function KjekitIcon({ className = '', size = 16 }: KjekitIconProps) {
  return (
    <img
      src="/kjekit.svg"
      alt=""
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
