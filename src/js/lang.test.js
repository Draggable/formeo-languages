import { deepStrictEqual } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { suite, test } from 'node:test'
import { I18N } from '@draggable/i18n'
import { getPlaceholders, placeholdersMatch } from '../../tools/placeholders.js'

// Read the .lang sources directly so contributors get feedback without rebuilding index.js
const langDir = new URL('../lang/', import.meta.url)
const readLang = file => I18N.processFile(readFileSync(new URL(file, langDir), 'utf8'))

const sourceLocale = 'en-US'
const source = readLang(`${sourceLocale}.lang`)
const langFiles = readdirSync(langDir).filter(file => file.endsWith('.lang') && file !== `${sourceLocale}.lang`)

suite('placeholders', () => {
  for (const file of langFiles) {
    test(`${file} keeps every {placeholder} from ${sourceLocale}`, () => {
      const lang = readLang(file)
      const mismatched = Object.entries(source)
        .filter(([key, value]) => lang[key] && !placeholdersMatch(value, lang[key]))
        .map(([key, value]) => ({ key, expected: getPlaceholders(value), actual: lang[key] }))

      deepStrictEqual(
        mismatched,
        [],
        'Placeholders must be copied exactly, not translated. Fix these keys, or run `npm run translate -- --fix-placeholders`',
      )
    })
  }
})
