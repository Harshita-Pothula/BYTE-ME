import styles from './ProgressBar.module.css'

interface ProgressBarProps {
  value: number
  color?: string
  height?: number
  ariaLabel?: string
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(Math.max(n, min), max)

export default function ProgressBar({
  value,
  color,
  height = 10,
  ariaLabel,
}: ProgressBarProps) {
  const pct = clamp(Math.min(value, 100), 0, 100)

  return (
    <div
      className={styles.track}
      style={{ height: `${height}px` }}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className={styles.fill}
        style={{
          height: '100%',
          backgroundColor: color ?? 'var(--caramel)',
          width: `${pct}%`,
        }}
        aria-hidden="true"
      />
    </div>
  )
}
