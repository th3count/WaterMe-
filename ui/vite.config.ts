import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',  // Allow network access
    port: 3000,       // Default port
    strictPort: true, // Fail if port is in use
  },
})
