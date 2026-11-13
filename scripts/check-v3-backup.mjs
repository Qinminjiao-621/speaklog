// Private backup is read only. All migrations, writes and restores use fake IDB.
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as equal } from 'node:util';
import { fileURLToPath } from 'node:url';
import { openDB } from 'idb';
import { build } from 'esbuild';
import { loadV2Api } from './baseline-v2.mjs';
try {
  if (process.argv.length !== 3) throw new Error('请提供一个 V2 完整备份文件路径。');
  const bytes = await readFile(process.argv[2]);
  let raw;
  try { raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); } catch { throw new Error('JSON 格式无效。'); }
  const oldApi = await loadV2Api();
  let original;
  try { if (raw.backupVersion !== 2) throw new Error(); original = oldApi.readBackup(raw).library; }
  catch { throw new Error('V2 完整备份校验未通过。'); }
  const bundle = await build({ stdin: { contents: "export * from './src/model.ts'; export * from './src/storage.ts';", resolveDir: fileURLToPath(new URL('../', import.meta.url)) }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const name = `speaklog-private-v3-${crypto.randomUUID()}`;
  const db = await openDB(name, 1, { upgrade(d) { d.createObjectStore('app'); } });
  await db.put('app', original, 'state-v2');
  await db.put('app', 'undefined', 'v2-legacy-fingerprint'); db.close();
  const repo = api.createRepository(name); const migrated = await repo.load();
  const check = (condition, label) => { if (!condition) throw new Error(`${label}未通过；未修改原文件。`); };
  check(equal(migrated.notes, original.notes), '逐字段内容、日期及笔记身份一致性');
  check(equal(migrated.notebooks, original.notebooks.map(b => ({ ...b, language: 'en' }))), '英文分类与笔记本身份');
  check(migrated.notebooks.every(b => b.language === 'en'), '中文分类初始为空');
  check(equal(await repo.load(), migrated), '迁移幂等性');
  const recovery = await repo.recoveryCopy();
  check(equal(recovery.snapshots['state-v2'], original) && equal(recovery.snapshots['v2-before-v3'].value, original), 'V2 原键及快照保护');
  const exported = api.exportLibrary(migrated);
  for (const backup of [raw, exported]) {
    const isolated = api.createRepository(`${name}-restore-${backup.backupVersion}`);
    const blank = await isolated.load();
    const plan = api.planRestore({ ...blank, notebooks: [] }, backup);
    const saved = await isolated.save(api.applyPlan(plan, true), 'restore');
    check(equal(saved.notes, migrated.notes) && equal(saved.notebooks, migrated.notebooks), `V${backup.backupVersion}恢复`);
    check(equal(await isolated.load(), saved), '恢复后重读');
    check(api.planRestore(saved, backup).added === 0, '重复恢复不产生副本');
  }
  check(bytes.equals(await readFile(process.argv[2])), '原文件未变');
  console.log(JSON.stringify({ result: '真实 V2 备份的 V3 隔离迁移与恢复验证通过', notebooks: original.notebooks.length, notes: original.notes.length,
    contentAndIdentityUnchanged: true, originalV2Preserved: true, migrationIdempotent: true, v2RestorePassed: true, v3RestorePassed: true, reloadPassed: true, fileUnchanged: true,
    sha256: createHash('sha256').update(bytes).digest('hex'), isolation: 'Node fake-indexeddb 内存数据库；无私人文件写入或上传，无真实浏览器数据库访问' }, null, 2));
} catch (e) {
  console.error(`验证未通过：${e instanceof Error && !e.stack?.includes('data:text/javascript') ? e.message : '迁移或恢复失败，请保留原件并检查数据结构。'}`);
  process.exitCode = 1;
}
