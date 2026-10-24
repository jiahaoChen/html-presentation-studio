---
name: html-presentation-studio
description: Create and edit agent-friendly HTML slide decks in the HTML Presentation Studio repository. Use when asked to make a slide, modify a named slide or element, apply a reusable 16:9 layout, preserve manual browser edits, validate one-slide diffs, or export an offline single-file HTML presentation. Requires the Studio project directory.
---

# HTML Presentation Studio

Use this skill to operate the repository, not to replace its editor. The browser editor and the agent work on the same `slides/<slide-id>.html` files.

## Inputs and outputs

- Input: presentation goal, slide ID (or unambiguous title), optional element ID, and requested change.
- Output: a minimal patch to the indicated slide HTML, validation result, and optionally `dist/presentation.html`.
- Requirements: Node.js 20 or newer. No external SDK or connector is needed for local edits.

## Repository contract

1. Read `deck.json` to map slide order to `slides/<slide-id>.html`. Never infer slide ID from visible page numbering alone.
2. Keep exactly one `<section class="slide-page" data-slide-id="...">` as the outermost element of each page.
3. Every independently editable component must have a unique `data-element-id` within its page. Use `data-editable="text"` only for actual plain-text elements.
4. Put shared visual rules in `public/theme.css`. Leave the editor implementation in `public/app.js` and `public/editor.css` alone for content-only requests.
5. Do **not** regenerate the whole deck for a single slide change. Do **not** edit unrelated slide files.
6. Prefer structured CSS and existing 16:9 theme tokens; preserve projector-readable type sizes and contrast.
7. Agent is allowed to edit a selected slide component's markup or CSS, but not to insert arbitrary scripts, external resources, event-handler attributes or untrusted HTML. Dynamic visualizations in this MVP use CSS only.

## Edit a plain-text element

```bash
node scripts/agent-edit.mjs --slide s04-precision --element demo-callout --text "更新後的重點"
```

For complex components, edit only the matching `data-element-id` region inside `slides/<id>.html`. Maintain its ID. Re-check the entire containing slide for correctness.

## Verify and export

```bash
npm run validate
npm test
npm run export
```

Inspect `git diff -- slides/<slide-id>.html` before declaring completion. When a user edits through the browser, use **儲存此頁** so changes persist to the same file. The API requires the previous SHA-256 (`expectedHash`) and rejects stale writes with HTTP 409.

## Interaction model

- Human: choose a slide, select an element, drag it, edit text, change bounds/font, save.
- AI: locate `slideId` + `elementId`, patch only the relevant file, validate, explain the diff.
- Renderer: `npm run export` creates a fully self-contained `dist/presentation.html` for offline viewing.

Read `references/format.md` for the exact slide contract. Keep future capabilities (PPTX, collaborative editing, arbitrary JS imports, asset manager) out of this MVP unless explicitly requested.