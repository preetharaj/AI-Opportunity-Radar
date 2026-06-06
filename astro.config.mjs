// astro.config.mjs
// Phase 0: Static site for AI Opportunity Radar
// GitHub Pages compatible (set base to your repo name if deploying to username.github.io/repo-name)

import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://preetharaj.github.io',
  base: '/AI-Opportunity-Radar',
  output: 'static',
  build: { assets: '_assets' },
});
