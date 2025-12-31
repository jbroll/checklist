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
          'vendor-jazz': ['jazz-tools'],
          'vendor-react': ['react', 'react-dom', 'react/jsx-runtime'],
          'vendor-radix': [
            '@radix-ui/react-checkbox',
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-popover',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-toast',
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
        // Jazz.tools handles data sync, so we use a simple runtime caching strategy
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cloud\.jazz\.tools\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'jazz-sync-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
            },
          },
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
  },
  server: {
    port: 8765,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Ensure custom headers are forwarded (critical for Jazz BetterAuth plugin)
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward the x-jazz-auth header required by Jazz BetterAuth plugin
            if (req.headers['x-jazz-auth']) {
              proxyReq.setHeader('x-jazz-auth', req.headers['x-jazz-auth']);
            }
          });
        },
      },
    },
  },
});
