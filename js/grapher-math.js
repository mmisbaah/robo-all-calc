'use strict';

/**
 * Pure graph mathematics — no DOM, no canvas.
 * Used by js/grapher.js in the browser and by Node unit tests.
 * Exposed as global `GrapherMath` / `module.exports`.
 */
(function (global) {

  /** Numerical derivative at x using central differences. */
  function numericalDerivative(fn, x, h = 1e-5) {
    const f1 = fn(x + h);
    const f2 = fn(x - h);
    if (f1 == null || isNaN(f1) || !isFinite(f1) || f2 == null || isNaN(f2) || !isFinite(f2)) {
      return null;
    }
    return (f1 - f2) / (2 * h);
  }

  /** Definite integral of f(x) from a to b using Simpson's rule. */
  function simpsonIntegrate(fn, a, b, n = 1000) {
    if (n % 2 !== 0) n++;
    const h = (b - a) / n;
    let sum = fn(a) + fn(b);
    for (let i = 1; i < n; i++) {
      const x = a + i * h;
      const fx = fn(x);
      if (fx == null || isNaN(fx) || !isFinite(fx)) return null;
      sum += (i % 2 === 0 ? 2 : 4) * fx;
    }
    return (h / 3) * sum;
  }

  /** Bisection root-finding: assumes sign change on [a, b]. */
  function findRootByBisection(fn, a, b, tolerance = 1e-7, maxIter = 50) {
    let fa = fn(a);
    let fb = fn(b);
    if (fa == null || fb == null || isNaN(fa) || isNaN(fb)) return null;
    if (fa * fb > 0) return null;
    for (let i = 0; i < maxIter; i++) {
      const mid = (a + b) / 2;
      const fm = fn(mid);
      if (fm == null || isNaN(fm)) return null;
      if (Math.abs(fm) < tolerance || (b - a) / 2 < tolerance) return mid;
      if (fa * fm < 0) { b = mid; fb = fm; } else { a = mid; fa = fm; }
    }
    return (a + b) / 2;
  }

  /** Scan [xMin, xMax] for sign changes and refine each with bisection. */
  function findRootsInRange(fn, xMin, xMax, samples = 400) {
    const roots = [];
    const step = (xMax - xMin) / samples;
    let prevX = xMin;
    let prevF = safeEval(fn, prevX);
    for (let i = 1; i <= samples; i++) {
      const x = xMin + i * step;
      const f = safeEval(fn, x);
      if (f != null && f === 0) {
        roots.push(x); // landed exactly on a root
      } else if (prevF != null && f != null && prevF * f < 0) {
        const root = findRootByBisection(fn, prevX, x);
        if (root != null) roots.push(root);
      }
      prevX = x;
      prevF = f;
    }
    // Collapse near-duplicates (exact zero vs adjacent bisection hit).
    return dedupe(roots.sort((a, b) => a - b), step / 2);
  }

  /** Pairwise intersections of two cartesian functions on [xMin, xMax]. */
  function findIntersectionsInRange(fn1, fn2, xMin, xMax, samples = 400) {
    const diff = (x) => {
      const a = safeEval(fn1, x);
      const b = safeEval(fn2, x);
      if (a == null || b == null) return null;
      return a - b;
    };
    const xs = findRootsInRange(diff, xMin, xMax, samples);
    return xs.map((x) => ({ x, y: safeEval(fn1, x) })).filter((p) => p.y != null);
  }

  /** Local extrema of a cartesian function via neighbour comparison. */
  function findExtremaInRange(fn, xMin, xMax, samples = 400) {
    const out = [];
    const step = (xMax - xMin) / samples;
    let prevX = xMin;
    let prevY = safeEval(fn, prevX);
    for (let i = 1; i < samples; i++) {
      const x = xMin + i * step;
      const y = safeEval(fn, x);
      const nextX = x + step;
      const nextY = i + 1 <= samples ? safeEval(fn, nextX) : null;
      if (y != null && prevY != null && nextY != null) {
        if (y > prevY && y >= nextY) out.push({ x, y, kind: 'max' });
        else if (y < prevY && y <= nextY) out.push({ x, y, kind: 'min' });
      }
      prevX = x;
      prevY = y;
    }
    // dedupe adjacent hits, keeping first of each cluster
    const xs = dedupe(out.map((p) => p.x), step);
    return xs.map((x) => out.find((p) => Math.abs(p.x - x) < step) || { x, y: safeEval(fn, x), kind: 'max' });
  }

  function safeEval(fn, x) {
    try {
      const v = fn(x);
      return v == null || isNaN(v) || !isFinite(v) ? null : v;
    } catch (e) { return null; }
  }

  function dedupe(values, eps) {
    if (!(eps > 0)) eps = 1e-9;
    const out = [];
    for (const v of values) {
      if (out.length === 0 || Math.abs(v - out[out.length - 1]) > eps) out.push(v);
    }
    return out;
  }

  /** Pick a human-friendly grid step for a given range. */
  function niceStep(range, targetSteps = 10) {
    const rough = range / targetSteps;
    if (!isFinite(rough) || rough <= 0) return 1;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / magnitude;
    let nice;
    if (residual <= 1.5) nice = 1;
    else if (residual <= 3) nice = 2;
    else if (residual <= 7) nice = 5;
    else nice = 10;
    return nice * magnitude;
  }

  /** Format a number for compact display. */
  function formatNum(n) {
    if (n == null || isNaN(n)) return '—';
    if (Math.abs(n) < 1e-10) return '0';
    if (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-3) {
      return n.toExponential(3);
    }
    return parseFloat(n.toPrecision(6)).toString();
  }

  /**
   * Compile a math expression string into f(x).
   * Grammar (recursive descent): supports + - * / ^ (right-assoc), unary
   * minus, parentheses, constants pi/e, the variable x, implicit
   * multiplication (2x, 2(x+1), x(x+1), 2sin(x)), and functions
   * sin cos tan asin acos atan sinh cosh tanh sqrt cbrt abs ln log log2
   * exp pow. Returns null for invalid/unknown input.
   */
  function compileFunction(expr) {
    const src = String(expr)
      .replace(/[\s]/g, '')
      .replace(/\u00d7/g, '*')
      .replace(/\u00f7/g, '/')
      .replace(/\u2212/g, '-');
    if (!src) return null;

    const FUNCS = {
      sin: Math.sin, cos: Math.cos, tan: Math.tan,
      asin: Math.asin, acos: Math.acos, atan: Math.atan,
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
      sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs,
      ln: Math.log, log: Math.log10, log2: Math.log2,
      exp: Math.exp, pow: Math.pow,
    };
    const CONSTS = { pi: Math.PI, e: Math.E };

    let pos = 0;

    function startsFactorJs() {
      const c = src[pos];
      return /[0-9.(a-z]/.test(c || '');
    }
    function parseExprJs() {
      let v = parseTermJs();
      while (src[pos] === '+' || src[pos] === '-') {
        const op = src[pos++];
        const rhs = parseTermJs();
        v = '(' + v + op + rhs + ')';
      }
      return v;
    }
    function parseTermJs() {
      let v = parseFactorJs();
      for (;;) {
        if (src[pos] === '*') { pos++; v = '(' + v + '*' + parseFactorJs() + ')'; }
        else if (src[pos] === '/') { pos++; v = '(' + v + '/' + parseFactorJs() + ')'; }
        else if (startsFactorJs()) { v = '(' + v + '*' + parseFactorJs() + ')'; }
        else break;
      }
      return v;
    }
    function parseFactorJs() {
      const base = parseUnaryJs();
      if (src[pos] === '^') {
        pos++;
        const e = parseFactorJs();
        return 'Math.pow(' + base + ',' + e + ')';
      }
      return base;
    }
    function parseUnaryJs() {
      if (src[pos] === '-') { pos++; return '(-' + parseUnaryJs() + ')'; }
      if (src[pos] === '+') { pos++; return parseUnaryJs(); }
      return parsePrimaryJs();
    }
    function parsePrimaryJs() {
      const c = src[pos];
      if (c === '(') {
        pos++;
        const v = parseExprJs();
        if (src[pos] !== ')') throw new Error('unbalanced (');
        pos++;
        return '(' + v + ')';
      }
      if (/[0-9.]/.test(c || '')) {
        let j = pos;
        while (j < src.length && /[0-9.]/.test(src[j])) j++;
        const num = src.slice(pos, j);
        if (isNaN(parseFloat(num))) throw new Error('bad number');
        pos = j;
        return num;
      }
      if (/[a-z]/.test(c || '')) {
        let j = pos;
        while (j < src.length && /[a-z]/.test(src[j])) j++;
        const name = src.slice(pos, j);
        pos = j;
        if (name === 'x') return 'x';
        if (name in CONSTS) return name === 'pi' ? 'Math.PI' : 'Math.E';
        if (name in FUNCS) {
          if (src[pos] !== '(') throw new Error('expected ( after ' + name);
          pos++;
          const a = parseExprJs();
          let b;
          if (src[pos] === ',') { pos++; b = parseExprJs(); }
          if (src[pos] !== ')') throw new Error('expected )');
          pos++;
          const jsName = name === 'ln' ? 'Math.log'
            : name === 'log' ? 'Math.log10'
            : name === 'log2' ? 'Math.log2'
            : 'Math.' + name;
          return b !== undefined ? jsName + '(' + a + ',' + b + ')' : jsName + '(' + a + ')';
        }
        throw new Error('unknown name ' + name);
      }
      throw new Error('unexpected char ' + c);
    }

    try {
      const js = parseExprJs();
      if (pos !== src.length) return null; // trailing garbage
      const fn = new Function('x', 'return ' + js);
      fn(1.234); // smoke test
      return fn;
    } catch (e) {
      return null;
    }
  }

  /** Sample y = f(x) on [xMin, xMax]. Returns [{x, y}]. */
  function sampleCartesian(fn, xMin, xMax, samples = 400) {
    const out = [];
    for (let i = 0; i <= samples; i++) {
      const x = xMin + (i / samples) * (xMax - xMin);
      const y = safeEval(fn, x);
      if (y != null) out.push({ x, y });
    }
    return out;
  }

  /** Sample r = g(θ) (radians), returning cartesian points. */
  function samplePolar(rFn, thetaMin = 0, thetaMax = Math.PI * 2, samples = 400) {
    const out = [];
    for (let i = 0; i <= samples; i++) {
      const t = thetaMin + (i / samples) * (thetaMax - thetaMin);
      const r = safeEval(rFn, t);
      if (r != null) out.push({ x: r * Math.cos(t), y: r * Math.sin(t) });
    }
    return out;
  }

  /** Sample x = fx(t), y = fy(t) on [tMin, tMax]. */
  function sampleParametric(fxFn, fyFn, tMin, tMax, samples = 400) {
    const out = [];
    for (let i = 0; i <= samples; i++) {
      const t = tMin + (i / samples) * (tMax - tMin);
      const x = safeEval(fxFn, t);
      const y = safeEval(fyFn, t);
      if (x != null && y != null) out.push({ x, y });
    }
    return out;
  }

  const GrapherMath = {
    numericalDerivative,
    simpsonIntegrate,
    findRootByBisection,
    findRootsInRange,
    findIntersectionsInRange,
    findExtremaInRange,
    niceStep,
    formatNum,
    compileFunction,
    sampleCartesian,
    samplePolar,
    sampleParametric,
    safeEval,
  };

  global.GrapherMath = GrapherMath;
  if (typeof module !== 'undefined' && module.exports) module.exports = GrapherMath;
})(typeof window !== 'undefined' ? window : globalThis);
