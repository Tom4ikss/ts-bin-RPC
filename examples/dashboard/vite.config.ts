import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Serves /rpc/* from src/server/handler.ts inside the dev server; edits to the router apply on the next call. */
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
  plugins: [react(), rpc()],
  server: { port: 5173 },
});
