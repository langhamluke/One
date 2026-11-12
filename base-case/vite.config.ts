/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { productFromEnv, productConfig } from './shared/product';

/** Stamp the product on <html> so the first paint already carries the right theme (no light flash on Flight Plan or Sprout). */
function productAttr() {
  const product = productFromEnv(process.env.PRODUCT);
  const icon = product === 'base-case' ? 'favicon' : `favicon-${product}`;
  return {
    name: 'product-attr',
    transformIndexHtml(html: string) {
      return html
        .replace(/data-product="[a-z-]+"/, `data-product="${product}"`)
        .replace(/href="\/favicon[a-z-]*\.svg"/, `href="/${icon}.svg"`)
        .replace(/<title>[^<]*<\/title>/, `<title>${productConfig(product).name}</title>`);
    },
  };
}

export default defineConfig({
  plugins: [react(), productAttr()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // WEB_PORT / API_PORT let a second product run next to the default dev pair (5173 -> 8787).
    port: Number(process.env.WEB_PORT ?? 5173),
    proxy: {
      '/api': { target: `http://localhost:${process.env.API_PORT ?? 8787}`, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
