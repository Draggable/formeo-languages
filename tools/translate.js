import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import chunk from 'lodash/chunk.js'
import googleTranslate from '@google-cloud/translate'
import { languageFileMap } from '../src/js/index.js'

const { Translate } = googleTranslate.v2

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Command line arguments
const getDefaultToLocale = fromLocale => Object.keys(languageFileMap).filter(locale => locale !== fromLocale)
const [fromLocale = 'en-US', toLocaleArg = getDefaultToLocale(fromLocale)] = process.argv.slice(2)
const toLocales = Array.isArray(toLocaleArg) ? toLocaleArg : [toLocaleArg]

// Configuration
const projectId = 'formeo-1344'
const credentialsFile = path.resolve(__dirname, '../../', 'GOOGLE_APPLICATION_CREDENTIALS.json')
process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsFile

// Initialize translation client
const translate = new Translate({ projectId })

const getTextDirection = locale => {
  const localeObject = new Intl.Locale(locale)
  return localeObject.textInfo.direction // "ltr" or "rtl"
}

const getNativeLanguageName = (srcLocale, targetLocale = srcLocale) => {
  const languageNames = new Intl.DisplayNames(srcLocale, {
    type: 'language',
  })

  return languageNames.of(targetLocale)
}

toLocales.forEach(async toLocale => {
  const fromLang = languageFileMap[fromLocale]
  const toLang = languageFileMap[toLocale] || {}
  const otherLocales = getDefaultToLocale(fromLocale)
  const allLocaleNames = [fromLocale, ...otherLocales].reduce((acc, locale) => {
    const langCode = locale.split('-')[0]
    acc[locale] = getNativeLanguageName(toLocale, locale)
    acc[`lang.${langCode}`] = getNativeLanguageName(toLocale, langCode)
    return acc
  }, {})

  const { translated, unTranslated } = Object.entries(fromLang).reduce(
    (acc, [key, val]) => {
      if (key === 'dir') {
        acc.translated[key] = getTextDirection(toLocale)
        return acc
      }

      if (toLang[key]) {
        acc.translated[key] = toLang[key]
      } else {
        acc.unTranslated[key] = val
      }

      return acc
    },
    { translated: allLocaleNames, unTranslated: {} },
  )

  // Google translation API has a limit of 128 items
  const unTranslatedChunks = chunk(Object.entries(unTranslated), 128)

  // Translate chunks
  const translatedChunkPromises = unTranslatedChunks.map(async unTranslatedChunk => {
    const [keys, vals] = unTranslatedChunk.reduce(
      (acc, [key, val]) => {
        acc[0].push(key)
        acc[1].push(val)
        return acc
      },
      [[], []],
    )

    return translate
      .translate(vals, toLocale)
      .then(results => {
        const [translations] = results
        return translations.map((t, i) => [keys[i], t])
      })
      .catch(err => {
        console.error('ERROR:', err)
      })
  })

  // Process and write results
  const translatedChunks = await Promise.all(translatedChunkPromises)
  try {
    const translatedVals = translatedChunks.reduce((acc, cur) => acc.concat(cur), [])
    const fullLanguage = { ...translated, ...Object.fromEntries(translatedVals) }

    const formattedLanguage = formatLanguage(fullLanguage, toLocale)

    const outputPath = path.resolve(__dirname, '../src/lang', `${toLocale}.lang`)
    await writeFile(outputPath, formattedLanguage)
    console.log(`Created ${toLocale}.lang`)
  } catch (err) {
    console.error('Error writing translation file:', err)
  }
})

function entryToString(key, val) {
  return `${key} = ${val}`
}

function formatLanguage(fullLanguage, toLocale) {
  const languageEntries = Object.entries(fullLanguage)
  const keyIsLocale = key => /^[a-z]{2}\-[A-Z]{2}$/.test(key)

  const { locales, dir, ...rest } = languageEntries.reduce(
    (acc, [key, val]) => {
      if (keyIsLocale(key)) {
        acc.locales[key] = val

        return acc
      }

      if (key === 'dir') {
        acc.dir = val
      }

      acc[key] = val

      return acc
    },
    { locales: {} },
  )

  const { [toLocale]: nativeName, ...otherLocales } = locales

  const translatedLang = [entryToString(toLocale, nativeName), entryToString('dir', dir)]
  translatedLang.push('\n')
  Object.entries(otherLocales).forEach(([locale, name]) => {
    translatedLang.push(entryToString(locale, name))
  })
  translatedLang.push('\n')

  // alphabetically order the rest of the entries
  const orderedEntries = Object.entries(rest).sort(([a], [b]) => a.localeCompare(b))

  orderedEntries.forEach(([key, val]) => {
    translatedLang.push(entryToString(key, val))
  })

  return translatedLang.join('\n')
}
