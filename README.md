# robo-all-calc

A scientific calculator web app with **graphing**, **unit conversion** (300+ units
across 19 categories, live exchange rates), and a **symbolic solver** (algebra,
calculus, limits, factoring) — no framework, no build step, works offline.

Everything is plain HTML/CSS/JS. Open `index.html` and it runs.

## Run it

- **Quick start:** open `index.html` in any browser. Everything works, including
  the symbolic solver — but see the offline note below.
- **Full experience (PWA install + offline):** serve over HTTP once, e.g.
  ```
  python -m http.server 8080
  ```
  then visit http://localhost:8080. The app registers a service worker and can be
  installed (desktop Chrome/Edge: install icon in the address bar; Android: "Add
  to Home screen").

### Offline

Everything works with no network at all — no CDN, no API, no fonts:

| Feature | Offline behaviour |
| ------- | ----------------- |
| Calculator, graphing, units | Always available; no network is ever used |
| Unit converter | Non-currency categories always work. Currency falls back to a bundled snapshot (6 rates) if rates have not been fetched yet, and to the last live rates (166) otherwise |
| Symbolic solver | nerdamer is **vendored** in `vendor/`, not loaded from a CDN, and is precached by the service worker |

Two different situations, both supported:

- **Served over http** — after the first visit the service worker has cached
  everything, so you can stop the server or go off-network and it all keeps
  working. Cached assets are served regardless of query string, and an offline
  navigation falls back to the cached app shell.
- **Opened straight from disk (`file://`)** — browsers block Web Workers on
  `file://`, so the solver automatically falls back to running on the main
  thread. Same answers, same speed for normal problems; the panel notes that a
  very hard problem could briefly freeze the page. Serving over http avoids this.

The service worker caches each asset individually rather than with
`cache.addAll`, because `addAll` is all-or-nothing: one failed request would
otherwise leave the app with no offline cache at all.

## Deployment

Live at **https://robocalc.atollingo.com** (Cloudflare Pages, custom domain on the
`atollingo.com` zone). The canonical fallback is
`https://robocalc-atollingo.pages.dev`.

Redeploy after a change:

```bash
npm run deploy          # stages .deploy/ then uploads it
```

`npm run deploy` runs `tools/stage_deploy.py` first. That step matters: deploying
the repository root would upload `node_modules` (32 MB) along with the test suite
and CI scripts. It copies only what the browser loads — `index.html`,
`styles.css`, `sw.js`, `manifest.json`, `icons/`, `js/`, `vendor/` — which comes
to 23 files and about 0.82 MB.

Notes:

- **Pages, not Workers.** The app is entirely static and has no build step.
  Pages also serves it over HTTPS, which the service worker requires to register.
- **DNS is a manual step.** The Pages project cannot create its own CNAME, so
  `robocalc.atollingo.com` needs a `CNAME` record pointing at
  `robocalc-atollingo.pages.dev`. Wrangler's OAuth token carries Pages write but
  not DNS write, so this has to be added in the Cloudflare dashboard. Until it
  exists the domain stays `pending` and does not resolve, while the
  `pages.dev` URL works fine.
- Service workers are per-origin, so the live site's offline cache is entirely
  separate from any localhost copy.

## Features

### Calculator
- Basic arithmetic: `+  −  ×  ÷`, percent, sign toggle, backspace
- Correct operator replacement (`2 + × 3 =` → 6) and repeat-equals (`5 + 3 = = =` → 8, 11, 14)
- True percent semantics: `200 + 10% =` → 220
- Scientific mode (`fx`): x², x³, √, ∛, xʸ, mod, 1/x, sin/cos/tan, asin/acos/atan, sinh/cosh/tanh (+inverses), ln, log, log₂, π, e, φ, |x|, sgn, floor, ceil, round, trunc, n!, nCr, nPr, DEG/RAD
- Memory: MC / MR / M+ / M−, with an `M` badge and localStorage persistence
- History panel (🕘): last 50 calculations, click an entry to reuse its result (returns to the calculator), **← Back** button or `Esc` to close, persisted
- Undo / redo (`Ctrl+Z` / `Ctrl+Y`) for operand edits and history reuse
- Unit converter (⇄): **19 categories, 300+ units** (see below)
- Thousands separators, exponent display for very large/small numbers, 15-digit input limit
- Themes: **robotic** (default), dark, OLED-black, light; high-contrast toggle;
  adjustable density (key size)
