import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigation, homeView, isBackSwipe } from './navigation';
import type { Entry, Swipe } from './navigation';

export function useNavigation(ready: boolean, enabled: boolean) {
  const [entry, setEntry] = useState<Entry>({ speaklog: 2, index: 0, view: homeView(), scroll: 0 });
  const nav = useRef<Navigation | null>(null);
  useEffect(() => {
    const oldRestoration = history.scrollRestoration; history.scrollRestoration = 'manual';
    const controller = new Navigation(history, () => window.scrollY, setEntry); nav.current = controller; setEntry(controller.entry);
    const pop = (e: PopStateEvent) => controller.pop(e.state);
    const save = () => controller.checkpoint();
    window.addEventListener('popstate', pop); window.addEventListener('pagehide', save);
    return () => { window.removeEventListener('popstate', pop); window.removeEventListener('pagehide', save); history.scrollRestoration = oldRestoration; };
  }, []);
  useLayoutEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, entry.scroll));
    return () => cancelAnimationFrame(frame);
  }, [entry, ready]);
  useEffect(() => {
    if (entry.view.page !== 'detail' || !enabled) return;
    let start: Swipe | undefined; let claimed = false;
    const selected = () => !!window.getSelection()?.toString();
    const clear = () => { start = undefined; claimed = false; };
    const begin = (e: TouchEvent) => {
      clear();
      if (e.touches.length !== 1 || selected() || (e.target instanceof Element && e.target.closest('button,a,input,textarea,select,summary,[contenteditable]'))) return;
      const t = e.touches[0]; if (t.clientX > 24) return;
      start = { x: t.clientX, y: t.clientY, time: Date.now(), index: entry.index };
    };
    const move = (e: TouchEvent) => {
      if (!start) return;
      if (e.touches.length !== 1 || selected() || Date.now() - start.time >= 700) { clear(); return; }
      const t = e.touches[0]; const dx = t.clientX - start.x; const dy = Math.abs(t.clientY - start.y);
      if (dy > 30 || dx < -10 || (dy > 12 && dy > dx)) { clear(); return; }
      if (dx > 18 && dx > dy * 2) {
        if (!e.cancelable) { clear(); return; }
        e.preventDefault(); claimed = e.defaultPrevented;
      }
    };
    const end = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (start && claimed && t && isBackSwipe(start, { x: t.clientX, y: t.clientY, time: Date.now() }, nav.current!.entry.index, selected())) nav.current?.back();
      clear();
    };
    // Only claim an explicitly horizontal, cancelable gesture. Native Safari
    // navigation cancels touch events; no synthetic second back is issued.
    document.addEventListener('touchstart', begin, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end); document.addEventListener('touchcancel', clear);
    return () => { document.removeEventListener('touchstart', begin); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', clear); };
  }, [entry.index, entry.view.page, enabled]);
  return { entry, nav };
}
