import { deepStrictEqual, strictEqual } from 'node:assert'
import { suite, test } from 'node:test'
import { getPlaceholders, placeholdersMatch, protectPlaceholders, restorePlaceholders } from './placeholders.js'

suite('getPlaceholders', () => {
  test('returns tokens sorted, including duplicates', () => {
    deepStrictEqual(getPlaceholders('{label} {count} of {count}'), ['{count}', '{count}', '{label}'])
  })

  test('returns an empty array when there are none', () => {
    deepStrictEqual(getPlaceholders('Add option'), [])
  })

  test('ignores unbalanced braces', () => {
    deepStrictEqual(getPlaceholders('Nuevo tipo}'), [])
  })
})

suite('placeholdersMatch', () => {
  test('matches regardless of order', () => {
    strictEqual(placeholdersMatch('{label} {count}', '{count} {label}'), true)
  })

  test('detects translated tokens', () => {
    strictEqual(placeholdersMatch('Option {count}', 'Option {Anzahl}'), false)
  })

  test('detects dropped tokens', () => {
    strictEqual(placeholdersMatch('New {type}', 'Nuevo tipo}'), false)
  })
})

suite('protectPlaceholders / restorePlaceholders', () => {
  test('wraps tokens in notranslate spans', () => {
    strictEqual(protectPlaceholders('Option {count}'), 'Option <span translate="no">{count}</span>')
  })

  test('round-trips a string untouched by translation', () => {
    const source = 'Attribute "{attribute}" is not permitted'
    strictEqual(restorePlaceholders(protectPlaceholders(source), source), source)
  })

  test('strips spans and whitespace Google adds around them', () => {
    const source = 'Filtering "{term}"'
    const response = 'Filtern &quot;<span translate="no"> {term} </span>&quot;'
    strictEqual(restorePlaceholders(response, source), 'Filtern "{term}"')
  })

  test('strips spans whose attribute quotes were encoded', () => {
    const source = 'Option {count}'
    strictEqual(restorePlaceholders('Option <span translate=&quot;no&quot;>{count}</span>', source), source)
  })

  test('decodes entities Google introduced', () => {
    const source = 'Remove {type}'
    const response = 'Supprimer l&#39;élément <span translate="no">{type}</span>'
    strictEqual(restorePlaceholders(response, source), "Supprimer l'élément {type}")
  })

  test('keeps entities that were in the source', () => {
    const source = 'Wrap row in a &lt;fieldset&gt; tag'
    const response = 'Zeile in ein &lt;fieldset&gt;-Tag einschließen'
    strictEqual(restorePlaceholders(response, source), response)
  })
})
