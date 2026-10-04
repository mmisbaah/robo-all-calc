/**
 * Unit tests for the keyboard focus guard (js/keyboard-target.js).
 *
 * Regression cover for a bug that a large test suite missed: the global keypad
 * handler called preventDefault() on '=' while a text field had focus, so the
 * character never landed and an equation like x^2-5x+6=0 could not be typed
 * into the symbolic solver. Every existing test set input.value directly and
 * never dispatched a key, so nothing caught it.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const KT = isNode ? require('../js/keyboard-target.js') : root.KeyboardTarget;

  let passed = 0;
  let failed = 0;
  const results = [];
  let currentFailures = 0;
  let currentTest = '';

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

  /** Minimal stand-in for an element; avoids needing a DOM in Node. */
  function el(tag, attrs) {
    attrs = attrs || {};
    return {
      tagName: tag,
      isContentEditable: !!attrs.contentEditable,
      getAttribute: function (name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      },
    };
  }

  /* ---------------- the reported bug ---------------- */

  test('the symbolic solver input is a text entry', () => {
    // cas-input is <input id="cas-input" class="fn-text"> with no type,
    // which means type=text.
    ok(KT.isTextEntry(el('INPUT', {})), 'cas-input must own its keys');
  });

  test('= is not swallowed in a text field (the reported bug)', () => {
    ok(KT.shouldDeferToField(el('INPUT', {}), '='),
      'the keypad handler must stand down so = is inserted');
  });

  test('every character of an equation is deferred', () => {
    const field = el('INPUT', {});
    const keys = ['x', '^', '2', '-', '5', 'x', '+', '6', '=', '0'];
    const blocked = keys.filter(function (k) { return !KT.shouldDeferToField(field, k); });
    eq(blocked.length, 0, 'no character of x^2-5x+6=0 may be intercepted');
  });

  test('Enter is deferred to the field, which submits the solver itself', () => {
    ok(KT.shouldDeferToField(el('INPUT', {}), 'Enter'),
      'the solver input has its own Enter handler; the global one must not also fire');
  });

  /* ---------------- digits must not leak into the calculator ---------------- */

  test('digits typed into a field do not reach the calculator', () => {
    const field = el('INPUT', { type: 'number' });
    const keys = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const leaked = keys.filter(function (k) { return !KT.shouldDeferToField(field, k); });
    eq(leaked.length, 0, 'no digit may reach calc.inputDigit while typing');
  });

  test('operators typed into a field do not reach the calculator', () => {
    const field = el('INPUT', {});
    const keys = ['+', '-', '*', '/', '^', '%'];
    const leaked = keys.filter(function (k) { return !KT.shouldDeferToField(field, k); });
    eq(leaked.length, 0, 'no operator may reach the calculator while typing');
  });

  /* ---------------- non-text controls keep working ---------------- */

  test('range inputs keep native arrow-key handling', () => {
    // If a range were treated as text entry, arrow keys would stop adjusting it.
    const range = el('INPUT', { type: 'range' });
    ok(!KT.isTextEntry(range), 'a range is not a text field');
    ok(!KT.shouldDeferToField(range, 'ArrowRight'), 'arrows must reach the range');
  });

  test('checkbox, radio, colour and file are not text entry', () => {
    ['checkbox', 'radio', 'color', 'file', 'button', 'submit'].forEach(function (type) {
      ok(!KT.isTextEntry(el('INPUT', { type: type })), type + ' is not a text field');
    });
  });

  test('buttons are not text entry, so clicking one then typing still works', () => {
    // Regression risk from the guard itself: toolbar buttons keep focus after
    // a click, and the keypad must still respond.
    ok(!KT.isTextEntry(el('BUTTON', {})), 'a button is not a text field');
    const btn = el('BUTTON', {});
    ok(!KT.shouldDeferToField(btn, '5'), 'digits must still reach the calculator');
  });

  test('the graph canvas is not text entry, so its own keys still fire', () => {
    const canvas = el('CANVAS', {});
    ok(!KT.isTextEntry(canvas), 'the canvas handles its own arrow keys');
    ok(!KT.shouldDeferToField(canvas, 'ArrowRight'), 'canvas arrows must not be deferred');
  });

  /* ---------------- other fields ---------------- */

  test('textarea and select are text entry', () => {
    ok(KT.isTextEntry(el('TEXTAREA', {})), 'textarea');
    ok(KT.isTextEntry(el('SELECT', {})), 'select');
  });

  test('contentEditable elements are text entry', () => {
    ok(KT.isTextEntry(el('DIV', { contentEditable: true })), 'contentEditable');
    ok(!KT.isTextEntry(el('DIV', {})), 'a plain div is not');
  });

  test('input type defaults to text when absent', () => {
    ok(KT.isTextEntry(el('INPUT', {})), 'no type attribute means text');
    ok(KT.isTextEntry(el('INPUT', { type: 'TEXT' })), 'type match is case-insensitive');
  });

  test('null and undefined targets are safe', () => {
    ok(!KT.isTextEntry(null), 'null');
    ok(!KT.isTextEntry(undefined), 'undefined');
  });

  /* ---------------- Escape stays global ---------------- */

  test('Escape is never deferred, so panels still close from a field', () => {
    const field = el('INPUT', {});
    ok(!KT.shouldDeferToField(field, 'Escape'), 'Escape must stay global');
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
