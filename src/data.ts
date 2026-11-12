import { openDB } from 'idb';

export interface Sentence { id: string; en: string; zh: string; tip?: string }
export interface Mistake { id: string; original: string; corrected: string }
export interface Note {
  schemaVersion: 1; id: string; day: number; date: string; title: string; topic: string;
  sentences: Sentence[]; mistakes: Mistake[];
  // Compatibility-only content is retained in exports, never invented or discarded.
  legacyMistakes?: string[]; summary?: string; example?: boolean;
}
export interface State { notes: Note[] }
const obj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
function fail(message: string): never { throw new Error(message); }
function str(v: unknown, path: string, allowEmpty = false): string {
  if (typeof v !== 'string' || (!allowEmpty && !v.trim()) || v.length > 20000) fail(`${path} 必须是${allowEmpty ? '' : '非空'}字符串，且不超过 20000 字。`);
  return v;
}
export function validateNotes(input: unknown, limit = 1000): Note[] {
  const raw = Array.isArray(input) ? input : obj(input) && 'notes' in input ? input.notes : [input];
  if (!Array.isArray(raw) || raw.length > limit) fail('笔记必须为对象或不超过 1000 篇的数组。');
  const ids = new Set<string>();
  return raw.map((n: unknown, i) => {
    const p = `第 ${i + 1} 篇笔记`;
    if (!obj(n)) fail(`${p} 必须为对象。`);
    if (n.schemaVersion !== 1) fail(`${p} schemaVersion 必须为 1。`);
    const id = str(n.id, `${p} id`);
    if (ids.has(id)) fail(`${p} id 重复。`);
    ids.add(id);
    if (!Number.isInteger(n.day) || Number(n.day) < 1 || Number(n.day) > 10000) fail(`${p} day 必须为 1–10000 的整数。`);
    const date = str(n.date, `${p} date`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail(`${p} date 必须为有效的 YYYY-MM-DD 日期。`);
    if (!Array.isArray(n.sentences) || !n.sentences.length || n.sentences.length > 500) fail(`${p} sentences 必须包含 1–500 个句子。`);
    const sids = new Set<string>();
    const sentences = n.sentences.map((s: unknown, j) => {
      if (!obj(s)) fail(`${p}句子 ${j + 1} 必须为对象。`);
      const sid = str(s.id, `${p}句子 id`);
      if (sids.has(sid)) fail(`${p}句子 id 重复。`);
      sids.add(sid);
      return { id: sid, en: str(s.en, `${p} en`), zh: str(s.zh, `${p} zh`), ...(typeof s.tip === 'string' ? { tip: s.tip } : {}) };
    });
    if (!Array.isArray(n.mistakes)) fail(`${p} mistakes 必须为数组。`);
    const legacyMistakes: string[] = [];
    if (n.legacyMistakes !== undefined) {
      if (!Array.isArray(n.legacyMistakes)) fail(`${p} legacyMistakes 必须为数组。`);
      legacyMistakes.push(...n.legacyMistakes.map(m => str(m, `${p}旧纠错`, true)));
    }
    const mids = new Set<string>();
    const mistakes: Mistake[] = [];
    // Reserve explicit IDs before generating IDs for legacy rows.
    for (const m of n.mistakes) if (obj(m)) {
      const mid = str(m.id, `${p}纠错 id`);
      if (mids.has(mid)) fail(`${p}纠错 id 重复。`);
      mids.add(mid);
    }
    n.mistakes.forEach((m: unknown, j: number) => {
      if (typeof m === 'string') {
        str(m, `${p}旧纠错`, true);
        const parts = m.split(/→|->/);
        if (parts.length === 2 && parts.every(v => v.trim())) {
          let mid = `${id}-legacy-m${j + 1}`;
          while (mids.has(mid)) mid += '-old';
          mids.add(mid);
          mistakes.push({ id: mid, original: parts[0].trim(), corrected: parts[1].trim() });
        } else legacyMistakes.push(m);
      } else {
        if (!obj(m)) fail(`${p}纠错必须为对象或旧版字符串。`);
        mistakes.push({ id: str(m.id, `${p}纠错 id`), original: str(m.original, `${p} original`), corrected: str(m.corrected, `${p} corrected`) });
      }
    });
    return { schemaVersion: 1, id, day: n.day as number, date, title: str(n.title, `${p} title`), topic: str(n.topic, `${p} topic`), sentences, mistakes,
      ...(legacyMistakes.length ? { legacyMistakes } : {}), ...(typeof n.summary === 'string' ? { summary: n.summary } : {}), ...(n.example === true ? { example: true } : {}) };
  });
}
export function parseNotes(text: string): Note[] {
  try { const notes = validateNotes(JSON.parse(text)); if (!notes.length) fail('没有可导入的笔记。'); return notes; }
  catch (e) { if (e instanceof SyntaxError) throw new Error('JSON 格式不正确，请只粘贴 JSON 内容，不要包含 Markdown 代码围栏。'); throw e; }
}
export function mergeNotes(state: State, notes: Note[]) {
  const map = new Map(state.notes.map(n => [n.id, n])); let added = 0, updated = 0;
  for (const n of notes) { if (map.has(n.id)) updated++; else added++; map.set(n.id, n); }
  return { state: { notes: [...map.values()] }, added, updated };
}
export function searchNotes(notes: Note[], query: string): Note[] {
  const q = query.trim().toLocaleLowerCase();
  return notes.filter(n => [n.title, n.topic, n.date, `Day ${String(n.day).padStart(2, '0')}`,
    ...n.sentences.flatMap(s => [s.en, s.zh]), ...n.mistakes.flatMap(m => [m.original, m.corrected]), ...(n.legacyMistakes ?? [])]
    .some(v => v.toLocaleLowerCase().includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.day - a.day || a.id.localeCompare(b.id));
}
export function validateBackup(input: unknown): State {
  if (!obj(input) || input.backupVersion !== 1 || !Array.isArray(input.notes)) fail('不是有效的 SpeakLog v1 备份文件。');
  return { notes: validateNotes(input.notes, Infinity) };
}
export function createBackup(state: State) { return { backupVersion: 1, exportedAt: new Date().toISOString(), notes: state.notes }; }
const db = () => openDB('speaklog', 1, { upgrade(d) { d.createObjectStore('app'); } });
export async function loadState(): Promise<State> {
  const d = await db();
  try { const saved = await d.get('app', 'state'); if (saved === undefined) return { notes: [] };
    if (!obj(saved) || !Array.isArray(saved.notes)) fail('本地笔记结构异常，原始数据未更改。');
    // Loading is read-only: failed conversion can never overwrite the original.
    return { notes: validateNotes(saved.notes, Infinity) };
  } finally { d.close(); }
}
export async function saveState(state: State) {
  // Validate per note so accumulated libraries are not limited by batch size.
  const notes = state.notes.flatMap(n => validateNotes(n));
  const d = await db();
  try {
    const tx = d.transaction('app', 'readwrite');
    const previous = await tx.store.get('state');
    if (previous !== undefined && (await tx.store.get('legacy-state-before-simplification')) === undefined)
      await tx.store.put(previous, 'legacy-state-before-simplification');
    await tx.store.put({ notes }, 'state'); await tx.done;
  } finally { d.close(); }
}
