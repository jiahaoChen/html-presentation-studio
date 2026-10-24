import { readSlide, updateSlide } from '../lib/deck.mjs';
import { patchElementText } from '../lib/patch.mjs';
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i].startsWith('--')) throw new Error('參數必須使用 --slide / --element / --text');
  options[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!options.slide || !options.element || options.text === undefined) {
  console.error('Usage: node scripts/agent-edit.mjs --slide s04-precision --element demo-callout --text "新內容"');
  process.exit(2);
}
const current = await readSlide(options.slide);
const html = patchElementText(options.slide, current.html, options.element, options.text);
const result = await updateSlide(options.slide, html, current.hash);
console.log(`Patched ${result.id}/${options.element}; sha256=${result.hash}`);