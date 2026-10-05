import styles from './Legend.module.css'

type ShapeKind = 'square' | 'dot' | 'dashed'

interface LegendItem {
  label: string
  color: string
  shape: ShapeKind
}

interface LegendProps {
  items: LegendItem[]
}

export default function Legend({ items }: LegendProps) {
  return (
    <div className={styles.legend} role="group" aria-label="Legend">
      {items.map((item) => (
        <div key={item.label + item.color + String(item.shape)} className={styles.item}>
          <span
            className={`${styles.swatch}${item.shape ? ` ${styles[item.shape]}` : ''}`}
            style={{
              backgroundColor: item.shape === 'dashed' ? 'transparent' : item.color,
              borderColor: item.color,
            }}
            aria-hidden="true"
          />
          <span className={styles.desc}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}
