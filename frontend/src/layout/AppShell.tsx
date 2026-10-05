import { Outlet } from 'react-router-dom'
import Button from '../components/Button/Button'
import Card from '../components/Card/Card'
import { useFactory } from '../context/useFactory'
import Sidebar from './Sidebar'
import styles from './AppShell.module.css'

export default function AppShell() {
  const { factories, loading, error, reloadFactories } = useFactory()

  const dataState = loading ? (
    <Card title="Loading factory data…">
      <p className={styles.stateText}>Please wait while factory data loads.</p>
    </Card>
  ) : error ? (
    <Card title="Factory data could not be loaded">
      <p className={styles.stateText}>{error}</p>
      <Button variant="primary" onClick={() => void reloadFactories()}>
        Try again
      </Button>
    </Card>
  ) : factories.length === 0 ? (
    <Card title="No factory data yet">
      <p className={styles.stateText}>
        No factories are available from the configured data source.
      </p>
      <Button variant="primary" onClick={() => void reloadFactories()}>
        Try again
      </Button>
    </Card>
  ) : null

  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        {dataState ?? <Outlet />}
      </main>
    </div>
  )
}
