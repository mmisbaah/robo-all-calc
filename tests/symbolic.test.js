'use strict';

/**
 * Tests for the symbolic front-end: normalisation, guards, and detection.
 * The CAS itself is exercised in cas.test.js against the real nerdamer build.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const Symbolic = isNode ? require('../js/symbolic.js') : root.Symbolic;

  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try { fn(); passed++; results.push({ name, ok: true }); }
    catch (err) { failed++; results.push({ name, ok: false, error: err.message }); }
  }
  function ok(v, label) { if (!v) throw new Error(label + ': expected truthy'); }
  function eq(a, b, label) {
    if (a !== b) throw new Error((label || '') + ': expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a));
  }
  /** Assert detection produced the given op (and optionally variable/args). */
  function det(input, want) {
    const r = Symbolic.detect(input);
    if (r === null) throw new Error(JSON.stringify(input) + ': expected a request, got null');
    if (r.error) throw new Error(JSON.stringify(input) + ': unexpected error: ' + r.error);
    eq(r.op, want.op, JSON.stringify(input) + ' op');
    if (want.variable !== undefined) eq(r.variable, want.variable, JSON.stringify(input) + ' variable');
    if (want.args) {
      eq(JSON.stringify(r.args), JSON.stringify(want.args), JSON.stringify(input) + ' args');
    }
    return r;
  }

  /* ---------------- normalisation ---------------- */

  test('normalize: superscript exponents', () => {
    eq(Symbolic.normalize('x\u00B2'), 'x^2', 'x2');
    eq(Symbolic.normalize('x\u00B3'), 'x^3', 'x3');
    eq(Symbolic.normalize('2x\u00B2'), '2x^2', '2x2');
  });

  test('normalize: unicode operators', () => {
    eq(Symbolic.normalize('6\u00D77'), '6*7', 'times');
    eq(Symbolic.normalize('8\u00F74'), '8/4', 'divide');
    eq(Symbolic.normalize('5\u22122'), '5-2', 'minus sign');
    eq(Symbolic.normalize('2\u00B7x'), '2*x', 'middle dot');
  });

  test('normalize: constants', () => {
    eq(Symbolic.normalize('\u03C0'), 'pi', 'pi');
    eq(Symbolic.normalize('\u03C4'), '2*pi', 'tau');
    eq(Symbolic.normalize('1/\u221E'), '1/Infinity', 'infinity');
  });

  test('normalize: radicals', () => {
    eq(Symbolic.normalize('\u221A(2)'), 'sqrt(2)', 'sqrt parens');
    eq(Symbolic.normalize('\u221Ax'), 'sqrt(x)', 'sqrt bare');
    eq(Symbolic.normalize('\u221B(8)'), 'cbrt(8)', 'cbrt parens');
  });

  test('normalize: ln is rewritten, never passed through', () => {
    // nerdamer parses a bare `ln` as implicit multiplication (ln(100) -> 100*ln)
    eq(Symbolic.normalize('ln(100)'), 'log(100)', 'ln(x)');
    eq(Symbolic.normalize('ln x'), 'log(x)', 'ln x');
    eq(Symbolic.normalize('log10(100)'), 'log10(100)', 'log10 kept');
  });

  test('normalize: implicit multiplication is left for nerdamer', () => {
    // nerdamer parses 2x, 3x^2 and 2(x+1) correctly, so expanding here would
    // only risk breaking trailing differential markers.
    eq(Symbolic.normalize('2x'), '2x', '2x');
    eq(Symbolic.normalize('3x^2'), '3x^2', '3x^2');
    eq(Symbolic.normalize('2(x+1)'), '2(x+1)', '2(x+1)');
    eq(Symbolic.normalize('2\u00B7x'), '2*x', 'middle dot still becomes *');
  });

  test('normalize: function calls are not broken', () => {
    eq(Symbolic.normalize('log10(100)'), 'log10(100)', 'log10 intact');
    eq(Symbolic.normalize('sqrt(2)'), 'sqrt(2)', 'sqrt intact');
    eq(Symbolic.normalize('nthroot(8,3)'), 'nthroot(8,3)', 'nthroot intact');
  });

  test('normalize: thousands separators', () => {
    eq(Symbolic.normalize('1,000,000'), '1000000', 'grouped');
    eq(Symbolic.normalize('1,234.5'), '1234.5', 'grouped decimal');
  });

  test('normalize: preserves meaningful commas', () => {
    eq(Symbolic.normalize('nthroot(8,3)'), 'nthroot(8,3)', 'multi-arg kept');
  });

  /* ---------------- guards ---------------- */

  test('guard: inequalities are refused', () => {
    ['x<=3', 'x>=3', 'x<3', 'x>3'].forEach((t) => {
      const r = Symbolic.detect(t);
      ok(r && r.error, t + ' should be refused');
      ok(/Inequalit/.test(r.error), t + ' message: ' + r.error);
    });
  });

  test('guard: not-equal is refused', () => {
    const r = Symbolic.detect('x!=3');
    ok(r && r.error, 'should refuse');
    ok(/Not-equal/.test(r.error), 'message: ' + r.error);
  });

  test('guard: approximate relation is refused', () => {
    ['pi~3.14', 'x \u2248 3', 'x approx 3'].forEach((t) => {
      const r = Symbolic.detect(t);
      ok(r && r.error, t + ' should be refused');
    });
  });

  test('guard: overlong input is refused', () => {
    const r = Symbolic.detect('x+' + '+x'.repeat(300));
    ok(r && r.error, 'should refuse');
    ok(/too long/.test(r.error), 'message: ' + r.error);
  });

  /* ---------------- detection: equations ---------------- */

  test('detect: quadratic equation', () => {
    det('x^2-5x+6=0', { op: 'solve', variable: 'x', args: ['x^2-5x+6=0', 'x'] });
  });

  test('detect: linear equation with rhs', () => {
    det('2x+3=7', { op: 'solve', variable: 'x', args: ['2x+3=7', 'x'] });
  });

  test('detect: solve keyword form', () => {
    det('solve x^2=4', { op: 'solve', variable: 'x', args: ['x^2=4', 'x'] });
  });

  test('detect: equation with empty rhs solves f(x)=0', () => {
    det('x^2-5x+6=', { op: 'solve', variable: 'x' });
  });

  test('detect: solves for the independent variable, not the dependent one', () => {
    const r = det('y=2x+1', { op: 'solve' });
    eq(r.variable, 'x', 'y=2x+1 should solve for x');
    ok(r.variableKnown, 'should be treated as a deliberate choice');
  });

  test('detect: solving for a lone lhs works', () => {
    det('y=y^2+1', { op: 'solve' });
  });

  test('detect: equation with no variable is refused', () => {
    const r = Symbolic.detect('1+1=2');
    ok(r && r.error, 'should refuse, got ' + JSON.stringify(r));
  });

  /* ---------------- detection: derivatives ---------------- */

  test('detect: d/dx shorthand', () => {
    det('d/dx x^3', { op: 'diff', variable: 'x', args: ['x^3', 'x', 1] });
  });

  test('detect: d/dx with parentheses and implicit multiply', () => {
    det('d/dx sin(x)*x', { op: 'diff', variable: 'x', args: ['sin(x)*x', 'x', 1] });
  });

  test('detect: second derivative', () => {
    det('d2/dx2 x^4', { op: 'diff', variable: 'x', args: ['x^4', 'x', 2] });
  });

  test('detect: partial derivative', () => {
    det('\u2202/\u2202y x^2*y^3', { op: 'diff', variable: 'y' });
  });

  test('detect: derivative keyword with trailing differential', () => {
    det('derivative x^3 dx', { op: 'diff', variable: 'x', args: ['x^3', 'x', 1] });
  });

  test('detect: d/dx with nothing after it is refused', () => {
    const r = Symbolic.detect('d/dx');
    ok(r && r.error, 'should refuse, got ' + JSON.stringify(r));
  });

  test('detect: differential order does not eat the integrand', () => {
    // Regression: "d/dx 1/x" was parsed as d/dx then "/x", because the
    // trailing-order group matched the leading 1 of the expression.
    det('d/dx 1/x', { op: 'diff', variable: 'x', args: ['1/x', 'x', 1] });
    det('d/dx 3x^2', { op: 'diff', variable: 'x', args: ['3x^2', 'x', 1] });
    det('d/dx 2sin(x)', { op: 'diff', variable: 'x', args: ['2sin(x)', 'x', 1] });
  });

  test('detect: integral order does not eat the integrand', () => {
    det('\u222B 1/x dx', { op: 'integrate', variable: 'x', args: ['1/x', 'x'] });
    det('\u222B 3x^2 dx from 0 to 1', { op: 'defint', args: ['3x^2', 'x', '0', '1'] });
  });

  /* ---------------- detection: integrals ---------------- */

  test('detect: indefinite integral', () => {
    det('\u222B x^2 dx', { op: 'integrate', variable: 'x', args: ['x^2', 'x'] });
  });

  test('detect: definite integral with from/to', () => {
    det('\u222B x^2 dx from 0 to 3', { op: 'defint', variable: 'x', args: ['x^2', 'x', '0', '3'] });
  });

  test('detect: definite integral with bracket bounds', () => {
    det('\u222B x^2 dx [0,3]', { op: 'defint', args: ['x^2', 'x', '0', '3'] });
  });

  test('detect: definite integral with leading bracket bounds', () => {
    det('\u222B[0,3] x^2 dx', { op: 'defint', args: ['x^2', 'x', '0', '3'] });
  });

  test('detect: integral keyword', () => {
    det('integral of x^2 dx', { op: 'integrate', variable: 'x' });
  });

  test('detect: integral with empty body is refused', () => {
    const r = Symbolic.detect('\u222B dx');
    ok(r && r.error, 'should refuse, got ' + JSON.stringify(r));
  });

  /* ---------------- detection: limits and commands ---------------- */

  test('detect: limit with as x -> a', () => {
    det('limit (x^2-1)/(x-1) as x -> 1', { op: 'limit', variable: 'x', args: ['(x^2-1)/(x-1)', 'x', '1'] });
  });

  test('detect: lim shorthand', () => {
    det('lim x->1 (x^2-1)/(x-1)', { op: 'limit', variable: 'x', args: ['(x^2-1)/(x-1)', 'x', '1'] });
  });

  test('detect: limit without a destination is refused', () => {
    const r = Symbolic.detect('limit x^2');
    ok(r && r.error, 'should refuse, got ' + JSON.stringify(r));
  });

  test('detect: simplify / expand / factor', () => {
    det('simplify (x^2-1)/(x-1)', { op: 'simplify', args: ['(x^2-1)/(x-1)'] });
    det('expand (x+1)^3', { op: 'expand', args: ['(x+1)^3'] });
    det('factor x^2-1', { op: 'factor', args: ['x^2-1'] });
  });

  test('detect: bare symbolic expression is canonicalised', () => {
    det('(x+1)^3', { op: 'canonize', variable: 'x' });
  });

  test('detect: purely numeric input is left to the numeric path', () => {
    ['2+2', '1234.5', '6*7', '1+2*3'].forEach((t) => {
      eq(Symbolic.detect(t), null, t + ' should not be symbolic');
    });
  });

  test('detect: empty input is not symbolic', () => {
    eq(Symbolic.detect(''), null, 'empty');
    eq(Symbolic.detect('   '), null, 'blank');
  });

  /* ---------------- helpers ---------------- */

  test('findVariables ignores function names', () => {
    eq(JSON.stringify(Symbolic.findVariables('sin(x)+y')), '["x","y"]', 'sin(x)+y');
    eq(JSON.stringify(Symbolic.findVariables('log(x)*z')), '["x","z"]', 'log(x)*z');
    eq(JSON.stringify(Symbolic.findVariables('sqrt(2)*w')), '["w"]', 'sqrt(2)*w');
  });

  test('splitEquation respects parentheses', () => {
    const e = Symbolic.splitEquation('(x+1)*2=6');
    eq(e.lhs, '(x+1)*2', 'lhs');
    eq(e.rhs, '6', 'rhs');
  });

  test('pretty renders powers and products for humans', () => {
    eq(Symbolic.pretty('4*x+3*x^2'), '4\u00B7x+3\u00B7x\u00B2', 'pretty');
    eq(Symbolic.pretty('(1/3)*x^3'), '(1/3)\u00B7x\u00B3', 'cubic');
    eq(Symbolic.pretty('_n*pi'), 'n\u00B7pi', 'index');
  });

  if (typeof window !== 'undefined' && window.__testResults) {
    window.__testResults['symbolic'] = results;
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
