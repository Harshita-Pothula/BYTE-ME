import { useViewStore } from '../../state/viewStore';

/** Crosshair and key hint while walking. */
export function WalkOverlay() {
  const walk = useViewStore((s) => s.mode === 'walk');
  const fallback = useViewStore((s) => s.walkFallback);
  if (!walk) return null;
  return (
    <>
      <div className="crosshair" />
      <div className="panel hint">
        <b>W A S D</b> to move, <b>{fallback ? 'drag' : 'mouse'}</b> to look, <b>Shift</b> to run, <b>Esc</b> to leave
        {fallback && <small>Mouse capture isn&rsquo;t available here, so drag to look around.</small>}
      </div>
    </>
  );
}
