'use strict';

/**
 * Calculator core engine — pure logic, no DOM access.
 * Exposed as a global `CalculatorLib` in browsers and via
 * module.exports in Node (for unit tests).
 */
(function (global) {

  const MAX_DIGITS = 15;
  const HISTORY_LIMIT = 50;

  const STORAGE_KEYS = {
    memory: 'calc:memory',
    history: 'calc:history',
  };

  function countDigits(s) {
    return (String(s).match(/\d/g) || []).length;
  }

  /**
   * Round to 12 significant digits to remove binary floating point
   * artifacts (e.g. 0.1 + 0.2). Returns null for non-finite results.
   */
  function roundResult(x) {
    if (typeof x !== 'number' || !isFinite(x)) return null;
    let r = parseFloat(x.toPrecision(12));
    if (Object.is(r, -0)) r = 0;
    return r;
  }

  function trimExponential(s) {
    return s.replace(/\.?0+e/, 'e');
  }

  /** Format a numeric string for display: thousands separators or exponent. */
  function formatNumber(value) {
    const str = String(value);
    if (str === 'Error') return str;
    const n = parseFloat(str);
    if (isNaN(n)) return str;
    if (n !== 0 && (Math.abs(n) >= 1e15 || Math.abs(n) < 1e-9)) {
      return trimExponential(n.toExponential(6));
    }
    const negative = str.startsWith('-');
    const unsigned = negative ? str.slice(1) : str;
    const parts = unsigned.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (negative ? '-' : '') + parts.join('.');
  }

  function factorial(n) {
    let r = 1;
    for (let i = 2; i <= n; i++) r *= i;
    return r;
  }

  function computeBinary(a, op, b) {
    let r;
    switch (op) {
      case '+': r = a + b; break;
      case '\u2212': r = a - b; break; // −
      case '\u00d7': r = a * b; break; // ×
      case '\u00f7': if (b === 0) return null; r = a / b; break; // ÷
      case 'mod': if (b === 0) return null; r = a % b; break;
      case '^': r = Math.pow(a, b); break;
      default: return null;
    }
    return roundResult(r);
  }

  /**
   * Evaluate a plain-text math expression (for paste support).
   * Supports: numbers, + - * / ^ and parentheses, unary minus.
   * Returns a rounded number, or null if the input is invalid.
   */
  function evaluateExpression(input) {
    const cleaned = String(input)
      .replace(/[\s,]/g, '')
      .replace(/\u00d7/g, '*')
      .replace(/\u00f7/g, '/')
      .replace(/\u2212/g, '-');
    if (!cleaned || !/^[-+*/^().0-9]+$/.test(cleaned)) return null;

    // Tokenize
    const tokens = [];
    let i = 0;
    while (i < cleaned.length) {
      const ch = cleaned[i];
      if (/[0-9.]/.test(ch)) {
        let j = i;
        while (j < cleaned.length && /[0-9.]/.test(cleaned[j])) j++;
        const numStr = cleaned.slice(i, j);
        const num = parseFloat(numStr);
        if (isNaN(num) || (numStr.match(/\./g) || []).length > 1) return null;
        tokens.push({ type: 'num', value: num });
        i = j;
      } else if ('+-*/^()'.indexOf(ch) !== -1) {
        tokens.push({ type: 'op', value: ch });
        i++;
      } else {
        return null;
      }
    }

    // Shunting-yard -> RPN
    const prec = { '+': 2, '-': 2, '*': 3, '/': 3, '^': 4 };
    const out = [];
    const stack = [];
    let prev = null;
    for (const t of tokens) {
      if (t.type === 'num') {
        out.push(t);
      } else if (t.value === '(') {
        stack.push(t);
      } else if (t.value === ')') {
        let opened = false;
        while (stack.length) {
          const s = stack.pop();
          if (s.value === '(') { opened = true; break; }
          out.push(s);
        }
        if (!opened) return null;
      } else {
        const isUnary = (t.value === '-' || t.value === '+') &&
          (prev === null || (prev.type === 'op' && prev.value !== ')'));
        if (isUnary) {
          if (t.value === '-') stack.push({ type: 'u', value: 'u' });
          // unary plus is a no-op
        } else {
          while (stack.length) {
            const top = stack[stack.length - 1];
            if (top.value === '(') break;
            const topPrec = top.type === 'u' ? 5 : prec[top.value];
            if (topPrec > prec[t.value] ||
                (topPrec === prec[t.value] && t.value !== '^')) {
              out.push(stack.pop());
            } else break;
          }
          stack.push(t);
        }
      }
      prev = t;
    }
    while (stack.length) {
      const s = stack.pop();
      if (s.value === '(') return null;
      out.push(s);
    }

    // Evaluate RPN
    const st = [];
    for (const t of out) {
      if (t.type === 'num') {
        st.push(t.value);
      } else if (t.type === 'u') {
        const a = st.pop();
        if (a === undefined) return null;
        st.push(-a);
      } else {
        const b = st.pop();
        const a = st.pop();
        if (a === undefined || b === undefined) return null;
        let r;
        switch (t.value) {
          case '+': r = a + b; break;
          case '-': r = a - b; break;
          case '*': r = a * b; break;
          case '/': if (b === 0) return null; r = a / b; break;
          case '^': r = Math.pow(a, b); break;
          default: return null;
        }
        st.push(r);
      }
    }
    if (st.length !== 1) return null;
    return roundResult(st[0]);
  }

  class Calculator {
    /**
     * @param {object} [options]
     * @param {any} [options.storage]
     *        Optional persistence backend with get/set methods.
     */
    constructor(options) {
      options = options || {};
      this.storage = options.storage || null;
      this.memory = this._load('memory', 0);
      this.history = this._load('history', []);
      if (!Array.isArray(this.history)) this.history = [];
      this.degrees = true;
      this._binaryFunc = null;   // 'nCr' or 'nPr' waiting for second operand
      this._binaryFuncArg = null;
      this.clearAll();
    }

    _load(key, fallback) {
      try {
        if (!this.storage) return fallback;
        const raw = this.storage.get(STORAGE_KEYS[key]);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    }

    _save(key, value) {
      try {
        if (this.storage) this.storage.set(STORAGE_KEYS[key], JSON.stringify(value));
      } catch (e) { /* storage unavailable */ }
    }

    /* ---------------- state transitions ---------------- */

    clearAll() {
      this.current = '0';
      this.previous = null;
      this.operator = null;
      this.entering = false;
      this.justEvaluated = false;
      this.lastOperator = null;
      this.lastOperand = null;
      this.error = false;
      this.pendingExpression = '';
      this._binaryFunc = null;
      this._binaryFuncArg = null;
    }

    clearEntry() {
      if (this.error) { this.clearAll(); return; }
      this.current = '0';
      this.entering = false;
    }

    backspace() {
      if (this.error) { this.clearAll(); return; }
      if (this.justEvaluated) {
        this.justEvaluated = false;
        this.pendingExpression = '';
        this.entering = true;
      }
      if (!this.entering) return;
      const c = this.current;
      const next = (c.length <= 1 || (c.length === 2 && c.startsWith('-')))
        ? ''
        : c.slice(0, -1);
      if (next === '' || next === '-') {
        this.current = '0';
        this.entering = false;
      } else {
        this.current = next;
      }
    }

    /** Reset to a fresh operand when starting to type after "=" or an operator. */
    _beginNewInput() {
      if (this.justEvaluated) {
        this.previous = null;
        this.operator = null;
        this.lastOperator = null;
        this.lastOperand = null;
        this.pendingExpression = '';
        this.justEvaluated = false;
        this.current = '0';
      }
      if (!this.entering) this.current = '0';
      this.entering = true;
    }

    inputDigit(d) {
      if (this.error) this.clearAll();
      this._beginNewInput();
      if (countDigits(this.current) >= MAX_DIGITS) return;
      if (this.current === '0') this.current = d;
      else if (this.current === '-0') this.current = '-' + d;
      else this.current += d;
    }

    inputDecimal() {
      if (this.error) this.clearAll();
      this._beginNewInput();
      if (!this.current.includes('.')) this.current += '.';
    }

    /** Replace the current operand (used by paste / history reuse). */
    setOperand(str) {
      if (this.error) this.clearAll();
      this._beginNewInput();
      this.current = String(str);
      this.entering = true;
    }

    toggleSign() {
      if (this.error || this.current === '0') return;
      this.current = this.current.startsWith('-')
        ? this.current.slice(1)
        : '-' + this.current;
      this.entering = true;
      this.justEvaluated = false;
    }

    chooseOperator(op) {
      if (this.error) return;
      if (this.operator !== null && this.previous !== null && !this.justEvaluated) {
        if (this.entering) {
          this._evaluate(false);
          if (this.error) return;
        }
        // Replace the pending operator, or chain after intermediate evaluation.
        this.operator = op;
        this.previous = this.current;
        this.entering = false;
        return;
      }
      // Fresh start, or continuing from a result.
      this.previous = this.current;
      this.operator = op;
      this.entering = false;
      this.justEvaluated = false;
      this.pendingExpression = '';
      this.lastOperator = null;
      this.lastOperand = null;
    }

    equals() {
      this._evaluate(true);
    }

    _evaluate(isEquals) {
      if (this.error) return;

      // Handle binary functions (nCr, nPr)
      if (this._binaryFunc !== null) {
        const n = this._binaryFuncArg;
        const r = parseFloat(this.current);
        let result;
        let expr;
        if (this._binaryFunc === 'nCr') {
          if (r < 0 || !Number.isInteger(r) || r > n) {
            this.pendingExpression = 'C(' + formatNumber(String(n)) + ',' + formatNumber(String(r)) + ')';
            this.setError();
            return;
          }
          result = factorial(n) / (factorial(r) * factorial(n - r));
          expr = 'C(' + formatNumber(String(n)) + ',' + formatNumber(String(r)) + ')';
        } else {
          if (r < 0 || !Number.isInteger(r) || r > n) {
            this.pendingExpression = 'P(' + formatNumber(String(n)) + ',' + formatNumber(String(r)) + ')';
            this.setError();
            return;
          }
          result = factorial(n) / factorial(n - r);
          expr = 'P(' + formatNumber(String(n)) + ',' + formatNumber(String(r)) + ')';
        }
        const rounded = roundResult(result);
        if (rounded === null) {
          this.setError();
          return;
        }
        this.current = String(rounded);
        this.entering = true;
        this._binaryFunc = null;
        this._binaryFuncArg = null;
        if (isEquals) {
          this.pendingExpression = expr + ' =';
          this.pushHistory(expr, String(rounded));
          this.justEvaluated = true;
        }
        return;
      }

      let a, b, op, expr;
      if (this.operator !== null && this.previous !== null) {
        a = parseFloat(this.previous);
        b = parseFloat(this.current);
        op = this.operator;
        expr = formatNumber(this.previous) + ' ' + op + ' ' + formatNumber(this.current);
      } else if (isEquals && this.lastOperator !== null && this.lastOperand !== null) {
        // Repeat-equals: re-apply the last operation.
        a = parseFloat(this.current);
        b = this.lastOperand;
        op = this.lastOperator;
        expr = formatNumber(this.current) + ' ' + op + ' ' + formatNumber(String(b));
      } else {
        return;
      }

      const result = computeBinary(a, op, b);
      if (result === null) {
        this.pendingExpression = expr + (isEquals ? ' =' : '');
        this.setError();
        return;
      }

      this.current = String(result);
      this.entering = true;
      if (isEquals) {
        this.lastOperator = op;
        this.lastOperand = b;
        this.pendingExpression = expr + ' =';
        this.pushHistory(expr, String(result));
        this.previous = null;
        this.operator = null;
        this.justEvaluated = true;
      }
    }

    percent() {
      if (this.error) return;
      const b = parseFloat(this.current);
      let value;
      if (this.operator !== null && this.previous !== null &&
          (this.operator === '+' || this.operator === '\u2212')) {
        value = parseFloat(this.previous) * b / 100; // % of previous operand
      } else {
        value = b / 100;
      }
      const r = roundResult(value);
      if (r === null) { this.setError(); return; }
      this.current = String(r);
      this.entering = true;
      this.justEvaluated = false;
    }

    applyFunction(fn) {
      if (this.error) return;
      const x = parseFloat(this.current);
      const shown = formatNumber(this.current);
      let r;
      switch (fn) {
        case 'sqrt':
          if (x < 0) { this.pendingExpression = '\u221a(' + shown + ')'; this.setError(); return; }
          r = Math.sqrt(x); break;
        case 'square': r = x * x; break;
        case 'cube': r = x * x * x; break;
        case 'reciprocal':
          if (x === 0) { this.pendingExpression = '1 \u00f7 ' + shown; this.setError(); return; }
          r = 1 / x; break;
        case 'cbrt':
          r = Math.cbrt(x); break;
        case 'abs': r = Math.abs(x); break;
        case 'sign': r = Math.sign(x); break;
        case 'floor': r = Math.floor(x); break;
        case 'ceil': r = Math.ceil(x); break;
        case 'round': r = Math.round(x); break;
        case 'trunc': r = Math.trunc(x); break;
        case 'ln':
          if (x <= 0) { this.pendingExpression = 'ln(' + shown + ')'; this.setError(); return; }
          r = Math.log(x); break;
        case 'log':
          if (x <= 0) { this.pendingExpression = 'log(' + shown + ')'; this.setError(); return; }
          r = Math.log10(x); break;
        case 'log2':
          if (x <= 0) { this.pendingExpression = 'log\u2082(' + shown + ')'; this.setError(); return; }
          r = Math.log2(x); break;
        case 'sin': r = this._trig(x, Math.sin); break;
        case 'cos': r = this._trig(x, Math.cos); break;
        case 'tan':
          if (Math.abs(Math.cos(this._toRad(x))) < 1e-10) {
            this.pendingExpression = 'tan(' + shown + ')';
            this.setError();
            return;
          }
          r = this._trig(x, Math.tan); break;
        case 'asin':
          if (x < -1 || x > 1) { this.pendingExpression = 'asin(' + shown + ')'; this.setError(); return; }
          r = this._trigInverse(Math.asin(x)); break;
        case 'acos':
          if (x < -1 || x > 1) { this.pendingExpression = 'acos(' + shown + ')'; this.setError(); return; }
          r = this._trigInverse(Math.acos(x)); break;
        case 'atan':
          r = this._trigInverse(Math.atan(x)); break;
        case 'sinh': r = Math.sinh(x); break;
        case 'cosh': r = Math.cosh(x); break;
        case 'tanh': r = Math.tanh(x); break;
        case 'asinh': r = Math.asinh(x); break;
        case 'acosh':
          if (x < 1) { this.pendingExpression = 'acosh(' + shown + ')'; this.setError(); return; }
          r = Math.acosh(x); break;
        case 'atanh':
          if (Math.abs(x) >= 1) { this.pendingExpression = 'atanh(' + shown + ')'; this.setError(); return; }
          r = Math.atanh(x); break;
        case 'fact':
          if (x < 0 || !Number.isInteger(x) || x > 170) {
            this.pendingExpression = shown + '!';
            this.setError();
            return;
          }
          r = factorial(x); break;
        case 'nCr': {
          if (x < 0 || !Number.isInteger(x)) {
            this.pendingExpression = 'C(' + shown + ', ?)';
            this.setError();
            return;
          }
          this._binaryFunc = 'nCr';
          this._binaryFuncArg = x;
          this.current = '0';
          this.entering = true;
          this.justEvaluated = false;
          return;
        }
        case 'nPr': {
          if (x < 0 || !Number.isInteger(x)) {
            this.pendingExpression = 'P(' + shown + ', ?)';
            this.setError();
            return;
          }
          this._binaryFunc = 'nPr';
          this._binaryFuncArg = x;
          this.current = '0';
          this.entering = true;
          this.justEvaluated = false;
          return;
        }
        case 'golden': r = (1 + Math.sqrt(5)) / 2; break;
        case 'pi': r = Math.PI; break;
        case 'e': r = Math.E; break;
        default: return;
      }
      const rounded = roundResult(r);
      if (rounded === null) { this.pendingExpression = ''; this.setError(); return; }
      this.current = String(rounded);
      this.entering = true;
      this.justEvaluated = false;
      this.lastOperator = null;
      this.lastOperand = null;
    }

    /** Convert degrees to radians (or pass through if already in radians mode). */
    _toRad(deg) {
      return this.degrees ? (deg * Math.PI) / 180 : deg;
    }

    _trig(x, fn) {
      const input = this._toRad(x);
      let r = fn(input);
      if (Math.abs(r) < 1e-10) r = 0; // snap artifacts like sin(180°) ≈ 1.2e-16
      return r;
    }

    /** Inverse trig: always returns radians, then convert to degrees if needed. */
    _trigInverse(rad) {
      return this.degrees ? (rad * 180) / Math.PI : rad;
    }

    insertConstant(name) {
      if (this.error) this.clearAll();
      const value = name === 'pi' ? Math.PI : Math.E;
      this._beginNewInput();
      this.current = String(roundResult(value));
      this.entering = true;
      this.lastOperator = null;
      this.lastOperand = null;
    }

    toggleAngleMode() {
      this.degrees = !this.degrees;
      return this.degrees;
    }

    /* ---------------- memory ---------------- */

    memoryClear() {
      this.memory = 0;
      this._save('memory', this.memory);
    }

    memoryRecall() {
      if (this.error) this.clearAll();
      this._beginNewInput();
      this.current = String(this.memory);
      this.entering = true;
      this.lastOperator = null;
      this.lastOperand = null;
    }

    memoryAdd() {
      this._memoryUpdate(this.memory + parseFloat(this.current));
    }

    memorySubtract() {
      this._memoryUpdate(this.memory - parseFloat(this.current));
    }

    _memoryUpdate(v) {
      const r = roundResult(v);
      if (r !== null) {
        this.memory = r;
        this._save('memory', this.memory);
        // The displayed value has been consumed; the next digit starts
        // a fresh operand instead of appending to it.
        this.entering = false;
      }
    }

    get hasMemory() {
      return this.memory !== 0;
    }

    /* ---------------- undo / redo ---------------- */

    /** Capture full input state as a plain object. */
    snapshot() {
      return {
        current: this.current,
        previous: this.previous,
        operator: this.operator,
        entering: this.entering,
        justEvaluated: this.justEvaluated,
        lastOperator: this.lastOperator,
        lastOperand: this.lastOperand,
        error: this.error,
        pendingExpression: this.pendingExpression,
        _binaryFunc: this._binaryFunc,
        _binaryFuncArg: this._binaryFuncArg,
      };
    }

    /** Restore a state previously captured by snapshot(). */
    restore(s) {
      if (!s) return;
      this.current = s.current;
      this.previous = s.previous;
      this.operator = s.operator;
      this.entering = s.entering;
      this.justEvaluated = s.justEvaluated;
      this.lastOperator = s.lastOperator;
      this.lastOperand = s.lastOperand;
      this.error = s.error;
      this.pendingExpression = s.pendingExpression;
      this._binaryFunc = s._binaryFunc;
      this._binaryFuncArg = s._binaryFuncArg;
    }

    /* ---------------- history ---------------- */

    pushHistory(expression, result) {
      this.history.unshift({ expression: expression, result: result });
      if (this.history.length > HISTORY_LIMIT) this.history.length = HISTORY_LIMIT;
      this._save('history', this.history);
    }

    clearHistory() {
      this.history = [];
      this._save('history', this.history);
    }

    reuseHistory(index) {
      const entry = this.history[index];
      if (!entry) return;
      if (this.error) this.clearAll();
      this.previous = null;
      this.operator = null;
      this.lastOperator = null;
      this.lastOperand = null;
      this.justEvaluated = false;
      this.pendingExpression = '';
      this.error = false;
      this.current = String(entry.result);
      this.entering = true;
    }

    /* ---------------- error + display ---------------- */

    setError() {
      this.error = true;
      this.current = 'Error';
      this.previous = null;
      this.operator = null;
      this.entering = false;
      this.justEvaluated = false;
      this.lastOperator = null;
      this.lastOperand = null;
    }

    get displayValue() {
      if (this.error) return 'Error';
      return formatNumber(this.current);
    }

    get displayHistoryLine() {
      if (this.error || this.justEvaluated) return this.pendingExpression;
      if (this.operator !== null && this.previous !== null) {
        return formatNumber(this.previous) + ' ' + this.operator;
      }
      return '';
    }
  }

  const CalculatorLib = {
    Calculator: Calculator,
    formatNumber: formatNumber,
    roundResult: roundResult,
    evaluateExpression: evaluateExpression,
    factorial: factorial,
    computeBinary: computeBinary,
    MAX_DIGITS: MAX_DIGITS,
  };

  global.CalculatorLib = CalculatorLib;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalculatorLib;
  }
})(typeof window !== 'undefined' ? window : globalThis);
