# Instructions for coding agents

This repository is an MVP of an agent-friendly HTML slide editor.

- Read `SKILL.md` for editing procedures.
- If a request targets one slide or element, modify **only** its slide file. Keep every `data-slide-id` and `data-element-id` stable.
- Treat `deck.json` as the source for slide order. Never interpret the visual page number as a filename.
- Avoid adding frameworks, new servers, plugins, or abstractions without a verified use case.
- Do not bypass `expectedHash` optimistic concurrency for UI saves.
- No external assets or dynamic scripts inside slide fragments in this MVP.
- Run `npm run validate && npm test && npm run export` before delivery.
- Human changes saved in the editor may occur independently. Inspect `git diff` before overwriting any content.