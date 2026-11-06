// Vite plugin: tbr generate before a build and when the dev server starts, then again on every save
// of the TypeScript project. Errors go to the terminal and to the browser's error overlay.
import path from 'node:path';
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { GenerateOptions, Generated } from './generate.ts';
import { typescriptProblem } from './typescript.ts';

export interface TbrPluginOptions {
  /** The router as `file#export`, relative to the tsconfig. Default: `src/router.ts#appRouter`. */
  router?: string;
  /** The TypeScript project, relative to Vite's root. Default: `tsconfig.json`. */
  project?: string;
  /** The lockfile, relative to the tsconfig. Default: `tbr.lock.json`. */
  lock?: string;
  /** The generated codecs, relative to the tsconfig. Default: `tbr.gen.ts` next to the router. */
  out?: string;
  /** Accept breaking changes of the contract, like `tbr generate --allow-breaking`. Default: false. */
  allowBreaking?: boolean;
}

export function tbr(options: TbrPluginOptions = {}): Plugin {
  let config: ResolvedConfig;
  let server: ViteDevServer | undefined;
  let stop: AbortController | undefined;
  let built = false;

  const print = (log: string, error: boolean) => {
    // the lines that say something happened
    const lines = log.split('\n').filter((l) => l.trim() && !l.endsWith(' is up to date'));
    if (!lines.length) return;
    const text = lines.map((l) => `[tbr] ${l}`).join('\n');
    if (error) config.logger.error(text, { timestamp: true });
    else config.logger.info(text, { timestamp: true });
  };

  return {
    name: 'ts-bin-rpc',
    configResolved(c) {
      config = c;
    },
    configureServer(s) {
      server = s;
    },
    async buildStart() {
      const problem = typescriptProblem();
      if (problem) this.error(problem);
      // TypeScript loads only now: a config that imports the plugin works without it
      const [{ generate, readLock, resolvePaths, watch }, { Ts71Source }] = await Promise.all([import('./generate.ts'), import('./source.ts')]);
      const project = path.resolve(config.root, options.project ?? 'tsconfig.json');
      const paths = resolvePaths(project, options.router ?? 'src/router.ts#appRouter', options.lock, options.out);
      const o: GenerateOptions = {
        'dry-run': false,
        'allow-breaking': !!options.allowBreaking,
        allowHint: 'pass tbr({ allowBreaking: true }) or run tbr generate --allow-breaking to accept them',
      };

      if (config.command === 'build') {
        if (built) return; // once for all environments
        built = true;
        const src = new Ts71Source(project);
        let log = '';
        let result: Generated;
        try {
          result = generate(src, paths, readLock(paths.lockPath), o, (s) => (log += s));
        } finally {
          src.close();
        }
        if (result.code) this.error(`tbr generate failed:\n${log}`);
        print(log, false);
        return;
      }

      // dev: one watcher for all environments, until the server closes
      if (stop) return;
      stop = new AbortController();
      let failed = false;
      void watch(project, paths, o, {
        out: () => {},
        generated: (r, log) => {
          print(log, r.code !== 0);
          if (r.code) {
            failed = true;
            server?.ws.send({ type: 'error', err: { message: `tbr generate: ${log.trim()}`, stack: '', plugin: 'ts-bin-rpc', id: paths.router } });
          } else if (failed) {
            failed = false;
            // a rewritten file reloads the page, which clears the overlay; otherwise clear it here
            if (!r.wrote) {
              print(`${path.relative(config.root, paths.outPath)} is current again`, false);
              server?.ws.send({ type: 'full-reload' });
            }
          }
        },
      }, stop.signal);
    },
    closeBundle() {
      stop?.abort();
      stop = undefined;
    },
  };
}
