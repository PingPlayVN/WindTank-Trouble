import crypto from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';

/**
 * Generates a relative-path-safe Offline PWA Service Worker (`dist/sw.js`) at build time:
 * - Precaches `index.html`, `manifest.webmanifest`, `favicon.svg`, and all hashed JS/CSS chunks
 *   relative to `self.registration.scope` so offline play works both on root domains
 *   (`https://windtank-trouble.vercel.app/`) AND sub-path Vercel rewrites (`https://.../windtank/`).
 */
function windtankOfflinePlugin(): Plugin {
  return {
    name: 'windtank-offline-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assetFiles = Object.keys(bundle)
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();

      const versionHash = crypto
        .createHash('sha1')
        .update(assetFiles.join('|'))
        .digest('hex')
        .slice(0, 10);

      const relativePrecache = [
        './',
        './index.html',
        './manifest.webmanifest',
        './favicon.svg',
        ...assetFiles.map((f) => `./${f}`),
      ];

      const swSource = [
        `const CACHE_NAME = "windtank-offline-v1-${versionHash}";`,
        `const RELATIVE_PRECACHE = ${JSON.stringify(relativePrecache)};`,
        '',
        'function resolveScopeUrls() {',
        '  const base = self.registration ? self.registration.scope : self.location.href;',
        '  return RELATIVE_PRECACHE.map((rel) => new URL(rel, base).toString());',
        '}',
        '',
        'self.addEventListener("install", (event) => {',
        '  event.waitUntil(',
        '    caches',
        '      .open(CACHE_NAME)',
        '      .then((cache) => cache.addAll(resolveScopeUrls()))',
        '      .then(() => self.skipWaiting())',
        '  );',
        '});',
        '',
        'self.addEventListener("activate", (event) => {',
        '  event.waitUntil(',
        '    caches',
        '      .keys()',
        '      .then((keys) =>',
        '        Promise.all(',
        '          keys',
        '            .filter((k) => k.startsWith("windtank-offline-") && k !== CACHE_NAME)',
        '            .map((k) => caches.delete(k))',
        '        )',
        '      )',
        '      .then(() => self.clients.claim())',
        '  );',
        '});',
        '',
        'self.addEventListener("fetch", (event) => {',
        '  const req = event.request;',
        '  if (req.method !== "GET") return;',
        '  const url = new URL(req.url);',
        '  if (url.origin !== self.location.origin) return;',
        '',
        '  const scopeBase = self.registration ? self.registration.scope : self.location.origin + "/";',
        '  const indexUrl = new URL("./index.html", scopeBase).toString();',
        '  const rootUrl = new URL("./", scopeBase).toString();',
        '',
        '  if (req.mode === "navigate") {',
        '    event.respondWith(',
        '      fetch(req)',
        '        .then((res) => {',
        '          if (res && res.ok) {',
        '            const copy = res.clone();',
        '            caches.open(CACHE_NAME).then((c) => c.put(indexUrl, copy));',
        '          }',
        '          return res;',
        '        })',
        '        .catch(async () => {',
        '          const cache = await caches.open(CACHE_NAME);',
        '          return (',
        '            (await cache.match(req, { ignoreSearch: true })) ||',
        '            (await cache.match(indexUrl)) ||',
        '            (await cache.match(rootUrl))',
        '          );',
        '        })',
        '    );',
        '    return;',
        '  }',
        '',
        '  const isStaticAsset = /\\.(?:js|mjs|css|svg|png|jpe?g|webp|ico|webmanifest|json|woff2?|mp3|ogg|wav)$/i.test(url.pathname);',
        '  if (!isStaticAsset) return;',
        '',
        '  event.respondWith(',
        '    (async () => {',
        '      const cache = await caches.open(CACHE_NAME);',
        '      const cached = await cache.match(req, { ignoreSearch: true });',
        '      if (cached) return cached;',
        '      const res = await fetch(req);',
        '      if (res && res.ok) {',
        '        await cache.put(req, res.clone());',
        '      }',
        '      return res;',
        '    })()',
        '  );',
        '});',
      ].join('\n');

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource,
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [windtankOfflinePlugin()],
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
          peerjs: ['peerjs'],
        },
      },
    },
  },
});
