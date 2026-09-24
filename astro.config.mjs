// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// ByteCabin is a fully static site. Every tool runs in the visitor's browser,
// so there is no adapter, no SSR and no server runtime in production.
export default defineConfig({
  site: 'https://bytecabin.dev',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'auto',
  },
  compressHTML: true,
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      cssMinify: 'lightningcss',
    },
  },
});
