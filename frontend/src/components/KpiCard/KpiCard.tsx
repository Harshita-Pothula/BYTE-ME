import styles from './KpiCard.module.css'

interface KpiCardProps {
  label?: string
  value: React.ReactNode
  delta?: string
  note?: string
  dotColor?: string
}

export default function KpiCard({
  label,
  value,
  delta,
  note,
  dotColor,
}: KpiCardProps) {
  return (
    <section className={styles.card}>
      <div className={styles.labelRow}>
        <span
          className={styles.dot}
          style={{ backgroundColor: dotColor ?? 'var(--caramel)' }}
          aria-hidden="true"
        />
        <span className={styles.label}>{label}</span>
      </div>
      <div className={styles.value} aria-label={String(value)}>
        {value}
      </div>
      {(delta || note) && (
        <div className={styles.bottomRow}>
          {delta && (
            <span className={styles.deltaPill} role="status">
              {delta}
            </span>
          )}
          {note && <span className={styles.note}>{note}</span>}
        </div>
      )}
    </section>
  )
}
