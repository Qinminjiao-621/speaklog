import { describe, it, expect } from 'vitest';
import type { Note } from './data';
import { parseNotes } from './data';
import { DEFAULT_BOOK, addBook, applyPlan, deleteBook, deletionPrompts, emptyLibrary, exportLibrary, migrateLegacy, moveNote, nextDay, planImport, planRestore, readBackup, renameBook, saveNote, searchLibrary, sortedNotes, validateLibrary } from './model';

export const fixture = (day = 1, id = `day-${day}`): Note => ({ schemaVersion: 1, id, day, date: '2026-01-01', title: `Day ${day} greeting`, topic: '问候', sentences: [{ id: 's1', en: 'Good morning, supplier.', zh: '供应商，早上好。' }], mistakes: [{ id: 'm1', original: 'I is happy.', corrected: 'I am happy.' }] });
const seeded = () => migrateLegacy({ notes: [fixture(1), fixture(5)] });

describe('笔记本', () => {
  it('只初始化默认一本，初始无笔记', () => { expect(emptyLibrary().notebooks).toEqual([DEFAULT_BOOK]); expect(emptyLibrary().notes).toEqual([]); });
  it('创建唯一稳定 ID 的笔记本', () => { const s = addBook(emptyLibrary(), '生活', 'book-b'); expect(s.notebooks[1]).toEqual({ id: 'book-b', name: '生活' }); });
  it.each(['采购职场英语', ' 采购职场英语 '])('拒绝重名 %s', name => expect(() => addBook(emptyLibrary(), name)).toThrow('重复'));
  it('名称正规化、大小写重名受保护', () => { const s = addBook(emptyLibrary(), 'English'); expect(() => addBook(s, 'ＥＮＧＬＩＳＨ')).toThrow('重复'); });
  it('拒绝重复内部 ID', () => expect(() => addBook(emptyLibrary(), '其他', DEFAULT_BOOK.id)).toThrow('重复'));
  it('拒绝空名称和过长名称', () => { for (const name of ['', ' ', 'a'.repeat(81)]) expect(() => addBook(emptyLibrary(), name)).toThrow(); });
  it('重命名保留笔记归属、内容及身份', () => { const s = seeded(); const next = renameBook(s, DEFAULT_BOOK.id, '新名称'); expect(next.notes).toEqual(s.notes); expect(next.notebooks[0].id).toBe(DEFAULT_BOOK.id); });
  it('重命名不允许与其他笔记本重名', () => expect(() => renameBook(addBook(seeded(), '生活', 'b'), 'b', DEFAULT_BOOK.name)).toThrow('重复'));
  it('空笔记本删除需要一次确认且不重新创建', () => { expect(() => deleteBook(emptyLibrary(), DEFAULT_BOOK.id, 0)).toThrow(); const s = deleteBook(emptyLibrary(), DEFAULT_BOOK.id, 1); expect(validateLibrary(s).notebooks).toEqual([]); });
  it('非空笔记本需要两次确认且提示实际数量', () => { const s = seeded(); expect(deletionPrompts(s, DEFAULT_BOOK.id).every(x => x.includes('2 篇') && x.includes(DEFAULT_BOOK.name))).toBe(true); expect(() => deleteBook(s, DEFAULT_BOOK.id, 1)).toThrow(); expect(deleteBook(s, DEFAULT_BOOK.id, 2).notes).toEqual([]); });
  it('删除一本不影响其他笔记本', () => { const s = planImport(addBook(seeded(), '生活', 'b'), 'b', [fixture()]).state; expect(deleteBook(s, DEFAULT_BOOK.id, 2).notes).toEqual(s.notes.filter(n => n.notebookId === 'b')); });
});
describe('导入、编辑和移动', () => {
  it('同一本重复导入先预览确认，保留内部 ID', () => { const s = seeded(); const plan = planImport(s, DEFAULT_BOOK.id, [{ ...fixture(), title: '更新' }]); expect([plan.added, plan.updated]).toEqual([0, 1]); expect(() => applyPlan(plan, false)).toThrow('确认'); const next = applyPlan(plan, true); expect(next.notes[0].uid).toBe(s.notes[0].uid); expect(next.notes[0].title).toBe('更新'); expect(s.notes[0].title).not.toBe('更新'); });
  it('同 Day、不同导入 ID 更新而非重复创建', () => { const s = seeded(); const plan = planImport(s, DEFAULT_BOOK.id, [fixture(1, 'changed-id')]); expect(plan.updated).toBe(1); expect(plan.state.notes).toHaveLength(2); });
  it('不同笔记本同 Day 和导入 ID 互不覆盖', () => { const s = seeded(); const plan = planImport(addBook(s, '生活', 'b'), 'b', [fixture()]); expect(plan.added).toBe(1); expect(plan.state.notes[0]).toEqual(s.notes[0]); expect(new Set(plan.state.notes.map(n => n.uid)).size).toBe(3); });
  it.each(['single', 'array', 'container'])('兼容原 JSON %s 格式', format => { const n = fixture(); const raw = format === 'single' ? n : format === 'array' ? [n] : { notes: [n] }; expect(planImport(emptyLibrary(), DEFAULT_BOOK.id, parseNotes(JSON.stringify(raw))).added).toBe(1); });
  it('批量新增与更新计数正确', () => { const p = planImport(seeded(), DEFAULT_BOOK.id, [fixture(), fixture(2)]); expect([p.added, p.updated]).toEqual([1, 1]); });
  it('非法 JSON 拒绝', () => expect(() => parseNotes('{broken')).toThrow('JSON'));
  it('一条无效则整批不改变输入状态', () => { const s = seeded(); const before = structuredClone(s); expect(() => planImport(s, DEFAULT_BOOK.id, [fixture(2), { ...fixture(3), date: 'bad' }])).toThrow(); expect(s).toEqual(before); });
  it('同批重复 Day 拒绝', () => expect(() => planImport(emptyLibrary(), DEFAULT_BOOK.id, [fixture(1, 'a'), fixture(1, 'b')])).toThrow('重复 Day'));
  it('ID 与 Day 指向不同笔记时拒绝', () => expect(() => planImport(seeded(), DEFAULT_BOOK.id, [fixture(5, 'day-1')])).toThrow('不同笔记'));
  it('同 ID 可改 Day 但内部身份保留', () => { const s = seeded(); expect(planImport(s, DEFAULT_BOOK.id, [fixture(3, 'day-1')]).state.notes[0].uid).toBe(s.notes[0].uid); });
  it('同批多次更新一个身份拒绝', () => expect(() => planImport(seeded(), DEFAULT_BOOK.id, [fixture(1, 'new-id'), fixture(3, 'day-1')])).toThrow('同一篇'));
  it('编辑不能创建同一本重复 Day', () => { const s = seeded(); expect(() => saveNote(s, fixture(5), DEFAULT_BOOK.id, s.notes[0].uid)).toThrow('重复'); });
  it('编辑保留兼容字段与条目 ID', () => { const s = migrateLegacy({ notes: [{ ...fixture(), summary: '旧总结', sentences: [{ ...fixture().sentences[0], tip: '旧提示' }], legacyMistakes: ['原始旧纠错'] }] }); expect(saveNote(s, { ...s.notes[0], title: 'new' }, DEFAULT_BOOK.id, s.notes[0].uid).notes[0]).toEqual({ ...s.notes[0], title: 'new' }); });
  it('无冲突移动保留内容、日期和身份，源不保留副本', () => { const s = addBook(seeded(), '生活', 'b'); const n = s.notes[0]; const next = moveNote(s, n.uid, 'b', n.day); expect(next.notes.find(v => v.uid === n.uid)).toEqual({ ...n, notebookId: 'b' }); expect(next.notes.filter(v => v.uid === n.uid)).toHaveLength(1); });
  it('移动冲突拒绝并能采用建议编号', () => { const s = planImport(addBook(seeded(), '生活', 'b'), 'b', [fixture()]).state; expect(() => moveNote(s, s.notes[0].uid, 'b', 1)).toThrow('重复'); expect(nextDay(s, 'b')).toBe(2); expect(moveNote(s, s.notes[0].uid, 'b', 2).notes[0].day).toBe(2); });
  it('移动的自定义 Day 需要合法', () => { const s = addBook(seeded(), '生活', 'b'); for (const day of [0, 10001, 1.2]) expect(() => moveNote(s, s.notes[0].uid, 'b', day)).toThrow(); });
  it('移动到不存在的笔记本拒绝', () => { const s = seeded(); expect(() => moveNote(s, s.notes[0].uid, 'missing', 1)).toThrow(); });
});
describe('搜索与顺序', () => {
  it('正序倒序按 Day 排列，不改变数据', () => { const s = seeded(); expect(sortedNotes(s.notes, 'asc').map(n => n.day)).toEqual([1, 5]); expect(sortedNotes(s.notes, 'desc').map(n => n.day)).toEqual([5, 1]); expect(s.notes.map(n => n.day)).toEqual([1, 5]); });
  it.each(['SUPPLIER', '供应商', 'I is', 'I am', 'greeting', '问候'])('全文搜索 %s', q => expect(searchLibrary(seeded(), q)).toHaveLength(2));
  it.each(['Day 15', 'day15', '15', 'DAY 015'])('编号精确匹配 %s', q => { const s = migrateLegacy({ notes: [fixture(1), fixture(15), fixture(150)] }); expect(searchLibrary(s, q).map(r => r.note.day)).toEqual([15]); });
  it('纯数字不误匹配句子中的编号', () => { const s = migrateLegacy({ notes: [{ ...fixture(1), title: '15 words' }] }); expect(searchLibrary(s, '15')).toHaveLength(0); });
  it('全局与局部搜索范围正确，每篇多命中只出一次', () => { const s = planImport(addBook(seeded(), '生活', 'b'), 'b', [fixture()]).state; expect(searchLibrary(s, 'good')).toHaveLength(3); expect(searchLibrary(s, 'good', 'b')).toHaveLength(1); });
  it('片段包含实际命中内容', () => expect(searchLibrary(seeded(), '供应商')[0].snippet).toContain('供应商'));
  it('空查询返回所属笔记本实际笔记', () => expect(searchLibrary(seeded(), '', DEFAULT_BOOK.id)).toHaveLength(2));
});
describe('备份与迁移', () => {
  it('V1 内容完全保留且生成稳定身份', () => { const raw = { notes: Array.from({ length: 5 }, (_, i) => fixture(i + 1)) }; const s = migrateLegacy(raw); expect(s.notes.map(({ uid, notebookId, ...n }) => n)).toEqual(raw.notes); expect(migrateLegacy(raw)).toEqual(s); });
  it('V1 重复 Day 停止迁移，不删除任何笔记', () => { const raw = { notes: [fixture(1, 'a'), fixture(1, 'b')] }; expect(() => migrateLegacy(raw)).toThrow('重复'); expect(raw.notes).toHaveLength(2); });
  it('V2 完整备份往返保留笔记本及关联', () => { const s = planImport(addBook(seeded(), '生活', 'b'), 'b', [fixture()]).state; expect(readBackup(JSON.parse(JSON.stringify(exportLibrary(s)))).library).toEqual(s); });
  it('V1 恢复归入默认名称，其他本不被覆盖', () => { const s = planImport(addBook(seeded(), '生活', 'b'), 'b', [fixture()]).state; const p = planRestore(s, { backupVersion: 1, notes: [{ ...fixture(), title: '恢复' }] }); expect(p.updated).toBe(1); expect(p.state.notes.find(n => n.notebookId === 'b')?.title).not.toBe('恢复'); });
  it('默认本重命名后恢复 V1 新建默认名称本，不覆盖改名本', () => { const s = renameBook(seeded(), DEFAULT_BOOK.id, '其他'); const p = planRestore(s, { backupVersion: 1, notes: [fixture()] }); expect(p.booksAdded).toBe(1); expect(p.state.notes).toHaveLength(3); });
  it('空 V1 备份不会清空已有笔记', () => expect(planRestore(seeded(), { backupVersion: 1, notes: [] }).state.notes).toEqual(seeded().notes));
  it('重复恢复 V2 不重复生成笔记', () => { const s = seeded(); const first = planRestore(emptyLibrary(), exportLibrary(s)).state; expect(planRestore(first, exportLibrary(s)).state).toEqual(first); });
  it('V2 同名不同 ID 合并到已有本并提示更新', () => { const s = addBook(emptyLibrary(), '生活', 'b'); const incoming = planImport(addBook(emptyLibrary(), '生活', 'c'), 'c', [fixture()]).state; const p = planRestore(s, exportLibrary(incoming)); expect(p.state.notes[0].notebookId).toBe('b'); expect(p.booksAdded).toBe(0); });
  it('V2 内部身份已移到其他本时拒绝跨本覆盖', () => { const original = seeded(); const moved = moveNote(addBook(original, '生活', 'b'), original.notes[0].uid, 'b', 1); expect(() => planRestore(moved, exportLibrary(original))).toThrow('其他笔记本'); });
  it('备份笔记本不能多对一合并造成覆盖', () => { const current = addBook(emptyLibrary(), '生活', 'b'); const source = validateLibrary({ ...emptyLibrary(), notebooks: [{ id: 'source-x', name: '生活' }, { id: 'b', name: '其他' }] }); expect(() => planRestore(current, exportLibrary(source))).toThrow('多个笔记本'); });
  it('未知备份版本和孤立笔记拒绝', () => { expect(() => readBackup({ backupVersion: 3 })).toThrow(); const s = seeded(); expect(() => validateLibrary({ ...s, notebooks: [] })).toThrow('不存在'); });
  it('累计超过1000篇可完整备份恢复', () => { const s = migrateLegacy({ notes: Array.from({ length: 1001 }, (_, i) => fixture(i + 1)) }); expect(readBackup(exportLibrary(s)).library.notes).toHaveLength(1001); expect(planRestore(emptyLibrary(), exportLibrary(s)).state.notes).toHaveLength(1001); });
});
