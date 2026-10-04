'use strict';

/** Unit tests for the i18n module. */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const I18n = isNode ? require('../js/i18n.js') : root.I18n;

  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try { fn(); passed++; results.push({ name, ok: true }); }
    catch (err) { failed++; results.push({ name, ok: false, error: err.message }); }
  }
  function ok(v, label) { if (!v) throw new Error(label + ': expected truthy'); }

  test('translate en/ja', () => {
    ok(I18n.translate('en', 'graph.title') === 'Graph', 'en');
    ok(I18n.translate('ja', 'graph.title') === 'グラフ', 'ja');
  });

  test('unknown key falls back to key itself', () => {
    ok(I18n.translate('en', 'nope.nope') === 'nope.nope', 'fallback');
  });

  test('unknown lang falls back to en', () => {
    ok(I18n.translate('fr', 'graph.title') === 'Graph', 'fr->en');
  });

  test('every ja key exists in en', () => {
    const enKeys = Object.keys(I18n.DICTS.en);
    Object.keys(I18n.DICTS.ja).forEach((k) => ok(enKeys.indexOf(k) !== -1, 'missing en key ' + k));
  });

  test('every en key exists in ja', () => {
    const jaKeys = Object.keys(I18n.DICTS.ja);
    Object.keys(I18n.DICTS.en).forEach((k) => ok(jaKeys.indexOf(k) !== -1, 'missing ja key ' + k));
  });

  if (typeof window !== 'undefined' && window.__testResults) {
    window.__testResults['i18n'] = results;
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
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  }
})(typeof window !== 'undefined' ? window : globalThis);
