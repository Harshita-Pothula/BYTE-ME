import type {
  CompareMetric,
  Factory,
  FactoryKpi,
  HourEnergy,
  Machine,
  MachineType,
  ScheduleBlock,
  Stage,
} from './types'

// SAMPLE DATA ONLY. Replace this module with API-backed data in the data phase.
const CHOCOLATE_SOLAR = [
  0, 0, 0, 0, 0, 0, 2, 8, 18, 30, 40, 46, 48, 46, 40, 30, 18, 8, 2, 0, 0,
  0, 0, 0,
]

const CHOCOLATE_GRID = [
  12, 12, 12, 12, 14, 16, 20, 18, 12, 8, 6, 6, 6, 6, 8, 10, 14, 18, 14, 10,
  10, 12, 12, 12,
]

function createEnergyByHour(solarFactor: number, gridFactor: number): HourEnergy[] {
  return CHOCOLATE_SOLAR.map((solarKwh, hour) => ({
    hour,
    solarKwh: Math.round(solarKwh * solarFactor),
    gridKwh: Math.round(CHOCOLATE_GRID[hour] * gridFactor),
    tariff:
      hour >= 18 && hour <= 21
        ? 'peak'
        : hour >= 6 && hour <= 9
          ? 'mid'
          : 'off',
  }))
}

function createMachine(
  id: string,
  name: string,
  type: MachineType,
  ratedKw: number,
  status: Machine['status'] = 'Running',
  utilization = 78,
  currentJob = 'Production batch',
  onSolar = true,
): Machine {
  return { id, name, type, ratedKw, status, utilization, currentJob, onSolar }
}

function createStage(id: string, name: string, machines: Machine[]): Stage {
  return { id, name, machines }
}

const CHOCOLATE_KPIS: FactoryKpi[] = [
  {
    label: 'Energy cost saved',
    value: '₹ 18,400',
    delta: '−22%',
    note: 'vs baseline',
    dotColor: 'var(--teal)',
  },
  {
    label: 'Makespan',
    value: '19.5 h',
    delta: '−1.5 h',
    note: 'from 21 h',
    dotColor: 'var(--caramel)',
  },
  {
    label: 'Solar share',
    value: '41%',
    delta: '+16 pts',
    note: 'vs baseline',
    dotColor: 'var(--sun)',
  },
  {
    label: 'Machine utilization',
    value: '78%',
    delta: '+9 pts',
    note: 'vs baseline',
    dotColor: 'var(--plum)',
  },
]

function createCompareMetrics(
  baselineCost: number,
  optimizedCost: number,
  baselineGrid: number,
  optimizedGrid: number,
  baselinePeak: number,
  optimizedPeak: number,
  baselineMakespan: number,
  optimizedMakespan: number,
): CompareMetric[] {
  const formatChange = (baseline: number, optimized: number) => {
    const change = Math.round(((optimized - baseline) / baseline) * 100)
    const sign = change < 0 ? '−' : change > 0 ? '+' : ''
    return `${sign}${Math.abs(change)}%`
  }

  return [
    {
      label: 'Energy cost',
      baseline: `₹ ${baselineCost.toLocaleString('en-IN')}`,
      optimized: `₹ ${optimizedCost.toLocaleString('en-IN')}`,
      baselinePct: 100,
      optimizedPct: Math.round((optimizedCost / baselineCost) * 100),
      change: formatChange(baselineCost, optimizedCost),
    },
    {
      label: 'Grid energy',
      baseline: `${baselineGrid.toLocaleString('en-IN')} kWh`,
      optimized: `${optimizedGrid.toLocaleString('en-IN')} kWh`,
      baselinePct: 100,
      optimizedPct: Math.round((optimizedGrid / baselineGrid) * 100),
      change: formatChange(baselineGrid, optimizedGrid),
    },
    {
      label: 'Peak demand',
      baseline: `${baselinePeak} kW`,
      optimized: `${optimizedPeak} kW`,
      baselinePct: 100,
      optimizedPct: Math.round((optimizedPeak / baselinePeak) * 100),
      change: formatChange(baselinePeak, optimizedPeak),
    },
    {
      label: 'Makespan',
      baseline: `${baselineMakespan} h`,
      optimized: `${optimizedMakespan} h`,
      baselinePct: 100,
      optimizedPct: Math.round((optimizedMakespan / baselineMakespan) * 100),
      change: formatChange(baselineMakespan, optimizedMakespan),
    },
  ]
}

