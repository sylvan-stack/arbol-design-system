import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve } from 'path'
export default defineConfig({
  root: __dirname,
  plugins: [svelte()],
  base: './',
  resolve: { alias: {
    '@arbol/design-system/tokens.css': resolve(__dirname, '../src/tokens.css'),
    '@arbol/design-system': resolve(__dirname, '../src/index.ts'),
  } },
  build: { outDir: resolve(__dirname, './dist'), emptyOutDir: true, target: 'es2020' },
})
