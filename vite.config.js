import { writeFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// The app polls version.json and reloads itself when it changes,
// so every build shows up on the frame without touching it.
const versionFile = {
  name: 'version-file',
  writeBundle({ dir }) {
    writeFileSync(`${dir}/version.json`, JSON.stringify({ sha: String(Date.now()) }));
  },
};

export default defineConfig({
  base: './',
  plugins: [versionFile],
  build: {
    // The frame runs Android System WebView 107.
    target: 'chrome107',
  },
});
