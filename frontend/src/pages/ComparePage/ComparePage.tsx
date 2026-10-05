import Card from '../../components/Card/Card'
import CompareCard from '../../components/CompareCard/CompareCard'
import GanttRow from '../../components/GanttRow/GanttRow'
import PageHeader from '../../components/PageHeader/PageHeader'
import { useFactory } from '../../context/useFactory'
import styles from './ComparePage.module.css'

const HOURS = Array.from({ length: 25 }, (_, index) => index)

export default function ComparePage() {
  const { factory } = useFactory()

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={factory.name} title="Baseline vs optimized" />

      <CompareCard compare={factory.compare} />

      <Card title="Schedule timelines">
        <div className={styles.timelineScroller}>
          <div className={styles.timelineInner}>
            <div className={styles.timeAxis} aria-hidden="true">
              {HOURS.map((hour) => (
                <span key={hour}>{hour % 3 === 0 ? `${hour}:00` : ''}</span>
              ))}
            </div>
            <GanttRow
              label="Baseline"
              blocks={factory.baselineSchedule}
              autoLanes
            />
            <GanttRow
              label="Optimized"
              blocks={factory.optimizedSchedule}
              autoLanes
            />
          </div>
        </div>
      </Card>

      <Card title="Shifted processes">
        <div className={styles.tableScroller}>
          <table className={styles.shiftTable}>
            <caption className={styles.visuallyHidden}>
              Processes shifted by the optimizer, their schedule changes, reason,
              and energy cost savings
            </caption>
            <thead>
              <tr>
                <th scope="col">Process</th>
                <th scope="col">Machine</th>
                <th scope="col">Was</th>
                <th scope="col">Now</th>
                <th scope="col">Reason</th>
                <th scope="col">Saved</th>
              </tr>
            </thead>
            <tbody>
              {factory.shifted.map((shift) => (
                <tr key={`${shift.process}-${shift.machine}`}>
                  <th scope="row">{shift.process}</th>
                  <td>{shift.machine}</td>
                  <td>{shift.was}</td>
                  <td>{shift.now}</td>
                  <td>{shift.reason}</td>
                  <td>{shift.saved}</td>
                </tr>
              ))}
              {factory.shifted.length === 0 && (
                <tr>
                  <td className={styles.noShifts} colSpan={6}>
                    No processes were shifted for this factory.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
