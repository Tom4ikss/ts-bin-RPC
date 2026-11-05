import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { tbr } from 'ts-bin-rpc/vite';

/**
 * Serves /rpc/* from src/server/handler.ts inside the dev server: with tbr() regenerating the codecs on
 * every save, edits to the router apply on the next call.
 */
function rpc(): Plugin {
  return {
    name: 'tbr-rpc',
    configureServer(server) {
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
  plugins: [react(), tbr({ router: 'src/server/router.ts' }), rpc()],
  server: { port: 5173 },
});
