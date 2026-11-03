# Site design notes

The docs site for ts-bin-rpc. Astro Starlight, static output, guide pages read from `../docs/guide`.

## Stack

**Astro 7.3 + Starlight 0.42.** Chosen because it gives the most of the brief from plain Markdown
with no server: static HTML, Pagefind full-text search built in (indexed at build time, runs
locally), Expressive Code (Shiki) for code frames with file tabs, terminal frames and copy buttons,
sidebar, table of contents, prev/next and dark/light without extra plugins. The landing page is an
ordinary Astro page with no client framework; its only JavaScript is the chart tabs and tooltip and
the hex highlight in the hero.

Astro is pinned to `~7.3.8`: Astro 7.4 requires Node 22.22 or later, and this machine has 22.13.

Markdown goes through `unified()` (remark/rehype) rather than Astro's default Sätteri pipeline,
so the guide can use ordinary remark plugins (`src/plugins/remark-guide.mjs`).

## References

| Site | What I took |
|---|---|
| Bun (bun.com) | A benchmark as a first-class landing element, with the methodology printed right under it. Dense docs sidebar with small uppercase group labels. |
| Vercel docs | Near-monochrome palette, hairline borders instead of shadows, a lede under every page title, a single quiet active state in the sidebar. |
| Linear | Restraint: one accent, large tight headings (−0.03 to −0.045 em tracking), feature grid drawn with 1 px gaps instead of separate cards. |
| tRPC / Hono | Code sample next to the hero copy; "write → generate → call" told with real code, not illustrations. |
| Effect / oxc | Mono uppercase kickers and labels as a typographic accent; dark-first design. |
| Biome / Astro | Translucent sticky header with backdrop blur and a hairline; search as a compact pill with a kbd hint. |
| Stripe docs | File-named code tabs, tables with hairlines and no zebra striping, tabular numerals. |
| Vite | Sidebar grouping by intent (Start here / Concepts / Reference) rather than one flat list. |

## Palette

Ink grays with a faint cool tint (hue 260, chroma ≤ 0.008) and one accent, "signal lime". Every
color is defined in OKLCH in `src/styles/theme.css`; Starlight's `--sl-*` variables are mapped
onto these tokens. The light theme is its own set of steps, not an inversion.

| Token | Dark | Light |
|---|---|---|
| Background | `oklch(0.155 0.006 260)` ≈ #0b0c0f | `oklch(0.995 0.001 260)` |
| Surface / surface 2 | `oklch(0.18 …)` / `oklch(0.215 …)` | `oklch(0.985 …)` / `oklch(0.965 …)` |
| Border | `oklch(0.26 0.008 260)` | `oklch(0.91 0.004 260)` |
| Body text | `oklch(0.8 0.006 260)` | `oklch(0.36 0.008 260)` |
| Accent | `oklch(0.87 0.19 127)` ≈ #b2ea4f | text `oklch(0.46 0.13 134)`, line `oklch(0.58 0.15 132)` |
| Primary button | lime on ink | ink on white |

Chart series were checked with a palette validator (lightness band, chroma floor, colour-vision
deficiency separation, 3:1 contrast against the background) for each theme:

| Series | Dark | Light |
|---|---|---|
| With verification (default) | #6ea518 | #578c19 |
| `verify: false` | #1195b4 | #0087ab |

Every bar also has a direct value label, a legend and a table view, so colour is never the only
way to tell the two apart.

Callouts: note is blue, tip is the accent, caution is amber, danger is red, each as a 7% wash with
a 32% border.

## Type

- **Geist Variable** for text and headings, **Geist Mono Variable** for code, labels and numbers
  in the hero. Self-hosted from `@fontsource-variable/*` (Latin and Cyrillic subsets), no requests
  to font CDNs.
- Body 15.8 px / 1.7. Headings weight 600–650, tracking −0.02 em (h3) to −0.045 em (hero h1).
- Mono uppercase, 11 px, +0.08 em tracking for sidebar groups, TOC title and section kickers.
- Tables and chart axes use tabular figures; big standalone numbers use proportional figures.

## Code

Expressive Code with `vitesse-dark` / `vitesse-light` (muted greens that sit well next to the lime
accent), backgrounds replaced with the site's code surface, 1 px borders, no shadows, file name
tabs with an accent underline. A first-line comment such as `// src/router.ts` becomes the tab
title automatically. Shell blocks render as terminal frames.

Twoslash hovers are not set up: the guide's snippets are fragments that don't type-check on their
own, and twoslash would need TypeScript 5's JS API next to the repository's TypeScript 7.1.

## Landing page

1. Hero: copy on the left; on the right a card with the real bytes of a `Float32Array` field
   (eight values encoded as little-endian f32 at build time). Each 4-byte group lights up together
   with its value. A stats strip under the hero.
2. How it works: router → `tbr generate` → client, three steps with code from
   `examples/dashboard`.
3. Why: six features in a hairline grid, each linking to its guide page.
4. Benchmarks: horizontal bars per runtime, relative to `JSON.parse`, with a dashed 1× line.
   Tabs switch the scenario. Two bars per runtime: verification on (the client default) and off.
   Tooltip shows absolute medians. A table view, the machine and the noise caveat, and links to
   the result files. Next to it: size after compression (cells where JSON is smaller are shaded)
   and bundle sizes.
5. When not to use it: a good fit vs. stay with JSON.

All numbers come from `bench/results/*.md` via `src/data/bench.ts`.
