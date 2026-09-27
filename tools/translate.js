/**
 * Machine-translates missing strings from a source language file into one or
 * more target language files using the Google Cloud Translation API (v2/Basic).
 *
 * Usage (note the `--` so npm passes the arguments through to this script):
 *   npm run translate                           # en-US -> every other known locale
 *   npm run translate -- en-US de-DE            # en-US -> de-DE only
 *   npm run translate -- en-US de-DE,fr-FR      # several target locales
 *   npm run translate -- en-US sw-KE            # bootstrap a new locale (no .lang yet)
 *   npm run translate -- --dry-run              # list what would be translated, no API calls
 *   npm run translate -- --fix-placeholders     # re-translate strings with broken {placeholders}
 *
 * Prerequisites (not needed for --dry-run):
 *   - A Google Cloud service account key with the Cloud Translation API enabled.
 *     Point GOOGLE_APPLICATION_CREDENTIALS_PATH at it (a .env file works), or save it
 *     as GOOGLE_APPLICATION_CREDENTIALS.json in the directory *above* this repository
 *     (a sibling of the repo folder, so it can't be committed by accident).
 *   - Billing enabled on the Google Cloud project. Only missing keys are sent, but
 *     a new locale sends every string in the source file.
 *   The .github/workflows/translate.yml workflow runs this in CI, so contributors
 *   only need to edit en-US.lang and never need credentials themselves.
 *
 * How it works:
 *   1. `pretranslate` runs `build:lib`, which regenerates src/js/index.js from
 *      the current src/lang/*.lang files, so `languageFileMap` is up to date.
 *   2. For each target locale, every key in the source file is resolved as:
 *        - `dir`            -> "ltr"/"rtl", derived from the locale via Intl
 *        - already present  -> existing translation is kept as-is
 *        - locale names     -> native names via Intl.DisplayNames (no API call)
 *        - anything else    -> queued for machine translation
 *   3. Queued strings are sent to Google in batches of 128 (the API limit) as
 *      HTML, with each {placeholder} wrapped in a translate="no" span so it comes
 *      back untouched. Results that still lost a placeholder are skipped.
 *   4. The merged result is written to src/lang/<locale>.lang, overwriting it.
 *   5. `posttranslate` runs `build:lib` again so index.js and the *.json files
 *      pick up the new translations.
 *
 * Notes:
 *   - Existing translations are intentionally never overwritten, so contributors'
 *     refinements of machine translations survive future runs. The only
 *     exception is --fix-placeholders, which replaces translations whose
 *     placeholders don't match the source (they're broken at runtime anyway).
 *   - Keys that no longer exist in the source file are removed.
 *   - The output file is fully regenerated: keys are sorted and any comments or
 *     manual formatting in the .lang file are lost.
 *   - Exits with code 1 if any locale fails, so CI doesn't treat it as success.
 */
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import chunk from 'lodash/chunk.js'
import googleTranslate from '@google-cloud/translate'
import dotenv from 'dotenv'
import { languageFileMap } from '../src/js/index.js'
import { placeholdersMatch, protectPlaceholders, restorePlaceholders } from './placeholders.js'

const { Translate } = googleTranslate.v2

const __dirname = fileURLToPath(new URL('.', import.meta.url))

// Load environment variables from a local .env file (gitignored), if there is one
dotenv.config()

const usage = `
Usage: npm run translate -- [fromLocale] [toLocale[,toLocale...]] [options]

  fromLocale            source locale (default: en-US)
  toLocale              comma-separated target locales (default: every other known locale)

Options:
  --dry-run             list the strings that would be translated without calling the API
  --fix-placeholders    re-translate existing strings whose {placeholders} don't match the source
  -h, --help            show this message
`

// Command line arguments
let args
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      'fix-placeholders': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
} catch (err) {
  console.error(err.message, usage)
  process.exit(1)
}

const { values: options, positionals } = args
if (options.help) {
  console.log(usage)
  process.exit(0)
}

