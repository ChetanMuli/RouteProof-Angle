import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App runs on http://localhost:3000 and forwards /api and /uploads to the Node backend on port 5000
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, port: 3000, strictPort: true,
    proxy: { '/api': 'http://localhost:5000', '/uploads': 'http://localhost:5000' },
  },
});
