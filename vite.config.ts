/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Renames the single-file bundle's index.html to flight-plan.html. */
function renameSingle(): Plugin {
  return {
    name: 'rename-single-html',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = bundle['index.html'];
      if (html) html.fileName = 'flight-plan.html';
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    base: './',
    plugins: [react(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true }), renameSingle()] : [])],
    build: single
      ? { outDir: 'dist-single', emptyOutDir: true, assetsInlineLimit: 100_000_000, cssCodeSplit: false }
      : { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