const getDefaultToLocale = fromLocale => Object.keys(languageFileMap).filter(locale => locale !== fromLocale)
const [fromLocale = 'en-US', toLocaleArg] = positionals
// An empty toLocale ('') means "all", which lets CI pass an optional input straight through
const toLocales = toLocaleArg
  ? toLocaleArg
      .split(',')
      .map(locale => locale.trim())
      .filter(Boolean)
  : getDefaultToLocale(fromLocale)

if (!languageFileMap[fromLocale]) {
  console.error(`Unknown source locale "${fromLocale}". Known locales: ${Object.keys(languageFileMap).join(', ')}`)
  process.exit(1)
}

// Configuration
// The key file is resolved from, in order: GOOGLE_APPLICATION_CREDENTIALS_PATH (e.g. in .env),
// GOOGLE_APPLICATION_CREDENTIALS (set by the GitHub workflow), then a sibling of the
// repo folder so it can't be committed by accident. GOOGLE_CLOUD_PROJECT overrides the project.
const defaultCredentialsFile = path.resolve(__dirname, '../../', 'GOOGLE_APPLICATION_CREDENTIALS.json')
process.env.GOOGLE_APPLICATION_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || defaultCredentialsFile
const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'formeo-1344'

/**
 * Creates the Translation API client, failing early with setup instructions
 * rather than letting every request fail with an auth error.
 * @returns {InstanceType<typeof Translate>}
 */
const createTranslateClient = () => {
  const credentialsFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (!existsSync(credentialsFile)) {
    console.error(
      `Google Cloud credentials not found at ${credentialsFile}\n` +
        'Set GOOGLE_APPLICATION_CREDENTIALS_PATH to a service account key file, or use --dry-run.',
    )
    process.exit(1)
  }
  return new Translate({ projectId })
}

// Dry runs never touch the API, so they work without credentials
const translate = options['dry-run'] ? null : createTranslateClient()

/**
 * Resolves the writing direction for a locale, e.g. "rtl" for ar-TN or he-IL.
 * @param {string} locale BCP 47 locale tag
 * @returns {'ltr'|'rtl'}
 */
const getTextDirection = locale => {
  const localeObject = new Intl.Locale(locale)
  // getTextInfo() replaced the older non-standard textInfo getter
  const textInfo = localeObject.getTextInfo?.() ?? localeObject.textInfo
  return textInfo.direction // "ltr" or "rtl"
}

/**
 * Names `targetLocale` in the language of `srcLocale`, using the runtime's ICU
 * data rather than the translation API.
 * e.g. getNativeLanguageName('de-DE', 'fr-FR') -> "Französisch (Frankreich)"
 * @param {string} srcLocale locale to write the name in
 * @param {string} [targetLocale] locale being named, defaults to srcLocale
 * @returns {string}
 */
const getNativeLanguageName = (srcLocale, targetLocale = srcLocale) => {
  const languageNames = new Intl.DisplayNames(srcLocale, {
    type: 'language',
  })

  return languageNames.of(targetLocale)
}

/**
 * Sends strings to the Translation API with their placeholders protected.
 * Values are sent as a batch and returned in the same order, so they're zipped
 * back onto their keys by index.
 * @param {[string, string][]} entries [key, source string] pairs
 * @param {string} toLocale
 * @returns {Promise<[string, string][]>} [key, translated string] pairs
 */
const translateEntries = async (entries, toLocale) => {
  const sources = entries.map(([, val]) => protectPlaceholders(val))
  // HTML mode is what makes translate="no" work, and the source values are HTML already (e.g. &lt;fieldset&gt;)
  const [translations] = await translate.translate(sources, { to: toLocale, format: 'html' })
  return entries.map(([key, val], i) => [key, restorePlaceholders(translations[i], val)])
}

/**
 * Builds and writes the .lang file for a single target locale.
 * @param {string} toLocale
 */
