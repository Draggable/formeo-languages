import { strictEqual, ok } from 'node:assert'
import { suite, test } from 'node:test'
import { languageFileMap, enUS } from './index.js'

suite('languageFiles', () => {
  test('should contain all the definitions in languageList', () => {
    Object.entries(languageFileMap).forEach(([locale, lang]) => {
      strictEqual(typeof lang, 'object', `${locale} should be an object`)
    })
  })
})

suite('en-US', () => {
  test('should be defined', () => {
    ok(enUS !== undefined, 'enUS should be defined')
  })

  test("should equal languageFiles['en-US']", () => {
    strictEqual(enUS, languageFileMap['en-US'], 'enUS should match languageFiles[en-US]')
  })
})
