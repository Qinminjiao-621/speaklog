export type View = { page: 'home' | 'book' | 'detail' | 'add' | 'edit' | 'backup'; bookId?: string; uid?: string; query: string };
export interface Entry { speaklog: 2; index: number; view: View; scroll: number }
export interface HistoryPort {
  state: unknown;
  replaceState(data: Entry, title: string): void;
  pushState(data: Entry, title: string): void;
  back(): void;
}
export const homeView = (): View => ({ page: 'home', query: '' });
export function isEntry(v: unknown): v is Entry {
  const x = v as Entry | null;
  return !!x && x.speaklog === 2 && Number.isInteger(x.index) && x.index >= 0 &&
    !!x.view && ['home', 'book', 'detail', 'add', 'edit', 'backup'].includes(x.view.page) &&
    typeof x.view.query === 'string' && Number.isFinite(x.scroll);
}
export class Navigation {
  entry: Entry;
  private returning = false;
  constructor(private history: HistoryPort, private scroll: () => number, private changed: (e: Entry) => void) {
    this.entry = isEntry(history.state) ? history.state : { speaklog: 2, index: 0, view: homeView(), scroll: 0 };
    history.replaceState(this.entry, '');
  }
  private publish(entry: Entry) { this.entry = entry; this.changed(entry); }
  checkpoint() { this.entry = { ...this.entry, scroll: this.scroll() }; this.history.replaceState(this.entry, ''); }
  go(view: View) {
    this.checkpoint(); const next: Entry = { speaklog: 2, index: this.entry.index + 1, view, scroll: 0 };
    this.history.pushState(next, ''); this.returning = false; this.publish(next);
  }
  replace(view: View) {
    const next = { ...this.entry, view, scroll: 0 };
    this.history.replaceState(next, ''); this.publish(next);
  }
  query(query: string) {
    const next = { ...this.entry, view: { ...this.entry.view, query }, scroll: 0 };
    this.history.replaceState(next, ''); this.publish(next);
  }
  back() {
    if (this.entry.index === 0 || this.returning) return;
    this.returning = true; this.history.back();
  }
  pop(state: unknown) {
    this.returning = false;
    if (isEntry(state)) this.publish(state);
    else { const next: Entry = { speaklog: 2, index: 0, view: homeView(), scroll: 0 }; this.history.replaceState(next, ''); this.publish(next); }
  }
}
export interface Swipe { x: number; y: number; time: number; index: number }
export function isBackSwipe(start: Swipe, end: { x: number; y: number; time: number }, index: number, blocked: boolean) {
  const dx = end.x - start.x; const dy = Math.abs(end.y - start.y);
  return !blocked && start.index === index && index > 0 && start.x <= 24 && start.x >= 0 && dx >= 75 && dy <= 30 && dx > dy * 2 && end.time - start.time < 700;
}
