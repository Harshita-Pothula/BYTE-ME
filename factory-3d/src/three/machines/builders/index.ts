import type { MachineId } from '../../../config/layout';
import type { MachineBuilder } from './types';
import { conche, grinder, mixer, rawMaterialStorage, refiner, roaster } from './partA';
import { cooling, finishedGoodsStorage, moulding, packaging, tempering } from './partB';

/** Procedural stand-ins; a GLB with the same ids could replace any of them. */
export const BUILDERS: Record<MachineId, MachineBuilder> = {
  raw_material_storage: rawMaterialStorage,
  roaster,
  grinder,
  mixer,
  refiner,
  conche,
  tempering,
  moulding,
  cooling,
  packaging,
  finished_goods_storage: finishedGoodsStorage,
};

export type { Anim, MachineBuilder } from './types';
