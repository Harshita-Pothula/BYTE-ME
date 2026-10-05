import { useId } from 'react';

/** The Bitten Bar: a 3 x 3 chocolate bar with a bite out of the top-right corner. */
export function BrandLogo({ size = 34 }: { size?: number }) {
  const mask = useId();
  const sq = [18, 47, 76];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <mask id={mask}>
          <rect width="120" height="120" fill="#fff" />
          <circle cx="108" cy="14" r="20" fill="#000" />
          <circle cx="88" cy="6" r="11" fill="#000" />
          <circle cx="116" cy="34" r="11" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        <rect x="10" y="10" width="100" height="100" rx="14" fill="#3B2416" />
        {sq.map((y, i) =>
          sq.map((x, j) => <rect key={`${i}${j}`} x={x} y={y} width="26" height="26" rx="4" fill={i === 2 && j === 2 ? '#E3A72F' : '#5A3A26'} />),
        )}
      </g>
    </svg>
  );
}
