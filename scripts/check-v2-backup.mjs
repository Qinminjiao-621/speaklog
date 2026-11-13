// Read-only private backup verification; all database writes are in Node memory.
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { build } from 'esbuild';
import { openDB } from 'idb';
import { fileURLToPath } from 'node:url';

try {
  if (process.argv.length !== 3) throw new Error('请提供一个本地 V1 完整备份文件路径。');
  const bytes = await readFile(process.argv[2]);
  let raw;
  try { raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new Error('不是有效的 JSON，原文件未修改。'); }
  const bundle = await build({ stdin: { contents: "export * from './src/model.ts'; export * from './src/storage.ts'; export { validateBackup } from './src/data.ts';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const v1 = api.validateBackup(raw);
  const days = v1.notes.map(n => n.day).sort((a, b) => a - b);
  if (![1, 2, 3, 4, 5].every(d => days.includes(d))) throw new Error('未包含完整 Day 01–05。');
  const name = `speaklog-private-check-${crypto.randomUUID()}`;
  const db = await openDB(name, 1, { upgrade(d) { d.createObjectStore('app'); } });
  await db.put('app', v1, 'state'); db.close();
  const repo = api.createRepository(name);
  const migrated = await repo.load();
  const contents = migrated.notes.map(({ uid, notebookId, ...n }) => n);
  if (!isDeepStrictEqual(contents, v1.notes)) throw new Error('迁移后笔记内容不一致。');
  if (migrated.notebooks.length !== 1 || migrated.notebooks[0].name !== '采购职场英语') throw new Error('默认笔记本或归属不正确。');
  if (!isDeepStrictEqual(await repo.load(), migrated)) throw new Error('重复初始化结果不一致。');
  const backup = JSON.parse(JSON.stringify(api.exportLibrary(migrated)));
  const restored = api.planRestore(api.emptyLibrary(), backup).state;
  if (!isDeepStrictEqual(restored.notes, migrated.notes) || !isDeepStrictEqual(restored.notebooks, migrated.notebooks)) throw new Error('V2 完整备份恢复结果不一致。');
  const second = api.createRepository(`${name}-restore`); const initial = await second.load();
  const restoredV1 = await second.save(api.planRestore(initial, raw).state, 'restore');
  if (!isDeepStrictEqual(restoredV1.notes.map(({ uid, notebookId, ...n }) => n), v1.notes)) throw new Error('V1 备份恢复内容不一致。');
  if (!isDeepStrictEqual(await second.load(), restoredV1)) throw new Error('模拟重启后内容不一致。');
  const saved = await repo.save(api.addBook(migrated, '隔离测试笔记本'));
  const recovery = await repo.recoveryCopy();
  if (!isDeepStrictEqual(recovery.snapshots.state, v1) || !isDeepStrictEqual(recovery.snapshots['v1-before-v2'].value, v1)) throw new Error('V1 原始状态或快照被更改。');
  if (saved.notes.length !== v1.notes.length) throw new Error('后续写入改变笔记数量。');
  if (!bytes.equals(await readFile(process.argv[2]))) throw new Error('校验期间文件被外部修改，请重新校验。');
  console.log(JSON.stringify({ result: 'V2 隔离迁移及备份恢复验证通过', notes: v1.notes.length, days, contentUnchanged: true, originalV1Preserved: true, migrationIdempotent: true, v1RestorePassed: true, v2RestorePassed: true, reloadPassed: true, fileUnchanged: true, sha256: createHash('sha256').update(bytes).digest('hex'), isolation: 'Node fake-indexeddb 内存数据库；无浏览器数据库访问，无私人文件写入或上传' }, null, 2));
} catch (e) {
  // Never expose assertion diffs or the private JSON in logs.
  console.error(`验证未通过：${e instanceof SyntaxError ? 'JSON 格式错误' : e.message}`); process.exitCode = 1;
}
