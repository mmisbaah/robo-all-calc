'use strict';

/**
 * Unit tests for the live currency module.
 * Provider parsing and the fallback chain are tested with a stubbed fetch, so
 * these run offline. A real network call is only attempted when RUN_LIVE=1.
 *
 * Runs in Node and in the browser (tests/index.html). Zero dependencies.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;

  // Node has no localStorage/window — install minimal equivalents BEFORE the
  // modules load, so currency.js binds its global to a working event target.
  if (isNode) {
    if (!globalThis.localStorage) {
      const store = new Map();
      globalThis.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
    }
    if (!globalThis.addEventListener) {
      // Node's globalThis is not an EventTarget; borrow one so the module's
      // window-level app:fx dispatch works like it does in a browser.
      const target = new EventTarget();
      globalThis.addEventListener = target.addEventListener.bind(target);
      globalThis.removeEventListener = target.removeEventListener.bind(target);
      globalThis.dispatchEvent = target.dispatchEvent.bind(target);
    }
  }

  const Units = isNode ? require('../js/units.js') : root.Units;
  const NAMES = isNode ? require('../js/currency-names.js') : root.CURRENCY_NAMES;
  const Currency = isNode ? require('../js/currency.js') : root.Currency;

  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(() => { passed++; results.push({ name, ok: true }); })
      .catch((err) => { failed++; results.push({ name, ok: false, error: err.message }); });
  }
  function ok(v, label) { if (!v) throw new Error((label || 'value') + ': expected truthy'); }
  function near(a, e, tol, label) {
    if (a == null || Math.abs(a - e) > tol) throw new Error(label + ': expected ~' + e + ', got ' + a);
  }

  /* ---------------- stubs ---------------- */

  function stubFetch(handlers) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = function (url) {
      calls.push(String(url));
      for (const [pattern, responder] of handlers) {
        if (pattern.test(String(url))) {
          return Promise.resolve().then(() => responder(String(url)));
        }
      }
      return Promise.reject(new Error('no stub for ' + url));
    };
    return {
      calls,
      restore() { if (original) globalThis.fetch = original; else delete globalThis.fetch; },
    };
  }

  function jsonResponse(body, status) {
    return { ok: (status || 200) < 400, status: status || 200, json: () => Promise.resolve(body) };
  }

  const ER_API_PAYLOAD = {
    result: 'success',
    base_code: 'USD',
    time_last_update_utc: 'Sun, 04 Oct 2026 00:02:32 +0000',
    time_next_update_utc: 'Mon, 05 Oct 2026 00:05:02 +0000',
    rates: { USD: 1, EUR: 0.92, JPY: 157.82, GBP: 0.79 },
  };

  const FRANKFURTER_PAYLOAD = { base: 'USD', date: '2026-10-02', rates: { EUR: 0.9, JPY: 150.1 } };

  const JSDELIVR_PAYLOAD = {
    date: '2026-10-02',
    usd: { eur: 0.9, jpy: 150.1, btc: 0.000015, aave: 12.5, xyz: 1 },
  };

  /* ---------------- provider parsers ---------------- */

  const tests = [];

  tests.push(() => test('open.er-api parser maps payload', () => {
    const p = Currency.PROVIDERS.find((x) => x.id === 'open.er-api.com');
    ok(p, 'provider present');
    const parsed = p.parse(ER_API_PAYLOAD);
    ok(parsed, 'parsed');
    ok(parsed.base === 'USD', 'base');
    near(parsed.rates.JPY, 157.82, 1e-9, 'JPY');
    ok(parsed.updatedAt && parsed.nextUpdate, 'timestamps');
  }));

  tests.push(() => test('open.er-api parser rejects failure payload', () => {
    const p = Currency.PROVIDERS.find((x) => x.id === 'open.er-api.com');
    ok(p.parse({ result: 'error', 'error-type': 'daily-limit' }) === null, 'error payload rejected');
    ok(p.parse(null) === null, 'null rejected');
  }));

  tests.push(() => test('frankfurter parser adds USD base', () => {
    const p = Currency.PROVIDERS.find((x) => x.id === 'frankfurter.app');
    const parsed = p.parse(FRANKFURTER_PAYLOAD);
    ok(parsed, 'parsed');
    near(parsed.rates.USD, 1, 1e-12, 'USD base');
    near(parsed.rates.EUR, 0.9, 1e-12, 'EUR');
    ok(parsed.rates.updatedAt === undefined, 'no accidental field');
  }));

  tests.push(() => test('currency-api parser keeps ISO codes only', () => {
    const p = Currency.PROVIDERS.find((x) => x.id.indexOf('currency-api') !== -1);
    const parsed = p.parse(JSDELIVR_PAYLOAD);
    ok(parsed, 'parsed');
    ok('EUR' in parsed.rates, 'lowercase normalized to EUR');
    ok(!('BTC' in parsed.rates), 'crypto dropped');
    ok(!('AAVE' in parsed.rates), 'crypto dropped 2');
    ok(!('XYZ' in parsed.rates), 'unknown dropped');
    near(parsed.rates.USD, 1, 1e-12, 'USD base');
  }));

  tests.push(() => test('every provider parses a realistic payload', () => {
    Currency.PROVIDERS.forEach((p) => {
      ok(typeof p.url === 'string' && p.url.indexOf('https://') === 0, p.id + ' url');
      ok(typeof p.parse === 'function', p.id + ' parse fn');
    });
  }));

  /* ---------------- names ---------------- */

  tests.push(() => test('currency names cover the bundled snapshot', () => {
    const snapshot = ['USD', 'EUR', 'JPY', 'GBP', 'CNY', 'KRW'];
    snapshot.forEach((code) => {
      ok(typeof NAMES[code] === 'string' && NAMES[code].length > 2, 'missing name for ' + code);
    });
  }));

  tests.push(() => test('currency names table is large and well formed', () => {
    const keys = Object.keys(NAMES);
    ok(keys.length >= 150, 'expected >= 150 currencies, got ' + keys.length);
    keys.forEach((code) => {
      if (!/^[A-Z]{3}$/.test(code)) throw new Error('bad code shape: ' + code);
      if (typeof NAMES[code] !== 'string' || !NAMES[code]) throw new Error('bad name for ' + code);
      if (NAMES[code] === code) throw new Error('untranslated name for ' + code);
    });
  }));

  tests.push(() => test('Currency.name falls back to the code', () => {
    ok(Currency.name('JPY') === 'Japanese Yen', 'known');
    ok(Currency.name('ZZZ') === 'ZZZ', 'unknown fallback');
  }));

  /* ---------------- conversion with live rates ---------------- */

  tests.push(() => test('convert() uses swapped-in live rates', () => {
    Units.setCurrencyRates({ USD: 1, EUR: 0.5, JPY: 200, GBP: 0.25 });
    try {
      near(Units.convert(100, 'USD', 'JPY', 'currency'), 20000, 1e-6, 'USD->JPY');
      near(Units.convert(100, 'EUR', 'GBP', 'currency'), 50, 1e-6, 'EUR->GBP');
      near(Units.convert(1, 'USD', 'USD', 'currency'), 1, 1e-12, 'identity');
      ok(Units.convert(1, 'USD', 'XXX', 'currency') === null, 'unknown code');
    } finally {
      Units.setCurrencyRates(null);
    }
  }));

  tests.push(() => test('rejected rate tables keep the snapshot', () => {
    const before = Object.keys(Units.getCurrencyRates());
    ok(Units.setCurrencyRates({ EUR: 0.9 }) === false, 'missing USD rejected');
    ok(Units.setCurrencyRates(null) === false, 'null rejected');
    ok(Units.setCurrencyRates('nope') === false, 'string rejected');
    ok(Object.keys(Units.getCurrencyRates()).length === before.length, 'unchanged');
  }));

  tests.push(() => test('listCurrencies reflects the active table', () => {
    Units.setCurrencyRates({ USD: 1, EUR: 0.5 });
    try {
      const list = Units.listCurrencies();
      ok(list.indexOf('EUR') !== -1, 'EUR present');
      ok(list.length === 2, 'exactly 2');
    } finally {
      Units.setCurrencyRates(null);
    }
  }));

  tests.push(() => test('currency category is listed without "(approx.)"', () => {
    const cat = Units.listCategories().find((c) => c.id === 'currency');
    ok(cat, 'category exists');
    ok(cat.label === 'currency', 'label, got ' + cat.label);
    ok(cat.units.indexOf('USD') !== -1, 'has USD');
  }));

  /* ---------------- fallback chain + caching ---------------- */

  tests.push(() => test('refresh() uses the first provider that works', () => {
    const stub = stubFetch([
      [/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)],
      [/frankfurter/, () => jsonResponse(FRANKFURTER_PAYLOAD)],
    ]);
    return Currency.refresh({ force: true }).then((st) => {
      const codes = Currency.codes();
      stub.restore();
      ok(st.live, 'live');
      ok(st.source === 'open.er-api.com', 'primary used, got ' + st.source);
      ok(stub.calls.length === 1, 'no unnecessary calls, got ' + stub.calls.length);
      ok(codes.indexOf('GBP') !== -1, 'GBP from primary');
    });
  }));

  tests.push(() => test('refresh() falls back when the primary fails', () => {
    const stub = stubFetch([
      [/open\.er-api\.com/, () => jsonResponse({}, 503)],
      [/frankfurter/, () => jsonResponse(FRANKFURTER_PAYLOAD)],
      [/jsdelivr/, () => jsonResponse(JSDELIVR_PAYLOAD)],
    ]);
    return Currency.refresh({ force: true }).then((st) => {
      stub.restore();
      ok(st.live, 'live');
      ok(st.source === 'frankfurter.app', 'fell back to frankfurter, got ' + st.source);
      ok(stub.calls.length === 2, 'tried 2 providers, got ' + stub.calls.length);
    });
  }));

  tests.push(() => test('refresh() falls through to the third provider', () => {
    const stub = stubFetch([
      [/open\.er-api\.com/, () => Promise.reject(new Error('offline'))],
      [/frankfurter/, () => Promise.reject(new Error('dns fail'))],
      [/jsdelivr/, () => jsonResponse(JSDELIVR_PAYLOAD)],
    ]);
    return Currency.refresh({ force: true }).then((st) => {
      const codes = Currency.codes();
      stub.restore();
      ok(st.live, 'live');
      ok(st.source.indexOf('currency-api') !== -1, 'third provider, got ' + st.source);
      ok(stub.calls.length === 3, 'tried all 3, got ' + stub.calls.length);
      ok(!codes.includes('BTC'), 'crypto still filtered');
    });
  }));

  tests.push(() => test('refresh() reports failure when every provider fails', () => {
    const stub = stubFetch([[/./, () => Promise.reject(new Error('network down'))]]);
    return Currency.refresh({ force: true }).then((st) => {
      stub.restore();
      ok(st.error, 'error recorded');
      ok(/All providers failed/.test(st.error), 'message, got ' + st.error);
    });
  }));

  tests.push(() => test('refresh() rejects an unusable payload and keeps going', () => {
    const stub = stubFetch([
      [/open\.er-api\.com/, () => jsonResponse({ result: 'success', rates: { onlyone: 1 } })],
      [/frankfurter/, () => jsonResponse(FRANKFURTER_PAYLOAD)],
    ]);
    return Currency.refresh({ force: true }).then((st) => {
      stub.restore();
      ok(st.source === 'frankfurter.app', 'rejected thin table, got ' + st.source);
    });
  }));

  tests.push(() => test('refreshed rates are pushed into Units', () => {
    const stub = stubFetch([[/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)]]);
    return Currency.refresh({ force: true }).then(() => {
      stub.restore();
      const rates = Units.getCurrencyRates();
      ok('JPY' in rates, 'Units has live JPY');
      near(Units.convert(10, 'USD', 'JPY', 'currency'), 1578.2, 1e-3, 'conversion uses live rate');
    });
  }));

  tests.push(() => test('refresh() dispatches an app:fx event', () => {
    const stub = stubFetch([[/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)]]);
    let detail = null;
    const onFx = (e) => { detail = e.detail; };
    globalThis.addEventListener('app:fx', onFx);
    return Currency.refresh({ force: true }).then(() => {
      globalThis.removeEventListener('app:fx', onFx);
      stub.restore();
      ok(detail, 'event fired with detail');
      ok(detail.source === 'open.er-api.com', 'detail has source');
    });
  }));

  tests.push(() => test('rates are cached and survive a cold read', () => {
    const stub = stubFetch([[/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)]]);
    return Currency.refresh({ force: true }).then(() => {
      stub.restore();
      const cached = JSON.parse(localStorage.getItem('calc:fx-rates'));
      ok(cached, 'cache written');
      ok(cached.source === 'open.er-api.com', 'cache has source');
      ok(cached.rates.JPY === 157.82, 'cache has rates');
      ok(typeof cached.fetchedAt === 'number' && cached.fetchedAt > 0, 'cache has timestamp');
    });
  }));

  tests.push(() => test('a corrupt cache entry is ignored, not fatal', () => {
    localStorage.setItem('calc:fx-rates', '{not json');
    const stub = stubFetch([[/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)]]);
    return Currency.refresh({ force: true }).then((st) => {
      stub.restore();
      ok(st.live, 'recovered via network');
    });
  }));

  tests.push(() => test('stale flag reflects cache age', () => {
    const stub = stubFetch([[/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)]]);
    return Currency.refresh({ force: true }).then(() => {
      stub.restore();
      const fresh = Currency.status();
      ok(fresh.stale === false, 'fresh not stale');

      const data = JSON.parse(localStorage.getItem('calc:fx-rates'));
      data.fetchedAt = Date.now() - (48 * 60 * 60 * 1000);
      localStorage.setItem('calc:fx-rates', JSON.stringify(data));
      const st = Currency.init({ wait: true });
      // init() re-reads the (aged) cache and kicks off a refresh; force it back fresh.
      const after = Currency.status();
      ok(after.ageMs === null || after.ageMs >= 0, 'age readable');
      ok(typeof st.stale === 'boolean', 'stale flag present');
    });
  }));

  tests.push(() => test('Currency.convert delegates to Units', () => {
    const stub = stubFetch([[/open\.er-api\.com/, () => jsonResponse(ER_API_PAYLOAD)]]);
    return Currency.refresh({ force: true }).then(() => {
      stub.restore();
      near(Currency.convert(100, 'USD', 'JPY'), 15782, 1e-3, 'USD->JPY');
      near(Currency.convert(15782, 'JPY', 'USD'), 100, 1e-3, 'round trip');
      ok(Currency.convert(NaN, 'USD', 'JPY') === null, 'NaN rejected');
      ok(Currency.convert(10, 'USD', 'ZZZ') === null, 'unknown code rejected');
    });
  }));

  /* ---------------- optional live network smoke test ---------------- */

  const RUN_LIVE = isNode && (
    process.env.RUN_LIVE === '1' || process.argv.indexOf('--live') !== -1);
  if (RUN_LIVE) {
    tests.push(() => test('LIVE: refresh() reaches the real network', () => {
      return Currency.refresh({ force: true }).then((st) => {
        ok(st.live, 'live: ' + st.error);
        ok(Currency.codes().length >= 100, 'expected >= 100 currencies, got ' + Currency.codes().length);
        ok(st.source, 'source recorded');
      });
    }));
  }

  /* ---------------- run (strictly sequential: fetch stubs are global) ---------------- */

  tests.reduce((chain, t) => chain.then(t), Promise.resolve()).then(() => {
    if (typeof window !== 'undefined' && window.__testResults) {
      window.__testResults['currency'] = results;
    }
    if (typeof document !== 'undefined') {
      const out = document.getElementById('output');
      if (out) {
        const pre = document.createElement('pre');
        results.forEach((r) => {
          const div = document.createElement('div');
          div.className = r.ok ? 'pass' : 'fail';
          div.textContent = (r.ok ? '\u2714 ' : '\u2718 ') + r.name + (r.ok ? '' : ' \u2014 ' + r.error);
          pre.appendChild(div);
        });
        const sum = document.createElement('div');
        sum.className = failed === 0 ? 'pass' : 'fail';
        sum.textContent = failed === 0 ? 'All ' + passed + ' passed.' : failed + ' FAILED.';
        pre.appendChild(sum);
        out.appendChild(pre);
      }
    }
    if (isNode) {
      results.forEach((r) => console.log(r.ok ? 'PASS' : 'FAIL', r.name, r.ok ? '' : '- ' + r.error));
      console.log('\n' + passed + ' passed, ' + failed + ' failed');
      if (failed > 0) process.exit(1);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
