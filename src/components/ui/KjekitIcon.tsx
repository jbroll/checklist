import kjekitIconUrl from '/kjekit-icon.svg?url';
import kjekitPathUrl from '/kjekit-path.svg?url';

interface KjekitIconProps {
  className?: string;
  size?: number;
}

export function KjekitIcon({ className = '', size = 16 }: KjekitIconProps) {
  return (
    <img
      src={kjekitIconUrl}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}

interface KjekitTextProps {
  className?: string;
  height?: number;
}

export function KjekitText({ className = '', height = 30 }: KjekitTextProps) {
  return (
    <img src={kjekitPathUrl} alt="Kjekit" className={className} style={{ height, width: 'auto' }} />
  );
}
