import { spawn } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Serves /rpc/* from src/server/handler.ts inside the dev server, with `tbr generate --watch` alongside:
 * edits to the router apply on the next call.
 */
function rpc(): Plugin {
  return {
    name: 'tbr-rpc',
    configureServer(server) {
      // Router edits regenerate src/server/tbr.gen.ts, which Vite then reloads on both sides.
      const gen = spawn('node_modules/.bin/tbr', ['generate', '--watch', '--router', 'src/server/router.ts'], { stdio: 'inherit', shell: process.platform === 'win32' });
      const stop = () => gen.kill('SIGINT');
      server.httpServer?.once('close', stop);
      process.once('exit', stop);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/rpc/')) return next();
        try {
          const { listener } = await server.ssrLoadModule('/src/server/handler.ts');
          await listener(req, res);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), rpc()],
  server: { port: 5173 },
});
