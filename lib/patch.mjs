import { DeckError, validateSlideHtml } from './deck.mjs';

function escapeText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

/** Update exactly one plain-text element by stable element ID. Complex widgets stay unchanged. */
export function patchElementText(slideId, html, elementId, value) {
  if (typeof value !== 'string' || value.length > 4000) {
    throw new DeckError(400, '文字必須為 4000 字以內的字串');
  }
  validateSlideHtml(slideId, html);
  const safeId = elementId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openingPattern = new RegExp(`<([a-z][a-z0-9-]*)\\b([^>]*\\bdata-element-id=["']${safeId}["'][^>]*)>`, 'gi');
  const matches = [...html.matchAll(openingPattern)];
  if (matches.length !== 1 || !/\bdata-editable\s*=\s*["']text["']/.test(matches[0][2])) {
    throw new DeckError(404, `找不到可修改的文字元件: ${elementId}`);
  }
  const opening = matches[0];
  const start = opening.index + opening[0].length;
  const closing = `</${opening[1]}>`;
  const end = html.indexOf(closing, start);
  if (end === -1 || html.slice(start, end).includes('<')) {
    throw new DeckError(400, '此元件包含子標籤，請直接修改該頁 HTML 並執行驗證');
  }
  const patched = html.slice(0, start) + escapeText(value) + html.slice(end);
  validateSlideHtml(slideId, patched);
  return patched;
}