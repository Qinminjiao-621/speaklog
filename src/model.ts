import { validateNotes, validateBackup } from './data';
import type { Note } from './data';
import { validateChineseNotes } from './chinese';
import type { ChineseNote } from './chinese';
import { markdownText } from './markdown';

export type Language = 'en' | 'zh';
export const DATA_VERSION = 3;
export const BACKUP_VERSION = 3;
export const DEFAULT_BOOK: Notebook = { id: 'notebook-default', name: '采购职场英语', language: 'en' };
export type Order = 'asc' | 'desc';
export interface Notebook { id: string; name: string; language: Language }
export type ContentNote = Note | ChineseNote;
export type StoredNote = ContentNote & { uid: string; notebookId: string };
export const noteLanguage = (n: ContentNote): Language => n.schemaVersion === 1 ? 'en' : 'zh';
export const noteLabel = (n: Pick<ContentNote, 'schemaVersion' | 'day'>) => n.schemaVersion === 1 ? `Day ${String(n.day).padStart(2, '0')}` : `第 ${String(n.day).padStart(2, '0')} 篇`;
function validateContent(input: unknown, language: Language, limit = 1000): ContentNote[] {
  return language === 'en' ? validateNotes(input, limit) : validateChineseNotes(input, limit);
}
export interface Library {
  dataVersion: 3;
  revision: number;
  notebooks: Notebook[];
  notes: StoredNote[];
  order: Order;
}
export const newId = (): string => crypto.randomUUID();
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
function requireText(v: unknown, label: string, max = 20000): string {
  if (typeof v !== 'string' || !v.trim() || v.length > max) throw new Error(`${label}不能为空，且最多 ${max} 字。`);
  return v;
}
const nameKey = (name: string) => name.trim().normalize('NFKC').toLocaleLowerCase();
export function emptyLibrary(): Library {
  return { dataVersion: 3, revision: 0, notebooks: [{ ...DEFAULT_BOOK }], notes: [], order: 'asc' };
}
export function validateLibrary(raw: unknown): Library {
  if (!record(raw) || raw.dataVersion !== 3 || !Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0 ||
    !Array.isArray(raw.notebooks) || !Array.isArray(raw.notes) || !['asc', 'desc'].includes(String(raw.order)))
    throw new Error('V3 数据结构无效，已停止操作，原数据未更改。');
  const bookIds = new Set<string>(); const names = new Set<string>();
  const notebooks = raw.notebooks.map(b => {
    if (!record(b)) throw new Error('笔记本格式无效。');
    const id = requireText(b.id, '笔记本 ID'); const name = requireText(b.name, '笔记本名称', 80).trim();
    if (b.language !== 'en' && b.language !== 'zh') throw new Error('笔记本语言类型无效。');
    const language: Language = b.language; const key = `${language}:${nameKey(name)}`;
    if (bookIds.has(id) || names.has(key)) throw new Error('笔记本名称或 ID 重复。');
    bookIds.add(id); names.add(key); return { id, name, language };
  });
  const uids = new Set<string>(); const days = new Set<string>();
  const notes = raw.notes.map(n => {
    if (!record(n)) throw new Error('笔记格式无效。');
    const uid = requireText(n.uid, '内部笔记 ID'); const notebookId = requireText(n.notebookId, '笔记本 ID');
    const book = notebooks.find(b => b.id === notebookId);
    if (!book) throw new Error('笔记所属笔记本不存在。');
    const note = validateContent([n], book.language)[0]; const key = JSON.stringify([notebookId, note.day]);
    if (!bookIds.has(notebookId)) throw new Error('笔记所属笔记本不存在。');
    if (uids.has(uid)) throw new Error('内部笔记 ID 重复。');
    if (days.has(key)) throw new Error(`同一笔记本中 ${noteLabel(note)} 重复，已停止操作。`);
    uids.add(uid); days.add(key); return { ...note, uid, notebookId };
  });
  return { dataVersion: 3, revision: raw.revision as number, notebooks, notes, order: raw.order as Order };
}
// V2 has no language field. Validate its version and English schema before conversion.
export function migrateV2(raw: unknown): Library {
  if (!record(raw) || raw.dataVersion !== 2 || !Array.isArray(raw.notebooks) || !Array.isArray(raw.notes))
    throw new Error('V2 数据结构无效，原数据未更改。');
  for (const n of raw.notes) validateNotes([n]);
  return validateLibrary({ ...raw, dataVersion: DATA_VERSION,
    notebooks: raw.notebooks.map(b => {
      if (!record(b)) throw new Error('V2 笔记本格式无效。');
      return { ...b, language: 'en' };
    }),
  });
}
export function migrateLegacy(raw: unknown): Library {
  if (raw === undefined) return emptyLibrary();
  if (!record(raw) || !Array.isArray(raw.notes)) throw new Error('旧数据格式异常，原始数据已保留。');
  const notes = validateNotes(raw.notes, Infinity);
  return validateLibrary({ ...emptyLibrary(), notes: notes.map(n => ({ ...n, uid: `v1:${n.id}`, notebookId: DEFAULT_BOOK.id })) });
}
export function getBook(s: Library, id: string) {
  const b = s.notebooks.find(b => b.id === id);
  if (!b) throw new Error('笔记本已不存在，请返回首页。'); return b;
}
export function addBook(s: Library, name: string, id = newId(), language: Language = 'en'): Library {
  return validateLibrary({ ...s, notebooks: [...s.notebooks, { id, name, language }] });
}
export function renameBook(s: Library, id: string, name: string): Library {
  getBook(s, id);
  return validateLibrary({ ...s, notebooks: s.notebooks.map(b => b.id === id ? { ...b, name } : b) });
}
export function deletionPrompts(s: Library, id: string): string[] {
  const book = getBook(s, id); const count = s.notes.filter(n => n.notebookId === id).length;
  return count ? [`「${book.name}」有 ${count} 篇笔记。确定删除整个笔记本？`,
    `再次确认：永久删除「${book.name}」及其中 ${count} 篇笔记。请先确保已有备份。`] : [`确定删除空笔记本「${book.name}」？`];
}
export function deleteBook(s: Library, id: string, confirmations: number): Library {
  if (confirmations < deletionPrompts(s, id).length) throw new Error('删除尚未完成确认。');
  return validateLibrary({ ...s, notebooks: s.notebooks.filter(b => b.id !== id), notes: s.notes.filter(n => n.notebookId !== id) });
}
export function nextDay(s: Library, book: string): number {
  const days = new Set(s.notes.filter(n => n.notebookId === book).map(n => n.day));
  const after = Math.max(0, ...days) + 1;
  if (after <= 10000) return after;
  for (let d = 1; d <= 10000; d++) if (!days.has(d)) return d;
  throw new Error('此笔记本已没有可用 Day 编号。');
}
export function saveNote(s: Library, note: ContentNote, book: string, uid?: string): Library {
  const target = getBook(s, book);
  const original = s.notes.find(n => n.uid === uid);
  if (original && noteLanguage(original) !== target.language) throw new Error('只能在相同语言类型的笔记本之间移动。');
  const checked = validateContent([note], target.language)[0];
  if (uid && !s.notes.some(n => n.uid === uid)) throw new Error('原笔记已不存在，请重新打开。');
  const stored: StoredNote = { ...checked, notebookId: book, uid: uid ?? newId() };
  return validateLibrary({ ...s, notes: uid ? s.notes.map(n => n.uid === uid ? stored : n) : [...s.notes, stored] });
}
export function moveNote(s: Library, uid: string, book: string, day: number): Library {
  const n = s.notes.find(n => n.uid === uid); if (!n) throw new Error('笔记不存在。');
  return saveNote(s, { ...n, day }, book, uid);
}
export interface Plan { state: Library; added: number; updated: number; updates: string[]; booksAdded: number }
export function planImport(s: Library, book: string, input: ContentNote[], limit = 1000): Plan {
  const target = getBook(s, book);
  const notes = validateContent(input, target.language, limit);
  const batchDays = new Set<number>(); const targets = new Set<string>(); let added = 0;
  const updates: string[] = []; const next = [...s.notes];
  for (const note of notes) {
    if (batchDays.has(note.day)) throw new Error(`本次导入包含重复 ${noteLabel(note)}，整批未保存。`);
    batchDays.add(note.day);
    const current = s.notes.filter(n => n.notebookId === book);
    const byDay = current.find(n => n.day === note.day);
    const byId = current.filter(n => n.id === note.id);
    if (byId.length > 1 || (byDay && byId[0] && byDay.uid !== byId[0].uid)) throw new Error(`${noteLabel(note)} 的编号与导入 ID 指向不同笔记，请核对 JSON。`);
    const existing = byDay ?? byId[0];
    if (existing && targets.has(existing.uid)) throw new Error('批量导入多次更新同一篇笔记，整批未保存。');
    if (existing) {
      targets.add(existing.uid); updates.push(`${noteLabel(existing)}「${existing.title}」${existing.day !== note.day ? ` → ${noteLabel(note)}` : ''}`);
      next[next.findIndex(n => n.uid === existing.uid)] = { ...note, uid: existing.uid, notebookId: book };
    } else { added++; next.push({ ...note, uid: newId(), notebookId: book }); }
  }
  return { state: validateLibrary({ ...s, notes: next }), added, updated: updates.length, updates, booksAdded: 0 };
}
export function applyPlan(plan: Plan, confirmed: boolean): Library {
  if (plan.updated && !confirmed) throw new Error('更新已有笔记前需要确认。');
  return validateLibrary(plan.state);
}
export function sortedNotes(notes: StoredNote[], order: Order): StoredNote[] {
  return [...notes].sort((a, b) => (order === 'asc' ? a.day - b.day : b.day - a.day) || a.uid.localeCompare(b.uid));
}
export function searchLibrary(s: Library, query: string, book: string) {
  const q = query.trim().toLocaleLowerCase();
  const number = /^(?:day\s*)?(\d+)$/i.exec(q);
  return sortedNotes(s.notes.filter(n => n.notebookId === book), s.order).flatMap(note => {
    if (number) return note.day === Number(number[1]) ? [{ note, snippet: `${noteLabel(note)} · ${note.schemaVersion === 1 ? note.topic : note.title}` }] : [];
    const fields = note.schemaVersion === 2 ? [note.title, markdownText(note.content)] : [note.title, note.topic, note.date, ...note.sentences.flatMap(s => [s.en, s.zh]),
      ...note.mistakes.flatMap(m => [m.original, m.corrected]), ...(note.legacyMistakes ?? [])];
    const hit = fields.find(text => text.toLocaleLowerCase().includes(q));
    if (hit === undefined) return [];
    const index = hit.toLocaleLowerCase().indexOf(q); const start = Math.max(0, index - 30);
    return [{ note, snippet: `${start ? '…' : ''}${hit.slice(start, start + Math.max(100, q.length))}${hit.length > start + Math.max(100, q.length) ? '…' : ''}` }];
  });
}
export function exportLibrary(s: Library) {
  const checked = validateLibrary(s);
  return { backupVersion: BACKUP_VERSION, exportedAt: new Date().toISOString(), ...checked };
}
export function readBackup(raw: unknown): { version: 1 | 2 | 3; library: Library } {
  if (record(raw) && raw.backupVersion === 3) return { version: 3, library: validateLibrary(raw) };
  if (record(raw) && raw.backupVersion === 2) return { version: 2, library: migrateV2(raw) };
  const legacy = validateBackup(raw);
  return { version: 1, library: migrateLegacy(legacy) };
}
export function planRestore(s: Library, raw: unknown): Plan {
  const backup = readBackup(raw);
  if (backup.version === 1) {
    let target = s.notebooks.find(b => b.language === 'en' && nameKey(b.name) === nameKey(DEFAULT_BOOK.name));
    let state = s;
    if (!target) {
      const id = s.notebooks.some(b => b.id === DEFAULT_BOOK.id) ? newId() : DEFAULT_BOOK.id;
      state = addBook(s, DEFAULT_BOOK.name, id); target = getBook(state, id);
    }
    return { ...planImport(state, target.id, backup.library.notes, Infinity), booksAdded: state.notebooks.length - s.notebooks.length };
  }
  let state = s; const bookMap = new Map<string, string>();
  for (const book of backup.library.notebooks) {
    const match = state.notebooks.find(b => b.id === book.id) ?? state.notebooks.find(b => b.language === book.language && nameKey(b.name) === nameKey(book.name));
    if (match && match.language !== book.language) throw new Error('备份笔记本 ID 的语言类型冲突，停止恢复。');
    if (match) bookMap.set(book.id, match.id);
    else { state = addBook(state, book.name, book.id, book.language); bookMap.set(book.id, book.id); }
  }
  if (new Set(bookMap.values()).size !== bookMap.size) throw new Error('备份中的多个笔记本映射到同一本，停止恢复，请核对名称及 ID。');
  const notes = [...state.notes]; const updates: string[] = []; let added = 0;
  for (const n of backup.library.notes) {
    const notebookId = bookMap.get(n.notebookId)!;
    const byUid = notes.find(x => x.uid === n.uid);
    const byDay = notes.find(x => x.notebookId === notebookId && x.day === n.day);
    // Never let a backup silently move an identity or overwrite another book.
    if (byUid && byUid.notebookId !== notebookId) throw new Error(`${noteLabel(n)} 的内部 ID 已属于其他笔记本，停止恢复，请先导出当前数据核对。`);
    if (byUid && byDay && byUid.uid !== byDay.uid) throw new Error(`${noteLabel(n)} 的身份与编号冲突，停止恢复。`);
    const match = byUid ?? byDay;
    const replacement = { ...n, notebookId, uid: match?.uid ?? n.uid };
    if (match) { notes[notes.indexOf(match)] = replacement; updates.push(`「${getBook(state, notebookId).name}」${noteLabel(match)}`); }
    else { notes.push(replacement); added++; }
  }
  return { state: validateLibrary({ ...state, notes }), added, updated: updates.length, updates, booksAdded: state.notebooks.length - s.notebooks.length };
}
