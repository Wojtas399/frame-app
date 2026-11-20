import { defineConfig } from 'vite';

export default defineConfig({
  // Served from https://<user>.github.io/frame-app/
  base: './',
  build: {
    // The frame runs Android System WebView 107.
    target: 'chrome107',
  },
});
