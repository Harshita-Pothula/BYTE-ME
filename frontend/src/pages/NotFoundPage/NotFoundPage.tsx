import { Link } from 'react-router-dom'
import Card from '../../components/Card/Card'
import PageHeader from '../../components/PageHeader/PageHeader'

export default function NotFoundPage() {
  return (
    <>
      <PageHeader eyebrow="404" title="Page not found" />
      <Card title="This route is not available">
        <p>The page may have moved or no longer be part of ByteMe.</p>
        <Link to="/">Return to the dashboard</Link>
      </Card>
    </>
  )
}
