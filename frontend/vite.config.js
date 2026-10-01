import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // relative asset paths, so the build works from any folder (e.g. GitHub Pages /repo-name/)
  base: './',
})
