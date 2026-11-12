import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Vite 8 (oxc) doesn't lower TC39 decorators yet; the admin's decorators support both flavors.
  oxc: { decorator: { legacy: true } } as any,
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], testTimeout: 30000, hookTimeout: 60000 },
})
