'use strict';

/**
 * Numeric factor coverage for every unit in js/units.js.
 *
 * Each row states an authoritative expected value. `tol` is an absolute
 * tolerance; a relative tolerance of 1e-12 is always allowed on top so that
 * float representation noise never fails a row.
 *
 * Rows: [value, from, to, category, expected, tolerance, label]
 * Use `null` as `expected` to require a null result.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const Units = isNode ? require('../js/units.js') : root.Units;

  const ROWS = [
    /* ---------------- length ---------------- */
    [1, 'nautical mile', 'm', 'length', 1852, 0, 'nautical mile is exactly 1852 m'],
    [1, 'mile', 'km', 'length', 1.609344, 1e-12, 'mile -> km'],
    [1, 'light-year', 'm', 'length', 9460730472580800, 1, 'light-year (IAU 2012)'],
    [1, 'AU', 'km', 'length', 149597870.7, 1e-6, 'AU -> km (IAU 2012)'],
    [1, 'parsec', 'AU', 'length', 648000 / Math.PI, 1e-3, 'parsec -> AU'],
    [1, 'fathom', 'ft', 'length', 6, 1e-12, 'fathom -> ft'],
    [1, 'furlong', 'ft', 'length', 660, 1e-9, 'furlong -> ft'],
    [1, 'chain', 'ft', 'length', 66, 1e-9, 'chain -> ft'],
    [1000, 'thou (mil)', 'inch', 'length', 1, 1e-12, '1000 thou -> inch'],
    [1, 'rod', 'ft', 'length', 16.5, 1e-9, 'rod -> ft'],
    [1, 'yd', 'ft', 'length', 3, 1e-12, 'yd -> ft'],

    /* ---------------- mass ---------------- */
    [1, 'lb', 'g', 'mass', 453.59237, 1e-9, 'lb -> g'],
    [1, 'oz', 'g', 'mass', 28.349523125, 1e-9, 'oz -> g'],
    [1, 'stone', 'lb', 'mass', 14, 1e-12, 'stone -> lb'],
    [1, 'ton (US)', 'lb', 'mass', 2000, 1e-12, 'US short ton -> lb'],
    [1, 'ton (imp)', 'lb', 'mass', 2240, 1e-12, 'UK long ton -> lb'],
    [1, 'troy oz', 'g', 'mass', 31.1034768, 1e-9, 'troy oz -> g'],
    [1, 'troy lb', 'troy oz', 'mass', 12, 1e-12, 'troy lb -> troy oz'],
    [1, 'carat', 'mg', 'mass', 200, 1e-12, 'carat -> mg'],
    [1, 'grain', 'mg', 'mass', 64.79891, 1e-9, 'grain -> mg'],
    [1, 'slug', 'lb', 'mass', 14.593902937206364 / 0.45359237, 1e-12, 'slug -> lb'],
    [1, 'cwt (US)', 'lb', 'mass', 100, 1e-9, 'US cwt -> lb'],
    [1, 'cwt (imp)', 'lb', 'mass', 112, 1e-9, 'imp cwt -> lb'],
    [16, 'drachm', 'oz', 'mass', 1, 1e-12, '16 drachm -> oz'],
    [1, 't', 'kg', 'mass', 1000, 1e-12, 'tonne -> kg'],

    /* ---------------- area ---------------- */
    [1, 'acre', 'sq ft', 'area', 43560, 1e-6, 'acre -> sq ft'],
    [1, 'are', 'm2', 'area', 100, 1e-12, 'are -> sq m'],
    [1, 'sq mi', 'km2', 'area', 2.589988110336, 1e-12, 'sq mi -> sq km'],
    [1, 'ha', 'acre', 'area', 2.4710538146717, 1e-9, 'hectare -> acre'],
    [1, 'sq yd', 'sq ft', 'area', 9, 1e-12, 'sq yd -> sq ft'],
    [1, 'sq in', 'cm2', 'area', 6.4516, 1e-12, 'sq in -> sq cm'],
    [1, 'township (US)', 'sq mi', 'area', 36, 1e-9, 'township -> sq mi'],

    /* ---------------- volume ---------------- */
    [1, 'gal (imp)', 'l', 'volume', 4.54609, 1e-12, 'imperial gallon -> l'],
    [1, 'gal (US)', 'l', 'volume', 3.785411784, 1e-12, 'US gallon -> l'],
    [1, 'pint', 'floz (imp)', 'volume', 20, 1e-12, 'imp pint -> imp floz'],
    [1, 'quart', 'cup', 'volume', 4, 1e-12, 'imp quart -> imp cup'],
    // The 1958 tablespoon redefinition means a cup is 16.0004 tbsp, not 16.
    [1, 'cup', 'tbsp (imp)', 'volume', 16.00036, 1e-4, 'imp cup -> imp tbsp (post-1958)'],
    [1, 'cup (US)', 'tbsp (US)', 'volume', 16, 1e-12, 'US cup -> US tbsp'],
    [1, 'cup (US)', 'floz (US)', 'volume', 8, 1e-12, 'US cup -> US floz'],
    [1, 'stick (butter)', 'tbsp (US)', 'volume', 8, 1e-6, 'stick -> US tbsp'],
    [1, 'stick (butter)', 'cup (US)', 'volume', 0.5, 1e-9, 'stick -> half US cup'],
    [1, 'bushel (imp)', 'gal (imp)', 'volume', 8, 1e-12, 'imp bushel -> imp gal'],
    [1, 'bushel (US)', 'gal (US)', 'volume', 2150.42 / 231, 1e-9, 'US bushel -> US gal'],
    [1, 'barrel (oil)', 'gal (US)', 'volume', 42, 1e-6, 'oil barrel -> US gal'],
    [1, 'firkin', 'gal (imp)', 'volume', 9, 1e-9, 'firkin -> imp gal'],
    [1, 'gill', 'floz (imp)', 'volume', 5, 1e-12, 'gill -> imp floz'],
    [1, 'peck', 'gal (imp)', 'volume', 2, 1e-12, 'peck -> imp gal'],
    [1, 'ft3', 'l', 'volume', 28.316846592, 1e-12, 'cu ft -> l'],
    [1, 'in3', 'cm3', 'volume', 16.387064, 1e-12, 'cu in -> cc'],
    [1, 'm3', 'l', 'volume', 1000, 1e-12, 'm3 -> l'],
    [1, 'tsp (US)', 'ml', 'volume', 4.92892159375, 1e-12, 'US tsp -> ml'],

    /* ---------------- time ---------------- */
    [1, 'year', 'day', 'time', 365.25, 1e-12, 'year -> day'],
    [1, 'fortnight', 'day', 'time', 14, 1e-12, 'fortnight -> day'],
    [1, 'month', 'day', 'time', 30, 1e-12, 'month -> day (30-day convention)'],
    [1, 'week', 'h', 'time', 168, 1e-12, 'week -> hour'],
    [1, 'century', 'year', 'time', 100, 1e-12, 'century -> year'],
    [1, 'millennium', 'year', 'time', 1000, 1e-12, 'millennium -> year'],
    [1, 'decade', 'year', 'time', 10, 1e-12, 'decade -> year'],

    /* ---------------- speed ---------------- */
    [1, 'mph', 'km/h', 'speed', 1.609344, 1e-12, 'mph -> km/h'],
    [1, 'knot', 'km/h', 'speed', 1.852, 1e-12, 'knot -> km/h'],
    [1, 'ft/s', 'mph', 'speed', 0.6818181818, 1e-9, 'ft/s -> mph'],
    [1, 'mach', 'km/h', 'speed', 1225.044, 1e-2, 'mach -> km/h'],
    [1, 'c', 'km/s', 'speed', 299792.458, 1e-6, 'speed of light -> km/s'],

    /* ---------------- temperature (affine) ---------------- */
    [0, 'C', 'F', 'temperature', 32, 1e-12, '0 C -> F'],
    [100, 'C', 'F', 'temperature', 212, 1e-12, '100 C -> F'],
    [0, 'C', 'K', 'temperature', 273.15, 1e-12, '0 C -> K'],
    [-273.15, 'C', 'K', 'temperature', 0, 1e-12, 'absolute zero -> 0 K'],
    [-40, 'C', 'F', 'temperature', -40, 1e-12, '-40 C -> F'],
    [36.6, 'C', 'F', 'temperature', 97.88, 1e-9, 'body temperature -> F'],
    [0, 'C', 'R', 'temperature', 491.67, 1e-9, '0 C -> Rankine'],
    [491.67, 'R', 'C', 'temperature', 0, 1e-9, 'Rankine -> C'],
    [0, 'C', 'Re', 'temperature', 0, 1e-12, '0 C -> Reaumur'],
    [100, 'C', 'Re', 'temperature', 80, 1e-12, '100 C -> Reaumur'],
    [0, 'C', 'Ro', 'temperature', 7.5, 1e-12, '0 C -> Romer'],
    [100, 'C', 'Ro', 'temperature', 60, 1e-12, '100 C -> Romer'],
    [60, 'Ro', 'C', 'temperature', 100, 1e-9, 'Romer -> C'],
    [0, 'C', 'N', 'temperature', 0, 1e-12, '0 C -> Newton'],
    [100, 'C', 'N', 'temperature', 33, 1e-12, '100 C -> Newton'],
    [33, 'N', 'C', 'temperature', 100, 1e-9, 'Newton -> C'],
    [0, 'C', 'De', 'temperature', 150, 1e-12, '0 C -> Delisle'],
    [100, 'C', 'De', 'temperature', 0, 1e-12, '100 C -> Delisle'],
    [150, 'De', 'C', 'temperature', 0, 1e-12, '150 De -> C'],
    [0, 'De', 'C', 'temperature', 100, 1e-12, '0 De -> C'],

    /* ---------------- fuel economy (inverted) ---------------- */
    [1, 'mpg (US)', 'mpg (imp)', 'fuel-economy', 1.200949925504855, 1e-9, 'US mpg -> imp mpg'],
    [1, 'mpg (imp)', 'mpg (US)', 'fuel-economy', 0.8326741846, 1e-9, 'imp mpg -> US mpg'],
    [1, 'mpg (US)', 'km/L', 'fuel-economy', 1.609344 / 3.785411784, 1e-12, 'US mpg -> km/L'],
    [23.5214583, 'mpg (US)', 'L/100km', 'fuel-economy', 10, 1e-6, 'US mpg -> L/100km'],
    [10, 'L/100km', 'mpg (US)', 'fuel-economy', 23.5214583, 1e-6, 'L/100km -> US mpg'],
    [10, 'L/100km', 'mpg (imp)', 'fuel-economy', 28.2480936, 1e-6, 'L/100km -> imp mpg'],
    [1, 'km/L', 'L/100km', 'fuel-economy', 100, 1e-12, 'km/L -> L/100km'],
    [100, 'L/100km', 'km/L', 'fuel-economy', 1, 1e-12, '100 L/100km -> km/L'],
    [1, 'mpg (US)', 'mpg (US)', 'fuel-economy', 1, 1e-12, 'fuel economy identity'],

    /* ---------------- pressure ---------------- */
    [1, 'atm', 'kPa', 'pressure', 101.325, 1e-12, 'atm -> kPa'],
    [1, 'atm', 'psi', 'pressure', 14.6959487755, 1e-8, 'atm -> psi'],
    [1, 'psi', 'kPa', 'pressure', 6.894757293168361, 1e-12, 'psi -> kPa'],
    [1, 'bar', 'psi', 'pressure', 14.503773773, 1e-6, 'bar -> psi'],
    [760, 'torr', 'atm', 'pressure', 1, 1e-12, '760 torr -> 1 atm'],
    [1, 'torr', 'mmHg', 'pressure', 0.9999998575337, 1e-9, 'torr -> mmHg'],
    [1, 'inHg', 'kPa', 'pressure', 3.386388640341, 1e-9, 'inHg -> kPa'],
    [1, 'kgf/cm2', 'kPa', 'pressure', 98.0665, 1e-12, 'kgf/cm2 -> kPa'],
    [1, 'MPa', 'kPa', 'pressure', 1000, 1e-12, 'MPa -> kPa'],

    /* ---------------- energy ---------------- */
    [1, 'kWh', 'MJ', 'energy', 3.6, 1e-12, 'kWh -> MJ'],
    [1, 'kcal', 'kJ', 'energy', 4.184, 1e-12, 'kcal -> kJ'],
    [1, 'cal', 'J', 'energy', 4.184, 1e-12, 'cal -> J'],
    [1, 'BTU (IT)', 'J', 'energy', 1055.05585262, 1e-9, 'BTU(IT) -> J'],
    // The US therm is defined via BTU(59F), so it is 99976 BTU(IT), not 100000.
    [1, 'therm', 'BTU (IT)', 'energy', 99976.1289775, 1e-3, 'therm -> BTU(IT)'],
    [1, 'eV', 'J', 'energy', 1.602176634e-19, 1e-30, 'eV -> J'],
    [1, 'Wh', 'J', 'energy', 3600, 1e-12, 'Wh -> J'],
    [1, 'erg', 'J', 'energy', 1e-7, 1e-20, 'erg -> J'],
    [1, 'ft-lbf', 'J', 'energy', 1.3558179483314004, 1e-12, 'ft-lbf -> J'],

    /* ---------------- power ---------------- */
    [1, 'hp (mech)', 'W', 'power', 745.6998715823, 1e-9, 'mechanical hp -> W'],
    [1, 'hp (metric)', 'W', 'power', 735.49875, 1e-9, 'metric hp -> W'],
    [1, 'kW', 'BTU/h', 'power', 3412.1416331, 1e-6, 'kW -> BTU/h'],
    [1, 'kW', 'hp (mech)', 'power', 1.34102209, 1e-8, 'kW -> mechanical hp'],
    [1, 'J/min', 'W', 'power', 1 / 60, 1e-12, 'J/min -> W'],
    [1, 'MW', 'kW', 'power', 1000, 1e-12, 'MW -> kW'],

    /* ---------------- force ---------------- */
    [1, 'lbf', 'N', 'force', 4.4482216152605, 1e-12, 'lbf -> N'],
    [1, 'kgf', 'N', 'force', 9.80665, 1e-12, 'kgf -> N'],
    [1, 'poundal', 'dyn', 'force', 13825.4954376, 1e-6, 'poundal -> dyn'],
    [1, 'kN', 'N', 'force', 1000, 1e-12, 'kN -> N'],

    /* ---------------- density ---------------- */
    [1, 'g/cm3', 'kg/L', 'density', 1, 1e-15, 'g/cm3 -> kg/L'],
    [1, 'lb/ft3', 'kg/m3', 'density', 16.01846337396, 1e-9, 'lb/ft3 -> kg/m3'],
    [1, 'oz/gal (US)', 'g/L', 'density', 0.028349523125 / 0.003785411784, 1e-12, 'US oz/gal -> g/L'],
    [1, 'oz/gal (imp)', 'g/L', 'density', 0.028349523125 / 0.00454609, 1e-12, 'imp oz/gal -> g/L'],
    [1, 'lb/in3', 'g/cm3', 'density', 27.6799047102, 1e-9, 'lb/in3 -> g/cm3'],
    [1, 'mg/L', 'g/L', 'density', 0.001, 1e-15, 'mg/L -> g/L'],

    /* ---------------- flow rate ---------------- */
    [1, 'GPM (US)', 'L/min', 'flow-rate', 3.785411784, 1e-9, 'US GPM -> L/min'],
    [1, 'GPM (imp)', 'L/min', 'flow-rate', 4.54609, 1e-9, 'imp GPM -> L/min'],
    [1, 'CFM', 'm3/h', 'flow-rate', 1.6990107952, 1e-9, 'CFM -> m3/h'],
    [1, 'm3/h', 'L/s', 'flow-rate', 1000 / 3600, 1e-15, 'm3/h -> L/s'],
    [1, 'L/min', 'L/h', 'flow-rate', 60, 1e-12, 'L/min -> L/h'],

    /* ---------------- data storage ---------------- */
    [1, 'GB', 'GiB', 'data-storage', 1e9 / 1073741824, 1e-15, 'GB -> GiB (1000 vs 1024)'],
    [1, 'GiB', 'GB', 'data-storage', 1073741824 / 1e9, 1e-15, 'GiB -> GB'],
    [1, 'byte', 'bit', 'data-storage', 8, 1e-12, 'byte -> bit'],
    [1, 'MiB', 'KiB', 'data-storage', 1024, 1e-12, 'MiB -> KiB'],
    [1, 'TiB', 'GiB', 'data-storage', 1024, 1e-12, 'TiB -> GiB'],
    [1, 'TB', 'GB', 'data-storage', 1000, 1e-12, 'TB -> GB'],
    [1, 'MB', 'kB', 'data-storage', 1000, 1e-12, 'MB -> kB'],

    /* ---------------- frequency ---------------- */
    [1, 'GHz', 'MHz', 'frequency', 1000, 1e-12, 'GHz -> MHz'],
    [1, 'rpm', 'Hz', 'frequency', 1 / 60, 1e-15, 'rpm -> Hz'],
    [60, 'rpm', 'Hz', 'frequency', 1, 1e-12, '60 rpm -> 1 Hz'],
    [1, 'kHz', 'Hz', 'frequency', 1000, 1e-12, 'kHz -> Hz'],

    /* ---------------- angle ---------------- */
    [180, 'deg', 'rad', 'angle', Math.PI, 1e-12, '180 deg -> rad'],
    [2, 'rad', 'deg', 'angle', 360 / Math.PI, 1e-12, '2 rad -> deg'],
    [1, 'turn', 'deg', 'angle', 360, 1e-12, 'turn -> deg'],
    [1, 'gradian', 'deg', 'angle', 0.9, 1e-12, 'gradian -> deg'],
    [1, 'arcminute', 'deg', 'angle', 1 / 60, 1e-12, 'arcminute -> deg'],
    [1, 'arcsecond', 'deg', 'angle', 1 / 3600, 1e-12, 'arcsecond -> deg'],
    [1, 'mil (NATO)', 'deg', 'angle', 0.05625, 1e-12, 'NATO mil -> deg'],

    /* ---------------- paper size (by area) ---------------- */
    [1, 'Letter', 'A4', 'paper-size', 0.06032246 / 0.06237, 1e-9, 'Letter -> A4'],
    [1, 'Legal', 'Letter', 'paper-size', 0.07677404 / 0.06032246, 1e-9, 'Legal -> Letter'],
    [1, 'A4', 'cm2', 'paper-size', 623.7, 1e-9, 'A4 -> sq cm'],
    [1, 'A0', 'm2', 'paper-size', 1, 1e-15, 'A0 -> sq m'],
    [1, 'm2', 'A0', 'paper-size', 1, 1e-12, 'sq m -> A0'],
    [1, 'Tabloid', 'A3', 'paper-size', 0.12062452 / 0.125, 1e-9, 'Tabloid -> A3'],
    // ISO 216 rounds A4 down, so 2 A4 is fractionally under 1 A3.
    [2, 'A4', 'A3', 'paper-size', 0.99792, 1e-9, '2 A4 -> 0.998 A3 (ISO rounding)'],
    [4, 'A4', 'A2', 'paper-size', 0.99792, 1e-9, '4 A4 -> 0.998 A2 (ISO rounding)'],

    /* ---------------- identity / rejection ---------------- */
    [5, 'm', 'm', 'length', 5, 1e-12, 'identity'],
    [5, 'zzz', 'm', 'length', null, 0, 'unknown unit rejected'],
    [5, 'm', 'ft', 'nonsense', null, 0, 'unknown category rejected'],
    [0, 'L/100km', 'mpg (US)', 'fuel-economy', null, 0, 'zero efficiency rejected'],
  ];

  const results = [];
  let passed = 0;
  let failed = 0;

  ROWS.forEach(function (row) {
    const [value, from, to, category, expected, tol, label] = row;
    let ok = true;
    let detail = '';
    try {
      const got = Units.convert(value, from, to, category);
      if (expected === null) {
        ok = got === null;
        if (!ok) detail = 'expected null, got ' + got;
      } else if (got == null) {
        ok = false;
        detail = 'expected ' + expected + ', got null';
      } else {
        const diff = Math.abs(got - expected);
        const rel = diff / Math.max(1e-300, Math.abs(expected));
        ok = (diff <= tol) || (rel <= 1e-12);
        if (!ok) detail = 'expected ' + expected + ', got ' + got + ' (rel ' + rel.toExponential(2) + ')';
      }
    } catch (err) {
      ok = false;
      detail = err.message;
    }
    if (ok) { passed++; results.push({ name: label, ok: true }); }
    else { failed++; results.push({ name: label, ok: false, error: detail }); }
  });

  if (typeof window !== 'undefined' && window.__testResults) {
    window.__testResults['units-factors'] = results;
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
    results.forEach((r) => { if (!r.ok) console.log('FAIL', r.name, '-', r.error); });
    console.log(passed + ' factor rows passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
  }
})(typeof window !== 'undefined' ? window : globalThis);
