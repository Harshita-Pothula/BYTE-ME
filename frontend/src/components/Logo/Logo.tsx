import { useId } from 'react'
import styles from './Logo.module.css'

interface LogoProps {
  size?: number
  showWordmark?: boolean
  tone?: 'dark' | 'light'
}

export default function Logo({
  size = 40,
  showWordmark = true,
  tone = 'dark',
}: LogoProps) {
  const maskId = useId()

  const squareXs = [18, 47, 76]
  const squareYs = [18, 47, 76]

  return (
    <div
      className={styles.wrapper}
      role="img"
      aria-label="ByteMe"
      data-tone={tone}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <mask id={maskId}>
            <rect width="120" height="120" fill="#fff" />
            <circle cx="108" cy="14" r="20" fill="#000" />
            <circle cx="88" cy="6" r="11" fill="#000" />
            <circle cx="116" cy="34" r="11" fill="#000" />
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>
          <rect
            x="10"
            y="10"
            width="100"
            height="100"
            rx="14"
            className={styles.bar}
          />
          {squareYs.map((y) =>
            squareXs.map((x) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width="26"
                height="26"
                rx="4"
                className={
                  x === 76 && y === 76 ? styles.squareSun : styles.square
                }
              />
            )),
          )}
        </g>
      </svg>
      {showWordmark && (
        <div className={styles.wordmarkBlock}>
          <span className={styles.wordmark}>ByteMe</span>
          <span className={styles.tagline}>Energy-smart scheduling</span>
        </div>
      )}
    </div>
  )
}
