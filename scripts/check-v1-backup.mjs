// Runs in Node with an in-memory IndexedDB implementation. No browser database,
// network request, or file write is used. Never print the private note contents.
import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validateBackup, createBackup, loadState, saveState } from '../src/data.ts';

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error('用法：node --experimental-strip-types scripts/check-v1-backup.mjs "备份文件的完整路径"');
  process.exitCode = 1;
} else {
  try {
    const bytes = await readFile(path);
    let raw;
    try { raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
    catch { throw new Error('文件不是可读取的 JSON；原文件未修改。'); }
    const state = validateBackup(raw);
    const days = state.notes.map(n => n.day).sort((a, b) => a - b);
    if (!days.length) throw new Error('备份为空，不能作为升级前的完整备份。');
    if (new Set(days).size !== days.length) throw new Error('存在重复 Day 编号，需要先人工核对，不能直接迁移。');
    const missing = [1, 2, 3, 4, 5].filter(day => !days.includes(day));
    if (missing.length) throw new Error(`缺少预期笔记：${missing.map(d => `Day ${String(d).padStart(2, '0')}`).join('、')}。`);
    // The Node process owns this temporary fake database; nothing is persisted
    // to Safari, Chrome, iCloud, or the iPhone. Do not replace this with real IDB.
    await saveState(state);
    if (!isDeepStrictEqual(await loadState(), state)) throw new Error('隔离数据库写入、重读后的内容不一致。');
    const roundtrip = validateBackup(JSON.parse(JSON.stringify(createBackup(await loadState()))));
    if (!isDeepStrictEqual(roundtrip, state)) throw new Error('隔离恢复、重新导出后的内容不一致。');
    const after = await readFile(path);
    if (!bytes.equals(after)) throw new Error('校验期间备份文件被外部修改，请重新校验。');
    console.log(JSON.stringify({
      result: '通过 V1 格式校验和内存数据库恢复往返校验',
      backupVersion: raw.backupVersion,
      notes: state.notes.length,
      days,
      sentences: state.notes.reduce((n, v) => n + v.sentences.length, 0),
      mistakes: state.notes.reduce((n, v) => n + v.mistakes.length + (v.legacyMistakes?.length ?? 0), 0),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fileUnchanged: true,
      isolation: 'Node fake-indexeddb，仅内存，无网络，不接触真实浏览器数据库',
      remaining: '请本人确认这是 iPhone 全量备份；V2 迁移仍需单独测试。',
    }, null, 2));
  } catch (error) {
    const message = error instanceof SyntaxError ? 'JSON 格式错误。' : error.message;
    console.error(`校验未通过：${message}`);
    process.exitCode = 1;
  }
}
