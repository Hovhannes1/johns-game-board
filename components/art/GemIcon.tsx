import { useId } from 'react';
import type { TokenColor } from '@/engine';
import { GEM_PALETTE, svgId } from './palette';

/**
 * Every gem has its own silhouette as well as its own color, so the game stays
 * readable for color-blind players (section 4.3):
 * diamond = brilliant, sapphire = pear, emerald = step cut, ruby = trillion,
 * onyx = hexagon, gold = star.
 */
const SHAPES: Record<TokenColor, { outline: string; facets: string }> = {
  diamond: {
    outline: 'M6 4H18L22 9.5L12 21L2 9.5Z',
    facets: 'M2 9.5H22M6 4L9 9.5L12 4L15 9.5L18 4M9 9.5L12 21L15 9.5',
  },
  sapphire: {
    outline: 'M12 2.5C14.5 6 19.5 10.5 19.5 15A7.5 7.5 0 0 1 4.5 15C4.5 10.5 9.5 6 12 2.5Z',
    facets:
      'M12 7C13.5 9.5 16 12 16 15A4 4 0 0 1 8 15C8 12 10.5 9.5 12 7ZM12 2.5V7M4.5 15H8M16 15H19.5',
  },
  emerald: {
    outline: 'M7.5 3H16.5L20 6.5V17.5L16.5 21H7.5L4 17.5V6.5Z',
    facets: 'M9 7H15L16 8V16L15 17H9L8 16V8ZM7.5 3L9 7M16.5 3L15 7M20 17.5L16 16M4 17.5L8 16',
  },
  ruby: {
    outline: 'M12 3L22 20H2Z',
    facets: 'M12 9L17 17.5H7ZM12 3V9M22 20L17 17.5M2 20L7 17.5',
  },
  onyx: {
    outline: 'M12 2L20.7 7V17L12 22L3.3 17V7Z',
    facets:
      'M12 7L16.3 9.5V14.5L12 17L7.7 14.5V9.5ZM12 2V7M20.7 7L16.3 9.5M20.7 17L16.3 14.5M12 22V17M3.3 17L7.7 14.5M3.3 7L7.7 9.5',
  },
  gold: {
    outline: 'M12 2L14.9 8.6L22 9.3L16.6 14L18.2 21L12 17.3L5.8 21L7.4 14L2 9.3L9.1 8.6Z',
    facets: 'M12 6.5L13.3 10.2L17 10.4L14.1 12.8L15 16.4L12 14.4L9 16.4L9.9 12.8L7 10.4L10.7 10.2Z',
  },
};

/** Gem silhouettes in a 24x24 box, reused as large motifs on card art. */
export function gemOutline(color: TokenColor): string {
  return SHAPES[color].outline;
}

interface GemIconProps {
  color: TokenColor;
  size?: string;
  className?: string;
  /** When given, the icon is announced to screen readers. */
  title?: string;
}

export function GemIcon({ color, size = '1em', className, title }: GemIconProps) {
  const gradientId = svgId(`gem${useId()}`);
  const palette = GEM_PALETTE[color];
  const shape = SHAPES[color];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={palette.light} />
          <stop offset="0.5" stopColor={palette.base} />
          <stop offset="1" stopColor={palette.dark} />
        </linearGradient>
      </defs>
      <path
        d={shape.outline}
        fill={`url(#${gradientId})`}
        stroke={palette.stroke}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path
        d={shape.facets}
        fill="none"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="0.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
