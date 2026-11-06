import { defineConfig } from 'vite';
// Relative base so the build works at any path; briandaviddavidson.com builds it with --base /oscars/.
export default defineConfig({ base: './', build: { outDir: 'dist' } });
