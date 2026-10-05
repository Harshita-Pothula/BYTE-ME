import Card from '../Card/Card'
import Legend from '../Legend/Legend'
import ProgressBar from '../ProgressBar/ProgressBar'
import type { CompareMetric } from '../../data/types'
import styles from './CompareCard.module.css'

interface CompareCardProps {
  compare: CompareMetric[]
  title?: string
}

export default function CompareCard({
  compare,
  title = 'Baseline vs optimized',
}: CompareCardProps) {
  return (
    <Card title={title}>
      <Legend
        items={[
          { label: 'Baseline', color: 'var(--tan)', shape: 'square' },
          { label: 'Optimized', color: 'var(--teal)', shape: 'square' },
        ]}
      />
      <div className={styles.compareList}>
        {compare.map((metric) => (
          <div className={styles.compareMetric} key={metric.label}>
            <div className={styles.compareHeading}>
              <strong>{metric.label}</strong>
              <span>{metric.change}</span>
            </div>
            <div className={styles.compareBarRow}>
              <ProgressBar
                value={metric.baselinePct}
                color="var(--tan)"
                height={12}
                ariaLabel={`${metric.label} baseline`}
              />
              <span className={styles.compareValue}>{metric.baseline}</span>
            </div>
            <div className={styles.compareBarRow}>
              <ProgressBar
                value={metric.optimizedPct}
                color="var(--teal)"
                height={12}
                ariaLabel={`${metric.label} optimized`}
              />
              <strong className={styles.compareValue}>{metric.optimized}</strong>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
