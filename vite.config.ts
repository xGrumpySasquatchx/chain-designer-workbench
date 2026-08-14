import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// Built assets are served from a repository subpath on GitHub Pages, so the
// production build needs that prefix while the dev server stays at the root.
// Keying on mode rather than command keeps `vite preview` serving the built
// bundle from the same prefix it was built with.
export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/msab-designer/' : '/',
  plugins: [react()],
}))
