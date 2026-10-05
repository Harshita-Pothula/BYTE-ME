import { Kit, std } from '../machines/kit';

/** Materials shared by the static building (no per-object highlight needed). */
let cached: { steel: ReturnType<typeof std>; kit: Kit } | null = null;

export function envMats() {
  return (cached ??= { steel: std(0x4d4540, 0.6, 0.45), kit: new Kit() });
}
