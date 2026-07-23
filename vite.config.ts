import fs from 'node:fs';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Custom plugin to relax CSP in development mode for Vite HMR
function relaxCspForDev(): Plugin {
  return {
    name: 'relax-csp-for-dev',
    transformIndexHtml(html, ctx) {
      if (ctx.server) {
        // In dev mode, remove CSP entirely to allow Vite HMR and WASM
        return html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/,
          '<!-- CSP disabled in dev mode for Vite HMR -->',
        );
      }
      return html;
    },
  };
}

// Custom plugin to serve static website files in development
function serveWebsiteFiles(): Plugin {
  return {
    name: 'serve-website-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const websiteDir = path.resolve(__dirname, 'website');

        // Redirect /website to /website/ for consistent relative links
        if (req.url === '/website') {
          res.writeHead(302, { Location: '/website/' });
          res.end();
          return;
        }

        // Handle /website/* routes
        if (req.url?.startsWith('/website/')) {
          let filePath = req.url.replace('/website/', '/') || '/index.html';
          if (filePath === '/') filePath = '/index.html';

          const fullPath = path.join(websiteDir, filePath);

          if (fs.existsSync(fullPath)) {
            const ext = path.extname(fullPath);
            const contentType =
              ext === '.html'
                ? 'text/html'
                : ext === '.css'
                  ? 'text/css'
                  : ext === '.js'
                    ? 'application/javascript'
                    : ext === '.svg'
                      ? 'image/svg+xml'
                      : ext === '.png'
                        ? 'image/png'
                        : ext === '.jpg' || ext === '.jpeg'
                          ? 'image/jpeg'
                          : 'text/plain';

            res.setHeader('Content-Type', contentType);
            res.end(fs.readFileSync(fullPath));
            return;
          }
        }
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  build: {
    // Enable source maps in production for better debugging
    sourcemap: true,
    // Strip console.log/warn in production (keeps some from vendor libs)
    esbuild: {
      drop: ['debugger', 'console'],
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks - separate large libraries
          'vendor-react': ['react', 'react-dom', 'react/jsx-runtime'],
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-tooltip',
          ],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  plugins: [
    react(),
    relaxCspForDev(),
    serveWebsiteFiles(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['checklist.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'CheckList - Collaborative Lists',
        short_name: 'CheckList',
        description: 'Collaborative list app with real-time sync across devices',
        theme_color: '#76daDA',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'shopping', 'lifestyle'],
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/screenshot-mobile.png',
            sizes: '536x858',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Organize lists into folders',
          },
          {
            src: '/screenshot-checklist.png',
            sizes: '536x858',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'Check off items while shopping',
          },
          {
            src: '/screenshot-desktop.png',
            sizes: '1288x636',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Organize lists into folders',
          },
        ],
      },
      workbox: {
        // CRITICAL: Exclude /api/* routes from navigation fallback to prevent service worker
        // from intercepting OAuth callbacks and auth endpoints
        navigateFallbackDenylist: [/^\/api\//],
        // rowboat handles data sync over its own (uncached) POST endpoints, so the only
        // runtime caching we need is for static image assets.
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    // Force a SINGLE better-auth instance in the bundle. The file:-linked
    // @jbroll/rowboat-auth-betterauth(-react) packages do NOT carry their own copy of
    // better-auth — their built dist imports `better-auth/react`, which Node resolves from
    // *this app's* node_modules, i.e. the root `better-auth` dependency (see docs/BACKLOG.md).
    // That's why the root dependency must stay; without dedupe, the bundle can still end up
    // loading more than one instance, breaking session state.
    dedupe: ['better-auth', 'react', 'react-dom'],
  },
  server: {
    port: 8765,
    proxy: {
      '/api': {
        // Use 127.0.0.1 (not 'localhost'): the backend binds IPv4-only (127.0.0.1), and
        // 'localhost' can resolve to ::1 (IPv6) first → ECONNREFUSED.
        target: 'http://127.0.0.1:3001',
        // changeOrigin MUST be false: the backend's per-origin BetterAuth derives the
        // auth baseURL from the Host header and rejects untrusted origins with 421.
        // Rewriting Host to 127.0.0.1:3001 (changeOrigin:true) is not a trusted origin;
        // keeping the real Host (localhost:8765) matches trustedOrigins so login works.
        changeOrigin: false,
      },
    },
  },
});
