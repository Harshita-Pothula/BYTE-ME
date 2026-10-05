import Card from '../../components/Card/Card'
import PageHeader from '../../components/PageHeader/PageHeader'
import ProgressBar from '../../components/ProgressBar/ProgressBar'
import StatusChip from '../../components/StatusChip/StatusChip'
import { useFactory } from '../../context/useFactory'
import { FactoryFloorPlan } from '../FactoryViewPage/FactoryViewPage'
import styles from './ProcessesPage.module.css'

export default function ProcessesPage() {
  const { factory } = useFactory()
  const machines = factory.stages.flatMap((stage) =>
    stage.machines.map((machine) => ({ machine, stage })),
  )

  return (
    <div className={styles.page}>
      <PageHeader eyebrow={factory.name} title="Processes & machines" />

      <FactoryFloorPlan key={factory.id} factory={factory} />

      <Card title="All machines" className={styles.machineCard}>
        <div className={styles.tableScroller}>
          <table className={styles.machineTable}>
            <caption className={styles.visuallyHidden}>
              Machines, stages, rated power, status, and utilization
            </caption>
            <thead>
              <tr>
                <th scope="col">Machine</th>
                <th scope="col">Stage</th>
                <th scope="col">Type</th>
                <th scope="col">Rated power</th>
                <th scope="col">Status</th>
                <th scope="col">Utilization</th>
              </tr>
            </thead>
            <tbody>
              {machines.map(({ machine, stage }) => (
                <tr key={machine.id}>
                  <th scope="row">{machine.name}</th>
                  <td>{stage.name}</td>
                  <td>{machine.type[0].toUpperCase() + machine.type.slice(1)}</td>
                  <td>{machine.ratedKw} kW</td>
                  <td>
                    <StatusChip status={machine.status} />
                  </td>
                  <td>
                    <div className={styles.utilization}>
                      <ProgressBar
                        value={machine.utilization}
                        ariaLabel={`${machine.name} utilization`}
                      />
                      <span>{machine.utilization}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
