// Before V3 development: read-only verification of a V2 full backup.
// No private content is written or logged. IndexedDB exists only in Node memory.
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadV2Api } from './baseline-v2.mjs';

try {
  if (process.argv.length !== 3) throw new Error('请提供 iPhone 导出的 V2 完整备份本地路径。');
  const bytes = await readFile(process.argv[2]);
  let raw;
  try { raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('文件不是有效 JSON。'); }
  if (raw?.backupVersion !== 2 || raw?.dataVersion !== 2) throw new Error('需要 backupVersion: 2、dataVersion: 2 的完整备份。');
  const api = await loadV2Api();
  let library;
  try { library = api.readBackup(raw).library; }
  catch { throw new Error('笔记本、笔记、日期、句子或纠错结构无效，请保留原件以便核对。'); }
  const source = { dataVersion: raw.dataVersion, revision: raw.revision, notebooks: raw.notebooks, notes: raw.notes, order: raw.order };
  if (!isDeepStrictEqual(library, source)) throw new Error('校验后与原备份字段不完全一致，需要人工核对，尚不能确认通过。');
  const repo = api.createRepository(`speaklog-v2-backup-check-${crypto.randomUUID()}`);
  const initial = await repo.load();
  // The isolated destination is empty; this changes only an in-memory candidate.
  const plan = api.planRestore({ ...initial, notebooks: [], notes: [] }, raw);
  if (plan.updated !== 0 || plan.added !== library.notes.length) throw new Error('恢复预览数量不一致。');
  const saved = await repo.save({ ...api.applyPlan(plan, true), order: library.order }, 'restore');
  const restored = await repo.load();
  if (!isDeepStrictEqual(restored, saved) || !isDeepStrictEqual(restored.notes, library.notes) ||
      !isDeepStrictEqual(restored.notebooks, library.notebooks)) throw new Error('隔离数据库恢复、重读结果与原备份不一致。');
  const exported = api.readBackup(JSON.parse(JSON.stringify(api.exportLibrary(restored)))).library;
  if (!isDeepStrictEqual(exported, restored)) throw new Error('重新导出与读取结果不一致。');
  const again = api.planRestore(restored, raw);
  if (again.added !== 0 || !isDeepStrictEqual(again.state, restored)) throw new Error('重复恢复验证不一致。');
  if (!bytes.equals(await readFile(process.argv[2]))) throw new Error('校验期间文件被外部修改，请重新校验。');
  console.log(JSON.stringify({ result: 'V2 完整备份只读及隔离恢复校验通过',
    notebooks: library.notebooks.length, notes: library.notes.length,
    sentences: library.notes.reduce((sum, n) => sum + n.sentences.length, 0),
    mistakes: library.notes.reduce((sum, n) => sum + n.mistakes.length + (n.legacyMistakes?.length ?? 0), 0),
    contentAndIdentityUnchanged: true, datesValid: true, reloadPassed: true,
    repeatedRestorePassed: true, fileUnchanged: true,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    isolation: 'Node fake-indexeddb，仅内存；无网络、无私人文件写入、不接触浏览器数据库',
    remaining: '仍需用户确认这是当前 iPhone 全量备份；此结果不是 V3 迁移测试。',
  }, null, 2));
} catch (error) {
  // Never print parser excerpts, assertion diffs or raw data.
  console.error(`校验未通过：${error instanceof Error && !error.stack?.includes('data:text/javascript') ? error.message : '数据校验或隔离恢复失败，请保留原件。'}`);
  process.exitCode = 1;
}
