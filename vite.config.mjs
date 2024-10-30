import { defineConfig } from 'vite'
import { resolve } from 'path'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { createHtmlPlugin } from 'vite-plugin-html'
import pkg from './package.json'
import { languageFileMap } from './src/js/index.js'

export default defineConfig({
  root: 'src',
  base: process.env.NODE_ENV === 'production' ? '/formeo-languages/' : '/',
  build: {
    rollupOptions: {
      input: {
        demo: resolve(__dirname, 'src/index.html'),
      },
      output: {
        entryFileNames: '[name].min.js',
        chunkFileNames: '[name].min.js',
        manualChunks: {
          'main': ['./src/js/index.js'],
        },
      },
    },
    outDir: '../dist',
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
  plugins: [
    createHtmlPlugin({
      minify: true,
      entry: 'js/demo.js',
      template: 'index.html',
      filename: 'index.html',
      inject: {
        data: {
          langFiles: Object.entries(languageFileMap).map(([locale, lang]) => {
            return {
              locale: locale,
              dir: lang.dir,
              nativeName: lang[locale],
            }
          }),
          version: pkg.version,
        },
      },
    }),
    viteStaticCopy({
      targets: [
        {
          src: 'lang/*.lang',
          dest: './lang/',
        },
      ],
    }),
  ],
})
