'use strict';

/**
 * Unit tests for the calculator core.
 * Runs in Node (`node tests/calculator.test.js`) and in the browser
 * (open tests/index.html). Zero dependencies.
 */
(function (root) {
  const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  const lib = isNode ? require('../js/calculator.js') : root.CalculatorLib;
  const { Calculator, formatNumber, evaluateExpression } = lib;

  const results = [];
  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      passed++;
      results.push({ name: name, ok: true });
    } catch (err) {
      failed++;
      results.push({ name: name, ok: false, error: err.message });
    }
  }

  function eq(actual, expected, label) {
    if (actual !== expected) {
      throw new Error((label ? label + ': ' : '') +
        'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  }

  function ok(value, label) {
    if (!value) throw new Error((label || 'value') + ' expected truthy');
  }

  /** Type a program into a calculator: digits, . + − × ÷ ^ = % n(sign) \b(backspace) */
  function type(c, s) {
    for (const ch of s) {
      if (ch >= '0' && ch <= '9') c.inputDigit(ch);
      else if (ch === '.') c.inputDecimal();
      else if ('+\u2212\u00d7\u00f7^'.indexOf(ch) !== -1) c.chooseOperator(ch);
      else if (ch === '%') c.percent();
      else if (ch === '=') c.equals();
      else if (ch === 'n') c.toggleSign();
      else if (ch === '\b') c.backspace();
      else throw new Error('bad test input char: ' + ch);
    }
    return c;
  }

  function run(s) {
    return type(new Calculator(), s);
  }

  function fn(s, name) {
    const c = new Calculator();
    type(c, s);
    c.applyFunction(name);
    return c;
  }

  /* ---------------- basic arithmetic ---------------- */
  test('addition', () => eq(run('2+3=').current, '5'));
  test('subtraction', () => eq(run('9\u22124=').current, '5'));
  test('multiplication', () => eq(run('6\u00d77=').current, '42'));
  test('division', () => eq(run('8\u00f72=').current, '4'));
  test('power', () => eq(run('2^10=').current, '1024'));
  test('chained operations evaluate left-to-right', () => eq(run('2+3\u00d74=').current, '20'));
  test('intermediate result shown while chaining', () => {
    const c = run('2+3+');
    eq(c.current, '5');
    eq(c.displayHistoryLine, '5 +');
  });

  /* ---------------- bug fixes ---------------- */
  test('operator replacement does not evaluate with zero', () => {
    const c = run('2+\u00d73=');
    eq(c.current, '6');
  });
  test('operator replacement shows the new operator', () => {
    eq(run('2+\u00d7').displayHistoryLine, '2 \u00d7');
  });
  test('repeat equals re-applies last operation', () => {
    eq(run('5+3===').current, '14');
  });
  test('floating point artifact is cleaned', () => eq(run('0.1+0.2=').current, '0.3'));
  test('division by zero sets error', () => {
    const c = run('5\u00f70=');
    ok(c.error, 'error flag');
    eq(c.displayValue, 'Error');
    eq(c.displayHistoryLine, '5 \u00f7 0 =');
  });
  test('digit input recovers from error', () => {
    const c = run('5\u00f70=');
    type(c, '7');
    ok(!c.error, 'error cleared');
    eq(c.current, '7');
  });
  test('mod by zero sets error', () => {
    const c = new Calculator();
    type(c, '7');
    c.chooseOperator('mod');
    type(c, '0=');
    ok(c.error, 'error flag');
  });

  /* ---------------- percent ---------------- */
  test('percent of previous operand for +', () => eq(run('200+10%=').current, '220'));
  test('percent of previous operand for minus', () => eq(run('200\u221210%=').current, '180'));
  test('percent scales by 100 for multiply', () => eq(run('50\u00d710%=').current, '5'));
  test('standalone percent divides by 100', () => eq(run('50%').current, '0.5'));

  /* ---------------- input handling ---------------- */
  test('duplicate decimal point ignored', () => eq(run('1..2').current, '1.2'));
  test('digit input is limited', () => {
    const c = run('123456789012345678');
    eq(c.current, '123456789012345');
  });
  test('backspace removes last digit', () => eq(run('123\b').current, '12'));
  test('backspace to single digit resets to zero', () => eq(run('5\b').current, '0'));
  test('sign toggle', () => eq(run('5n').current, '-5'));
  test('sign toggle twice restores', () => eq(run('5nn').current, '5'));
  test('digit after equals starts fresh', () => eq(run('2+3=7').current, '7'));
  test('operator after equals continues from result', () => eq(run('2+3=\u00d72=').current, '10'));

  /* ---------------- scientific functions ---------------- */
  test('sqrt', () => eq(fn('9', 'sqrt').current, '3'));
  test('sqrt of negative errors', () => ok(fn('4n', 'sqrt').error));
  test('square', () => eq(fn('5', 'square').current, '25'));
  test('reciprocal', () => eq(fn('4', 'reciprocal').current, '0.25'));
  test('reciprocal of zero errors', () => ok(fn('0', 'reciprocal').error));
  test('ln(e) = 1', () => {
    const c = new Calculator();
    c.insertConstant('e');
    c.applyFunction('ln');
    eq(c.current, '1');
  });
  test('log(100) = 2', () => eq(fn('100', 'log').current, '2'));
  test('ln of non-positive errors', () => ok(fn('0', 'ln').error));
  test('sin 30 degrees', () => eq(fn('30', 'sin').current, '0.5'));
  test('cos 60 degrees', () => eq(fn('60', 'cos').current, '0.5'));
  test('sin 180 degrees snaps to zero', () => eq(fn('180', 'sin').current, '0'));
  test('radians mode: sin(pi/2)', () => {
    const c = new Calculator();
    c.toggleAngleMode();
    c.insertConstant('pi');
    c.chooseOperator('\u00f7');
    type(c, '2=');
    c.applyFunction('sin');
    eq(c.current, '1');
  });
  test('factorial', () => eq(fn('5', 'fact').current, '120'));
  test('factorial of negative errors', () => ok(fn('3n', 'fact').error));
  test('factorial of non-integer errors', () => {
    const c = new Calculator();
    type(c, '2.5');
    c.applyFunction('fact');
    ok(c.error);
  });
  test('abs', () => eq(fn('7n', 'abs').current, '7'));
  test('constant pi', () => {
    const c = new Calculator();
    c.insertConstant('pi');
    eq(c.current, '3.14159265359');
  });
  test('mod operator', () => {
    const c = new Calculator();
    type(c, '7');
    c.chooseOperator('mod');
    type(c, '3=');
    eq(c.current, '1');
  });

  /* ---------------- memory ---------------- */
  test('memory add and recall', () => {
    const c = new Calculator();
    type(c, '5');
    c.memoryAdd();
    type(c, '2.5');
    c.memoryAdd();
    ok(c.hasMemory, 'has memory');
    c.clearAll();
    c.memoryRecall();
    eq(c.current, '7.5');
  });
  test('memory subtract', () => {
    const c = new Calculator();
    type(c, '10');
    c.memoryAdd();
    type(c, '4');
    c.memorySubtract();
    c.memoryRecall();
    eq(c.current, '6');
  });
  test('memory clear', () => {
    const c = new Calculator();
    type(c, '5');
    c.memoryAdd();
    c.memoryClear();
    ok(!c.hasMemory, 'memory cleared');
  });

  /* ---------------- history ---------------- */
  test('equals pushes a history entry', () => {
    const c = run('2+3=');
    eq(c.history.length, 1);
    eq(c.history[0].expression, '2 + 3');
    eq(c.history[0].result, '5');
  });
  test('history reuse restores result as operand', () => {
    const c = run('2+3=');
    c.clearAll();
    c.reuseHistory(0);
    eq(c.current, '5');
    type(c, '\u00d72=');
    eq(c.current, '10');
  });
  test('clear history', () => {
    const c = run('1+1=');
    c.clearHistory();
    eq(c.history.length, 0);
  });

  /* ---------------- formatting ---------------- */
  test('formatNumber adds thousands separators', () => eq(formatNumber('1234567'), '1,234,567'));
  test('formatNumber keeps decimals and sign', () => eq(formatNumber('-1234.56'), '-1,234.56'));
  test('formatNumber keeps trailing decimal point', () => eq(formatNumber('123.'), '123.'));
  test('formatNumber passes zero', () => eq(formatNumber('0'), '0'));
  test('formatNumber uses exponent for huge values', () => eq(formatNumber('1e+21'), '1e+21'));
  test('formatNumber uses exponent for tiny values', () => eq(formatNumber(String(1e-10)), '1e-10'));
  test('displayValue is formatted', () => eq(run('1000\u00d72=').displayValue, '2,000'));

  /* ---------------- expression evaluation (paste) ---------------- */
  test('expr: precedence', () => eq(evaluateExpression('2+3*4'), 14));
  test('expr: parentheses', () => eq(evaluateExpression('(2+3)*4'), 20));
  test('expr: right-associative power', () => eq(evaluateExpression('2^3^2'), 512));
  test('expr: unary minus', () => eq(evaluateExpression('-3+5'), 2));
  test('expr: double negative', () => eq(evaluateExpression('2--3'), 5));
  test('expr: decimals and spaces', () => eq(evaluateExpression('3.5 * .5 + 1'), 2.75));
  test('expr: thousands commas stripped', () => eq(evaluateExpression('1,234.5 + 0.5'), 1235));
  test('expr: unicode operators', () => eq(evaluateExpression('6\u00d77'), 42));
  test('expr: division by zero rejected', () => eq(evaluateExpression('1/0'), null));
  test('expr: trailing operator rejected', () => eq(evaluateExpression('2+'), null));
  test('expr: unbalanced parens rejected', () => eq(evaluateExpression('(2+3'), null));
  test('expr: letters rejected', () => eq(evaluateExpression('abc'), null));
  test('expr: empty rejected', () => eq(evaluateExpression(''), null));

  /* ---------------- report ---------------- */
  const lines = results.map((r) =>
    (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.ok ? '' : '\n      ' + r.error));
  const summary = failed === 0
    ? '\nAll ' + passed + ' tests passed.'
    : '\n' + failed + ' of ' + (passed + failed) + ' tests FAILED.';

  if (isNode) {
    console.log(lines.join('\n') + summary);
    process.exitCode = failed === 0 ? 0 : 1;
  }

  if (typeof document !== 'undefined') {
    const out = document.getElementById('output');
    if (out) {
      const pre = document.createElement('pre');
      results.forEach((r) => {
        const div = document.createElement('div');
        div.className = r.ok ? 'pass' : 'fail';
        div.textContent = (r.ok ? '\u2714 ' : '\u2718 ') + r.name +
          (r.ok ? '' : ' \u2014 ' + r.error);
        pre.appendChild(div);
      });
      const sum = document.createElement('div');
      sum.className = failed === 0 ? 'pass' : 'fail';
      sum.textContent = summary.trim();
      pre.appendChild(sum);
      out.appendChild(pre);
    }
  }

  root.__calcTestResults = { passed: passed, failed: failed, results: results };
})(typeof window !== 'undefined' ? window : globalThis);
