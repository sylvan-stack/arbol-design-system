/* Storybook story-test runner: renders EVERY *.stories.tsx in a real headless
 * chromium via Playwright and fails on any runtime render error (a smoke test for
 * the whole catalog) — and is the foundation for visual-regression diffs. The
 * storybookTest plugin reuses .storybook/main.ts (stories globs + viteFinal aliases),
 * so the @arbol/* aliases resolve here too. Run: `npm run test-storybook`. */
import { defineConfig } from 'vitest/config'
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [storybookTest({ configDir: join(root, '.storybook') })],
  test: {
    name: 'storybook',
    // Preview annotations (theme decorator + tokens.css) are auto-applied by
    // @storybook/addon-vitest since SB 10.3 — no setup file needed.
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
})
