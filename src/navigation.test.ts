import { describe, it, expect } from 'vitest';
import { Navigation, isBackSwipe, isEntry } from './navigation';
import type { Entry, HistoryPort } from './navigation';
function setup() {
  const entries: Entry[] = []; let position = 0; let scroll = 0; let calls = 0;
  const port: HistoryPort = { get state() { return entries[position]; }, replaceState(e) { entries[position] = e; }, pushState(e) { entries.splice(++position); entries[position] = e; }, back() { calls++; position--; } };
  const nav = new Navigation(port, () => scroll, () => {});
  return { nav, port, setScroll: (y: number) => { scroll = y; }, calls: () => calls, forward: () => { position++; nav.pop(port.state); } };
}
describe('浏览器历史和返回状态', () => {
  it('首页不会触发返回退出', () => { const x = setup(); x.nav.back(); expect(x.calls()).toBe(0); });
  it('局部搜索、滚动及所属笔记本返回恢复', () => { const x = setup(); x.nav.go({ page: 'book', bookId: 'b', query: '' }); x.nav.query('supplier'); x.setScroll(420); x.nav.go({ page: 'detail', uid: 'n', bookId: 'b', query: '' }); x.nav.back(); x.nav.pop(x.port.state); expect(x.nav.entry.view).toEqual({ page: 'book', bookId: 'b', query: 'supplier' }); expect(x.nav.entry.scroll).toBe(420); });
  it('全局搜索详情返回原首页结果及位置', () => { const x = setup(); x.nav.query('day15'); x.setScroll(200); x.nav.go({ page: 'detail', uid: 'n', query: '' }); x.nav.back(); x.nav.pop(x.port.state); expect(x.nav.entry.view).toEqual({ page: 'home', query: 'day15' }); expect(x.nav.entry.scroll).toBe(200); });
  it('按钮与手势快速重复只调用一次 back', () => { const x = setup(); x.nav.go({ page: 'detail', uid: 'n', query: '' }); x.nav.back(); x.nav.back(); expect(x.calls()).toBe(1); });
  it('浏览器前进恢复详情', () => { const x = setup(); x.nav.go({ page: 'detail', uid: 'n', query: '' }); x.nav.back(); x.nav.pop(x.port.state); x.forward(); expect(x.nav.entry.view.uid).toBe('n'); });
  it('重新加载恢复 history state', () => { const x = setup(); x.nav.go({ page: 'book', bookId: 'b', query: 'hello' }); x.setScroll(100); x.nav.checkpoint(); const restored = new Navigation(x.port, () => 0, () => {}); expect(restored.entry.scroll).toBe(100); expect(restored.entry.view.query).toBe('hello'); });
  it('清空查询保留笔记本、恢复无搜索视图', () => { const x = setup(); x.nav.go({ page: 'book', bookId: 'b', query: 'hello' }); x.nav.query(''); expect(x.nav.entry.view).toEqual({ page: 'book', bookId: 'b', query: '' }); });
  it('未知历史状态安全回首页', () => { const x = setup(); x.nav.pop(null); expect(x.nav.entry.view.page).toBe('home'); expect(isEntry({})).toBe(false); });
});
describe('左边缘右滑误触保护', () => {
  const start = { x: 10, y: 100, time: 0, index: 2 };
  it('接受短时间左边缘水平右滑', () => expect(isBackSwipe(start, { x: 110, y: 105, time: 300 }, 2, false)).toBe(true));
  it.each([
    [{ ...start, x: 60 }, { x: 160, y: 100, time: 300 }, 2, false],
    [start, { x: 110, y: 200, time: 300 }, 2, false],
    [start, { x: 30, y: 100, time: 300 }, 2, false],
    [start, { x: 110, y: 100, time: 900 }, 2, false],
    [start, { x: 110, y: 100, time: 300 }, 2, true],
    [start, { x: 110, y: 100, time: 300 }, 1, false],
    [{ ...start, index: 0 }, { x: 110, y: 100, time: 300 }, 0, false],
    [start, { x: 0, y: 100, time: 300 }, 2, false],
  ] as const)('拒绝非边缘、滚动、短移、长按、选择、重复返回、首页或左滑 %#', (s, end, index, blocked) => expect(isBackSwipe(s, end, index, blocked)).toBe(false));
});
