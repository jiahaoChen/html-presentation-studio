import { loadDeck, readSlide } from '../lib/deck.mjs';
const deck = await loadDeck();
for (const slide of deck.slides) {
  const { html } = await readSlide(slide.id);
  console.log(`OK ${slide.id} (${html.length} chars)`);
}
console.log(`Validated ${deck.slides.length} slides.`);