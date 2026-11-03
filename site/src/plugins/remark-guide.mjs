// remark transforms for the guide pages in docs/guide. They keep the source plain GFM that also
// reads well on GitHub, and adapt it for the site:
//
// - a leading `# Title` is dropped, since the page title comes from the frontmatter;
// - relative links are rewritten: `./types.md#brands` → `/guide/types/#brands`, and links to other
//   files of the repository (`../../bench/results/core.md`) go to GitHub;
// - GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) become
//   Starlight asides. Starlight's own `:::note` … `:::` syntax works as well.
import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { visit, SKIP } from 'unist-util-visit';
import { GITHUB_BLOB, GITHUB_TREE, fileToSlug, guideDir, repoRoot, slugToHref } from '../lib/guide.mjs';

const ALERTS = {
  NOTE: { variant: 'note' },
  TIP: { variant: 'tip' },
  IMPORTANT: { variant: 'note', label: 'Important' },
  WARNING: { variant: 'caution', label: 'Warning' },
  CAUTION: { variant: 'danger', label: 'Caution' },
};
const ALERT_RE = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

const inside = (dir, path) => {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel));
};

/** Maps a relative URL in a guide page to its site or GitHub URL, or returns it unchanged. */
export function rewriteUrl(url, fromFile) {
  if (!url || url.startsWith('#') || url.startsWith('/') || url.startsWith('//') || SCHEME_RE.test(url)) return url;
  const m = /^([^?#]*)([?#].*)?$/.exec(url);
  const pathPart = decodeURI(m[1]);
  const suffix = m[2] ?? '';
  if (!pathPart) return url;
  const target = resolve(dirname(fromFile), pathPart);

  if (inside(guideDir, target)) {
    const rel = relative(guideDir, target).split(sep).join('/');
    if (/\.mdx?$/i.test(rel)) return slugToHref(fileToSlug(rel)) + suffix;
    if (rel === '') return slugToHref('index') + suffix;
  }
  if (inside(repoRoot, target)) {
    const rel = relative(repoRoot, target).split(sep).join('/');
    const isDir = existsSync(target) ? statSync(target).isDirectory() : pathPart.endsWith('/');
    return `${isDir ? GITHUB_TREE : GITHUB_BLOB}/${encodeURI(rel)}${suffix}`;
  }
  return url;
}

function convertAlert(node) {
  const first = node.children[0];
  if (first?.type !== 'paragraph') return null;
  const text = first.children[0];
  if (text?.type !== 'text') return null;
  const m = ALERT_RE.exec(text.value);
  if (!m) return null;
  const alert = ALERTS[m[1].toUpperCase()];

  text.value = text.value.slice(m[0].length);
  if (!text.value) first.children.shift();
  // A soft line break right after the marker would start the content with an empty line.
  if (first.children[0]?.type === 'break') first.children.shift();
  const children = first.children.length ? node.children : node.children.slice(1);
  if (alert.label) {
    children.unshift({ type: 'paragraph', data: { directiveLabel: true }, children: [{ type: 'text', value: alert.label }] });
  }
  return { type: 'containerDirective', name: alert.variant, attributes: {}, children, position: node.position };
}

export default function remarkGuide() {
  return (tree, file) => {
    const path = file.path ?? file.history?.[0];
    if (!path || !inside(guideDir, path)) return;

    const firstIdx = tree.children.findIndex((n) => n.type !== 'yaml' && n.type !== 'toml' && n.type !== 'html');
    const firstNode = tree.children[firstIdx];
    if (firstNode?.type === 'heading' && firstNode.depth === 1) tree.children.splice(firstIdx, 1);

    visit(tree, (node, index, parent) => {
      if (node.type === 'link' || node.type === 'definition' || node.type === 'image') {
        if (node.type !== 'image') node.url = rewriteUrl(node.url, path);
        return;
      }
      if (node.type === 'blockquote' && parent && index !== undefined) {
        const aside = convertAlert(node);
        if (aside) {
          parent.children[index] = aside;
          return [SKIP, index];
        }
      }
    });
  };
}
