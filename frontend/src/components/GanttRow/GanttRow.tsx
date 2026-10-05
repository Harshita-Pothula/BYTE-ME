import type { CSSProperties } from 'react'
import type { ScheduleBlock } from '../../data/types'
import styles from './GanttRow.module.css'

const BLOCK_CLASSES: Record<ScheduleBlock['colorKey'], string> = {
  roast: styles.roast,
  grind: styles.grind,
  conche: styles.conche,
  temper: styles.temper,
  mould: styles.mould,
  pack: styles.pack,
}

function formatTime(hour: number) {
  return `${Math.floor(hour)}:${hour % 1 === 0 ? '00' : '30'}`
}

interface GanttRowProps {
  label: string
  sublabel?: string
  blocks: ScheduleBlock[]
  height?: number
  trackStyle?: CSSProperties
  compact?: boolean
  autoLanes?: boolean
}

export default function GanttRow({
  label,
  sublabel,
  blocks,
  height = 44,
  trackStyle,
  compact = false,
  autoLanes = false,
}: GanttRowProps) {
  const laneByBlockId = new Map<string, number>()
  let laneCount = 1
  if (autoLanes) {
    const laneEnds: number[] = []
    for (const block of [...blocks].sort((left, right) => left.start - right.start)) {
      let lane = laneEnds.findIndex((end) => end <= block.start)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = block.end
      laneByBlockId.set(block.id, lane)
    }
    laneCount = Math.max(1, laneEnds.length)
  }
  const trackHeight = autoLanes ? laneCount * 32 + 8 : height

  return (
    <div
      className={`${styles.row}${compact ? ` ${styles.compactRow}` : ''}`}
      role="group"
      aria-label={`${label} schedule`}
    >
      <div className={styles.label}>
        <strong>{label}</strong>
        {sublabel && <span>{sublabel}</span>}
      </div>
      <div className={styles.track} style={{ height: trackHeight, ...trackStyle }}>
        {blocks.map((block) => (
          <span
            className={`${styles.block} ${BLOCK_CLASSES[block.colorKey]}${compact ? ` ${styles.compact}` : ''}${autoLanes ? ` ${styles.lanedBlock}` : ''}${block.shifted ? ` ${styles.shifted}` : ''}`}
            key={block.id}
            style={{
              left: `${(block.start / 24) * 100}%`,
              width: `${((block.end - block.start) / 24) * 100}%`,
              ...(autoLanes
                ? {
                    top: `${4 + (laneByBlockId.get(block.id) ?? 0) * 32}px`,
                    bottom: 'auto',
                    height: '28px',
                  }
                : {}),
            }}
            title={`${block.processName} · ${formatTime(block.start)}–${formatTime(block.end)}`}
          >
            {block.processName}
          </span>
        ))}
      </div>
    </div>
  )
}
