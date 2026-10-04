'use strict';

/**
 * Behaviour tests for the unit conversion module.
 * Numeric factor coverage lives in units-factors.test.js.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const Units = isNode ? require('../js/units.js') : root.Units;

  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try { fn(); passed++; results.push({ name, ok: true }); }
    catch (err) { failed++; results.push({ name, ok: false, error: err.message }); }
  }
  function ok(v, label) { if (!v) throw new Error(label + ': expected truthy'); }
  function near(a, e, tol, label) {
    if (a == null || Math.abs(a - e) > tol) throw new Error(label + ': expected ~' + e + ', got ' + a);
  }

  /* ---------------- original smoke tests ---------------- */

  test('length: 1 mile ~ 1609.344 m', () => {
    near(Units.convert(1, 'mile', 'm', 'length'), 1609.344, 1e-6, 'mile->m');
  });

  test('length: 1 km = 1000 m = ~0.6214 mile', () => {
    near(Units.convert(1, 'km', 'mile', 'length'), 0.621371, 1e-4, 'km->mile');
  });

  test('mass: 1 kg = 1000 g', () => {
    near(Units.convert(1, 'kg', 'g', 'mass'), 1000, 1e-9, 'kg->g');
  });

  test('area: 1 ha = 10000 m2', () => {
    near(Units.convert(1, 'ha', 'm2', 'area'), 10000, 1e-9, 'ha->m2');
  });

  test('volume: 1 gal (US) ~ 3.78541 l', () => {
    near(Units.convert(1, 'gal (US)', 'l', 'volume'), 3.785411784, 1e-8, 'gal US->l');
  });

  test('speed: 36 km/h = 10 m/s', () => {
    near(Units.convert(36, 'km/h', 'm/s', 'speed'), 10, 1e-9, 'kmh->ms');
  });

  test('time: 1 day = 86400 s', () => {
    near(Units.convert(1, 'day', 's', 'time'), 86400, 1e-9, 'day->s');
  });

  test('temperature: 0 C = 32 F = 273.15 K', () => {
    near(Units.convert(0, 'C', 'F', 'temperature'), 32, 1e-9, 'C->F');
    near(Units.convert(0, 'C', 'K', 'temperature'), 273.15, 1e-9, 'C->K');
  });

  test('temperature: 212 F = 100 C', () => {
    near(Units.convert(212, 'F', 'C', 'temperature'), 100, 1e-9, 'F->C');
  });

  /* ---------------- currency direction (regression) ----------------
   * The rate table is "units per 1 USD". Converting 1 USD to JPY must give a
   * LARGE number; converting 1 JPY to USD must give a SMALL one. This pair is
   * deliberately asymmetric so an inverted ratio cannot pass by coincidence. */

  test('currency: 1 USD = 149.5 JPY (static rate)', () => {
    near(Units.convert(1, 'USD', 'JPY', 'currency'), 149.5, 1e-9, 'USD->JPY');
  });

  test('currency: direction is not inverted', () => {
    const usdToJpy = Units.convert(1, 'USD', 'JPY', 'currency');
    const jpyToUsd = Units.convert(1, 'JPY', 'USD', 'currency');
    ok(usdToJpy > 100, 'USD->JPY should be > 100, got ' + usdToJpy);
    ok(jpyToUsd < 0.01, 'JPY->USD should be < 0.01, got ' + jpyToUsd);
    near(usdToJpy * jpyToUsd, 1, 1e-12, 'round trip');
  });

  test('currency: round trip through USD is lossless', () => {
    const rates = { USD: 1, EUR: 0.92, JPY: 149.5, GBP: 0.79 };
    Units.setCurrencyRates(rates);
    try {
      const viaUsd = Units.convert(Units.convert(50, 'EUR', 'USD', 'currency'), 'USD', 'JPY', 'currency');
      near(viaUsd, Units.convert(50, 'EUR', 'JPY', 'currency'), 1e-9, 'cross via USD');
    } finally {
      Units.setCurrencyRates(null);
    }
  });

  /* ---------------- affine: extended temperature scales ---------------- */

  test('temperature: Rankine', () => {
    near(Units.convert(0, 'C', 'R', 'temperature'), 491.67, 1e-9, 'C->R');
    near(Units.convert(491.67, 'R', 'C', 'temperature'), 0, 1e-9, 'R->C');
  });

  test('temperature: Reaumur', () => {
    near(Units.convert(100, 'C', 'Re', 'temperature'), 80, 1e-9, 'C->Re');
    near(Units.convert(80, 'Re', 'C', 'temperature'), 100, 1e-9, 'Re->C');
  });

  test('temperature: Romer (0 C = 7.5 Ro, 100 C = 60 Ro)', () => {
    near(Units.convert(0, 'C', 'Ro', 'temperature'), 7.5, 1e-9, 'C->Ro');
    near(Units.convert(100, 'C', 'Ro', 'temperature'), 60, 1e-9, 'C->Ro');
  });

  test('temperature: Newton (100 C = 33 N)', () => {
    near(Units.convert(100, 'C', 'N', 'temperature'), 33, 1e-9, 'C->N');
    near(Units.convert(33, 'N', 'C', 'temperature'), 100, 1e-9, 'N->C');
  });

  test('temperature: Delisle (150 De = 0 C, 0 De = 100 C)', () => {
    near(Units.convert(0, 'C', 'De', 'temperature'), 150, 1e-9, 'C->De');
    near(Units.convert(150, 'De', 'C', 'temperature'), 0, 1e-9, 'De->C');
    near(Units.convert(100, 'C', 'De', 'temperature'), 0, 1e-9, '100C->De');
  });

  /* ---------------- inverted: fuel economy ---------------- */

  test('fuel economy: 10 L/100km = ~23.5 US mpg', () => {
    near(Units.convert(10, 'L/100km', 'mpg (US)', 'fuel-economy'), 23.5214583, 1e-6, 'L/100km->mpg US');
  });

  test('fuel economy: round trip is lossless', () => {
    const there = Units.convert(8, 'L/100km', 'mpg (imp)', 'fuel-economy');
    near(Units.convert(there, 'mpg (imp)', 'L/100km', 'fuel-economy'), 8, 1e-9, 'round trip');
  });

  test('fuel economy: zero efficiency is rejected, not infinite', () => {
    ok(Units.convert(0, 'L/100km', 'mpg (US)', 'fuel-economy') === null, 'zero -> null');
    ok(Units.convert(0, 'km/L', 'L/100km', 'fuel-economy') === null, 'zero km/L -> null');
  });

  test('fuel economy: US gallon is smaller than imperial', () => {
    // 1 US mile per gallon covers more km/L than 1 imperial mile per gallon.
    const usd = Units.convert(1, 'mpg (US)', 'km/L', 'fuel-economy');
    const imp = Units.convert(1, 'mpg (imp)', 'km/L', 'fuel-economy');
    ok(usd > imp, 'US mpg should be more km/L: ' + usd + ' vs ' + imp);
  });

  /* ---------------- error handling ---------------- */

  test('unknown category/unit returns null', () => {
    ok(Units.convert(1, 'x', 'y', 'nope') === null, 'bad category');
    ok(Units.convert(1, 'x', 'm', 'length') === null, 'bad unit');
  });

  test('cross-category unit use returns null', () => {
    ok(Units.convert(1, 'm', 'kg', 'mass') === null, 'm in mass');
    ok(Units.convert(1, 'kg', 'm', 'length') === null, 'kg in length');
  });

  test('NaN and Infinity are rejected', () => {
    ok(Units.convert(NaN, 'm', 'ft', 'length') === null, 'NaN');
    ok(Units.convert(Infinity, 'm', 'ft', 'length') === null, 'Infinity');
  });

  test('string input is rejected', () => {
    ok(Units.convert('5', 'm', 'ft', 'length') === null, 'string');
  });

  /* ---------------- catalogue ---------------- */

  test('listCategories includes every category', () => {
    const cats = Units.listCategories().map((c) => c.id);
    const expected = ['length', 'mass', 'area', 'volume', 'speed', 'time', 'temperature',
      'currency', 'data-storage', 'pressure', 'energy', 'power', 'angle', 'frequency',
      'density', 'force', 'flow-rate', 'fuel-economy', 'paper-size'];
    expected.forEach((id) => ok(cats.indexOf(id) !== -1, 'missing ' + id));
    ok(cats.length === expected.length, 'expected ' + expected.length + ' categories, got ' + cats.length);
  });

  test('listCategories orders by group for optgroup rendering', () => {
    const groups = Units.listGroups();
    const seen = Units.listCategories().map((c) => groups.indexOf(c.group));
    seen.forEach((idx, i) => {
      if (idx === -1) throw new Error('unknown group at index ' + i);
      if (i > 0 && idx < seen[i - 1]) throw new Error('group order breaks at index ' + i);
    });
  });

  test('every category has a label, group and at least 2 units', () => {
    Units.listCategories().forEach((c) => {
      ok(typeof c.label === 'string' && c.label.length, c.id + ': label');
      ok(typeof c.group === 'string' && c.group, c.id + ': group');
      ok(Array.isArray(c.units) && c.units.length >= 2, c.id + ': needs >= 2 units');
    });
  });

  test('categoryNote flags the tricky categories only', () => {
    ok(/ISO 216/.test(Units.categoryNote('paper-size')), 'paper-size note');
    ok(/1024/.test(Units.categoryNote('data-storage')), 'data-storage note');
    ok(Units.categoryNote('length') === '', 'length has no note');
  });

  test('no duplicate unit names within a category', () => {
    Units.listCategories().forEach((c) => {
      const seen = new Set();
      c.units.forEach((u) => {
        if (seen.has(u)) throw new Error(c.id + ': duplicate unit ' + u);
        seen.add(u);
      });
    });
  });

  test('every linear category round trips through its base unit', () => {
    const cats = Units.listCategories().filter((c) => Units.UNITS[c.id]);
    ok(cats.length > 0, 'linear categories present');
    cats.forEach((c) => {
      const base = Units.UNITS[c.id].base;
      const sample = c.units[0];
      const there = Units.convert(7.5, sample, base, c.id);
      const back = Units.convert(there, base, sample, c.id);
      near(back, 7.5, 1e-9, c.id + ' round trip via ' + base);
    });
  });

  if (typeof window !== 'undefined' && window.__testResults) {
    window.__testResults['units'] = results;
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
})(typeof window !== 'undefined' ? window : globalThis);
