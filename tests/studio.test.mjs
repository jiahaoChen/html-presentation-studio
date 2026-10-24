import test from 'node:test';
import assert from 'node:assert/strict';
import { loadDeck, readSlide, validateSlideHtml, buildStandaloneHtml, DeckError } from '../lib/deck.mjs';
import { patchElementText } from '../lib/patch.mjs';
import { createApp } from '../server.mjs';

const validateError = (fn, status) => assert.throws(fn, (err) => err instanceof DeckError && err.status === status);

test('deck manifest is valid and all slides carry stable element IDs', async () => {
  const deck = await loadDeck();
  assert.equal(deck.slides.length, 4);
  for (const slide of deck.slides) {
    const data = await readSlide(slide.id);
    assert.equal(data.id, slide.id);
    assert.match(data.hash, /^[0-9a-f]{64}$/);
    assert.ok(validateSlideHtml(slide.id, data.html).elementIds.length > 2);
  }
});

test('agent patch modifies one plain-text element and preserves all surrounding markup', async () => {
  const input = (await readSlide('s04-precision')).html;
  const patched = patchElementText('s04-precision', input, 'demo-callout', '已完成指定元件修改 & Review');
  assert.ok(patched.includes('已完成指定元件修改 &amp; Review'));
  assert.ok(!patched.includes('只修改這個元件'));
  assert.ok(patched.includes('Agent 只應修改 slides/s04-precision.html'));
  assert.equal(validateSlideHtml('s04-precision', patched).elementIds.length, validateSlideHtml('s04-precision', input).elementIds.length);
  assert.equal(patched.replace('已完成指定元件修改 &amp; Review', '只修改這個元件'), input);
});

test('agent patch escapes HTML injection and rejects non-text components', async () => {
  const input = (await readSlide('s04-precision')).html;
  const patched = patchElementText('s04-precision', input, 'demo-callout', '<script>alert(1)</script>');
  assert.ok(patched.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  validateError(() => patchElementText('s04-precision', input, 'precision-code-box', 'not plain text'), 404);
  validateError(() => patchElementText('s04-precision', input, 'missing-element', 'value'), 404);
});

test('validator blocks duplicate IDs, wrong slide ID and active content', async () => {
  const original = (await readSlide('s04-precision')).html;
  validateError(() => validateSlideHtml('s03-workflow', original), 400);
  validateError(() => validateSlideHtml('s04-precision', original.replace('data-element-id="precision-title"', 'data-element-id="precision-kicker"')), 400);
  validateError(() => validateSlideHtml('s04-precision', original.replace('</section>', '<script>alert(1)</script></section>')), 400);
  validateError(() => validateSlideHtml('s04-precision', original.replace('</section>', '<img src="https://example.com/image.png"></section>')), 400);
});

test('standalone export contains every slide and an offline player', async () => {
  const exported = await buildStandaloneHtml();
  assert.equal((exported.match(/class="slide-page/g) || []).length, 4);
  assert.ok(exported.includes('id="deck-screen"'));
  assert.ok(exported.includes('id="deck-count"'));
  assert.ok(exported.includes('location.hash'));
  assert.ok(!/<script[^>]*src=/.test(exported));
  assert.ok(!/<link[^>]*href=/.test(exported));
});

test('API reads slides, refuses stale hash writes, and supports standalone download', async (t) => {
  const server = createApp();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const deckRes = await fetch(`${url}/api/deck`);
  assert.equal(deckRes.status, 200);
  const slideRes = await fetch(`${url}/api/slides/s01-cover`);
  const slide = await slideRes.json();
  assert.equal(slide.id, 's01-cover');
  const stale = await fetch(`${url}/api/slides/s01-cover`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html: slide.html, expectedHash: '0'.repeat(64) })
  });
  assert.equal(stale.status, 409);
  const malformed = await fetch(`${url}/api/slides/s01-cover`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html: '<h1>No section</h1>', expectedHash: slide.hash })
  });
  assert.equal(malformed.status, 400);
  const otherBefore = (await (await fetch(`${url}/api/slides/s02-architecture`)).json()).hash;
  const saved = await fetch(`${url}/api/slides/s01-cover`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ html: slide.html, expectedHash: slide.hash })
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).hash, slide.hash);
  const loadedAgain = await (await fetch(`${url}/api/slides/s01-cover`)).json();
  assert.equal(loadedAgain.hash, slide.hash);
  assert.equal((await (await fetch(`${url}/api/slides/s02-architecture`)).json()).hash, otherBefore);
  const forbidden = await fetch(`${url}/%2e%2e%2fdeck.json`);
  assert.notEqual(forbidden.status, 200);
  const out = await fetch(`${url}/api/export`);
  assert.equal(out.status, 200);
  assert.match(out.headers.get('content-disposition'), /presentation\.html/);
  assert.ok((await out.text()).includes('HTML Presentation Studio'));
});