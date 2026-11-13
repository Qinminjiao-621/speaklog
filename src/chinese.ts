export interface ChineseNote {
  schemaVersion: 2;
  id: string;
  day: number;
  date: string;
  title: string;
  content: string;
}
export const CHINESE_SCHEMA_VERSION = 2;
export const MAX_CONTENT_LENGTH = 500000;
export function validateChineseNotes(input: unknown, limit = 1000): ChineseNote[] {
  const rows = Array.isArray(input) ? input : [input];
  if (rows.length > limit) throw new Error('单次最多导入 1000 篇中文笔记。');
  const ids = new Set<string>();
  return rows.map((value, index) => {
    const fail = (message: string): never => { throw new Error(`第 ${index + 1} 篇中文笔记：${message}`); };
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('必须为对象。');
    const n = value as Record<string, unknown>;
    if (n.schemaVersion !== CHINESE_SCHEMA_VERSION) fail('schemaVersion 必须为 2。');
    const text = (key: string, max: number): string => {
      const v = n[key];
      if (typeof v !== 'string' || !v.trim() || v.length > max) return fail(`${key} 必须为非空字符串，最多 ${max} 字。`);
      return v;
    };
    const id = text('id', 20000);
    if (ids.has(id)) fail('id 重复。');
    ids.add(id);
    if (!Number.isInteger(n.day) || Number(n.day) < 1 || Number(n.day) > 10000) fail('编号必须为 1–10000 的整数。');
    const date = text('date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail('日期必须为有效的 YYYY-MM-DD。');
    return { schemaVersion: 2, id, day: n.day as number, date, title: text('title', 20000), content: text('content', MAX_CONTENT_LENGTH) };
  });
}
export function parseChineseNotes(text: string): ChineseNote[] {
  try {
    const notes = validateChineseNotes(JSON.parse(text));
    if (!notes.length) throw new Error('没有可导入的笔记。');
    return notes;
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error('JSON 格式不正确，请只粘贴 JSON 内容。');
    throw e;
  }
}
