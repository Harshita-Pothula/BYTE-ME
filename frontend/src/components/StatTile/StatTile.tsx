import styles from './StatTile.module.css'

interface StatTileProps {
  label: string
  value: React.ReactNode
}

export default function StatTile({ label, value }: StatTileProps) {
  return (
    <div className={styles.tile}>
      <span className={styles.label}>{label}</span>
      <div className={styles.value} aria-label={String(value)}>{value}</div>
    </div>
  )
}
