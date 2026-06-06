import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js (and its `buffer` dep) reference Node's
  // `global` — point it at `globalThis` so the dev server doesn't blow up
  // on the import. Prod build doesn't need this; Rollup handles it.
  define: {
    global: 'globalThis',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