- English/Japanese UI (`L` key or toolbar button)
- Keyboard support and clipboard paste (numbers or full expressions like `(2+3)*4`)
- Accessible: ARIA labels, live-region display, visible focus rings
- JSON backup: export/import all data (history, memory, settings, graph functions)

### Robotic theme

The default look: chamfered key geometry, cyan/amber instrumentation on near-black,
a CRT scanline veil, corner brackets on the card, a slowly sweeping display readout,
and a monospace interface. It applies to every section — calculator, converter,
solver, graph and history.

It is built entirely from custom properties, so:

- the high-contrast toggle still overrides its colours, and
- the other three themes are byte-for-byte unchanged.

Two implementation notes worth knowing before editing it:

- `clip-path` and `box-shadow` cannot be combined — a clipped element loses its
  outer shadow. Glowing chamfered elements use `filter: drop-shadow()`, which
  follows the clip.
- The graph canvas has its own palette in `GRAPH_THEMES` (`js/grapher-ui.js`).
  A theme with no entry there silently falls back to dark, so add both together.

Text contrast was measured rather than eyeballed: the main keys sit at 13.8:1,
operators 9.0:1, body text 16.4:1 and muted text 5.5:1. The robot theme's red
`--danger` is `#e11d48` specifically because white on it measures 4.7:1, where
brighter reds only reach 3.2–3.8:1.

### Graphing (📈)
- **Horizontal layout**: on screens wider than 720px the graph canvas sits beside a
  scrollable controls column; scientific mode places the function pad beside the keypad.
  Both stack vertically on narrow screens.
- **Theme-aware plot**: canvas, grid, axes, legend, and cursor readout follow the
  active app theme (robotic/dark/OLED/light).
- **Formula management**: up to 8 functions, add/delete, color cycle, visibility
  toggle, live preview (200 ms debounce), invalid-expression highlight, persisted.
- **Function modes**: cartesian `y=f(x)`, polar `r=f(θ)`, parametric `x(t),y(t)`
  with configurable `t` range.
- **Quick-add templates**: sin, cos, tan, x², x³, √x, 1/x, ln, log, eˣ, |x|, x·sin(x)
- **Press and hold to move the plot.** Click or tap the canvas and drag: the
  graph follows your pointer in both axes. The drag uses Pointer Events with
  `setPointerCapture`, so it keeps going when the pointer strays outside the
  canvas and only ends when you let go. The cursor shows which behaviour a drag
  will have — a grab hand to pan, a crosshair in inspect mode, and a closed hand
  while a drag is in flight. Only the primary button drags, so right-clicking
  never moves the plot.
- Interactive: **zoom** (wheel / +/- buttons / pinch), reset view, plus a
  **pan vs inspect** mode toggle (inspect shows cursor + tangent line, and a drag
  scrubs the readout instead of panning).
- Analysis tools: **Find Root**, **Derivative**, **Integrate** (shades the area),
  **Intersections**, **Extrema**, **Tangent line** at a draggable point.
- **Values table**: samples of all functions over the visible range (step configurable).
- **Export PNG**: download the current plot as an image.
- Touch support: one finger pans, two fingers pinch-zoom.

### PWA
- Manifest, service worker (offline capable), SVG + PNG icons — installable.

### Symbolic solver (computer algebra)

