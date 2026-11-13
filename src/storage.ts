import { openDB } from 'idb';
import { migrateLegacy, migrateV2, validateLibrary } from './model';
import type { Library } from './model';

export const DATABASE_VERSION = 1;
const fingerprint = (v: unknown) => JSON.stringify(v) ?? 'undefined';
const LEGACY_CHANGED = '检测到旧版本页面修改了笔记。已停止写入，请关闭旧页面，导出安全副本并联系协助合并；不要清除网站数据。';
export function createRepository(name = 'speaklog') {
  const connect = () => openDB(name, DATABASE_VERSION, { upgrade(db) { db.createObjectStore('app'); } });
  return {
    async load(): Promise<Library> {
      const db = await connect();
      const tx = db.transaction('app', 'readwrite');
      try {
        const v1 = await tx.store.get('state');
        const v2 = await tx.store.get('state-v2');
        const saved = await tx.store.get('state-v3');
        if (saved !== undefined) {
          const state = validateLibrary(saved);
          if (await tx.store.get('v3-v1-fingerprint') !== fingerprint(v1) ||
              await tx.store.get('v3-v2-fingerprint') !== fingerprint(v2)) throw new Error(LEGACY_CHANGED);
          await tx.done; return state;
        }
        // Respect V2's earlier detection of edits made by a still-open V1 page.
        if (v2 !== undefined && await tx.store.get('v2-legacy-fingerprint') !== fingerprint(v1)) throw new Error(LEGACY_CHANGED);
        const state = v2 !== undefined ? migrateV2(v2) : migrateLegacy(v1);
        // Snapshot, fingerprints and V3 state commit together, or all abort.
        // Never replace any V1/V2 state or pre-existing snapshot.
        for (const [key, value] of [['v1-before-v3', v1], ['v2-before-v3', v2]] as const) {
          if (await tx.store.get(key) === undefined)
            await tx.store.put({ existed: value !== undefined, value, savedAt: new Date().toISOString() }, key);
        }
        await tx.store.put(fingerprint(v1), 'v3-v1-fingerprint');
        await tx.store.put(fingerprint(v2), 'v3-v2-fingerprint');
        await tx.store.put(state, 'state-v3');
        await tx.done; return state;
      } catch (e) { try { tx.abort(); } catch { /* already aborted */ } await tx.done.catch(() => {}); throw e; }
      finally { db.close(); }
    },
    async save(input: Library, reason = 'edit'): Promise<Library> {
      const checked = validateLibrary(input);
      const db = await connect(); const tx = db.transaction('app', 'readwrite');
      try {
        const current = validateLibrary(await tx.store.get('state-v3'));
        if (current.revision !== checked.revision) throw new Error('另一页面已更新笔记，本次未保存。请先保留当前输入，再重新加载最新数据。');
        if (await tx.store.get('v3-v1-fingerprint') !== fingerprint(await tx.store.get('state')) ||
            await tx.store.get('v3-v2-fingerprint') !== fingerprint(await tx.store.get('state-v2'))) throw new Error(LEGACY_CHANGED);
        for (const book of checked.notebooks) {
          const previous = current.notebooks.find(b => b.id === book.id);
          if (previous && previous.language !== book.language) throw new Error('笔记本语言类型创建后不能改变。');
        }
        const next = validateLibrary({ ...checked, revision: current.revision + 1 });
        if (reason === 'restore') await tx.store.put(current, 'v3-before-last-restore');
        await tx.store.put(current, 'v3-before-last-save');
        await tx.store.put(next, 'state-v3');
        await tx.done; return next;
      } catch (e) { try { tx.abort(); } catch { /* already aborted */ } await tx.done.catch(() => {}); throw e; }
      finally { db.close(); }
    },
    async recoveryCopy() {
      const db = await connect();
      try {
        const tx = db.transaction('app', 'readonly'); const result: Record<string, unknown> = Object.create(null);
        // Include every key so future or older recovery records cannot be omitted.
        for (const key of await tx.store.getAllKeys()) result[String(key)] = await tx.store.get(key);
        await tx.done;
        return { recoveryVersion: 1, exportedAt: new Date().toISOString(), snapshots: result };
      } finally { db.close(); }
    },
  };
}
export const repository = createRepository();
