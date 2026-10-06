# Contributing

Thanks for helping translate Formeo! Most contributions only touch the `.lang` files in [`src/lang`](src/lang).

## How translations work

- [`src/lang/en-US.lang`](src/lang/en-US.lang) is the source of truth. Every other locale is translated from it.
- When a new string is added to `en-US.lang` on `master`, the [Translate workflow](.github/workflows/translate.yml) machine-translates it into every other locale and opens a pull request.
- Existing translations are never overwritten by machine translation, so any refinement you make is kept.

Many of the current translations are machine-generated, so improvements from native speakers are very welcome.

## Improving a translation

1. Edit the value in `src/lang/<locale>.lang`. Each line is `key = value`; only change the part after the `=`.
2. Run `npm test` to check your changes.
3. Open a pull request.

You don't need to rebuild anything. `src/js/index.js` and the `src/lang/*.json` files are generated from the `.lang` files and aren't committed. `npm test`, `npm run dev` and the build all regenerate them, and the release ships them in the npm package, on GitHub Pages and as GitHub release assets.

### Placeholders

Text in curly braces like `{count}` or `{title}` is a placeholder that Formeo fills in at runtime. Copy it exactly as it appears in `en-US.lang`; don't translate it. You can move it to wherever it reads naturally in your language.

```ini
# en-US.lang
optionLabel = Option {count}

# de-DE.lang
optionLabel = Option {count}     ✔
optionLabel = Option {Anzahl}    ✘ translated placeholder
```

`npm test` checks every file for this.

### HTML entities

Some values contain HTML entities such as `&lt;fieldset&gt;`. Keep those as they are.

## Adding a new string

Add it to `src/lang/en-US.lang` only. Once merged, the Translate workflow opens a pull request with machine translations for the other locales.

## Adding a new language

Open an issue or pull request asking for the locale (e.g. `sw-KE`). A maintainer can generate a complete machine-translated starting point with:

```sh
npm run translate -- en-US sw-KE
```

or by running the Translate workflow manually with that locale. You're then welcome to refine it.

## Running the translate script (maintainers)

The script needs a Google Cloud service account key with the Cloud Translation API enabled. Point `GOOGLE_APPLICATION_CREDENTIALS` at it, or save it as `GOOGLE_APPLICATION_CREDENTIALS.json` in the folder *above* this repository. Anyone can preview what would be translated without credentials:

```sh
npm run translate -- --dry-run
```

See the comment at the top of [`tools/translate.js`](tools/translate.js) or run `npm run translate -- --help` for all options. The `--` is required so npm passes the options through to the script.

In CI, the workflow reads the key from the `GOOGLE_CREDENTIALS` repository secret.