Press **∑** in the toolbar or `Y` to open it, or just **paste a formula
anywhere** in the app — a pasted equation opens the solver automatically, while
pasted arithmetic still goes through the normal calculator.

| You type | You get |
| -------- | ------- |
| `x^2-5x+6=0` | `x = 2 or 3` |
| `2x+3=7` | `x = 2` |
| `x^2+1=0` | `x = i or -i` (with a note that these are complex) |
| `x^4-5x+6=0` | numeric roots in ~0.1 s, paired as `x = -1.15697 ± 1.55531·i or 1.15697 ± 0.508118·i` |
| `sin(x)=0` | `x = n·pi` (with a note that `n` ranges over the integers) |
| `x = 2x + 1` | solves for `x`, not `y` |
| `d/dx x^3+2x^2-5` | `3·x² + 4·x` |
| `d2/dx2 x^4` | `12·x²` |
| `∂/∂y x^2*y^3` | `3·x²·y²` |
| `∫ x^2 dx` | `(1/3)·x³` |
| `∫ x^2 dx from 0 to 3` | `9` |
| `∫[0,pi] sin(x) dx` | `2` |
| `limit (x^2-1)/(x-1) as x -> 1` | `2` |
| `simplify (x^2-1)/(x-1)` | `1 + x` |
| `expand (x+1)^3` | `1 + 3·x + 3·x² + x³` |
| `factor x^2-1` | `(1+x)·(-1+x)` |

- **Input:** ASCII or unicode — `x²`, `×`, `÷`, `−`, `π`, `√`, `∛`, `∫`, `∂`,
  `∞`, `²`/`³` exponents, and `1,234,567` are all understood. Implicit
  multiplication (`2x`, `2(x+1)`, `2sin(x)`) works as typed.
