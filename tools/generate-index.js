import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { I18N } from '@draggable/i18n'
import template from 'lodash/template.js'

// Get __dirname equivalent in ES modules
const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Path configurations
const langDir = resolve(__dirname, '../src', 'lang')
const generatedIndexPath = resolve(__dirname, '../src/js/index.js')
const iconTemplatePath = resolve(__dirname, './index.tpl')

// Read and compile template
const tmpl = readFileSync(iconTemplatePath).toString()
const compiled = template(tmpl)

// Process language files
const [languageFiles, languageFileMap, languageFileOptions] = readdirSync(langDir)
  .filter(file => /.lang$/.test(file))
  .reduce(
    (acc, lang) => {
      const [langFileArray, langFileMap, langFileOptions] = acc
      const langFile = readFileSync(`${langDir}/${lang}`).toString()
      const fileName = basename(lang)
      const locale = fileName.slice(0, fileName.indexOf('.'))
      langFileMap[locale] = I18N.processFile(langFile)
      langFileArray.push(`languageFileMap['${locale}']`)
      langFileOptions.push(
        `{ locale: '${locale}', dir: '${langFileMap[locale].dir}', nativeName: '${langFileMap[locale][locale]}' }`,
      )
      return acc
    },
    [[], {}, []],
  )

// Generate exports
const langs = Object.keys(languageFileMap)
  .map(key => `export const ${key.replace('-', '')} = languageFileMap['${key}']`)
  .join('\n')

// Write output file
writeFileSync(
  generatedIndexPath,
  compiled({
    languageFiles: `[${languageFiles}]`,
    languageFileMap: JSON.stringify(languageFileMap),
    langs,
    languageFileOptions: `[${languageFileOptions}]`,
  }),
)

// generate json files too so github pages can be used like an api
Object.entries(languageFileMap).forEach(([locale, lang]) => {
  const filename = `${locale}.json`
  writeFileSync(`${langDir}/${filename}`, JSON.stringify(lang))
  console.log(`Generated ${filename}`)
})
