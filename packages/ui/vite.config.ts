import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built assets load no matter what host/path the daemon
// (or an IDE webview) serves them from.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
