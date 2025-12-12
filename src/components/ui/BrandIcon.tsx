import { brand } from '@/lib/brand';

interface BrandIconProps {
  className?: string;
  height?: number;
}

/**
 * Renders the current brand's header icon.
 * Preserves aspect ratio - sets height and lets width scale automatically.
 */
export function BrandIcon({ className = '', height = 32 }: BrandIconProps) {
  return (
    <img
      src={brand.logos.headerIcon}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ height, width: 'auto' }}
    />
  );
}

interface ListIconProps {
  className?: string;
  size?: number;
}

/**
 * Renders the square list icon for tree items.
 */
export function ListIcon({ className = '', size = 16 }: ListIconProps) {
  return (
    <img
      src={brand.logos.listIcon}
      alt=""
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
