'use strict';

/**
 * Live currency exchange rates — no API key required.
 *
 * Providers are tried in order until one returns a usable table. Rates are
 * cached in localStorage with a TTL and refreshed in the background, so the
 * converter still works offline (falling back to the bundled snapshot in
 * js/units.js).
 *
 * Exposed as global `Currency` / `module.exports`.
 */
(function (global) {

  // Resolve the names table from whichever global is in scope (browser window
  // or Node globalThis — the two differ when a window object is shimmed).
  const NAMES = (global && global.CURRENCY_NAMES)
    || (typeof globalThis !== 'undefined' && globalThis.CURRENCY_NAMES)
    || {};

  const LS_KEY = 'calc:fx-rates';
  /** Consider cached rates fresh for 6 hours. */
  const TTL_MS = 6 * 60 * 60 * 1000;
  /** Per-provider request timeout. */
  const TIMEOUT_MS = 8000;

  /**
   * Rate providers, in priority order.
   * `parse` maps a decoded JSON payload to {base, rates, updatedAt, nextUpdate}.
   */
  const PROVIDERS = [
    {
      id: 'open.er-api.com',
      label: 'ExchangeRate-API (open)',
      url: 'https://open.er-api.com/v6/latest/USD',
      parse(json) {
        if (!json || json.result !== 'success' || !json.rates) return null;
        return {
          base: json.base_code || 'USD',
          rates: json.rates,
          updatedAt: json.time_last_update_utc || null,
          nextUpdate: json.time_next_update_utc || null,
        };
      },
    },
    {
      id: 'frankfurter.app',
      label: 'Frankfurter (ECB)',
      url: 'https://api.frankfurter.app/latest?from=USD',
      parse(json) {
        if (!json || !json.rates) return null;
        const rates = { USD: 1 };
        for (const [code, value] of Object.entries(json.rates)) {
          const n = Number(value);
          if (isFinite(n)) rates[code] = n;
        }
        return {
          base: json.base || 'USD',
          rates: rates,
          updatedAt: json.date ? json.date + 'T00:00:00Z' : null,
          nextUpdate: null,
        };
      },
    },
    {
      id: 'currency-api (jsDelivr)',
      label: 'Currency API (jsDelivr)',
      url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
      parse(json) {
        if (!json || !json.usd) return null;
        const rates = {};
        for (const [rawCode, value] of Object.entries(json.usd)) {
          const code = String(rawCode).toUpperCase();
          const n = Number(value);
          if (!isFinite(n)) continue;
          // This source mixes in crypto and legacy tickers that are
          // indistinguishable by shape, so keep only codes we have a
          // currency name for (i.e. known ISO 4217 fiat).
          if (!NAMES[code]) continue;
          rates[code] = n;
        }
        rates.USD = 1;
        return { base: 'USD', rates: rates, updatedAt: json.date || null, nextUpdate: null };
      },
    },
  ];

  /* ---------------- state ---------------- */

  let current = {
    rates: null,          // {CODE: ratePerUsd}
    base: 'USD',
    source: null,         // provider id
    sourceLabel: null,
    updatedAt: null,      // ISO string from provider
    nextUpdate: null,     // ISO string from provider, when known
    fetchedAt: 0,         // epoch ms when we stored it
    error: null,
  };

  let inflight = null;

  /* ---------------- storage ---------------- */

  function storage() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  function readCache() {
    const ls = storage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(LS_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.rates || typeof data.rates !== 'object') return null;
      return data;
    } catch (e) { return null; }
  }

  function writeCache(state) {
    const ls = storage();
    if (!ls) return;
    try {
      ls.setItem(LS_KEY, JSON.stringify({
        rates: state.rates,
        base: state.base,
        source: state.source,
        sourceLabel: state.sourceLabel,
        updatedAt: state.updatedAt,
        nextUpdate: state.nextUpdate,
        fetchedAt: state.fetchedAt,
      }));
    } catch (e) { /* quota or private mode — cache is optional */ }
  }

  /* ---------------- fetching ---------------- */

  function fetchJson(url) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('fetch unavailable'));
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
    return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (timer) clearTimeout(timer);
        return json;
      })
      .catch(function (err) {
        if (timer) clearTimeout(timer);
        throw err;
      });
  }

  /** Try each provider in order; return the first usable rate table. */
  function fetchWithFallback() {
    const errors = [];

    function attempt(i) {
      if (i >= PROVIDERS.length) {
        return Promise.reject(new Error(
          errors.length ? 'All providers failed: ' + errors.join('; ') : 'No providers available'));
      }
      const provider = PROVIDERS[i];
      return fetchJson(provider.url)
        .then(function (json) {
          const parsed = provider.parse(json);
          if (!parsed || !parsed.rates || Object.keys(parsed.rates).length < 2) {
            throw new Error('unusable payload');
          }
          return {
            provider: provider,
            base: parsed.base || 'USD',
            rates: parsed.rates,
            updatedAt: parsed.updatedAt,
            nextUpdate: parsed.nextUpdate,
          };
        })
        .catch(function (err) {
          errors.push(provider.id + ': ' + (err && err.message ? err.message : 'error'));
          return attempt(i + 1);
        });
    }

    return attempt(0);
  }

  /* ---------------- public API ---------------- */

  /** Current status object (safe to read at any time). */
  function status() {
    const now = Date.now();
    const age = current.fetchedAt ? now - current.fetchedAt : Infinity;
    return {
      rates: current.rates,
      base: current.base,
      source: current.source,
      sourceLabel: current.sourceLabel,
      updatedAt: current.updatedAt,
      nextUpdate: current.nextUpdate,
      fetchedAt: current.fetchedAt,
      ageMs: current.fetchedAt ? age : null,
      stale: !current.fetchedAt || age > TTL_MS,
      live: !!current.rates,
      error: current.error,
    };
  }

  /**
   * Load cached rates (if any) synchronously and kick off a refresh when stale.
   * Safe to call on page load. Returns the status after cache hydration.
   */
  function init(options) {
    options = options || {};
    const cached = readCache();
    if (cached && cached.rates) {
      current = {
        rates: cached.rates,
        base: cached.base || 'USD',
        source: cached.source || null,
        sourceLabel: cached.sourceLabel || null,
        updatedAt: cached.updatedAt || null,
        nextUpdate: cached.nextUpdate || null,
        fetchedAt: cached.fetchedAt || 0,
        error: null,
      };
      applyRates();
    }
    if (!current.rates || Date.now() - current.fetchedAt > TTL_MS) {
      refresh({ force: !options.wait });
    }
    return status();
  }

  /**
   * Fetch fresh rates from the provider chain.
   * @param {{force?: boolean}} [options]
   * @returns {Promise<object>} status
   */
  function refresh(options) {
    options = options || {};
    if (inflight && !options.force) return inflight;

    inflight = fetchWithFallback()
      .then(function (result) {
        current = {
          rates: result.rates,
          base: result.base,
          source: result.provider.id,
          sourceLabel: result.provider.label,
          updatedAt: result.updatedAt,
          nextUpdate: result.nextUpdate,
          fetchedAt: Date.now(),
          error: null,
        };
        writeCache(current);
        applyRates();
        emit();
        inflight = null;
        return status();
      })
      .catch(function (err) {
        current.error = (err && err.message) || 'refresh failed';
        inflight = null;
        emit();
        return status();
      });

    return inflight;
  }

  /** Push the active rate table into the Units converter. */
  function applyRates() {
    if (!current.rates || typeof global.Units === 'undefined') return;
    global.Units.setCurrencyRates(current.rates);
  }

  function emit() {
    if (typeof global.CustomEvent === 'function' && typeof global.dispatchEvent === 'function') {
      global.dispatchEvent(new global.CustomEvent('app:fx', { detail: status() }));
    }
  }

  /** All available currency codes, sorted. */
  function codes() {
    const rates = current.rates || (global.Units && global.Units.getCurrencyRates
      ? global.Units.getCurrencyRates() : null);
    return rates ? Object.keys(rates).sort() : [];
  }

  /** Human-readable name for a code, falling back to the code itself. */
  function name(code) {
    return NAMES[code] || code;
  }

  /** [{code, name}] for dropdowns. */
  function list() {
    return codes().map(function (code) {
      return { code: code, name: name(code) };
    });
  }

  /**
   * Convert between currencies using live rates when available.
   * @param {number} value
   * @param {string} from  ISO code
   * @param {string} to    ISO code
   * @returns {number|null}
   */
  function convert(value, from, to) {
    if (typeof value !== 'number' || !isFinite(value)) return null;
    if (typeof global.Units === 'undefined') return null;
    return global.Units.convert(value, from, to, 'currency');
  }

  const Currency = {
    init,
    refresh,
    status,
    codes,
    name,
    list,
    convert,
    NAMES: NAMES,
    PROVIDERS: PROVIDERS,
    TTL_MS: TTL_MS,
  };

  global.Currency = Currency;
  if (typeof module !== 'undefined' && module.exports) module.exports = Currency;
})(typeof window !== 'undefined' ? window : globalThis);
