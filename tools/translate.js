import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { I18N } from 'mi18n'
import chunk from 'lodash/chunk.js'
import googleTranslate from '@google-cloud/translate'
import { languageFiles } from '../dist/index.min.js'

const { Translate } = googleTranslate.v2

// Get __dirname equivalent in ES modules
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Command line arguments
const [fromLang, toLang, toLocale = toLang] = process.argv.slice(2)

// Configuration
const projectId = 'formeo-1344'
const credentialsFile = path.resolve(__dirname, '../../', 'GOOGLE_APPLICATION_CREDENTIALS.json')
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsFile

// Initialize translation client
const translate = new Translate({ projectId })

// Process source language file
const processedFile = I18N.processFile(languageFiles[fromLang])
// Google translation API has a limit of 128 items
const chunked = chunk(Object.entries(processedFile), 128)

// Translate chunks
const translated = chunked.map(langChunk => {
  const keys = langChunk.map(([key]) => key)
  const vals = langChunk.map(keyVal => keyVal[1])

  return translate
    .translate(vals, toLang)
    .then(results => {
      const [translations] = results
      return translations.map((t, i) => [keys[i], t])
    })
    .catch(err => {
      console.error('ERROR:', err)
    })
})

// Process and write results
try {
  const translatedChunks = await Promise.all(translated)
  const langs = translatedChunks.reduce((acc, cur) => acc.concat(cur), [])
  const translatedLang = langs.reduce((acc, [key, val]) => {
    acc.push(`${key} = ${val}`)
    return acc
  }, [])

  const outputPath = path.resolve(__dirname, '../src/lang', `${toLocale}.lang`)
  await writeFile(outputPath, translatedLang.join('\n'))
  console.log(`Created ${toLocale}.lang`)
} catch (err) {
  console.error('Error writing translation file:', err)
}
