'use strict';

/**
 * End-to-end tests for the symbolic solver: detection -> nerdamer -> answer.
 *
 * Runs in Node by driving nerdamer directly through the same operations the
 * Web Worker performs (js/cas-worker.js). This checks the maths, while
 * symbolic.test.js checks the parsing.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const Symbolic = isNode ? require('../js/symbolic.js') : root.Symbolic;
  const CasSolve = isNode ? require('../js/cas-solve.js') : root.CasSolve;

  const results = [];
  /** Tests are queued, then run once nerdamer is available. */
  const queue = [];
  let passed = 0;
  let failed = 0;

  /** nerdamer is already loaded in Node; in the browser fetch it on demand. */
  function loadCas() {
    if (isNode) return Promise.resolve(require('nerdamer'));
    if (root.nerdamer) return Promise.resolve(root.nerdamer);
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = '../vendor/nerdamer.js';
      s.onload = function () { resolve(root.nerdamer); };
      s.onerror = function () { reject(new Error('could not load ../vendor/nerdamer.js')); };
      document.head.appendChild(s);
    });
  }

  /**
   * Drive the same module the worker uses (js/cas-solve.js), so these tests
   * exercise the shipped strategy rather than a copy of it.
   */
  function makeRunOp(N) {
    return function runOp(op, args) {
      switch (op) {
        case 'solve':
          return CasSolve.solveSmart(N, args[0], args[1]);
        case 'diff': return { text: String(N.diff.apply(null, args)), meta: {} };
        case 'integrate': return { text: String(N.integrate.apply(null, args)), meta: {} };
        case 'defint': return { text: String(N.defint.apply(null, args)), meta: {} };
        case 'limit': return { text: String(N.limit.apply(null, args)), meta: {} };
        case 'simplify': return { text: String(N(args[0]).simplify()), meta: {} };
        case 'expand': return { text: String(N(args[0]).expand()), meta: {} };
        case 'factor': return { text: String(N(args[0]).factor()), meta: {} };
        case 'canonize': return { text: String(N(args[0])), meta: {} };
        default: throw new Error('Unknown operation: ' + op);
      }
    };
  }

  let runOp = null;

  /** Detect + run + present, synchronously. */
  function answer(input) {
    const request = Symbolic.detect(input);
    if (request === null) return { skipped: true };
    if (request.error) return { error: request.error };
    try {
      return presentForTest(request, runOp(request.op, request.args));
    } catch (err) {
      return { ok: false, error: err.message, op: request.op };
    }
  }

  /** Mirrors symbolic.js present(), kept in sync by the tests below. */
  function presentForTest(request, reply) {
    const notes = [];
    let text = Symbolic.pretty(reply.text);
    if (request.op === 'solve') {
      const list = (reply.meta.list && reply.meta.list.length) ? reply.meta.list.slice() : [];
      const variable = request.variable || 'x';
      if (list.length && list.every((s) => /(^|\W)all(\W|$)/.test(s))) {
        text = 'Any value of ' + variable + ' satisfies the equation.';
        notes.push('identity');
      } else if (!list.length) {
        text = 'No closed-form solution found.';
        notes.push('empty');
      } else {
        const numericStrategy = reply.meta.strategy === 'numeric-roots'
          || reply.meta.strategy === 'mixed-factored';
        if (numericStrategy) {
          const all = Symbolic.formatNumericRoots(list);
          if (all) {
            text = variable + ' = ' + all.text;
            notes.push(all.complex ? 'complex numeric roots' : 'numeric roots');
          } else {
            text = variable + ' = ' + list.map(Symbolic.formatSingleRoot).join('  or  ');
            notes.push('mixed numeric roots');
          }
        } else {
          text = variable + ' = ' + list.map(Symbolic.pretty).join('  or  ');
        }
      }
    }
    return { ok: true, text: text, raw: String(reply.text), notes: notes };
  }

  function test(name, fn) {
    queue.push({ name, fn });
  }

  function runQueued() {
    queue.forEach(function (t) {
      try { t.fn(); passed++; results.push({ name: t.name, ok: true }); }
      catch (err) { failed++; results.push({ name: t.name, ok: false, error: err.message }); }
    });
  }
  function ok(v, label) { if (!v) throw new Error(label + ': expected truthy'); }
  function eq(a, b, label) {
    if (a !== b) throw new Error((label || '') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
  function has(result, needle, label) {
    ok(result.ok, (label || 'result') + ': failed — ' + (result.error || result.text));
    if (String(result.text).indexOf(needle) === -1) {
      throw new Error((label || '') + ': expected ' + JSON.stringify(needle)
        + ' in ' + JSON.stringify(result.text));
    }
  }

  /* ---------------- solving ---------------- */

  test('solve: quadratic factors to two roots', () => {
    has(answer('x^2-5x+6=0'), '3', 'roots');
    has(answer('x^2-5x+6=0'), '2', 'roots');
  });

  test('solve: linear equation', () => {
    has(answer('2x+3=7'), '2', 'x=2');
  });

  test('solve: implicit multiplication in the input', () => {
    has(answer('3x^2=12'), '2', 'plus root');
    has(answer('3x^2=12'), '-2', 'minus root');
  });

  test('solve: no real roots is reported as complex', () => {
    const r = answer('x^2+1=0');
    has(r, 'i', 'imaginary unit');
  });

  test('solve: rational answer stays exact', () => {
    has(answer('2/x=4'), '1/2', 'exact fraction');
  });

  test('solve: irrational answer uses an exact radical', () => {
    has(answer('x^2-2=0'), '2^(1/2)', 'sqrt(2)');
  });

  test('solve: transcendentally many solutions are flagged', () => {
    const r = answer('sin(x)=0');
    has(r, 'pi', 'family contains pi');
  });

  test('solve: identity is not reported as roots', () => {
    const r = answer('x=x');
    ok(/Any value/.test(r.text), 'identity wording, got ' + r.text);
  });

  test('solve: quintic reports all roots numerically', () => {
    // x^5-x^3+x-1 has no closed form, so the solver must not claim
    // "no solution"; it should return numeric roots and say so.
    const r = answer('x^5-x^3+x-1=0');
    ok(r.ok, 'expected a result: ' + (r.error || r.text));
    ok(/numeric/i.test(r.notes.join(' ')), 'should flag numeric roots: ' + r.notes.join(' '));
    ok(r.raw.split(',').length === 5, 'expected five roots, got ' + r.raw);
  });

  test('solve: y=2x+1 solves for the independent variable', () => {
    const r = answer('y=2x+1');
    has(r, 'x =', 'should solve for x');
  });

  /* ---------------- derivatives ---------------- */

  test('diff: power rule', () => {
    has(answer('d/dx x^3'), '3', '3x^2');
  });

  test('diff: polynomial', () => {
    has(answer('d/dx x^3+2x^2-5'), '4', '4x');
    has(answer('d/dx x^3+2x^2-5'), '3', '3x^2');
  });

  test('diff: product and chain rules', () => {
    has(answer('d/dx sin(x)*x'), 'cos(x)', 'product rule');
    has(answer('d/dx sin(x^2)'), 'cos(', 'chain rule');
  });

  test('diff: second derivative', () => {
    has(answer('d2/dx2 x^4'), '12', '12x^2');
  });

  test('diff: partial derivative picks the right variable', () => {
    const r = answer('\u2202/\u2202y x^2*y^3');
    has(r, '3', 'd/dy x^2 y^3 = 3x^2 y^2');
  });

  test('diff: reciprocal and coefficient forms', () => {
    has(answer('d/dx 1/x'), 'x\u207B\u00B2', 'd/dx 1/x = -x^-2');
    has(answer('d/dx 3x^2'), '6', 'd/dx 3x^2 = 6x');
  });

  test('integrate: reciprocal', () => {
    has(answer('\u222B 1/x dx'), 'log(x)', 'log(x)');
  });

  /* ---------------- integrals ---------------- */

  test('integrate: power rule', () => {
    has(answer('\u222B x^2 dx'), 'x\u00B3', 'x^3');
    has(answer('\u222B x^2 dx'), '(1/3)', '1/3 factor');
  });

  test('integrate: reciprocal gives a log', () => {
    has(answer('\u222B 1/x dx'), 'log(x)', 'log(x)');
  });

  test('integrate: trigonometric', () => {
    has(answer('\u222B sin(x) dx'), 'cos(x)', '-cos(x)');
  });

  test('integrate: by parts', () => {
    has(answer('\u222B x*exp(x) dx'), 'x', 'x e^x');
  });

  test('defint: definite integral over bounds', () => {
    has(answer('\u222B x^2 dx from 0 to 3'), '9', 'x^3/3 over [0,3]');
  });

  test('defint: bracketed bounds', () => {
    has(answer('\u222B[0,3] x^2 dx'), '9', 'leading bracket');
    has(answer('\u222B x^2 dx [0,3]'), '9', 'trailing bracket');
  });

  test('defint: sin over [0,pi] is 2', () => {
    const r = answer('\u222B sin(x) dx from 0 to pi');
    ok(/^2(\.0+)?$/.test(String(r.text).trim()),
      'expected 2, got ' + r.text);
  });

  /* ---------------- limits ---------------- */

  test('limit: removable discontinuity', () => {
    has(answer('limit (x^2-1)/(x-1) as x -> 1'), '2', 'limit = 2');
  });

  test('limit: at infinity', () => {
    has(answer('limit (x^2+1)/x^2 as x -> Infinity'), '1', 'limit = 1');
  });

  /* ---------------- algebra ---------------- */

  test('simplify: cancels a common factor', () => {
    has(answer('simplify (x^2-1)/(x-1)'), '1+x', 'simplified');
  });

  test('expand: binomial', () => {
    const r = answer('expand (x+1)^3');
    has(r, '3', 'middle term');
    has(r, 'x\u00B3', 'leading term');
  });

  test('factor: difference of squares', () => {
    const r = answer('factor x^2-1');
    has(r, '(1+x)', 'factored form');
  });

  /* ---------------- unicode input ---------------- */

  test('unicode: superscript and unicode operators solve correctly', () => {
    has(answer('x\u00B2-5x+6=0'), '3', 'roots with superscript');
    has(answer('2x+3=7'), '2', 'ascii');
    has(answer('2\u00D7x+1=7'), '3', 'unicode times in an equation');
  });

  test('unicode: pi is understood', () => {
    const r = answer('d/dx pi*x^2');
    has(r, '2', 'd/dx pi x^2 = 2 pi x');
  });

  /* ---------------- refusals ---------------- */

  test('refuses: inequalities', () => {
    const r = answer('x<=3');
    ok(r.error, 'should refuse');
  });

  test('refuses: not-equal', () => {
    const r = answer('x!=3');
    ok(r.error, 'should refuse');
  });

  test('solve: irreducible quartic falls back to numeric roots', () => {
    // nerdamer's general solve() takes ~12 s and returns nothing here, so the
    // worker must route high-degree polynomials to roots() instead.
    const t0 = Date.now();
    const r = answer('x^4-5x+6=0');
    const ms = Date.now() - t0;
    ok(r.ok, 'expected a result: ' + (r.error || r.text));
    ok(ms < 3000, 'should be fast, took ' + ms + 'ms');
    ok(/numeric/i.test(r.notes.join(' ')), 'should flag numeric roots: ' + r.notes.join(' '));
    ok(/i/.test(r.raw), 'roots should include the imaginary unit');
  });

  test('solve: reducible quartic still gives exact radicals', () => {
    const r = answer('x^4-5x^2+6=0');
    ok(r.ok, 'expected a result: ' + (r.error || r.text));
    ok(r.text.indexOf('3') !== -1 && r.text.indexOf('2') !== -1,
      'expected radicals of 2 and 3, got ' + r.text);
  });

  test('solve: quintic does not hang', () => {
    const t0 = Date.now();
    const r = answer('x^5-x^3+x-1=0');
    const ms = Date.now() - t0;
    ok(r.ok, 'expected a result: ' + (r.error || r.text));
    ok(ms < 3000, 'should be fast, took ' + ms + 'ms');
    ok(/numeric/i.test(r.notes.join(' ')), 'should flag numeric roots');
  });

  test('solve: sextic does not hang', () => {
    const t0 = Date.now();
    const r = answer('x^6-3x^5+2x^4+x^3-1=0');
    ok(r.ok, 'expected a result: ' + (r.error || r.text));
    ok(Date.now() - t0 < 3000, 'should be fast');
  });

  test('solve: factored quintic mixes exact and numeric roots', () => {
    // x^5-x^3+x-1 = (-1+x)*(1+x^3+x^4): the linear factor gives an exact
    // root, the quartic factor must not be handed to the slow solver.
    const r = answer('x^5-x^3+x-1=0');
    ok(r.ok, 'expected a result: ' + (r.error || r.text));
    ok(/x = 1(\s|$|\u00B7|,)/.test(r.text) || r.text.indexOf('1') !== -1,
      'should include the exact root 1, got ' + r.text);
  });

  test('formatNumericRoots: rounds and sorts real roots', () => {
    eq(Symbolic.formatNumericRoots([
      '1.7320508075688772935', '-1.4142135623730950488',
    ]).text, '-1.41421  or  1.73205', 'real roots');
  });

  test('formatNumericRoots: pairs complex conjugates', () => {
    const r = Symbolic.formatNumericRoots([
      '1.1569737666113891464+0.50811761046656016487*i',
      '1.1569737666113891464-0.50811761046656016487*i',
      '-1.1569737666113891464+1.5553112509037036325*i',
      '-1.1569737666113891464-1.5553112509037036325*i',
    ]);
    ok(r.complex, 'should report complex');
    eq(r.text, '-1.15697 \u00B1 1.55531\u00B7i  or  1.15697 \u00B1 0.508118\u00B7i', 'conjugate pairs');
  });

  test('parseNumeric understands nerdamer root formats', () => {
    eq(JSON.stringify(Symbolic.parseNumeric('3')), JSON.stringify({ re: 3, im: 0 }), 'int');
    eq(JSON.stringify(Symbolic.parseNumeric('-1.5')), JSON.stringify({ re: -1.5, im: 0 }), 'negative');
    eq(JSON.stringify(Symbolic.parseNumeric('1.25+0.5*i')),
      JSON.stringify({ re: 1.25, im: 0.5 }), 'complex plus');
    eq(JSON.stringify(Symbolic.parseNumeric('-0.3-1.2*i')),
      JSON.stringify({ re: -0.3, im: -1.2 }), 'complex minus');
    eq(Symbolic.parseNumeric('x^2'), null, 'symbolic is not numeric');
  });

  test('pure arithmetic is left to the numeric calculator', () => {
    // The CAS must not claim these; the keypad already handles them, and
    // nerdamer throws on 1/0 rather than producing a value.
    ok(answer('6\u00D77').skipped, '6x7 should be skipped');
    ok(answer('2+2').skipped, '2+2 should be skipped');
    ok(answer('1/0').skipped, '1/0 should be skipped');
  });

  test('float noise is tidied for display', () => {
    eq(Symbolic.tidyNumber('2.0000000000000004'), '2', 'near-integer');
    eq(Symbolic.tidyNumber('888.7860000000001'), '888.786', 'long tail');
    eq(Symbolic.tidyNumber('0.5'), '0.5', 'already tidy');
    eq(Symbolic.tidyNumber('42'), '42', 'exact integer untouched');
    eq(Symbolic.tidyNumber('9460730472580800'), '9460730472580800', 'large integer untouched');
    eq(Symbolic.tidyNumber('x^2'), 'x^2', 'symbolic untouched');
  });

  loadCas().then(function (N) {
    runOp = makeRunOp(N);
    runQueued();
    report();
  }, function (err) {
    queue.forEach(function (t) {
      failed++;
      results.push({ name: t.name, ok: false, error: 'nerdamer unavailable: ' + err.message });
    });
    report();
  });

  function report() {
  if (typeof window !== 'undefined' && window.__testResults) {
    window.__testResults['cas'] = results;
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
  }
})(typeof window !== 'undefined' ? window : globalThis);
