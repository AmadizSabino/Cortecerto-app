import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Build stamp sent with error reports, to tell which version a report came from.
  define: { __RELEASE__: JSON.stringify(new Date().toISOString().slice(0, 16)) },
})
