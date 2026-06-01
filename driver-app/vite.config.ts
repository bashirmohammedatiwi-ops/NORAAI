import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = 5000;

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    strictPort: true,
    host: true,
  },
  preview: {
    port: PORT,
    strictPort: true,
    host: true,
  },
  /** Relative base keeps Electron file:// builds working; Vite dev on :5000 supports both. */
  base: './',
});
