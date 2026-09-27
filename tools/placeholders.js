/**
 * Helpers for keeping @draggable/i18n interpolation tokens (e.g. `{count}`) intact
 * through machine translation.
 */

// Same pattern @draggable/i18n uses in I18N.get() to find tokens to interpolate
const PLACEHOLDER_PATTERN = /\{[^}]+?\}/g
const ENTITY_PATTERN = /&(#\d+|#x[\da-f]+|[a-z]+);/gi
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Lists the placeholders in a string, sorted so two strings can be compared
 * regardless of word order.
 * @param {string} str
 * @returns {string[]}
 */
export const getPlaceholders = str => (str.match(PLACEHOLDER_PATTERN) || []).sort()

/**
 * Whether a translation has exactly the same placeholders as its source.
 * @param {string} source
 * @param {string} translation
 * @returns {boolean}
 */
export const placeholdersMatch = (source, translation) =>
  getPlaceholders(source).join() === getPlaceholders(translation).join()

/**
 * Wraps each placeholder in a span Google Translate leaves untranslated when
 * the request is sent with `format: 'html'`.
 * @param {string} str
 * @returns {string}
 */
export const protectPlaceholders = str => str.replace(PLACEHOLDER_PATTERN, token => `<span translate="no">${token}</span>`)

const decodeEntity = entity => {
  const name = entity.slice(1, -1)
  if (name[0] !== '#') {
    return NAMED_ENTITIES[name.toLowerCase()] ?? entity
  }
  const isHex = name[1].toLowerCase() === 'x'
  return String.fromCodePoint(Number.parseInt(name.slice(isHex ? 2 : 1), isHex ? 16 : 10))
}

/**
 * Undoes protectPlaceholders() on an HTML-mode translation. Google encodes
 * characters like quotes and apostrophes in HTML mode, so any entity that
 * wasn't already in the source string is decoded back to plain text.
 * @param {string} translated
 * @param {string} source the untranslated string that was sent
 * @returns {string}
 */
export const restorePlaceholders = (translated, source) => {
  const sourceEntities = new Set(source.match(ENTITY_PATTERN))
  // Decode first so the span is still recognised if its attribute quotes came back encoded
  return translated
    .replace(ENTITY_PATTERN, entity => (sourceEntities.has(entity) ? entity : decodeEntity(entity)))
    .replace(/<span translate=["']?no["']?>\s*(.*?)\s*<\/span>/g, '$1')
}
