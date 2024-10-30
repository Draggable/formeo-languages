import '../scss/demo.scss'
import { languageFileMap, languageFileOptions } from '@draggable/formeo-languages'

const langSelect = document.getElementById('lang-select')
const activeLangTable = document.getElementById('active-lang')

languageFileOptions.forEach(({ locale, nativeName }) => {
  const option = document.createElement('option')
  option.setAttribute('data-dir', languageFileMap[locale].dir)
  option.value = locale
  option.textContent = nativeName
  langSelect.append(option)
})

const makeRow = (key, value) => {
  const row = document.createElement('tr')
  const keyCell = document.createElement('td')
  const valueCell = document.createElement('td')

  keyCell.textContent = key
  valueCell.textContent = value

  row.append(keyCell, valueCell)

  return row
}

const setActiveLang = locale => {
  window.sessionStorage.setItem('lang', locale)
  langSelect.value = locale
  const lang = languageFileMap[locale]
  activeLangTable.innerHTML = ''
  const rows = Object.entries(lang).map(([key, value]) => makeRow(key, value))
  activeLangTable.append(...rows)
}

langSelect.addEventListener('change', e => {
  setActiveLang(e.target.value)
})

setActiveLang(window.sessionStorage.getItem('lang') || 'en-US')
