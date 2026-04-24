# Replanish Redesign — Handoff Package

Everything Claude Code needs to apply the "Hearth" redesign **to the existing Replanish PWA**.

> This is a **visual + UX update in place.** Data model, routing, auth, business logic stay as-is. Change styling, copy, component structure, and add the skin system.

## Files

| File | What it is | Where it goes |
|---|---|---|
| `CLAUDE.md` | Persistent instructions for Claude Code — migration plan, rules, do-nots | **Merge into repo root `CLAUDE.md`** (or replace it if empty) |
| `DESIGN_SYSTEM.md` | Full design spec — tokens, type, components, patterns, copy tone | `docs/design-system.md` or keep in `handoff/` |
| `SKINS.md` | Theming system — how to implement 9 built-in skins + custom skin builder | `docs/skins.md` or keep in `handoff/` |
| `design-tokens.css` | CSS custom properties — Hearth palette, fonts, radii. Dark mode = Dusk. | Import at the top of `src/index.css` |
| `tailwind-extension.js` | Tailwind config block exposing tokens as `rp-*` utilities | Merge into `tailwind.config.ts` under `theme.extend` |
| `Replanish Redesign.html` | **Standalone self-contained visual reference** — every screen, every skin, interactive | Open in a browser. Do not deploy. |

## Handoff steps (for you, the human)

1. Unzip `handoff/` into the repo root (or anywhere — the docs are path-independent, just the CSS/Tailwind imports need to resolve).
2. Copy or merge `handoff/CLAUDE.md` into the repo root `CLAUDE.md`.
3. Commit.
4. Open Claude Code and say:

> "Follow `CLAUDE.md` — start with Phase 1 (Foundation). Open `handoff/Replanish Redesign.html` in a browser as your visual reference."

## What Claude Code will do

Phase 1 (Foundation) → Phase 2 (Shell) → Phase 3 (Pages, high → low priority) → Phase 4 (Skin system polish).

Full ordered task list lives in `CLAUDE.md`.

## Notes
- `Replanish Redesign.html` is self-contained (fonts, scripts, everything inlined). Works offline. 1.7MB.
- The design ships as a **PWA** — works on iOS + Android from one codebase. No native rewrite needed.
- `design-tokens.css` + `tailwind-extension.js` are the *Hearth* skin hardcoded as defaults. The skin system (`SKINS.md`) replaces these at runtime via the `SkinProvider` — so once Phase 4 is done, these static files are only a fallback.
