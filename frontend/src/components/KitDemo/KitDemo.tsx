import { useState } from 'react'
import Button from '../Button/Button'
import Card from '../Card/Card'
import StatusChip from '../StatusChip/StatusChip'
import KpiCard from '../KpiCard/KpiCard'
import ProgressBar from '../ProgressBar/ProgressBar'
import SegmentedToggle from '../SegmentedToggle/SegmentedToggle'
import Field from '../Field/Field'
import Legend from '../Legend/Legend'
import PageHeader from '../PageHeader/PageHeader'
import StatTile from '../StatTile/StatTile'
import { useFactory } from '../../context/useFactory'

const PLAY_ICON = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
    style={{ display: 'inline-block' }}
  >
    <path
      d="M8 5.14v14l11-6.75-5.14-4.86z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

export default function KitDemo() {
  const [selected, setSelected] = useState('second')
  const { factory } = useFactory()

  const toggleOptions = [
    { value: 'first', label: 'First' },
    { value: 'second', label: 'Second' },
    { value: 'third', label: 'Third', disabled: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader eyebrow={`${factory.name} · Sample data`} title="Shared components" />

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>Button</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <Button variant="primary">Primary</Button>
          <Button variant="primary" icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: 'inline-block' }}><path d="M3 12l5 5L16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}>With icon</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="dark">Dark</Button>
          <Button variant="primary" disabled>Disabled</Button>
          <Button variant="primary" isLoading>Loading</Button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card title="Card with title and actions">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p>Card body with a 16px gap.</p>
            <p>Every page reuses this.</p>
          </div>
        </Card>
        <Card title="Card with action" action={<Button variant="secondary">Open</Button>}>
          <p>Action sits on the right of the title.</p>
        </Card>
        <Card>
          <p style={{ margin: 0 }}>Card with no title (only body).</p>
        </Card>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>StatusChip</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <StatusChip status="Running">Running</StatusChip>
          <StatusChip status="Idle">Idle</StatusChip>
          <StatusChip status="Maintenance">Maintenance</StatusChip>
          <StatusChip status="Saved">Saved</StatusChip>
          <StatusChip status="Solar">Solar</StatusChip>
          <StatusChip status="Peak">Peak</StatusChip>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>KpiCard</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
          <KpiCard label="Energy cost saved" value="₹ 18,400" delta="−22%" note="vs baseline" dotColor="var(--teal)" />
          <KpiCard label="Makespan" value="19.5 h" delta="−1.5 h" note="from 21 h" dotColor="var(--caramel)" />
          <KpiCard label="Solar share" value="41%" delta="+16 pts" dotColor="var(--sun)" />
          <KpiCard label="Machine utilization" value="78%" delta="+9 pts" dotColor="var(--plum)" />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>ProgressBar</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 400 }}>
          <div><p>Utilization</p><ProgressBar value={78} color="var(--caramel)" ariaLabel="Utilization: 78%" /></div>
          <div><p>Solar (10px by default)</p><ProgressBar value={41} height={10} color="var(--sun)" ariaLabel="Solar: 41%" /></div>
          <div><p>Teal (optimized)</p><ProgressBar value={84} color="var(--teal)" ariaLabel="Optimized: 84%" /></div>
          <div><p>Toffee (idle)</p><ProgressBar value={52} color="var(--toffee)" ariaLabel="Idle: 52%" /></div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>SegmentedToggle</h2>
        <SegmentedToggle
          options={toggleOptions}
          value={selected}
          onChange={setSelected}
          ariaLabel="Schedule version"
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>Field</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Field id="factory-name" label="Factory name" helper="Tip: tariffs come from your electricity bill.">
            <input id="factory-name" type="text" placeholder="e.g. My Plant" />
          </Field>
          <Field id="industry" label="Industry">
            <select id="industry">
              <option>Food processing</option>
              <option>Textiles</option>
              <option>Other</option>
            </select>
          </Field>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>Legend</h2>
        <Legend
          items={[
            { label: 'Solar', color: 'var(--sun)', shape: 'dot' },
            { label: 'Grid', color: 'var(--grid-brown)', shape: 'dot' },
            { label: 'Peak price', color: 'var(--terracotta)', shape: 'dashed' },
            { label: 'Solar window', color: 'var(--sun-soft)', shape: 'square' },
          ]}
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>PageHeader</h2>
        <PageHeader
          eyebrow={`${factory.name} · Sample data`}
          title="Factory dashboard"
          actions={[
            <Button key="secondary" variant="secondary">Export report</Button>,
            <Button key="primary" variant="primary" icon={PLAY_ICON}>Run optimization</Button>,
          ]}
        />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>StatTile</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <StatTile label="Makespan" value="19.5 h" />
          <StatTile label="Energy cost" value="₹ 65,200" />
          <StatTile label="Solar share" value="41%" />
          <StatTile label="Processes shifted" value="9" />
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, margin: 0, fontSize: 22 }}>Focus ring check</h2>
        <p style={{ color: 'var(--text-2)', margin: 0 }}>Tab through the demo above: every control should show a 3px sun-coloured outline with 2px offset.</p>
      </section>
    </div>
  )
}
