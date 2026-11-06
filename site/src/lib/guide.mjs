// Where the guide lives and how its pages map to routes and to the sidebar.
//
// The pages are written in docs/guide/*.md at the repository root and are read from there, not
// copied. A page that does not exist yet is simply left out of the sidebar.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const repoRoot = resolve(siteRoot, '..');
/** docs/guide; `TBR_GUIDE_DIR` overrides it, e.g. to check the build against another set of pages. */
export const guideDir = process.env.TBR_GUIDE_DIR ? resolve(process.env.TBR_GUIDE_DIR) : join(repoRoot, 'docs', 'guide');
/** The same directory relative to site/, as Astro and Starlight expect it. */
export const guideDirFromSite = relative(siteRoot, guideDir).split(sep).join('/');

export const GITHUB = 'https://github.com/Tom4ikss/ts-bin-RPC';
/** The site is served from https://tom4ikss.github.io/ts-bin-RPC/ (GitHub Pages project site). */
export const SITE = 'https://tom4ikss.github.io';
export const BASE = '/ts-bin-RPC';
/** A root-relative site path (`/guide/`) with the base prepended. */
export const href = (path) => BASE + path;
/** A request path with the base removed, for comparing against site paths. */
export const unbase = (path) => (path.startsWith(BASE) ? path.slice(BASE.length) || '/' : path);
export const GITHUB_BLOB = `${GITHUB}/blob/main`;
export const GITHUB_TREE = `${GITHUB}/tree/main`;

/** URL prefix of the guide. */
export const GUIDE_BASE = 'guide';

/** Planned pages in sidebar order, grouped. Slugs are file names without `.md`. */
export const PLAN = [
  { label: 'Start here', items: ['index', 'getting-started'] },
  { label: 'Concepts', items: ['types', 'validation', 'views', 'server-client', 'middleware', 'queries', 'tanstack-query', 'streams', 'live', 'websocket', 'batching', 'evolution'] },
  { label: 'Reference', items: ['cli', 'devtools', 'performance', 'faq'] },
];

const PAGE_EXT = /\.mdx?$/;

/** Guide page files relative to the guide directory, using `/`, skipping `_drafts` and dotfiles. */
export function listGuideFiles(dir = guideDir) {
  if (!existsSync(dir)) return [];
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      if (name.startsWith('_') || name.startsWith('.')) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (PAGE_EXT.test(name)) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out;
}

/** `types.md` → `types`, `index.md` → `index`, `nested/index.md` → `nested`. */
export function fileToSlug(file) {
  const s = file.replace(PAGE_EXT, '').toLowerCase();
  if (s === 'index') return 'index';
  return s.replace(/\/index$/, '');
}

/** The content collection id, which Starlight uses as the route: `guide`, `guide/types`. */
export function slugToId(slug) {
  return slug === 'index' ? GUIDE_BASE : `${GUIDE_BASE}/${slug}`;
}

/** The URL of a guide page, with the trailing slash Astro uses by default. */
export function slugToHref(slug) {
  return href(`/${slugToId(slug)}/`);
}

/** Sidebar from the files that exist: planned pages in order, then any others under "More". */
export function buildSidebar() {
  const existing = new Set(listGuideFiles().map(fileToSlug));
  const planned = new Set(PLAN.flatMap((g) => g.items));
  const groups = PLAN.map((g) => ({
    label: g.label,
    items: g.items.filter((s) => existing.has(s)).map((s) => ({ slug: slugToId(s) })),
  })).filter((g) => g.items.length > 0);
  const extra = [...existing].filter((s) => !planned.has(s)).sort();
  if (extra.length) groups.push({ label: 'More', items: extra.map((s) => ({ slug: slugToId(s) })) });
  return groups;
}

/** `getting-started` → `Getting started`, used only when a page has no `title`. */
export function titleFromSlug(slug) {
  const last = slug.split('/').pop() ?? slug;
  const words = (last === 'index' ? 'introduction' : last).replace(/[-_]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