async function translateLocale(toLocale) {
  const fromLang = languageFileMap[fromLocale]
  // A locale without a .lang file yet starts empty, so every key gets translated
  const toLang = languageFileMap[toLocale] || {}

  // Names of every known locale (and bare language code) written in the target
  // language, e.g. for de-DE: { 'fr-FR': 'Französisch (Frankreich)', 'lang.fr': 'Französisch' }
  // toLocale is included for new locales that aren't in languageFileMap yet
  const allLocales = new Set([fromLocale, ...getDefaultToLocale(fromLocale), toLocale])
  const translated = [...allLocales].reduce((acc, locale) => {
    const langCode = locale.split('-')[0]
    acc[locale] = getNativeLanguageName(toLocale, locale)
    acc[`lang.${langCode}`] = getNativeLanguageName(toLocale, langCode)
    return acc
  }, {})

  // Split the source keys into ones resolved locally (`translated`) and ones that
  // need a round trip to the translation API (`unTranslated`)
  const unTranslated = {}
  const mismatchedKeys = []
  for (const [key, val] of Object.entries(fromLang)) {
    const existing = toLang[key]
    const hasBrokenPlaceholders = Boolean(existing) && !placeholdersMatch(val, existing)
    if (hasBrokenPlaceholders) {
      mismatchedKeys.push(key)
    }

    if (key === 'dir') {
      translated[key] = getTextDirection(toLocale)
    } else if (existing && !(hasBrokenPlaceholders && options['fix-placeholders'])) {
      translated[key] = existing
    } else if (!(key in translated)) {
      unTranslated[key] = val
    }
  }

  if (mismatchedKeys.length && !options['fix-placeholders']) {
    console.warn(
      `${toLocale}: ${mismatchedKeys.length} existing translation(s) have mismatched placeholders ` +
        `(${mismatchedKeys.join(', ')}). Re-run with --fix-placeholders to replace them.`,
    )
  }

  const pendingEntries = Object.entries(unTranslated)
  if (options['dry-run']) {
    const keyList = pendingEntries.map(([key]) => `\n  ${key}`).join('')
    console.log(`${toLocale}: ${pendingEntries.length} string(s) to translate${keyList}`)
    return
  }

  // Google translation API has a limit of 128 items per request
  const translatedChunks = await Promise.all(chunk(pendingEntries, 128).map(entries => translateEntries(entries, toLocale)))

  // Leave a string untranslated rather than write one that breaks at runtime.
  // @draggable/i18n falls back to another loaded language for missing keys.
  const skippedKeys = []
  for (const [key, value] of translatedChunks.flat()) {
    if (placeholdersMatch(unTranslated[key], value)) {
      translated[key] = value
    } else {
      skippedKeys.push(key)
    }
  }
  if (skippedKeys.length) {
    console.warn(`${toLocale}: skipped translation(s) that lost placeholders: ${skippedKeys.join(', ')}`)
  }

  const outputPath = path.resolve(__dirname, '../src/lang', `${toLocale}.lang`)
  await writeFile(outputPath, formatLanguage(translated, toLocale))
  console.log(`${toLocale}: wrote ${toLocale}.lang (${pendingEntries.length - skippedKeys.length} machine-translated)`)
}

// Locales are processed concurrently; one failing doesn't stop the others
const results = await Promise.allSettled(toLocales.map(translateLocale))
const failedLocales = toLocales.filter((toLocale, i) => {
  const { status, reason } = results[i]
  if (status === 'rejected') {
    console.error(`${toLocale}: failed -`, reason)
  }
  return status === 'rejected'
})

if (failedLocales.length) {
  console.error(`Translation failed for: ${failedLocales.join(', ')}`)
  process.exitCode = 1
}

/**
 * Formats a single `key = value` line in @draggable/i18n's .lang format.
 * @param {string} key
 * @param {string} val
 * @returns {string}
 */
function entryToString(key, val) {
  return `${key} = ${val}`
}

/**
 * Serializes a language object into the .lang file layout used by this repo:
 *
 *   de-DE = Deutsch (Deutschland)           <- the file's own locale name
 *   dir = ltr                               <- text direction
 *
 *   en-US = Englisch (Vereinigte Staaten)   <- other locale names (xx-XX keys)
 *   ...
 *
 *   addOption = Option hinzufügen           <- everything else, sorted by key
 *   ...
 *
 * @param {Record<string, string>} fullLanguage merged key/value pairs
 * @param {string} toLocale locale the file is for
 * @returns {string} file contents
 */
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
