export const htmlToPlainText = (html = '') => {
  if (!html) return '';

  // 1) Normalize paragraph / break tags to newlines
  let s = html
    .replace(/<\/p\s*>/gi, '\n') // closing p -> newline
    .replace(/<br\s*\/?>/gi, '\n') // br -> newline
    .replace(/<p[^>]*>/gi, ''); // opening p -> removed (we already added newline)

  // 2) Remove all remaining HTML tags
  s = s.replace(/<\/?[^>]+(>|$)/g, '');

  // 3) Decode HTML entities (Node.js-safe DOM check)
  const hasDOM =
    typeof globalThis !== 'undefined' && globalThis.document && typeof globalThis.document.createElement === 'function';

  if (hasDOM) {
    // Browser environment
    const ta = globalThis.document.createElement('textarea');
    ta.innerHTML = s;
    s = ta.value;
  } else {
    // Node.js environment
    s = s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x2F;/gi, '/');
  }

  // 4) Clean up whitespace: collapse multiple spaces, trim lines, remove empty lines
  s = s
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n\n');

  return s;
};