const CHOCOLATE_BASELINE: ScheduleBlock[] = [
  { id: 'choc-roast-base', processName: 'Roasting', machineId: 'roaster-r1', start: 6, end: 9, colorKey: 'roast', shifted: false },
  { id: 'choc-grind-base', processName: 'Grinding', machineId: 'grinder-g2', start: 9, end: 12, colorKey: 'grind', shifted: false },
  { id: 'choc-conche-base', processName: 'Conching', machineId: 'conche-c1', start: 12, end: 16, colorKey: 'conche', shifted: false },
  { id: 'choc-temper-base', processName: 'Tempering', machineId: 'tempering-t1', start: 16, end: 18, colorKey: 'temper', shifted: false },
  { id: 'choc-mould-base', processName: 'Moulding', machineId: 'moulding-m1', start: 18, end: 20, colorKey: 'mould', shifted: false },
  { id: 'choc-pack-base', processName: 'Packaging', machineId: 'packaging-line', start: 20, end: 22, colorKey: 'pack', shifted: false },
]

const CHOCOLATE_OPTIMIZED: ScheduleBlock[] = [
  { id: 'choc-roast-opt', processName: 'Roasting', machineId: 'roaster-r1', start: 8, end: 11, colorKey: 'roast', shifted: true },
  { id: 'choc-grind-opt', processName: 'Grinding', machineId: 'grinder-g2', start: 10, end: 13, colorKey: 'grind', shifted: true },
  { id: 'choc-conche-opt', processName: 'Conching', machineId: 'conche-c1', start: 12, end: 16, colorKey: 'conche', shifted: false },
  { id: 'choc-temper-opt', processName: 'Tempering', machineId: 'tempering-t1', start: 14, end: 16, colorKey: 'temper', shifted: true },
  { id: 'choc-mould-opt', processName: 'Moulding', machineId: 'moulding-m1', start: 16, end: 18, colorKey: 'mould', shifted: true },
  { id: 'choc-pack-opt', processName: 'Packaging', machineId: 'packaging-line', start: 17, end: 19, colorKey: 'pack', shifted: true },
]

function remapSchedule(
  schedule: ScheduleBlock[],
  factoryId: string,
  tasks: { processName: string; machineId: string }[],
): ScheduleBlock[] {
  return schedule.map((block, index) => ({
    ...block,
    id: `${factoryId}-${block.id}`,
    ...tasks[index],
  }))
}

