# Source format and edit contract

- `deck.json` is a version-1 manifest with `title` and ordered `{id,title,label}` slide entries.
- A slide is stored in `slides/<slide-id>.html`. Only lowercase ASCII letters, digits and dashes are allowed in IDs; IDs must be unique within their respective scope.
- One `section.slide-page` root per slide, tagged with `data-slide-id` equal to its filename stem.
- Editable components are identified by `data-element-id`. Add `data-editable="text"` to simple leaf elements (do not nest tags inside a text leaf when the agent CLI needs to edit it).
- The default canvas is 1280 x 720. Child `.element` blocks use absolute `left`, `top`, `width` and `height` in pixels.
- CSS animations should be declared in `public/theme.css` and should respect `prefers-reduced-motion` when meaningful.
- Server refuses `<script>`, `<iframe>`, `<form>`, inline `on*` events, external `src`/`href` attributes, and `javascript:`. This restriction limits the attack surface but is **not** a complete HTML sanitization engine. Use only trusted inputs in this local MVP.
- The editor uses optimistic concurrency: `GET /api/slides/:id` returns `{id, html, hash}`, while `PUT /api/slides/:id` expects `{html, expectedHash}`. A stale hash yields HTTP 409.
- `GET /api/export` downloads a self-contained HTML deck, with slide-navigation code and CSS embedded.
- Agent CLI only updates plain-text leaf contents. For SVG charts and more complex animation components, edit the selected slide fragment directly, validate, and inspect a diff.