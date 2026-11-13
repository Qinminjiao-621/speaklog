import { openDB } from 'idb';
import { migrateLegacy, validateLibrary } from './model';
import type { Library } from './model';

const fingerprint = (v: unknown) => JSON.stringify(v) ?? 'undefined';
const LEGACY_CHANGED = '检测到旧版本页面修改了笔记。已停止写入，请关闭旧页面，导出安全副本并联系协助合并；不要清除网站数据。';
export function createRepository(name = 'speaklog') {
  const connect = () => openDB(name, 1, { upgrade(db) { db.createObjectStore('app'); } });
  return {
    async load(): Promise<Library> {
      const db = await connect();
      const tx = db.transaction('app', 'readwrite');
      try {
        const raw = await tx.store.get('state');
        const saved = await tx.store.get('state-v2');
        if (saved !== undefined) {
          const state = validateLibrary(saved);
          if (await tx.store.get('v2-legacy-fingerprint') !== fingerprint(raw)) throw new Error(LEGACY_CHANGED);
          await tx.done; return state;
        }
        const state = migrateLegacy(raw);
        // Snapshot, origin marker and new state either all commit or all abort.
        // V1's state and earlier snapshots are never modified by V2.
        if (await tx.store.get('v1-before-v2') === undefined)
          await tx.store.put({ existed: raw !== undefined, value: raw, savedAt: new Date().toISOString() }, 'v1-before-v2');
        await tx.store.put(fingerprint(raw), 'v2-legacy-fingerprint');
        await tx.store.put(state, 'state-v2');
        await tx.done; return state;
      } catch (e) { try { tx.abort(); } catch { /* already aborted */ } await tx.done.catch(() => {}); throw e; }
      finally { db.close(); }
    },
    async save(input: Library, reason = 'edit'): Promise<Library> {
      const checked = validateLibrary(input);
      const db = await connect(); const tx = db.transaction('app', 'readwrite');
      try {
        const current = validateLibrary(await tx.store.get('state-v2'));
        if (current.revision !== checked.revision) throw new Error('另一页面已更新笔记，本次未保存。请先保留当前输入，再重新加载最新数据。');
        if (await tx.store.get('v2-legacy-fingerprint') !== fingerprint(await tx.store.get('state'))) throw new Error(LEGACY_CHANGED);
        const next = validateLibrary({ ...checked, revision: current.revision + 1 });
        if (reason === 'restore') await tx.store.put(current, 'v2-before-last-restore');
        await tx.store.put(current, 'v2-before-last-save');
        await tx.store.put(next, 'state-v2');
        await tx.done; return next;
      } catch (e) { try { tx.abort(); } catch { /* already aborted */ } await tx.done.catch(() => {}); throw e; }
      finally { db.close(); }
    },
    async recoveryCopy() {
      const db = await connect();
      try {
        const tx = db.transaction('app', 'readonly'); const result: Record<string, unknown> = {};
        for (const key of ['state', 'state-v2', 'v1-before-v2', 'legacy-state-before-simplification', 'v2-before-last-restore', 'v2-before-last-save'])
          result[key] = await tx.store.get(key);
        await tx.done;
        return { recoveryVersion: 1, exportedAt: new Date().toISOString(), snapshots: result };
      } finally { db.close(); }
    },
  };
}
export const repository = createRepository();
