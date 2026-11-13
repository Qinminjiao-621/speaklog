import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

// No raw HTML plugin or HTML insertion. Links are plain text; images and embeds
// never create DOM elements or network requests. The allowlist is deliberate.
export default memo(function Markdown({ content }: { content: string }) {
  return <div className="markdown"><ReactMarkdown skipHtml
    allowedElements={['h1', 'h2', 'h3', 'p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'code', 'pre']}
    unwrapDisallowed remarkPlugins={[remarkBreaks]}>{content}</ReactMarkdown></div>;
});
