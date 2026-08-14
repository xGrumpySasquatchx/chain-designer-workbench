import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Built assets are served from a repository subpath on GitHub Pages, so the
// production build needs that prefix while the dev server stays at the root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/msab-designer/' : '/',
  plugins: [react()],
}))
