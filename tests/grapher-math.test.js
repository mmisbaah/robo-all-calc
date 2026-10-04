'use strict';

/**
 * Unit tests for the pure graph-math module.
 * Runs in Node and in the browser (tests/index.html). Zero dependencies.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const M = isNode ? require('../js/grapher-math.js') : root.GrapherMath;

  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try { fn(); passed++; results.push({ name, ok: true }); }
    catch (err) { failed++; results.push({ name, ok: false, error: err.message }); }
  }

  function ok(v, label) { if (!v) throw new Error(label + ': expected truthy'); }
  function near(actual, expected, tol, label) {
    if (actual == null || Math.abs(actual - expected) > tol) {
      throw new Error(label + ': expected ~' + expected + ', got ' + actual);
    }
  }

  test('numericalDerivative of x^2 at 3 is ~6', () => {
    near(M.numericalDerivative((x) => x * x, 3), 6, 1e-3, 'x^2');
  });

  test('numericalDerivative of sin at 0 is ~1', () => {
    near(M.numericalDerivative(Math.sin, 0), 1, 1e-4, 'sin');
  });

  test('simpsonIntegrate x^2 over [0,2] is ~8/3', () => {
    near(M.simpsonIntegrate((x) => x * x, 0, 2), 8 / 3, 1e-6, 'integral');
  });

  test('simpsonIntegrate sin over [0,PI] is ~2', () => {
    near(M.simpsonIntegrate(Math.sin, 0, Math.PI), 2, 1e-6, 'integral');
  });

  test('findRootByBisection of x^2-2 is ~sqrt(2)', () => {
    near(M.findRootByBisection((x) => x * x - 2, 0, 2), Math.SQRT2, 1e-6, 'root');
  });

  test('findRootByBisection returns null without sign change', () => {
    ok(M.findRootByBisection((x) => x * x + 1, -1, 1) === null, 'no root');
  });

  test('findRootsInRange finds roots of x^3-x', () => {
    const roots = M.findRootsInRange((x) => x * x * x - x, -2, 2);
    ok(roots.length === 3, '3 roots, got ' + roots.length);
    near(roots[0], -1, 1e-4, 'root -1');
    near(roots[1], 0, 1e-4, 'root 0');
    near(roots[2], 1, 1e-4, 'root 1');
  });

  test('findIntersectionsInRange y=x and y=x^2', () => {
    const pts = M.findIntersectionsInRange((x) => x, (x) => x * x, -1, 3);
    ok(pts.length === 2, '2 intersections, got ' + pts.length);
    near(pts[0].x, 0, 1e-4, 'x=0');
    near(pts[1].x, 1, 1e-4, 'x=1');
  });

  test('findExtremaInRange of x^2 has a min at 0', () => {
    const ex = M.findExtremaInRange((x) => x * x, -2, 2);
    ok(ex.length >= 1, 'at least one extremum');
    const m = ex.find((p) => p.kind === 'min');
    ok(m && Math.abs(m.x) < 0.1, 'min near 0');
  });

  test('niceStep picks 1, 2, 5 or 10 * 10^k', () => {
    ok(Math.abs(M.niceStep(10) - 1) < 1e-9, 'step 1');
    ok([2, 2.5, 5].indexOf(M.niceStep(25)) !== -1, 'step 2/2.5/5');
    ok(Math.abs(M.niceStep(100) - 10) < 1e-9, 'step 10');
  });

  test('formatNum formats common values', () => {
    ok(M.formatNum(0) === '0', 'zero');
    ok(M.formatNum(3.14159).indexOf('3.14') === 0, 'pi-ish');
    ok(M.formatNum(1e9).indexOf('e') !== -1, 'large exp');
    ok(M.formatNum(NaN) === '—', 'NaN');
  });

  test('compileFunction compiles x^2+2x+1', () => {
    const f = M.compileFunction('x^2+2x+1');
    ok(typeof f === 'function', 'compiled');
    near(f(3), 16, 1e-9, 'f(3)');
  });

  test('compileFunction handles trig and constants', () => {
    const f = M.compileFunction('sin(x) + pi');
    ok(typeof f === 'function', 'compiled');
    near(f(0), Math.PI, 1e-9, 'sin(0)+pi');
  });

  test('compileFunction rejects garbage', () => {
    ok(M.compileFunction('alert(1)') === null, 'rejected');
    ok(M.compileFunction('x; process.exit()') === null, 'rejected 2');
  });

  test('sampleCartesian returns points', () => {
    const pts = M.sampleCartesian((x) => x * x, 0, 1, 10);
    ok(pts.length === 11, '11 points');
    near(pts[10].y, 1, 1e-9, 'y at x=1');
  });

  test('samplePolar circle r=2', () => {
    const pts = M.samplePolar(() => 2, 0, Math.PI * 2, 16);
    ok(pts.length === 17, 'points');
    pts.forEach((p) => near(Math.hypot(p.x, p.y), 2, 1e-9, 'radius 2'));
  });

  test('sampleParametric circle', () => {
    const pts = M.sampleParametric(Math.cos, Math.sin, 0, 2 * Math.PI, 16);
    ok(pts.length === 17, 'points');
    pts.forEach((p) => near(Math.hypot(p.x, p.y), 1, 1e-9, 'unit circle'));
  });

  test('compileFunction + findRootsInRange on x^2-4', () => {
    const f = M.compileFunction('x^2 - 4');
    const roots = M.findRootsInRange(f, -5, 5);
    ok(roots.length === 2, '2 roots');
    near(roots[0], -2, 1e-4, '-2');
    near(roots[1], 2, 1e-4, '2');
  });

  if (typeof window !== 'undefined' && window.__testResults) {
    window.__testResults['grapher-math'] = results;
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
