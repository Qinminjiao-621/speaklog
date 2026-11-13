import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { describe, it, expect, vi } from 'vitest';
import { createRepository } from './storage';
import { addBook, deleteBook, emptyLibrary, planImport } from './model';
const note = { schemaVersion: 1, id: 'sample', day: 1, date: '2026-01-01', title: 'Synthetic', topic: 'Test', sentences: [{ id: 's', en: 'Hello.', zh: '你好。' }], mistakes: [] };
function setup() { const name = `speaklog-test-${crypto.randomUUID()}`; return { name, repo: createRepository(name) }; }
async function rawPut(name: string, key: string, value: unknown) { const db = await openDB(name, 1, { upgrade(d) { d.createObjectStore('app'); } }); await db.put('app', value, key); db.close(); }
async function rawGet(name: string, key: string) { const db = await openDB(name, 1); try { return await db.get('app', key); } finally { db.close(); } }

describe('隔离 IndexedDB 的事务、迁移和并发保护', () => {
  it('首次初始化且多次启动不重复建本', async () => { const { repo } = setup(); const first = await repo.load(); expect(await repo.load()).toEqual(first); expect(first).toEqual(emptyLibrary()); });
  it('迁移保存完整旧状态，原 V1 键不变', async () => { const { name, repo } = setup(); const raw = { notes: [note], progress: { untouched: true } }; await rawPut(name, 'state', raw); const s = await repo.load(); expect(s.notes).toHaveLength(1); expect(await rawGet(name, 'state')).toEqual(raw); expect((await rawGet(name, 'v1-before-v3')).value).toEqual(raw); });
  it('反复迁移与重载不覆盖原始快照', async () => { const { name, repo } = setup(); await rawPut(name, 'state', { notes: [note] }); const first = await repo.load(); const snapshot = await rawGet(name, 'v1-before-v3'); await repo.load(); expect(await repo.load()).toEqual(first); expect(await rawGet(name, 'v1-before-v3')).toEqual(snapshot); });
  it('无效旧数据不写 V3、不修改 V1', async () => { const { name, repo } = setup(); const raw = { notes: [{ ...note, day: 0 }] }; await rawPut(name, 'state', raw); await expect(repo.load()).rejects.toThrow(); expect(await rawGet(name, 'state')).toEqual(raw); expect(await rawGet(name, 'state-v3')).toBeUndefined(); expect(await rawGet(name, 'v1-before-v3')).toBeUndefined(); });
  it('迁移写入失败时事务整体回滚', async () => { const { name, repo } = setup(); await rawPut(name, 'state', { notes: [note] }); const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key) { if (key === 'state-v3') throw new DOMException('test quota', 'QuotaExceededError'); return original.call(this, value, key); });
    try { await expect(repo.load()).rejects.toThrow(); } finally { spy.mockRestore(); }
    expect(await rawGet(name, 'state-v3')).toBeUndefined(); expect(await rawGet(name, 'v1-before-v3')).toBeUndefined(); expect(await rawGet(name, 'state')).toEqual({ notes: [note] }); expect((await repo.load()).notes).toHaveLength(1);
  });
  it('保存后新实例重新加载内容、顺序和笔记本均保留', async () => { const { name, repo } = setup(); const s = await repo.load(); const p = planImport(addBook(s, '生活', 'b'), 'b', [note as never]); const saved = await repo.save({ ...p.state, order: 'desc' }); expect(await createRepository(name).load()).toEqual(saved); });
  it('全部笔记本删除后重启不自动重建', async () => { const { repo } = setup(); const s = await repo.load(); await repo.save(deleteBook(s, s.notebooks[0].id, 1)); expect((await repo.load()).notebooks).toEqual([]); });
  it('过期页面写入被拒绝，不覆盖其他页面', async () => { const { repo } = setup(); const a = await repo.load(); const b = await repo.load(); const saved = await repo.save(addBook(a, 'A', 'a')); await expect(repo.save(addBook(b, 'B', 'b'))).rejects.toThrow('另一页面'); expect(await repo.load()).toEqual(saved); });
  it('并发保存只有一个事务成功', async () => { const { repo } = setup(); const s = await repo.load(); const results = await Promise.allSettled([repo.save(addBook(s, 'A', 'a')), repo.save(addBook(s, 'B', 'b'))]); expect(results.filter(v => v.status === 'fulfilled')).toHaveLength(1); expect((await repo.load()).notebooks).toHaveLength(2); });
  it('旧 V1 页面写入后禁止 V3 保存及自动加载，保留双方数据', async () => { const { name, repo } = setup(); const s = await repo.load(); await rawPut(name, 'state', { notes: [note] }); await expect(repo.save(s)).rejects.toThrow('旧版本'); await expect(repo.load()).rejects.toThrow('旧版本'); expect(await rawGet(name, 'state-v3')).toEqual(s); expect(await rawGet(name, 'state')).toEqual({ notes: [note] }); });
  it('损坏 V3 不回退初始化覆盖', async () => { const { name, repo } = setup(); await repo.load(); await rawPut(name, 'state-v3', { corrupt: true }); await expect(repo.load()).rejects.toThrow(); expect(await rawGet(name, 'state-v3')).toEqual({ corrupt: true }); });
  it('保存无效数据不触及已保存状态', async () => { const { repo } = setup(); const s = await repo.load(); await expect(repo.save({ ...s, notebooks: [{ id: '', name: 'x', language: 'en' }] })).rejects.toThrow(); expect(await repo.load()).toEqual(s); });
  it('保存失败保留原状态及恢复前快照', async () => { const { name, repo } = setup(); const s = await repo.load(); const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(this: IDBObjectStore, value, key) { if (key === 'state-v3') throw new DOMException('test quota', 'QuotaExceededError'); return original.call(this, value, key); });
    try { await expect(repo.save(addBook(s, 'A', 'a'), 'restore')).rejects.toThrow(); } finally { spy.mockRestore(); }
    expect(await repo.load()).toEqual(s); expect(await rawGet(name, 'v3-before-last-restore')).toBeUndefined();
  });
  it('恢复前快照和安全导出可读取，正常操作不改 V1', async () => { const { name, repo } = setup(); await rawPut(name, 'state', { notes: [note] }); const s = await repo.load(); await repo.save(addBook(s, 'A', 'a'), 'restore'); const recovery = await repo.recoveryCopy(); expect(recovery.snapshots['v3-before-last-restore']).toEqual(s); expect(recovery.snapshots.state).toEqual({ notes: [note] }); expect((await repo.load()).notebooks).toHaveLength(2); });
});
