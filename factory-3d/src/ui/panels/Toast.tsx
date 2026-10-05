import { useEffect, useState } from 'react';
import { useViewStore } from '../../state/viewStore';

/** Top-centre notice for live-simulation changes; auto-hides after 3.2 s. */
export function Toast() {
  const toast = useViewStore((s) => s.toast);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <div className={`toast${show ? ' show' : ''}`} role="status" aria-live="polite">
      {toast?.msg}
    </div>
  );
}
