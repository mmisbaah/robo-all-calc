/**
 * Unit tests for the graph viewport geometry (js/grapher-geometry.js).
 *
 * These are the calculations most able to be wrong in a way that still renders:
 * an inverted sign or a swapped axis produces a plot that looks plausible but
 * moves the wrong way. The inverted pinch-zoom that shipped in the drag work
 * would have been caught by the direction assertions below.
 *
 * Runs in Node and in the browser test runner.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const G = isNode ? require('../js/grapher-geometry.js') : root.GrapherGeometry;

  let passed = 0;
  let failed = 0;
  const results = [];
  let currentFailures = 0;

  function ok(cond, msg) {
    if (cond) return true;
    currentFailures++;
    failed++;
    console.log('FAIL ' + (currentTest || '') + ' - ' + msg);
    return false;
  }

  function eq(actual, expected, msg) {
    return ok(actual === expected, msg + ' (expected ' + expected + ', got ' + actual + ')');
  }

  function close(actual, expected, tolerance, msg) {
    const t = tolerance == null ? 1e-9 : tolerance;
    return ok(Math.abs(actual - expected) <= t,
      msg + ' (expected ~' + expected + ', got ' + actual + ')');
  }

  let currentTest = '';

  function test(name, fn) {
    currentTest = name;
    currentFailures = 0;
    let error = null;
    try {
      fn();
    } catch (e) {
      currentFailures++;
      failed++;
      error = e.message;
      console.log('FAIL ' + name + ' - threw: ' + e.message);
    }
    if (currentFailures === 0) passed++;
    results.push({ name: name, ok: currentFailures === 0, error: error });
  }

  const R = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  const W = 400;
  const H = 300;

  /* ---------------- coordinate transforms ---------------- */

  test('toPixel: corners map to the canvas corners', () => {
    const tl = G.toPixel(R, W, H, -10, 10);   // top-left in math
    ok(Math.abs(tl.x) < 1e-9, 'left edge -> x 0, got ' + tl.x);
    ok(Math.abs(tl.y) < 1e-9, 'top edge -> y 0, got ' + tl.y);
    const br = G.toPixel(R, W, H, 10, -10);   // bottom-right in math
    ok(Math.abs(br.x - W) < 1e-9, 'right edge -> x width, got ' + br.x);
    ok(Math.abs(br.y - H) < 1e-9, 'bottom edge -> y height, got ' + br.y);
  });

  test('toPixel: screen y is inverted relative to math y', () => {
    const high = G.toPixel(R, W, H, 0, 10);
    const low = G.toPixel(R, W, H, 0, -10);
    ok(high.y < low.y, 'larger math y must sit higher on screen (smaller pixel y)');
    close((high.y + low.y) / 2, H / 2, 1e-9, 'y=0 is vertically centred');
  });

  test('toMath: centre of the canvas is the range centre', () => {
    const c = G.toMath(R, W, H, W / 2, H / 2);
    close(c.x, 0, 1e-9, 'centre x');
    close(c.y, 0, 1e-9, 'centre y');
  });

  test('toPixel and toMath round-trip', () => {
    for (const [x, y] of [[-7, 3], [0, 0], [4.5, -9.25], [10, -10]]) {
      const p = G.toPixel(R, W, H, x, y);
      const m = G.toMath(R, W, H, p.x, p.y);
      close(m.x, x, 1e-9, 'round-trip x for ' + x);
      close(m.y, y, 1e-9, 'round-trip y for ' + y);
    }
  });

  test('transforms respect a non-default range', () => {
    const r = { xMin: 100, xMax: 110, yMin: -5, yMax: 5 };
    const p = G.toPixel(r, W, H, 100, 5);
    ok(Math.abs(p.x) < 1e-9 && Math.abs(p.y) < 1e-9, 'top-left of the shifted range');
    const c = G.toMath(r, W, H, W / 2, H / 2);
    close(c.x, 105, 1e-9, 'shifted centre x');
    close(c.y, 0, 1e-9, 'shifted centre y');
  });

  /* ---------------- panning ---------------- */

  test('panByFrom: zero delta leaves the range untouched', () => {
    const out = G.panByFrom(R, R, W, H, 0, 0);
    eq(out.xMin, R.xMin, 'xMin unchanged');
    eq(out.xMax, R.xMax, 'xMax unchanged');
    eq(out.yMin, R.yMin, 'yMin unchanged');
    eq(out.yMax, R.yMax, 'yMax unchanged');
  });

  test('panByFrom: dragging right moves the window left', () => {
    // Content follows the cursor, so a rightward drag exposes smaller x values.
    const out = G.panByFrom(R, R, W, H, 100, 0);
    ok(out.xMin < R.xMin, 'xMin must decrease when dragging right');
    ok(out.xMax < R.xMax, 'xMax must decrease when dragging right');
    close(out.xMax - out.xMin, R.xMax - R.xMin, 1e-9, 'pan must not change the span');
  });

  test('panByFrom: dragging down raises the bottom edge', () => {
    // Screen y grows downwards; dragging down shows larger math y.
    const out = G.panByFrom(R, R, W, H, 0, 100);
    ok(out.yMin > R.yMin, 'yMin must increase when dragging down');
    close(out.yMax - out.yMin, R.yMax - R.yMin, 1e-9, 'span preserved');
  });

  test('panByFrom: a full-width drag shifts by exactly one span', () => {
    const out = G.panByFrom(R, R, W, H, W, 0);
    close(out.xMax - out.xMin, 20, 1e-9, 'span preserved');
    // Dragging right by the full width moves the window left by one full span.
    close(R.xMin - out.xMin, 20, 1e-9, 'one full-width drag shifts exactly one span');
  });

  test('panByFrom: pan distance scales with pixel delta', () => {
    const small = G.panByFrom(R, R, W, H, 50, 0);
    const large = G.panByFrom(R, R, W, H, 200, 0);
    const s = R.xMin - small.xMin;
    const l = R.xMin - large.xMin;
    close(l / s, 4, 1e-9, 'four times the drag shifts four times as far');
  });

  test('panByFrom: does not mutate its inputs', () => {
    const before = JSON.stringify(R);
    G.panByFrom(R, R, W, H, 123, 45);
    eq(JSON.stringify(R), before, 'input range must be untouched');
  });

  test('panByFrom: is drift-free when fed the same origin repeatedly', () => {
    // This is the property that keeps a long drag from wandering: every move is
    // computed from the drag-start range, never from the previous frame.
    let range = Object.assign({}, R);
    for (let i = 1; i <= 50; i++) {
      range = G.panByFrom(range, R, W, H, i * 2, 0);
    }
    const single = G.panByFrom(R, R, W, H, 100, 0);
    close(range.xMin, single.xMin, 1e-9, '50 incremental moves equal one 100px move');
  });

  /* ---------------- zooming ---------------- */

  test('zoomAt: factor > 1 zooms out, factor < 1 zooms in', () => {
    const out = G.zoomAt(R, W, H, 2, 0, 0);
    close(out.xMax - out.xMin, 40, 1e-9, 'factor 2 doubles the visible span');
    const inn = G.zoomAt(R, W, H, 0.5, 0, 0);
    close(inn.xMax - inn.xMin, 10, 1e-9, 'factor 0.5 halves the visible span');
  });

  test('zoomAt: the anchor point stays put', () => {
    for (const factor of [0.5, 1.7, 3]) {
      const anchorX = 3.5;
      const anchorY = -2.25;
      const out = G.zoomAt(R, W, H, factor, anchorX, anchorY);
      const before = G.toPixel(R, W, H, anchorX, anchorY);
      const after = G.toPixel(out, W, H, anchorX, anchorY);
      close(after.x, before.x, 1e-6, 'anchor x pixel stable at factor ' + factor);
      close(after.y, before.y, 1e-6, 'anchor y pixel stable at factor ' + factor);
    }
  });

  test('zoomAt: defaults the anchor to the range centre', () => {
    const centred = G.zoomAt(R, W, H, 2, 0, 0);
    const implied = G.zoomAt(R, W, H, 2, null, null);
    eq(centred.xMin, implied.xMin, 'null anchor means centre');
    eq(centred.yMin, implied.yMin, 'null anchor means centre');
  });

  test('zoomAt: preserves symmetry about the centre', () => {
    const out = G.zoomAt(R, W, H, 2.5);
    close(-out.xMin, out.xMax, 1e-9, 'x stays symmetric');
    close(-out.yMin, out.yMax, 1e-9, 'y stays symmetric');
  });

  /* ---------------- validity guards ---------------- */

  test('isValidRange rejects inverted, collapsed and non-finite ranges', () => {
    ok(G.isValidRange(R), 'the default range is valid');
    ok(!G.isValidRange({ xMin: 10, xMax: -10, yMin: -1, yMax: 1 }), 'inverted x rejected');
    ok(!G.isValidRange({ xMin: 5, xMax: 5, yMin: -1, yMax: 1 }), 'zero-width x rejected');
    ok(!G.isValidRange({ xMin: NaN, xMax: 1, yMin: -1, yMax: 1 }), 'NaN rejected');
    ok(!G.isValidRange({ xMin: 0, xMax: Infinity, yMin: -1, yMax: 1 }), 'Infinity rejected');
  });

  test('clampRange rescues a collapsed range instead of dividing by zero', () => {
    const out = G.clampRange({ xMin: 5, xMax: 5, yMin: 0, yMax: 0 });
    ok(out.xMax > out.xMin, 'x span must become positive');
    ok(out.yMax > out.yMin, 'y span must become positive');
    ok(G.isValidRange(out), 'result must be valid');
  });

  test('clampRange replaces non-finite values', () => {
    const out = G.clampRange({ xMin: NaN, xMax: Infinity, yMin: -1, yMax: 1 });
    ok(isFinite(out.xMin) && isFinite(out.xMax), 'x bounds finite');
    ok(G.isValidRange(out), 'result valid');
  });

  test('clampRange caps an absurdly wide range', () => {
    const out = G.clampRange({ xMin: -1e300, xMax: 1e300, yMin: -1, yMax: 1 }, null, 1e6);
    ok(out.xMax - out.xMin <= 1e6 + 1, 'span capped at maxSpan, got ' + (out.xMax - out.xMin));
  });

  test('clampRange leaves a healthy range alone', () => {
    const out = G.clampRange(R);
    eq(out.xMin, R.xMin, 'xMin preserved');
    eq(out.xMax, R.xMax, 'xMax preserved');
    eq(out.yMin, R.yMin, 'yMin preserved');
    eq(out.yMax, R.yMax, 'yMax preserved');
  });

  /* ---------------- pinch regression ---------------- */

  test('pinch direction: fingers apart zooms out (regression)', () => {
    // The shipped bug used factor = startDist / dist, which made spreading two
    // fingers zoom IN. Model the gesture and assert the resulting span grows.
    const startDist = 80;
    const spreadDist = 200;
    const factor = spreadDist / startDist;
    const out = G.zoomAt(R, W, H, factor, 0, 0);
    ok(out.xMax - out.xMin > R.xMax - R.xMin,
      'spreading fingers must widen the range, got ' + (out.xMax - out.xMin));
  });

  test('pinch direction: fingers together zooms in', () => {
    const startDist = 200;
    const togetherDist = 80;
    const factor = togetherDist / startDist;
    const out = G.zoomAt(R, W, H, factor, 0, 0);
    ok(out.xMax - out.xMin < R.xMax - R.xMin,
      'pinching together must narrow the range, got ' + (out.xMax - out.xMin));
  });

  test('wheel and pinch agree on what zooming out means', () => {
    // Scroll down uses factor 1.1; a spread pinch must move the same way.
    const wheelOut = G.zoomAt(R, W, H, 1.1, 0, 0);
    const pinchOut = G.zoomAt(R, W, H, 1.1, 0, 0);
    close(wheelOut.xMax - wheelOut.xMin, pinchOut.xMax - pinchOut.xMin, 1e-12,
      'both widen the span identically');
  });

  /* ---------------- report ---------------- */

  if (isNode) {
    results.forEach(function (r) {
      console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : ' - ' + r.error));
    });
    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
  } else {
    const out = document.getElementById('output');
    const pre = document.createElement('pre');
    results.forEach(function (r) {
      const div = document.createElement('div');
      div.className = r.ok ? 'pass' : 'fail';
      div.textContent = (r.ok ? '✔ ' : '✘ ') + r.name + (r.ok ? '' : ' — ' + r.error);
      pre.appendChild(div);
    });
    const sum = document.createElement('div');
    sum.className = failed === 0 ? 'pass' : 'fail';
    sum.textContent = failed === 0 ? 'All ' + passed + ' passed.' : failed + ' FAILED.';
    pre.appendChild(sum);
    out.appendChild(pre);
  }
})(
  typeof window !== 'undefined' ? window
    : typeof globalThis !== 'undefined' ? globalThis : this
);