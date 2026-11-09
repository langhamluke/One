/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/** Stamp the product on <html> so the first paint already carries the right theme (no light flash on Flight Plan). */
function productAttr() {
  const product = (process.env.PRODUCT ?? '').toLowerCase() === 'flight-plan' ? 'flight-plan' : 'base-case';
  return {
    name: 'product-attr',
    transformIndexHtml(html: string) {
      return html.replace(/data-product="[a-z-]+"/, `data-product="${product}"`);
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
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
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
