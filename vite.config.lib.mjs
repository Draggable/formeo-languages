import { defineConfig } from 'vite'
import banner from 'vite-plugin-banner'
import { resolve } from 'path'

import pkg from './package.json'

const bannerTemplate = `
/**
${pkg.name} - ${pkg.homepage}
Version: ${pkg.version}
Author: ${pkg.author}
*/
`

export default defineConfig({
  root: './',
  build: {
    lib: {
      entry: resolve(__dirname, 'src/js/index.js'),
      name: 'formeo-languages',
      fileName: format => `formeo-languages.${format}.js`,
      formats: ['es', 'cjs', 'umd'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [banner(bannerTemplate)],
})
