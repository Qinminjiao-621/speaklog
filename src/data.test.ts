import 'fake-indexeddb/auto';
import { openDB, deleteDB } from 'idb';
import { describe, it, expect, beforeEach } from 'vitest';
import { createBackup, parseNotes, validateNotes, validateBackup, mergeNotes, searchNotes, loadState, saveState } from './data';
import type { Note } from './data';
const n: Note = { schemaVersion: 1, id: 'day-04', day: 4, date: '2026-11-10', title: 'Day 04｜采购报价谈判', topic: '采购报价谈判', sentences: [{ id: 'day-04-s01', en: 'I would ask the supplier to break down the price into materials, labor, and overhead.', zh: '我会要求供应商将报价拆分为材料、人工和间接费用。' }], mistakes: [{ id: 'day-04-m01', original: 'Your price is too high than the market price.', corrected: 'Your price is higher than the market price.' }] };
const legacy = { ...n, sentences: [{ ...n.sentences[0], tip: '旧提示' }], mistakes: ['bad phrase → better phrase', '不能确定的旧纠错', 'A → B → C', '', 'before -> after'], summary: '旧总结', example: true };
describe('笔记校验与旧格式兼容', () => {
  it('准确接受指定格式、数组和容器，允许自由主题与空纠错', () => { for (const v of [n, [n], { notes: [n] }]) expect(validateNotes(v)).toEqual([n]); expect(validateNotes({ ...n, topic: '任意新主题', mistakes: [] })[0].mistakes).toEqual([]); });
  it('拒绝无效 JSON 和空导入', () => { expect(() => parseNotes('```json')).toThrow('JSON 格式'); expect(() => parseNotes('[]')).toThrow('没有'); });
  it('校验字段类型、真实日期和范围', () => { for (const patch of [{ schemaVersion: 2 }, { day: '4' }, { day: 0 }, { day: 10001 }, { date: '2026-02-30' }, { title: null }, { topic: '' }, { sentences: [] }, { mistakes: [{}] }, { mistakes: null }]) expect(() => validateNotes({ ...n, ...patch })).toThrow(); });
  it('拒绝句子与纠错缺字段', () => { for (const field of ['id', 'en', 'zh']) expect(() => validateNotes({ ...n, sentences: [{ ...n.sentences[0], [field]: undefined }] })).toThrow(); for (const field of ['id', 'original', 'corrected']) expect(() => validateNotes({ ...n, mistakes: [{ ...n.mistakes[0], [field]: '' }] })).toThrow(); });
  it('拒绝各层重复 ID', () => { expect(() => validateNotes([n, n])).toThrow('重复'); expect(() => validateNotes({ ...n, sentences: [n.sentences[0], n.sentences[0]] })).toThrow('重复'); expect(() => validateNotes({ ...n, mistakes: [n.mistakes[0], n.mistakes[0]] })).toThrow('重复'); });
  it('保留不能确定的旧纠错，不编造对应关系；转换结果幂等', () => { const converted = validateNotes(legacy)[0]; expect(converted.mistakes.map(m => [m.original, m.corrected])).toEqual([['bad phrase', 'better phrase'], ['before', 'after']]); expect(converted.legacyMistakes).toEqual(['不能确定的旧纠错', 'A → B → C', '']); expect(converted.summary).toBe('旧总结'); expect(converted.sentences[0].tip).toBe('旧提示'); expect(validateNotes(converted)).toEqual([converted]); });
  it('混合新旧纠错生成 ID 不冲突', () => { const result = validateNotes({ ...n, mistakes: ['a → b', { ...n.mistakes[0], id: 'day-04-legacy-m1' }] })[0]; expect(new Set(result.mistakes.map(m => m.id)).size).toBe(2); });
  it('不引入解释字段，HTML 保持普通文本', () => { const result = validateNotes({ ...n, title: '<script>alert(1)</script>', mistakes: [{ ...n.mistakes[0], reason: '解释' }] })[0]; expect(result.title).toBe('<script>alert(1)</script>'); expect(result.mistakes[0]).toEqual(n.mistakes[0]); });
});
describe('全文搜索', () => {
  it('覆盖标题、主题、中英文句子与纠错两侧，英文不区分大小写', () => { for (const q of ['DAY 04', '采购报价', 'OVERHEAD', '间接费用', 'too high', 'HIGHER THAN']) expect(searchNotes([n], q)).toEqual([n]); const uniqueTopic = { ...n, topic: '独有主题' }; expect(searchNotes([uniqueTopic], '独有')).toEqual([uniqueTopic]); });
  it('支持旧纠错搜索、去除首尾空格、无匹配与空搜索', () => { const old = validateNotes(legacy)[0]; expect(searchNotes([old], '不能确定')).toEqual([old]); expect(searchNotes([n], '  SUPPLIER  ')).toEqual([n]); expect(searchNotes([n], '不存在')).toEqual([]); expect(searchNotes([n], '  ')).toEqual([n]); });
  it('按日期倒序，同日期按 Day 倒序', () => { const older = { ...n, id: 'older', date: '2026-01-01', day: 9 }; const same = { ...n, id: 'same', day: 5 }; expect(searchNotes([older, n, same], '').map(v => v.id)).toEqual(['same', 'day-04', 'older']); });
});
describe('更新与备份', () => {
  it('重复导入更新内容，不创建副本，保留其他笔记', () => { const other = { ...n, id: 'other' }; const changed = { ...n, title: '更新' }; const r = mergeNotes({ notes: [n, other] }, [changed]); expect(r.added).toBe(0); expect(r.updated).toBe(1); expect(r.state.notes).toEqual([changed, other]); expect(mergeNotes(r.state, [changed]).state).toEqual(r.state); });
  it('新旧笔记及空备份往返不丢内容', () => { for (const notes of [[], [n], validateNotes(legacy)]) { const state = { notes }; expect(validateBackup(JSON.parse(JSON.stringify(createBackup(state))))).toEqual(state); } });
  it('兼容原始 v1 备份，不依赖已移除的状态字段', () => { expect(validateBackup({ backupVersion: 1, notes: [legacy], progress: {}, completed: [] }).notes).toEqual(validateNotes(legacy)); expect(() => validateBackup({ backupVersion: 2, notes: [] })).toThrow(); });
  it('合并恢复空备份不删除笔记', () => expect(mergeNotes({ notes: [n] }, validateBackup({ backupVersion: 1, notes: [] }).notes).state.notes).toEqual([n]));
  it('整批无效时不部分接受', () => expect(() => validateNotes([n, { ...n, id: 'new', date: 'bad' }])).toThrow());
  it('超过单批限制的累计笔记仍可备份恢复', () => { const notes = Array.from({ length: 1001 }, (_, i) => ({ ...n, id: `note-${i}` })); expect(() => validateNotes(notes)).toThrow(); expect(validateBackup(createBackup({ notes })).notes).toHaveLength(1001); });
});
describe('IndexedDB 数据保护', () => {
  beforeEach(async () => { await deleteDB('speaklog'); });
  async function putRaw(raw: unknown) { const d = await openDB('speaklog', 1, { upgrade(db) { db.createObjectStore('app'); } }); await d.put('app', raw, 'state'); d.close(); }
  it('全新安装为空，删除后重载不重新填入示例', async () => { expect(await loadState()).toEqual({ notes: [] }); await saveState({ notes: [n] }); expect(await loadState()).toEqual({ notes: [n] }); await saveState({ notes: [] }); expect(await loadState()).toEqual({ notes: [] }); });
  it('读取旧数据不覆盖，首次保存保留完整旧快照', async () => { const old = { notes: [legacy], progress: { old: true }, completed: ['day-04'] }; await putRaw(old); const loaded = await loadState(); let d = await openDB('speaklog', 1); expect(await d.get('app', 'state')).toEqual(old); d.close(); await saveState(loaded); await saveState({ notes: [n] }); d = await openDB('speaklog', 1); expect(await d.get('app', 'legacy-state-before-simplification')).toEqual(old); d.close(); expect(await loadState()).toEqual({ notes: [n] }); });
  it('无法转换时不清空原始数据', async () => { const old = { notes: [{ ...legacy, date: '损坏' }] }; await putRaw(old); await expect(loadState()).rejects.toThrow(); const d = await openDB('speaklog', 1); expect(await d.get('app', 'state')).toEqual(old); d.close(); });
  it('无效写入不修改已保存数据', async () => { await saveState({ notes: [n] }); await expect(saveState({ notes: [{ ...n, day: 0 }] })).rejects.toThrow(); expect(await loadState()).toEqual({ notes: [n] }); });
  it('累计超过 1000 篇可以保存及重载', async () => { const notes = Array.from({ length: 1001 }, (_, i) => ({ ...n, id: `note-${i}` })); await saveState({ notes }); expect((await loadState()).notes).toHaveLength(1001); });
});
