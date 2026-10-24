const $ = (id) => document.getElementById(id);
const state = { deck: null, cache: new Map(), activeIndex: 0, selected: null, dirty: false, scale: 1, presenting: false, drag: null };
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
let toastTimer;

function toast(message) {
  const box = $('toast');
  box.textContent = message;
  box.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('visible'), 2800);
}

async function api(url, options = undefined) {
  const response = await fetch(url, options);
  let data;
  try { data = await response.json(); }
  catch { throw new Error(`HTTP ${response.status}`); }
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

const slideAt = (index) => state.deck.slides[index];
function currentSlide() { return slideAt(state.activeIndex); }
function getSlideRoot() { return $('slide-stage').querySelector('.slide-page'); }

function setDirty(dirty) {
  state.dirty = dirty;
  const status = $('save-status');
  status.classList.toggle('unsaved', dirty);
  status.lastChild.textContent = dirty ? ' 尚未儲存' : ' 已儲存';
}

async function getSlide(id) {
  if (!state.cache.has(id)) state.cache.set(id, await api(`/api/slides/${id}`));
  return state.cache.get(id);
}

async function createSlideList() {
  const list = $('slide-list');
  list.replaceChildren();
  for (let index = 0; index < state.deck.slides.length; index += 1) {
    const slide = slideAt(index);
    const button = document.createElement('button');
    button.className = 'slide-option';
    button.type = 'button';
    button.dataset.index = String(index);
    const thumb = document.createElement('div');
    thumb.className = 'slide-preview';
    const data = await getSlide(slide.id);
    thumb.innerHTML = data.html;
    const meta = document.createElement('div');
    meta.className = 'slide-meta';
    const num = document.createElement('span');
    num.className = 'slide-index';
    num.textContent = String(index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'slide-caption';
    name.textContent = slide.title;
    meta.append(num, name);
    button.append(thumb, meta);
    button.addEventListener('click', () => void openSlide(index));
    list.append(button);
  }
}

function refreshThumb() {
  const slide = currentSlide();
  const frame = $('slide-list').querySelector(`.slide-option[data-index="${state.activeIndex}"] .slide-preview`);
  if (frame) frame.innerHTML = state.cache.get(slide.id).html;
}

async function openSlide(index) {
  if (index < 0 || index >= state.deck.slides.length || index === state.activeIndex && getSlideRoot()) return;
  if (state.dirty && !confirm('目前頁面尚未儲存。確定放棄修改並切換頁面？')) return;
  state.activeIndex = index;
  const slide = currentSlide();
  try {
    const data = await getSlide(slide.id);
    $('slide-stage').innerHTML = data.html;
    deselect();
    setDirty(false);
    $('current-title').textContent = slide.title;
    $('slide-id').textContent = slide.id;
    $('page-indicator').textContent = `${String(index + 1).padStart(2, '0')} / ${String(state.deck.slides.length).padStart(2, '0')}`;
    $('slide-list').querySelectorAll('.slide-option').forEach((el, i) => el.classList.toggle('active', i === index));
    fit();
  } catch (error) { toast(`載入失敗：${error.message}`); }
}

function fit() {
  const view = $('viewport');
  const availableWidth = view.clientWidth - (state.presenting ? 0 : 42);
  const availableHeight = view.clientHeight - (state.presenting ? 0 : 42);
  state.scale = Math.max(0.1, Math.min(availableWidth / STAGE_WIDTH, availableHeight / STAGE_HEIGHT));
  $('stage-holder').style.width = `${STAGE_WIDTH * state.scale}px`;
  $('stage-holder').style.height = `${STAGE_HEIGHT * state.scale}px`;
  $('slide-stage').style.transform = `scale(${state.scale})`;
  $('zoom-value').textContent = `${Math.round(state.scale * 100)}%`;
}

function deselect() {
  state.selected?.classList.remove('selected');
  state.selected?.removeAttribute('contenteditable');
  state.selected = null;
  $('property-form').hidden = true;
  $('empty-selection').hidden = false;
  $('agent-target').textContent = '選取元件後，這裡將顯示 AI 修改座標。';
  $('copy-target').disabled = true;
}

function getPx(element, key) {
  const value = parseFloat(element.style[key]);
  return Number.isFinite(value) ? Math.round(value) : Math.round(element.getBoundingClientRect()[key] || 0);
}
function rgbHex(color) {
  const match = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (match) return '#' + match.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#132a4c';
}

function select(element) {
  if (state.presenting) return;
  if (state.selected === element) return;
  state.selected?.classList.remove('selected');
  state.selected = element;
  element.classList.add('selected');
  $('property-form').hidden = false;
  $('empty-selection').hidden = true;
  const id = element.dataset.elementId;
  $('element-id').textContent = id;
  const editable = element.dataset.editable === 'text';
  $('text-field').hidden = !editable;
  $('element-text').value = editable ? element.innerText : '';
  $('pos-x').value = getPx(element, 'left');
  $('pos-y').value = getPx(element, 'top');
  $('size-w').value = getPx(element, 'width');
  $('size-h').value = getPx(element, 'height');
  $('font-size').value = parseInt(getComputedStyle(element).fontSize, 10) || 20;
  $('font-color').value = rgbHex(getComputedStyle(element).color);
  const target = JSON.stringify({ slideId: currentSlide().id, elementId: id, scope: 'selected-element-only' }, null, 2);
  $('agent-target').textContent = target;
  $('copy-target').disabled = false;
}

function syncInspectorPosition() {
  if (!state.selected) return;
  for (const [id, key] of [['pos-x', 'left'], ['pos-y', 'top'], ['size-w', 'width'], ['size-h', 'height']]) {
    $(id).value = getPx(state.selected, key);
  }
}

function serializeSlide() {
  const clone = getSlideRoot()?.cloneNode(true);
  if (!clone) throw new Error('目前沒有投影片');
  clone.querySelectorAll('.selected').forEach((element) => element.classList.remove('selected'));
  clone.querySelectorAll('[contenteditable]').forEach((element) => element.removeAttribute('contenteditable'));
  return clone.outerHTML + '\n';
}

async function saveSlide() {
  const slide = currentSlide();
  if (!slide) return;
  const html = serializeSlide();
  const before = state.cache.get(slide.id);
  if (!state.dirty) { toast('沒有需要儲存的變更'); return; }
  try {
    const result = await api(`/api/slides/${slide.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html, expectedHash: before.hash })
    });
    state.cache.set(slide.id, { id: slide.id, html, hash: result.hash });
    setDirty(false);
    refreshThumb();
    toast('已儲存目前投影片，其他頁面未修改');
  } catch (error) {
    toast(`儲存失敗：${error.message}`);
    if (error.message.includes('其他編輯')) toast('版本衝突：請先複製修改內容，再重新載入');
  }
}

function applyFieldUpdate(id, value) {
  if (!state.selected) return;
  if (id === 'element-text' && state.selected.dataset.editable === 'text') state.selected.textContent = value;
  else if (id === 'pos-x') state.selected.style.left = `${Math.round(Number(value) || 0)}px`;
  else if (id === 'pos-y') state.selected.style.top = `${Math.round(Number(value) || 0)}px`;
  else if (id === 'size-w') state.selected.style.width = `${Math.max(10, Math.round(Number(value) || 10))}px`;
  else if (id === 'size-h') state.selected.style.height = `${Math.max(10, Math.round(Number(value) || 10))}px`;
  else if (id === 'font-size') state.selected.style.fontSize = `${Math.max(10, Math.round(Number(value) || 10))}px`;
  else if (id === 'font-color') state.selected.style.color = value;
  else return;
  setDirty(true);
}

function enableInlineEditing(element) {
  if (!element || element.dataset.editable !== 'text' || state.presenting) return;
  element.setAttribute('contenteditable', 'true');
  element.focus();
  element.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); element.blur(); }
    if (event.key === 'Enter') { event.preventDefault(); document.execCommand('insertText', false, '\n'); }
  }, { once: false, signal: editController.signal });
  element.addEventListener('input', () => { $('element-text').value = element.innerText; setDirty(true); }, { signal: editController.signal });
  element.addEventListener('blur', () => { element.removeAttribute('contenteditable'); $('element-text').value = element.innerText; }, { once: true });
}
let editController = new AbortController();
function handlePointerDown(event) {
  if (state.presenting || event.button !== 0) return;
  const target = event.target.closest('[data-element-id]');
  if (!target || !getSlideRoot().contains(target)) return;
  select(target);
  if (target.isContentEditable) return;
  const start = { id: event.pointerId, el: target, x: event.clientX, y: event.clientY, left: getPx(target, 'left'), top: getPx(target, 'top'), moved: false };
  state.drag = start;
  $('slide-stage').setPointerCapture(event.pointerId);
  event.preventDefault();
}
function handlePointerMove(event) {
  const drag = state.drag;
  if (!drag || drag.id !== event.pointerId) return;
  const dx = (event.clientX - drag.x) / state.scale;
  const dy = (event.clientY - drag.y) / state.scale;
  if (Math.abs(dx) + Math.abs(dy) < 2 && !drag.moved) return;
  drag.moved = true;
  const snap = (n) => Math.round(n / 4) * 4;
  drag.el.style.left = `${Math.max(0, Math.min(STAGE_WIDTH - 12, snap(drag.left + dx)))}px`;
  drag.el.style.top = `${Math.max(0, Math.min(STAGE_HEIGHT - 12, snap(drag.top + dy)))}px`;
  syncInspectorPosition();
  setDirty(true);
}
function handlePointerUp(event) {
  if (state.drag?.id !== event.pointerId) return;
  state.drag = null;
  if ($('slide-stage').hasPointerCapture(event.pointerId)) $('slide-stage').releasePointerCapture(event.pointerId);
}

async function togglePresent() {
  if (!state.presenting && state.dirty) { toast('請先儲存修改，再進入播放模式'); return; }
  state.presenting = !state.presenting;
  document.body.classList.toggle('present-mode', state.presenting);
  if (state.presenting) deselect();
  $('present').textContent = state.presenting ? '離開播放' : '▶ 播放';
  fit();
  if (state.presenting) toast('方向鍵切換頁面，Esc 離開播放');
}

async function init() {
  state.deck = await api('/api/deck');
  $('deck-name').textContent = state.deck.title;
  $('slide-total').textContent = String(state.deck.slides.length).padStart(2, '0');
  await createSlideList();
  await openSlide(0);
  $('slide-stage').addEventListener('pointerdown', handlePointerDown);
  $('slide-stage').addEventListener('pointermove', handlePointerMove);
  $('slide-stage').addEventListener('pointerup', handlePointerUp);
  $('slide-stage').addEventListener('pointercancel', handlePointerUp);
  $('slide-stage').addEventListener('dblclick', (event) => {
    const target = event.target.closest('[data-element-id]');
    if (!target) return;
    select(target);
    editController.abort();
    editController = new AbortController();
    enableInlineEditing(target);
  });
  ['element-text', 'pos-x', 'pos-y', 'size-w', 'size-h', 'font-size', 'font-color'].forEach((id) => {
    $(id).addEventListener('input', (event) => applyFieldUpdate(id, event.target.value));
  });
  $('save').addEventListener('click', () => void saveSlide());
  $('export').addEventListener('click', () => {
    if (state.dirty) { toast('請先儲存目前頁面，再匯出 HTML'); return; }
    window.location.href = '/api/export';
  });
  $('present').addEventListener('click', () => void togglePresent());
  $('prev').addEventListener('click', () => void openSlide(state.activeIndex - 1));
  $('next').addEventListener('click', () => void openSlide(state.activeIndex + 1));
  $('copy-target').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('agent-target').textContent); toast('已複製 Agent 定位資訊'); }
    catch { toast('無法存取剪貼簿，請手動複製'); }
  });
  window.addEventListener('keydown', (event) => {
    const focusedInput = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveSlide(); }
    if (event.key === 'Escape' && state.presenting) { void togglePresent(); return; }
    if (!focusedInput && event.key === 'ArrowRight') void openSlide(state.activeIndex + 1);
    if (!focusedInput && event.key === 'ArrowLeft') void openSlide(state.activeIndex - 1);
  });
  window.addEventListener('beforeunload', (event) => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  new ResizeObserver(fit).observe($('viewport'));
  setDirty(false);
}
init().catch((error) => toast(`啟動失敗：${error.message}`));