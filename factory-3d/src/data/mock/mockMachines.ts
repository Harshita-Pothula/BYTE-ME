import type { MachineData } from '../types';

export const MOCK_MACHINES: MachineData[] = [
  { machine_id: 'raw_material_storage', name: 'Raw Material Storage', status: 'running', power_kw: 6, production_duration_minutes: 60, start_time: '06:00', end_time: '07:00' },
  { machine_id: 'roaster', name: 'Cocoa Roaster', status: 'running', power_kw: 45, production_duration_minutes: 120, start_time: '06:30', end_time: '08:30' },
  { machine_id: 'grinder', name: 'Grinder', status: 'running', power_kw: 30, production_duration_minutes: 120, start_time: '08:00', end_time: '10:00' },
  { machine_id: 'mixer', name: 'Mixer', status: 'running', power_kw: 18, production_duration_minutes: 60, start_time: '10:00', end_time: '11:00' },
  { machine_id: 'refiner', name: 'Five-Roll Refiner', status: 'running', power_kw: 40, production_duration_minutes: 90, start_time: '10:30', end_time: '12:00' },
  { machine_id: 'conche', name: 'Conching Machine', status: 'running', power_kw: 35, production_duration_minutes: 180, start_time: '12:00', end_time: '15:00' },
  { machine_id: 'tempering', name: 'Tempering Unit', status: 'running', power_kw: 22, production_duration_minutes: 60, start_time: '15:00', end_time: '16:00' },
  { machine_id: 'moulding', name: 'Moulding Line', status: 'running', power_kw: 15, production_duration_minutes: 90, start_time: '15:30', end_time: '17:00' },
  { machine_id: 'cooling', name: 'Cooling Tunnel', status: 'warning', power_kw: 28, production_duration_minutes: 45, start_time: '16:00', end_time: '16:45', message: 'Tunnel at 16 °C, above the 14 °C target. Check the refrigeration unit.' },
  { machine_id: 'packaging', name: 'Packaging Machine', status: 'maintenance', power_kw: 12, production_duration_minutes: 120, start_time: '16:30', end_time: '18:30', message: 'Film roll jam cleared. Sensor recalibration until 17:30, so bars are queuing upstream.' },
  { machine_id: 'finished_goods_storage', name: 'Finished Goods Storage', status: 'running', power_kw: 3, production_duration_minutes: 30, start_time: '18:30', end_time: '19:00' },
];