export const factories: Factory[] = [
  {
    id: 'choc',
    name: 'Chocolate Factory',
    has3dModel: true,
    solarCapacityKw: 60,
    solarNowKw: 42,
    gridNowKw: 26,
    gridMaxKw: 64,
    stages: [
      createStage('bean-store', 'Bean store', [
        createMachine('bean-silo', 'Bean silo', 'generic', 6, 'Idle', 0, 'No active job', false),
      ]),
      createStage('roasting', 'Roasting', [
        createMachine('roaster-r1', 'Roaster R-1', 'oven', 45, 'Running', 86, 'Cocoa bean roast', true),
        createMachine('winnower', 'Winnower', 'conveyor', 10, 'Running', 74, 'Winnowing roasted beans', true),
      ]),
      createStage('grinding-conching', 'Grinding & conching', [
        createMachine('grinder-g2', 'Grinder G-2', 'grinder', 30, 'Running', 81, 'Chocolate liquor', true),
        createMachine('conche-c1', 'Conche C-1', 'mixer', 55, 'Running', 78, 'Dark chocolate batch', true),
      ]),
      createStage('tempering-moulding', 'Tempering & moulding', [
        createMachine('tempering-t1', 'Tempering T-1', 'tank', 18, 'Running', 72, 'Tempering batch', true),
        createMachine('moulding-m1', 'Moulding M-1', 'conveyor', 15, 'Running', 76, 'Chocolate bars', true),
      ]),
      createStage('packaging', 'Packaging', [
        createMachine('packaging-line', 'Packaging line', 'packer', 12, 'Maintenance', 0, 'Scheduled maintenance', false),
      ]),
    ],
    kpis: CHOCOLATE_KPIS,
    energyByHour: createEnergyByHour(1, 1),
    compare: createCompareMetrics(83600, 65200, 1240, 880, 64, 48, 21, 19.5),
    baselineSchedule: CHOCOLATE_BASELINE,
    optimizedSchedule: CHOCOLATE_OPTIMIZED,
    shifted: [
      { process: 'Roasting', machine: 'Roaster R-1', was: '06:00–09:00', now: '08:00–11:00', reason: 'Use solar', saved: '₹ 4,200' },
      { process: 'Grinding', machine: 'Grinder G-2', was: '09:00–12:00', now: '10:00–13:00', reason: 'Use solar', saved: '₹ 2,800' },
      { process: 'Tempering', machine: 'Tempering T-1', was: '16:00–18:00', now: '14:00–16:00', reason: 'Avoid peak', saved: '₹ 1,600' },
      { process: 'Packaging', machine: 'Packaging line', was: '20:00–22:00', now: '17:00–19:00', reason: 'Off-peak rate', saved: '₹ 1,200' },
    ],
  },
  {
    id: 'cosmetics',
    name: 'Cosmetics Plant',
    has3dModel: false,
    solarCapacityKw: 48,
    solarNowKw: 31,
    gridNowKw: 34,
    gridMaxKw: 58,
    stages: [
      createStage('raw-materials', 'Raw materials', [
        createMachine('ingredient-store', 'Ingredient store', 'generic', 8, 'Idle', 0, 'No active job', false),
      ]),
      createStage('mixing', 'Mixing', [
        createMachine('emulsifier-e1', 'Emulsifier E-1', 'mixer', 32, 'Running', 82, 'Moisturizer batch', true),
        createMachine('heating-tank', 'Heating tank', 'tank', 24, 'Running', 70, 'Base heating', true),
      ]),
      createStage('filling', 'Filling', [
        createMachine('tube-filler-f1', 'Tube filler F-1', 'filler', 16, 'Running', 76, 'Tube filling', true),
        createMachine('bottle-filler-f2', 'Bottle filler F-2', 'filler', 18, 'Running', 73, 'Bottle filling', true),
      ]),
      createStage('capping-labeling', 'Capping & labeling', [
        createMachine('capper-c1', 'Capper C-1', 'conveyor', 9, 'Running', 78, 'Capping', true),
        createMachine('labeler-l1', 'Labeler L-1', 'conveyor', 8, 'Maintenance', 0, 'Scheduled maintenance', false),
      ]),
      createStage('packing-dispatch', 'Packing & dispatch', [
        createMachine('carton-packer', 'Carton packer', 'packer', 14, 'Running', 79, 'Carton packing', true),
      ]),
    ],
    kpis: [
      { label: 'Energy cost saved', value: '₹ 15,900', delta: '−20%', note: 'vs baseline', dotColor: 'var(--teal)' },
      { label: 'Makespan', value: '18 h', delta: '−1.2 h', note: 'from 19.2 h', dotColor: 'var(--caramel)' },
      { label: 'Solar share', value: '38%', delta: '+13 pts', note: 'vs baseline', dotColor: 'var(--sun)' },
      { label: 'Machine utilization', value: '76%', delta: '+8 pts', note: 'vs baseline', dotColor: 'var(--plum)' },
    ],
    energyByHour: createEnergyByHour(0.82, 1.12),
    compare: createCompareMetrics(79500, 63600, 1180, 838, 58, 44, 19.2, 18),
    baselineSchedule: remapSchedule(CHOCOLATE_BASELINE, 'cosmetics', [
      { processName: 'Raw materials', machineId: 'ingredient-store' },
      { processName: 'Mixing', machineId: 'emulsifier-e1' },
      { processName: 'Filling', machineId: 'tube-filler-f1' },
      { processName: 'Capping', machineId: 'capper-c1' },
      { processName: 'Labeling', machineId: 'labeler-l1' },
      { processName: 'Packing & dispatch', machineId: 'carton-packer' },
    ]),
    optimizedSchedule: remapSchedule(CHOCOLATE_OPTIMIZED, 'cosmetics', [
      { processName: 'Raw materials', machineId: 'ingredient-store' },
      { processName: 'Mixing', machineId: 'emulsifier-e1' },
      { processName: 'Filling', machineId: 'tube-filler-f1' },
      { processName: 'Capping', machineId: 'capper-c1' },
      { processName: 'Labeling', machineId: 'labeler-l1' },
      { processName: 'Packing & dispatch', machineId: 'carton-packer' },
    ]),
    shifted: [
      { process: 'Mixing', machine: 'Emulsifier E-1', was: '06:00–09:00', now: '08:00–11:00', reason: 'Use solar', saved: '₹ 3,600' },
      { process: 'Filling', machine: 'Tube filler F-1', was: '18:00–20:00', now: '15:00–17:00', reason: 'Avoid peak', saved: '₹ 1,400' },
    ],
  },
  {
    id: 'textile',
    name: 'Textile Mill',
    has3dModel: false,
    solarCapacityKw: 72,
    solarNowKw: 48,
    gridNowKw: 52,
    gridMaxKw: 92,
    stages: [
      createStage('fibre-prep', 'Fibre prep', [
        createMachine('blow-room', 'Blow room', 'generic', 28, 'Running', 80, 'Cotton opening', true),
      ]),
      createStage('spinning', 'Spinning', [
        createMachine('carding-c1', 'Carding C-1', 'generic', 22, 'Running', 75, 'Carding cotton', true),
        createMachine('ring-frame-r1', 'Ring frame R-1', 'generic', 35, 'Running', 83, 'Yarn spinning', true),
      ]),
      createStage('weaving', 'Weaving', [
        createMachine('loom-bank-a', 'Loom bank A', 'generic', 40, 'Running', 78, 'Fabric weaving', true),
        createMachine('loom-bank-b', 'Loom bank B', 'generic', 40, 'Running', 74, 'Fabric weaving', true),
      ]),
      createStage('dyeing', 'Dyeing', [
        createMachine('dye-vessel-d1', 'Dye vessel D-1', 'tank', 30, 'Maintenance', 0, 'Scheduled maintenance', false),
      ]),
      createStage('finishing', 'Finishing', [
        createMachine('stenter-s1', 'Stenter S-1', 'oven', 38, 'Running', 77, 'Heat setting', true),
      ]),
    ],
    kpis: [
      { label: 'Energy cost saved', value: '₹ 24,600', delta: '−24%', note: 'vs baseline', dotColor: 'var(--teal)' },
      { label: 'Makespan', value: '22 h', delta: '−1.8 h', note: 'from 23.8 h', dotColor: 'var(--caramel)' },
      { label: 'Solar share', value: '43%', delta: '+17 pts', note: 'vs baseline', dotColor: 'var(--sun)' },
      { label: 'Machine utilization', value: '79%', delta: '+10 pts', note: 'vs baseline', dotColor: 'var(--plum)' },
    ],
    energyByHour: createEnergyByHour(1.08, 1.28),
    compare: createCompareMetrics(102500, 77900, 1560, 1108, 92, 69, 23.8, 22),
    baselineSchedule: remapSchedule(CHOCOLATE_BASELINE, 'textile', [
      { processName: 'Fibre prep', machineId: 'blow-room' },
      { processName: 'Spinning', machineId: 'carding-c1' },
      { processName: 'Spinning', machineId: 'ring-frame-r1' },
      { processName: 'Weaving', machineId: 'loom-bank-a' },
      { processName: 'Weaving', machineId: 'loom-bank-b' },
      { processName: 'Dyeing', machineId: 'dye-vessel-d1' },
    ]),
    optimizedSchedule: remapSchedule(CHOCOLATE_OPTIMIZED, 'textile', [
      { processName: 'Fibre prep', machineId: 'blow-room' },
      { processName: 'Spinning', machineId: 'carding-c1' },
      { processName: 'Spinning', machineId: 'ring-frame-r1' },
      { processName: 'Weaving', machineId: 'loom-bank-a' },
      { processName: 'Weaving', machineId: 'loom-bank-b' },
      { processName: 'Dyeing', machineId: 'dye-vessel-d1' },
    ]),
    shifted: [
      { process: 'Spinning', machine: 'Ring frame R-1', was: '18:00–22:00', now: '10:00–14:00', reason: 'Use solar', saved: '₹ 5,100' },
      { process: 'Finishing', machine: 'Stenter S-1', was: '19:00–22:00', now: '14:00–17:00', reason: 'Avoid peak', saved: '₹ 2,300' },
    ],
  },
  {
    id: 'bottling',
    name: 'Bottling Plant',
    has3dModel: false,
    solarCapacityKw: 55,
    solarNowKw: 37,
    gridNowKw: 29,
    gridMaxKw: 61,
    stages: [
      createStage('water-treatment', 'Water treatment', [
        createMachine('ro-unit', 'RO unit', 'generic', 20, 'Running', 72, 'Water purification', true),
      ]),
      createStage('blow-moulding', 'Blow moulding', [
        createMachine('blow-moulder-b1', 'Blow moulder B-1', 'oven', 42, 'Running', 84, 'Bottle moulding', true),
      ]),
      createStage('filling-capping', 'Filling & capping', [
        createMachine('rinser-filler', 'Rinser-filler', 'filler', 26, 'Running', 81, 'Bottle filling', true),
        createMachine('capper', 'Capper', 'conveyor', 12, 'Running', 76, 'Bottle capping', true),
      ]),
      createStage('labeling', 'Labeling', [
        createMachine('labeler-l2', 'Labeler L-2', 'conveyor', 10, 'Running', 78, 'Bottle labeling', true),
      ]),
      createStage('shrink-wrap', 'Shrink wrap', [
        createMachine('shrink-tunnel', 'Shrink tunnel', 'oven', 18, 'Running', 74, 'Pack wrapping', true),
      ]),
    ],
    kpis: [
      { label: 'Energy cost saved', value: '₹ 17,200', delta: '−21%', note: 'vs baseline', dotColor: 'var(--teal)' },
      { label: 'Makespan', value: '17.5 h', delta: '−1.4 h', note: 'from 18.9 h', dotColor: 'var(--caramel)' },
      { label: 'Solar share', value: '40%', delta: '+15 pts', note: 'vs baseline', dotColor: 'var(--sun)' },
      { label: 'Machine utilization', value: '77%', delta: '+9 pts', note: 'vs baseline', dotColor: 'var(--plum)' },
    ],
    energyByHour: createEnergyByHour(0.9, 0.96),
    compare: createCompareMetrics(81400, 64200, 1210, 859, 61, 46, 18.9, 17.5),
    baselineSchedule: remapSchedule(CHOCOLATE_BASELINE, 'bottling', [
      { processName: 'Water treatment', machineId: 'ro-unit' },
      { processName: 'Blow moulding', machineId: 'blow-moulder-b1' },
      { processName: 'Filling', machineId: 'rinser-filler' },
      { processName: 'Capping', machineId: 'capper' },
      { processName: 'Labeling', machineId: 'labeler-l2' },
      { processName: 'Shrink wrap', machineId: 'shrink-tunnel' },
    ]),
    optimizedSchedule: remapSchedule(CHOCOLATE_OPTIMIZED, 'bottling', [
      { processName: 'Water treatment', machineId: 'ro-unit' },
      { processName: 'Blow moulding', machineId: 'blow-moulder-b1' },
      { processName: 'Filling', machineId: 'rinser-filler' },
      { processName: 'Capping', machineId: 'capper' },
      { processName: 'Labeling', machineId: 'labeler-l2' },
      { processName: 'Shrink wrap', machineId: 'shrink-tunnel' },
    ]),
    shifted: [
      { process: 'Blow moulding', machine: 'Blow moulder B-1', was: '18:00–21:00', now: '10:00–13:00', reason: 'Use solar', saved: '₹ 4,100' },
      { process: 'Filling & capping', machine: 'Rinser-filler', was: '19:00–22:00', now: '15:00–18:00', reason: 'Avoid peak', saved: '₹ 1,900' },
    ],
  },
]

export default factories
