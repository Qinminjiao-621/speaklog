import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { toString } from 'mdast-util-to-string';

const parser = unified().use(remarkParse);
// Bounded cache avoids parsing the same long note on each search keystroke.
const cache = new Map<string, string>();
let cacheSize = 0;
export function markdownText(content: string): string {
  const cached = cache.get(content);
  if (cached !== undefined) return cached;
  const tree = parser.parse(content);
  const text = tree.children.map(node => toString(node, { includeHtml: false, includeImageAlt: false })).join('\n');
  if (cacheSize + content.length > 2000000) { cache.clear(); cacheSize = 0; }
  cache.set(content, text); cacheSize += content.length;
  return text;
}
