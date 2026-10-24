import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestFile = join(root, 'deck.json');
const slideDir = join(root, 'slides');
const idPattern = /^[a-z][a-z0-9-]{1,50}$/;

export class DeckError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'DeckError';
    this.status = status;
  }
}

export const digest = (content) => createHash('sha256').update(content).digest('hex');

export async function loadDeck() {
  let deck;
  try {
    deck = JSON.parse(await readFile(manifestFile, 'utf8'));
  } catch (error) {
    throw new DeckError(500, `無法讀取 deck.json: ${error.message}`);
  }
  if (deck?.version !== 1 || !Array.isArray(deck.slides) || !deck.slides.length) {
    throw new DeckError(500, 'deck.json 格式錯誤');
  }
  const ids = new Set();
  for (const slide of deck.slides) {
    if (!slide || !idPattern.test(slide.id) || typeof slide.title !== 'string' || ids.has(slide.id)) {
      throw new DeckError(500, 'deck.json 存在無效或重複的 slide ID');
    }
    ids.add(slide.id);
  }
  return deck;
}

export async function requireSlide(id) {
  if (!idPattern.test(id)) throw new DeckError(400, '無效的 slide ID');
  const deck = await loadDeck();
  if (!deck.slides.some((slide) => slide.id === id)) {
    throw new DeckError(404, `找不到 slide: ${id}`);
  }
  return join(slideDir, `${id}.html`);
}

export function validateSlideHtml(id, html) {
  if (typeof html !== 'string' || html.length > 300_000) {
    throw new DeckError(400, '投影片 HTML 格式錯誤或超過 300 KB');
  }
  // This MVP accepts trusted, script-free markup. This is a guard, not a general HTML sanitizer.
  if (/<\s*\/?\s*(script|iframe|object|embed|form|base|meta|link)\b/i.test(html)
    || /\bon[a-z]+\s*=/i.test(html) || /javascript\s*:/i.test(html)
    || /\b(?:src|href)\s*=/i.test(html) || /@import\b/i.test(html)) {
    throw new DeckError(400, '投影片不允許外部資源、事件屬性或嵌入 script');
  }
  const sections = [...html.matchAll(/<\s*section\b([^>]*)>/gi)];
  if (sections.length !== 1 || !/<\/section\s*>\s*$/i.test(html.trim())) {
    throw new DeckError(400, '每頁只能有一個最外層 section');
  }
  const opening = sections[0][1];
  const slideId = opening.match(/\bdata-slide-id\s*=\s*["']([^"']+)["']/i)?.[1];
  if (slideId !== id || !/\bclass\s*=\s*["'][^"']*\bslide-page\b/i.test(opening)) {
    throw new DeckError(400, `投影片容器必須使用 class="slide-page" 且 data-slide-id="${id}"`);
  }
  const elementIds = [...html.matchAll(/\bdata-element-id\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  if (!elementIds.length || elementIds.some((value) => !idPattern.test(value))) {
    throw new DeckError(400, '需至少有一個有效的 data-element-id');
  }
  if (new Set(elementIds).size !== elementIds.length) {
    throw new DeckError(400, '同一頁有重複的 data-element-id');
  }
  return { elementIds };
}

export async function readSlide(id) {
  const file = await requireSlide(id);
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    throw new DeckError(404, `投影片檔案不存在: ${id}`);
  }
  validateSlideHtml(id, html);
  return { id, html, hash: digest(html) };
}

export async function updateSlide(id, html, expectedHash) {
  if (typeof expectedHash !== 'string' || !/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new DeckError(400, '缺少有效的 expectedHash');
  }
  validateSlideHtml(id, html);
  const file = await requireSlide(id);
  const old = await readSlide(id);
  if (old.hash !== expectedHash) {
    throw new DeckError(409, '檔案已被其他編輯更新，請重新載入後再修改');
  }
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await writeFile(temp, html, 'utf8');
    await rename(temp, file);
  } catch (error) {
    throw new DeckError(500, `寫入失敗: ${error.message}`);
  }
  return { id, hash: digest(html) };
}

export async function buildStandaloneHtml() {
  const deck = await loadDeck();
  const theme = await readFile(join(root, 'public', 'theme.css'), 'utf8');
  const slideHtml = (await Promise.all(deck.slides.map((slide) => readSlide(slide.id)))).map((item) => item.html).join('\n');
  const escapedTitle = deck.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const app = String.raw`
    const slides = Array.from(document.querySelectorAll('.slide-page'));
    const screen = document.getElementById('deck-screen');
    const stage = document.getElementById('deck-stage');
    const indicator = document.getElementById('deck-count');
    let current = 0;
    function fit() {
      const scale = Math.min(screen.clientWidth / 1280, screen.clientHeight / 720);
      stage.style.transform = 'scale(' + scale + ')';
      stage.style.left = ((screen.clientWidth - 1280 * scale) / 2) + 'px';
      stage.style.top = ((screen.clientHeight - 720 * scale) / 2) + 'px';
    }
    function show(index) {
      current = Math.max(0, Math.min(index, slides.length - 1));
      slides.forEach((el, i) => { el.hidden = i !== current; });
      indicator.textContent = String(current + 1).padStart(2, '0') + ' / ' + String(slides.length).padStart(2, '0');
      location.hash = '#slide=' + (current + 1);
    }
    document.getElementById('prev').addEventListener('click', () => show(current - 1));
    document.getElementById('next').addEventListener('click', () => show(current + 1));
    document.getElementById('fullscreen').addEventListener('click', () => document.documentElement.requestFullscreen?.());
    addEventListener('keydown', (e) => {
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); show(current + 1); }
      if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); show(current - 1); }
    });
    addEventListener('resize', fit);
    show(Math.max(0, Number(location.hash.match(/slide=(\d+)/)?.[1] || '1') - 1));
    fit();`;
  return `<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapedTitle}</title><style>${theme}</style><style>html,body{height:100%;margin:0;background:#0c1426;color:#dce5f5;font-family:system-ui,-apple-system,sans-serif;overflow:hidden}#deck-screen{position:absolute;inset:12px 12px 68px;overflow:hidden}#deck-stage{position:absolute;width:1280px;height:720px;transform-origin:top left}.slide-page[hidden]{display:none!important}.deck-controls{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:#202c42;border:1px solid #3b4b62;padding:9px 14px;border-radius:30px}.deck-controls button{background:transparent;color:#e9efff;border:0;cursor:pointer;font-size:14px;padding:7px 12px;border-radius:20px}.deck-controls button:hover{background:#32415b}#deck-count{font-size:12px;white-space:nowrap;min-width:60px;text-align:center}</style></head><body><div id="deck-screen"><main id="deck-stage">${slideHtml}</main></div><nav class="deck-controls"><button id="prev" aria-label="上一頁">← 上一頁</button><span id="deck-count"></span><button id="next" aria-label="下一頁">下一頁 →</button><button id="fullscreen" aria-label="全螢幕">⛶</button></nav><script>${app}</script></body></html>`;
}

export async function writeStandalone(target = join(root, 'dist', 'presentation.html')) {
  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, await buildStandaloneHtml(), 'utf8');
  return target;
}