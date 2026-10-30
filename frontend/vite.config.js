import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/incidents': 'http://localhost:8000',
      '/uploads': 'http://localhost:8000',
      '/notifications': 'http://localhost:8000',
      '/announcements': 'http://localhost:8000',
      '/places': 'http://localhost:8000',
      '/response-teams': 'http://localhost:8000',
      '/teams': 'http://localhost:8000',
      '/resources': 'http://localhost:8000',
      '/admin/audit-log': {
        target: 'http://localhost:8000',
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        },
      },
      '/citizen': {
        target: 'http://localhost:8000',
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        },
      },
      '/map': {
        target: 'http://localhost:8000',
        bypass: (req) => {
          if (req.headers.accept && req.headers.accept.includes('text/html')) {
            return '/index.html';
          }
        },
      },
      '/health': 'http://localhost:8000',
    },
  },
})
