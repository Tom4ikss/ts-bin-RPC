// The sidebar is computed from docs/guide when the config loads. In `astro dev`, adding or removing
// a guide page touches astro.config.mjs, which makes Astro restart and pick up the new sidebar.
// Edits to existing pages are hot-reloaded by the content layer as usual.
import { utimesSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { guideDir } from './guide.mjs';

export default function guideWatch() {
  return {
    name: 'tbr-guide-watch',
    hooks: {
      'astro:server:setup': ({ server, logger }) => {
        const config = fileURLToPath(new URL('../../astro.config.mjs', import.meta.url));
        server.watcher.add(guideDir);
        let timer;
        const onChange = (file) => {
          if (!file.startsWith(guideDir) || !/\.mdx?$/.test(file)) return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            logger.info('guide pages added or removed, restarting to rebuild the sidebar');
            const now = new Date();
            utimesSync(config, now, now);
          }, 150);
        };
        server.watcher.on('add', onChange);
        server.watcher.on('unlink', onChange);
      },
    },
  };
}
