// The docs collection is read straight from docs/guide at the repository root. Files are not
// copied: edit them there and the dev server reloads.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { fileToSlug, guideDirFromSite, slugToId, titleFromSlug } from './lib/guide.mjs';

export const collections = {
  docs: defineCollection({
    loader: glob({
      base: guideDirFromSite,
      pattern: ['**/[^_]*.{md,mdx}'],
      generateId: ({ entry, data }) => {
        const slug = fileToSlug(entry);
        // A page without a `title` would fail validation; fall back to its file name.
        if (typeof data.title !== 'string' || !data.title) data.title = titleFromSlug(slug);
        return slugToId(slug);
      },
    }),
    schema: docsSchema(),
  }),
};