- **Power:** [nerdamer](https://github.com/casperw0/nerdamer) 2.0 (Apache-2.0),
  vendored in `vendor/` so it works offline. Loaded **lazily inside a Web
  Worker**, so the 500 KB bundle is fetched only when you open the solver.
- **Fast, and never freezes the UI.** nerdamer's general solver takes 12–27 s on
  an irreducible quartic or quintic while its polynomial root finder answers in
  under 0.1 s. `js/cas-solve.js` picks per problem: exact radicals up to degree
  3, factor-then-solve above that, and the root finder for anything still
  irreducible. Everything still runs off the main thread behind a 4 s watchdog,
  so a pathological input can never lock the page.
- **Honest about partial answers:** if no closed-form solution is found it says
  so and explains that an empty result is not proof there is none; complex
  roots, integer families and partially-solved results are all flagged.
- **Refuses rather than guesses:** inequalities (`x<=3`), not-equal (`x!=3`) and
  approximate relations (`~`) are rejected with an explanation, because nerdamer
  silently mis-parses them (`x!=3` used to be read as `fact(x)=3`).


### Unit converter

**19 categories, 300+ units**, grouped into an optgroup'd dropdown:

| Group | Categories |
| ----- | ---------- |
| Everyday | length · mass · area · volume · temperature · speed · time · fuel economy · paper size |
| Engineering | pressure · energy · power · force · density · flow rate |
| Computing | data storage · frequency |
| Science & maths | angle |
| Finance | currency (166 live codes) |

Three kinds of conversion, because naive scaling gets them wrong:

- **Linear** — factor ratios (length, pressure, energy, …)
- **Affine** — scale *and* offset, for the eight temperature scales:
  °C, °F, K, Rankine, Réaumur, Rømer, Newton, Delisle
- **Inverted** — reciprocal quantities, for fuel economy
  (`L/100km = 100 / km-per-litre`, `mpg` derived through the gallon size)

**US and imperial units are separate, labelled entries** — `gal (imp)` vs
`gal (US)`, `ton (imp)` vs `ton (US)`, `oz` vs `troy oz`, `cwt (imp/US)`,
`mph` vs `km/h`, `tsp (imp/US)`. They differ by ~20%, so silently picking one
produces confidently wrong answers. Imperial and traditional units are listed
first within each category. Decimal and binary data prefixes (`KB`/`KiB`) are
also distinct.

Two categories carry a caveat shown in the panel:

- **Paper size** converts by *sheet area*, and ISO 216 rounds A4 and smaller
  down, so 2 × A4 = 0.998 A3 rather than exactly 1
- **Data storage** keeps `KB` (1000) and `KiB` (1024) apart

Calendar units are approximate by convention: 30-day months, 365.25-day years.

### Currency converter (live rates)

All **166 fiat currencies** in the ISO 4217 set the providers return, labelled
`CODE — Name` (e.g. `JPY — Japanese Yen`). No API key required.

**Rate sources**, tried in order until one returns a usable table:

| # | Provider | Endpoint | Coverage |
| - | -------- | -------- | -------- |
| 1 | [open.er-api.com](https://open.er-api.com) (ExchangeRate-API) | `/v6/latest/USD` | 166 currencies, includes provider's next-update time |
| 2 | [api.frankfurter.app](https://api.frankfurter.app) (ECB) | `/latest?from=USD` | 29 major currencies, authoritative reference rates |
| 3 | [currency-api on jsDelivr](https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api) | `/v1/currencies/usd.json` | 339 codes, filtered down to the ISO set |

Behaviour:

- **Cached** in `localStorage` for 6 h, then refreshed in the background, so the
  converter is instant on repeat visits and works offline.
- **Offline fallback**: a bundled snapshot (USD/EUR/JPY/GBP/CNY/KRW) ships with
  the app, so currency conversion never breaks — even with no network.
- **Status line** shows provider, currency count, rate date, next-update time,
  and a colour-coded state (green live / amber stale / red offline).
- **Refresh button** re-fetches on demand; a failed refresh keeps the last known
  rates and says so instead of blanking the result.
- Rates are cross-derived through USD, so any pair works: `NGN → KES`,
  `ZWG → BRL`, `MXN → COP`, etc.
- Crypto and non-ISO tickers from source 3 are filtered out by intersecting
  with the ISO name table.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `0-9` `.` | Digits / decimal point |
| `+ - * / ^` | Operators |
| `%` | Percent |
| `Enter` or `=` | Equals |
| `Backspace` | Delete last digit |
| `Delete` | Clear entry |
| `Escape` | Close panel, else all clear |
| `Ctrl+V` | Paste a number or expression |
| `Ctrl+Z` / `Ctrl+Y` | Undo / redo |
| `H` | Toggle history panel |
| `F` | Toggle scientific mode |
| `T` | Cycle theme |
| `G` | Open graph view |
| `R` (in graph) | Reset view |
| `U` | Toggle unit converter |
| `Y` | Toggle symbolic solver |
| `L` | Switch language (EN/JA) |

## Tests

Zero-dependency test suites (387 tests total):

```
npm test
# or individually:
node tests/calculator.test.js      #  70 — core engine + expression evaluator
node tests/grapher-math.test.js    #  18 — derivatives, integrals, roots, functions
node tests/units.test.js           #  31 — conversion behaviour, category catalogue
node tests/units-factors.test.js   # 161 — numeric factor for every unit
node tests/currency.test.js        #  23 — providers, fallback chain, cache, math
node tests/symbolic.test.js        #  44 — input normalisation, guards, detection
node tests/cas.test.js             #  35 — detection -> nerdamer -> answer
node tests/i18n.test.js            #   5 — dictionaries
```

The factor suite is data-driven: every row states an authoritative expected
value with a note on anything non-obvious (e.g. a US bushel is 9.309 US gallons,
not 8.5; a therm is 99 976 BTU(IT), not 100 000; 1 US mpg is *more* imperial
mpg). `npm run verify:units` runs the same checks as a standalone report.

`npm run test:live` additionally hits the real rate APIs (opt-in; the rest of the
suite runs fully offline via a stubbed `fetch`). Or open `tests/index.html` in a
browser to run everything.

## Checks

| Command | What it does |
| ------- | ------------ |
| `npm run check` | `node --check` on every JS file |
| `npx tsc` | `checkJs` type-check of the pure modules |
| `npm run check:encoding` | Scans for mojibake (UTF-8 mangled by an ANSI round-trip) |
| `npm run check:html` | Tag balance, every JS-referenced id exists, no clipped attributes, i18n keys resolve |
| `npm run check:refs` | Flags app identifiers used but never declared |
| `npm run verify:units` | Prints a pass/fail line per unit conversion factor |
| `npm run bump` | Stamps the cache-busting token from the asset contents |
| `npm run check:version` | Fails if the stamped token no longer matches the assets |

CI runs all of the above plus the live rate smoke test
(`.github/workflows/test.yml`). The encoding and ref checks exist because both
failure modes were hit in practice and were invisible to `node --check`.


## Project structure

```
calculator/
├── index.html              # markup (calculator view + graph view + converter)
├── styles.css              # themes (robotic/dark/OLED/light) + HC + density + layout
├── js/
│   ├── calculator.js       # core engine (UMD: browser global + Node export)
│   ├── app.js              # calculator UI wiring, keyboard, paste, theme, i18n
│   ├── grapher.js          # graphing engine (canvas, multi-mode, markers)
│   ├── grapher-ui.js       # graph UI (formulas, templates, analysis, table)
│   ├── grapher-math.js     # pure math: parser, roots, integrals, samplers
│   ├── units.js            # 19 categories: linear, affine (temperature), inverted (fuel economy)
│   ├── currency.js         # live FX: providers, fallback chain, caching
│   ├── currency-names.js   # ISO 4217 code -> name (generated)
│   ├── symbolic.js         # symbolic front-end: normalise, guard, detect, dispatch
│   ├── cas-solve.js        # solve strategy (exact vs numeric) shared by worker + fallback
│   ├── cas-worker.js       # Web Worker that runs nerdamer off the main thread
│   └── i18n.js             # EN/JA dictionaries + DOM apply
├── vendor/nerdamer.js      # CAS bundle (Apache-2.0), loaded lazily in the worker
├── icons/                  # SVG + generated PNG icons
├── tools/                  # dev + verification scripts (see "Checks")
├── THIRD_PARTY.md          # vendored dependencies + licences
├── manifest.json           # PWA manifest
├── sw.js                   # service worker (cache-first app shell)
├── package.json            # test/check scripts
├── tsconfig.json           # checkJs for the pure modules
├── .github/workflows/      # CI
└── tests/                  # Node + browser test suites
```

## Notes

- **Cache busting is derived from content, not a counter.** `npm run bump` hashes
  `styles.css` and `js/*.js` and stamps the first 8 hex characters into every
  `?v=` query in `index.html` and into `CACHE_NAME` in `sw.js`. This replaced a
  hand-incremented number, which was a repeating source of stale-asset bugs: edit
  the CSS, forget the bump, and the service worker quietly keeps serving the old
  file. Now the token cannot go stale, and `npm run check:version` (also in CI)
  fails if it ever does. Use the Python tooling rather than PowerShell text
  cmdlets, which mangle multi-byte characters (this corrupted files twice during
  development).
- Rates are indicative reference rates for everyday use, not a dealing feed.
  Each source publishes its own terms; the app links no provider affiliation.
- The graph expression compiler is a safe recursive-descent parser (no `eval` on
  raw input) supporting `+ - * / ^`, unary minus, parentheses, implicit
  multiplication (`2x`, `2(x+1)`), constants `pi`/`e`, and the standard
  `sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs ln log log2 exp pow`
  functions.
- PNG icons are generated by `icons/make_icons.py`; the currency name table by
  `tools/gen_currency_names.py` (both require Pillow / network respectively).
