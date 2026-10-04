'use strict';

/**
 * Symbolic math front-end: turns typed text into a computer-algebra query.
 *
 * Responsibilities, in order:
 *   1. normalise    unicode / shorthand -> CAS syntax
 *   2. guard        reject constructs nerdamer silently mis-parses
 *   3. detect       classify the input (solve / diff / integrate / …)
 *   4. dispatch     run it in a Web Worker with a timeout
 *   5. present      format the answer, and say plainly when it is incomplete
 *
 * Everything up to step 4 is pure and unit-testable without a worker.
 * UMD export: global `Symbolic` / module.exports.
 */
(function (global) {

  /** Refuse anything longer; long input is a paste accident, not a question. */
  const MAX_INPUT = 400;
  /** Hard cap on a single operation. Exceeding it terminates the worker. */
  const DEFAULT_TIMEOUT_MS = 4000;

  /* ==================================================================
   * 1. Normalisation
   * ================================================================== */

  const SUPERSCRIPT = {
    '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4', '\u2075': '5',
    '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
  };

  /**
   * Convert typed text into something nerdamer's parser understands.
   * Deliberately conservative: anything ambiguous is left alone so the CAS
   * reports it rather than us silently guessing.
   */
  function normalize(text) {
    let s = String(text == null ? '' : text);

    // Thousands separators between digits only, so `nthroot(8,3)` survives.
    let prev;
    do { prev = s; s = s.replace(/(\d),(\d{3})(?!\d)/g, '$1$2'); } while (s !== prev);

    // Arithmetic operators and minus signs.
    s = s.replace(/\u00D7/g, '*')
      .replace(/\u00F7/g, '/')
      .replace(/\u2212/g, '-')   // minus sign
      .replace(/\u2013/g, '-')   // en dash
      .replace(/\u2014/g, '-')   // em dash
      .replace(/\u00B7/g, '*')   // middle dot used as "times"
      .replace(/\u2217/g, '*')   // asterisk operator
      .replace(/\u2219/g, '/');  // division slash

    // Superscript exponents: x2 -> x^2
    s = s.replace(/([A-Za-z0-9)\]])([\u00B9\u00B2\u00B3\u2074-\u2079])/g,
      function (m, base, sup) { return base + '^' + SUPERSCRIPT[sup]; });
    // Leading superscript, e.g. x^ written as ²
    s = s.replace(/^([\u00B9\u00B2\u00B3\u2074-\u2079])/, '^' + function () {
      return SUPERSCRIPT[arguments[0][1]];
    });

    // Constants.
    s = s.replace(/\u03C0/g, 'pi')
      .replace(/\u03C4/g, '2*pi')
      .replace(/\u221E/g, 'Infinity');

    // Roots: sqrt(x) / sqrt token, cbrt similarly.
    s = s.replace(/\u221A\s*\(([^()]*)\)/g, 'sqrt($1)');
    s = s.replace(/\u221A\s*([A-Za-z0-9.]+)/g, 'sqrt($1)');
    s = s.replace(/\u221B\s*\(([^()]*)\)/g, 'cbrt($1)');
    s = s.replace(/\u221B\s*([A-Za-z0-9.]+)/g, 'cbrt($1)');

    // Natural log. nerdamer treats a bare `ln` as implicit multiplication
    // (ln(100) became 100*ln), so it must be rewritten rather than trusted.
    s = s.replace(/\bln\s*\(([^()]*)\)/gi, 'log($1)');
    s = s.replace(/\bln\s+([A-Za-z][A-Za-z0-9_^]*)/gi, 'log($1)');
    s = s.replace(/\blog10\s*\(/gi, 'log10(');

    // Implicit multiplication (2x, 2(x+1), 2sin(x)) is deliberately left
    // alone: nerdamer parses all of it correctly, and expanding it here
    // produced `*` before trailing differential markers (x^2 dx -> x^2*dx).

    return s.trim();
  }

  /* ==================================================================
   * 2. Guards — nerdamer mis-handles these rather than erroring
   * ================================================================== */

  /**
   * Constructs nerdamer accepts but answers wrongly, so we refuse them with an
   * explanation instead of returning a confident wrong number.
   */
  function findUnsupported(text) {
    // Arrows ("x -> 1") contain '>', which is otherwise an inequality.
    const neutral = String(text).replace(/->|=>|→|➔/g, ' ');
    if (/<=|>=|<|>/.test(neutral)) {
      return 'Inequalities are not supported yet — this solver handles equations '
        + '(for example 2x+3=7).';
    }
    if (/!=|!==|≠/.test(text)) {
      return 'Not-equal conditions are not supported — try solving the equation '
        + 'for each root instead.';
    }
    if (/~|≈|\bapprox\b/i.test(text)) {
      return 'Approximate relations (~) are not supported. Use "=" for an equation, '
        + 'or enter a decimal value.';
    }
    return null;
  }

  /* ==================================================================
   * 3. Detection
   * ================================================================== */

  /** Split on the first top-level `=`. */
  function splitEquation(text) {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '=' && depth === 0) {
        // Ignore == and => and comparison operators.
        if (text[i + 1] === '=' || text[i - 1] === '=' || text[i - 1] === '<' || text[i - 1] === '>') continue;
        return { lhs: text.slice(0, i).trim(), rhs: text.slice(i + 1).trim() };
      }
    }
    return null;
  }

  /** Variable names present in the text, ignoring known function names. */
  const FUNCTION_NAMES = new Set([
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'arcsin',
    'arccos', 'arctan', 'sqrt', 'cbrt', 'nthroot', 'abs', 'log', 'ln', 'log10',
    'log2', 'exp', 'pow', 'fact', 'factorial', 'gamma', 'floor', 'ceil', 'round',
    'sign', 'min', 'max', 'pi', 'e', 'Infinity', 'i', 'n', 're', 'im', 'deg', 'rad',
  ]);

  /** All single-letter variables in the text, in first-seen order. */
  function findVariables(text) {
    const seen = [];
    const stripped = text.replace(/[A-Za-z_][A-Za-z_0-9]*\s*\(/g, '(');
    for (const m of stripped.matchAll(/[A-Za-z]/g)) {
      const v = m[0];
      if (seen.indexOf(v) === -1 && !FUNCTION_NAMES.has(v)) seen.push(v);
    }
    return seen;
  }

  /** Single bare variable, e.g. "y" (not "2y" or "y+1"). */
  function isLoneVariable(text) {
    return /^[A-Za-z]$/.test(text.trim());
  }

  /**
   * Classify input into a CAS request.
   * @returns {{op:string, args:Array, variable?:string, variableKnown?:boolean,
   *            label:string}|{error:string}|null}
   *   null means "not a symbolic problem" — the numeric path should handle it.
   */
  function detect(rawInput, options) {
    const options_ = options || {};
    let text = normalize(rawInput);
    if (!text) return null;

    const unsupported = findUnsupported(text);
    if (unsupported) return { error: unsupported };

    if (text.length > MAX_INPUT) {
      return { error: 'Input is too long (limit ' + MAX_INPUT + ' characters).' };
    }

    // --- explicit command prefixes ---
    const cmd = text.match(/^(solve|simplify|expand|factor|limit|diff|derivative|integrate|integral|eval|evaluate)\b\s*(.*)$/i);
    if (cmd) {
      const verb = cmd[1].toLowerCase();
      const rest = cmd[2].trim();
      const variables = findVariables(rest);

      if (verb === 'solve') return makeSolve(rest, text, options_);
      if (verb === 'simplify') return { op: 'simplify', args: [rest], label: 'Simplify' };
      if (verb === 'expand') return { op: 'expand', args: [rest], label: 'Expand' };
      if (verb === 'factor') return { op: 'factor', args: [rest], label: 'Factor' };
      if (verb === 'diff' || verb === 'derivative') {
        const d = parseDifferential(rest);
        if (d.error) return d;
        return { op: 'diff', args: [d.expr, d.variable, d.order], variable: d.variable, label: 'Differentiate' };
      }
      if (verb === 'integrate' || verb === 'integral') return makeIntegral(rest, text, options_);
      if (verb === 'limit') return makeLimit(rest, variables, options_);
      if (verb === 'eval' || verb === 'evaluate') {
        return { op: 'evaluate', args: [rest, {}], label: 'Evaluate' };
      }
    }

    // --- derivative shorthand: d/dx, d2/dx2, ∂/∂y ---
    // Groups: 1/2 order before "/", 3 variable, 4/5 order after the variable,
    // 6 the expression. The variable is captured directly after the second
    // "d" so that "sin" is not mistaken for the differential marker.
    const diff = text.match(
      /^(?:d|∂)\s*(?:\^\s*(\d+)|(\d+))?\s*\/\s*(?:d|∂)\s*([A-Za-z])(?:\^\s*(\d+)|(\d+))?\b\s*([\s\S]*)$/);
    if (diff) {
      const order = parseInt(diff[1] || diff[2] || diff[4] || diff[5] || '1', 10);
      const variable = diff[3];
      const expr = diff[6].trim().replace(/^[,=]\s*/, '').trim();
      if (!expr) return { error: 'Nothing to differentiate — try d/dx x^3' };
      return { op: 'diff', args: [expr, variable, order], variable: variable, label: 'Differentiate' };
    }

    // --- integral sign: ∫ ... dx [from a to b] ---
    if (/[\u222B\u222C\u222E]/.test(text) || /\bintegral\b/i.test(text)) {
      return makeIntegral(text, rawInput, options_);
    }

    // --- limit shorthand: lim x->a expr ---
    const lim = text.match(/^lim(?:it)?\s+([A-Za-z])\s*(?:->|→|=>|approaches?)\s*([^\s]+)\s+(.*)$/i);
    if (lim) {
      return makeLimit(lim[3].trim(), [lim[1]], { limitVar: lim[1], limitVal: lim[2] });
    }

    // --- equation: solve ---
    const eq = splitEquation(text);
    if (eq) return makeSolve(eq.lhs, text, options_, eq.rhs);

    // --- bare symbolic expression: canonicalise ---
    const variables = findVariables(text);
    if (variables.length || /[π√∫]/.test(String(rawInput))) {
      if (!/[A-Za-z0-9]/.test(text)) return null;
      return {
        op: 'canonize',
        args: [text],
        variable: options_.variable || variables[0] || null,
        variableKnown: !!options_.variable,
        label: 'Simplify',
      };
    }

    return null; // purely numeric — not our business
  }

  /** Build a solve request from an equation (either side may be empty). */
  function makeSolve(lhs, text, options, rhs) {
    const right = rhs == null ? '' : rhs;
    // `solve` in nerdamer normalises to f(x) = 0 itself.
    const equation = rhs == null ? lhs : (lhs + '=' + right);
    const variables = findVariables(equation);

    // Solve for the variable, not the dependent side: "y = 2x + 1" -> solve x.
    let variable = options.variable || null;
    if (!variable) {
      if (rhs != null && isLoneVariable(lhs) && variables.indexOf(lhs) === 0) {
        // "y = 2x + 1" solves for x; "y = y^2 + 1" can only solve for y.
        variable = variables[1] || variables[0] || null;
      } else {
        variable = variables[0] || null;
      }
    }
    if (!variable) {
      return { error: 'No variable to solve for. Try something like 2x+3=7' };
    }
    return {
      op: 'solve',
      args: [equation, variable],
      variable: variable,
      variableKnown: !!(options.variable || (rhs != null && isLoneVariable(lhs))),
      label: 'Solve',
    };
  }

  /** Build a diff request from "d/dx ..." style remainder text. */
  function parseDifferential(rest) {
    let s = rest.trim();
    const explicit = s.match(/^(?:d|∂)(?:\s*\^\s*(\d+))?\s*\/\s*(?:d|∂)(?:\s*\w)?\s*(?:\^\s*(\d+))?\s*([A-Za-z])\s*([\s\S]*)$/i);
    if (explicit) {
      return {
        order: parseInt(explicit[1] || explicit[2] || '1', 10),
        variable: explicit[3],
        expr: explicit[4].trim().replace(/^[,=]\s*/, ''),
      };
    }
    const variables = findVariables(s);
    const tail = s.match(/d\s*([A-Za-z])\s*$/i);
    if (tail) {
      return { order: 1, variable: tail[1], expr: s.slice(0, tail.index).trim() };
    }
    if (!variables.length) {
      return { error: 'No variable found — try d/dx x^3' };
    }
    return { order: 1, variable: variables[0], expr: s };
  }

  /** Build an integrate (or definite integrate) request. */
  function makeIntegral(text, raw, options) {
    let s = text;
    let bounds = null;

    // `from a to b`, or "between a and b".
    const fromTo = s.match(/\bfrom\s+(.+?)\s+to\s+(.+?)\s*$/i);
    const between = s.match(/\bbetween\s+(.+?)\s+and\s+(.+?)\s*$/i);
    if (fromTo) { bounds = [fromTo[1].trim(), fromTo[2].trim()]; s = s.slice(0, fromTo.index); }
    else if (between) { bounds = [between[1].trim(), between[2].trim()]; s = s.slice(0, between.index); }
    else {
      // Bracket bounds either lead the integral or follow it:
      //   ∫[0,3] x^2 dx   /   ∫ x^2 dx [0,3]
      // The leading form must be handled first, otherwise slicing at the
      // bracket would discard the integral sign and everything after it.
      const lead = s.match(/[\u222B\u222C\u222E]\s*\[(.+?)\s*,\s*(.+?)\]/);
      if (lead) {
        bounds = [lead[1].trim(), lead[2].trim()];
        s = s.slice(0, lead.index) + s.slice(lead.index + lead[0].length);
      } else {
        const bracket = s.match(/\[(.+?)\s*,\s*(.+?)\]/);
        if (bracket) {
          bounds = [bracket[1].trim(), bracket[2].trim()];
          s = s.slice(0, bracket.index);
        }
      }
    }

    s = s.replace(/[\u222B\u222C\u222E]/g, ' ').trim();
    s = s.replace(/^\s*(?:the\s+)?(?:integral|antiderivative)\s+(?:of\s+)?/i, '');

    // Trailing differential: dx / d x
    let variable = options.variable || null;
    const tail = s.match(/d\s*([A-Za-z])\s*$/i);
    if (tail) {
      if (!variable) variable = tail[1];
      s = s.slice(0, tail.index).trim();
    }
    s = s.replace(/[,;]\s*$/, '').trim();

    if (!s) {
      return { error: 'Nothing to integrate — try \u222B x^2 dx' };
    }
    if (!variable) {
      const variables = findVariables(s);
      variable = variables[0] || 'x';
    }

    if (bounds) {
      return {
        op: 'defint',
        args: [s, variable, bounds[0], bounds[1]],
        variable: variable,
        label: 'Definite integral',
      };
    }
    return {
      op: 'integrate',
      args: [s, variable],
      variable: variable,
      label: 'Integrate',
    };
  }

  /** Build a limit request. */
  function makeLimit(rest, variables, options) {
    const opts = options || {};
    let expr = rest.trim();
    let variable = opts.limitVar || null;
    let value = opts.limitVal || null;

    if (!value) {
      const m = expr.match(/\b(?:as|when|at)\s+([A-Za-z])\s*(?:->|→|=|approaches?)\s*([^\s,]+)\s*$/i);
      if (m) {
        variable = variable || m[1];
        value = m[2];
        expr = expr.slice(0, m.index).trim();
      }
    }
    if (!variable) variable = (variables && variables[0]) || 'x';
    if (!value) {
      return { error: 'Say where the limit is taken — try limit (x^2-1)/(x-1) as x -> 1' };
    }
    return {
      op: 'limit',
      args: [expr, variable, value],
      variable: variable,
      label: 'Limit',
    };
  }

  /* ==================================================================
   * 4. Dispatch — Web Worker with a hard timeout
   * ================================================================== */

  const workerUrl = (function () {
    // Resolve relative to this script so subdirectory hosting still works.
    if (typeof document !== 'undefined' && document.currentScript) {
      return document.currentScript.src.replace(/[^/]*$/, 'cas-worker.js');
    }
    return 'js/cas-worker.js';
  })();

  const bundleUrl = (function () {
    if (typeof document !== 'undefined' && document.currentScript) {
      return document.currentScript.src.replace(/js\/[^/]*$/, 'vendor/nerdamer.js');
    }
    return 'vendor/nerdamer.js';
  })();

  /**
   * Workers are unavailable when the page is opened straight from disk
   * (file:// blocks them) and in a few older browsers. The CAS still works
   * there — it just runs on the main thread, so it cannot be interrupted.
   * Offline-from-disk should still be usable, hence the fallback.
   */
  function workerUsable() {
    if (typeof Worker === 'undefined') return false;
    if (typeof location !== 'undefined' && /^file:$/.test(location.protocol)) return false;
    return true;
  }

  /* ---------------- direct (main-thread) fallback ---------------- */

  let directCas = null;
  let directPromise = null;

  function loadDirect() {
    if (directPromise) return directPromise;
    directPromise = new Promise(function (resolve, reject) {
      if (directCas) { resolve(directCas); return; }
      if (global.nerdamer) { directCas = global.nerdamer; resolve(directCas); return; }
      const s = document.createElement('script');
      s.src = bundleUrl;
      s.onload = function () {
        directCas = global.nerdamer;
        if (directCas) resolve(directCas);
        else reject(new Error('the CAS bundle did not initialise'));
      };
      s.onerror = function () { reject(new Error('could not load ' + bundleUrl)); };
      document.head.appendChild(s);
    });
    directPromise.catch(function () { directPromise = null; });
    return directPromise;
  }

  /** Mirror of cas-worker.js `run()`, for the main-thread fallback. */
  function runDirect(N, op, args) {
    switch (op) {
      case 'solve':
        // Same strategy module the worker uses, so offline-from-disk gives
        // identical answers (and identical speed) to the worker path.
        if (global.CasSolve && global.CasSolve.solveSmart) {
          return global.CasSolve.solveSmart(N, args[0], args[1]);
        }
        return {
          text: (function () {
            const set = N.solve(args[0], args[1]);
            return typeof set.text === 'function' ? set.text() : String(set);
          })(),
          meta: (function () {
            const set = N.solve(args[0], args[1]);
            return { list: set.toArray().map(String), strategy: 'exact' };
          })(),
        };
      case 'diff': return { text: String(N.diff.apply(null, args)), meta: {} };
      case 'integrate': return { text: String(N.integrate.apply(null, args)), meta: {} };
      case 'defint': return { text: String(N.defint.apply(null, args)), meta: {} };
      case 'limit': return { text: String(N.limit.apply(null, args)), meta: {} };
      case 'simplify': return { text: String(N(args[0]).simplify()), meta: {} };
      case 'expand': return { text: String(N(args[0]).expand()), meta: {} };
      case 'factor': return { text: String(N(args[0]).factor()), meta: {} };
      case 'canonize': return { text: String(N(args[0])), meta: {} };
      case 'evaluate': return { text: String(N(args[0]).evaluate(args[1] || {})), meta: {} };
      default: throw new Error('Unknown operation: ' + op);
    }
  }

  let worker = null;
  let workerBroken = false;
  let readyPromise = null;
  let seq = 0;
  const pending = new Map();

  function spawn() {
    if (worker || workerBroken) return worker;
    if (!workerUsable()) {
      workerBroken = true;
      return null;
    }
    try {
      worker = new Worker(workerUrl);
    } catch (err) {
      workerBroken = true;
      return null;
    }
    // Note: the Promise executor runs synchronously, before the assignment to
    // readyPromise completes — so the resolver is captured in a local first.
    let resolveReadyFn = null;
    const ready = new Promise(function (resolve) { resolveReadyFn = resolve; });
    ready.resolveReady = resolveReadyFn;
    readyPromise = ready;
    worker.onmessage = function (event) {
      const msg = event.data || {};
      if (msg.ready) {
        if (readyPromise && readyPromise.resolveReady) readyPromise.resolveReady(true);
        return;
      }
      const entry = pending.get(msg.id);
      if (!entry) return;
      pending.delete(msg.id);
      clearTimeout(entry.timer);
      entry.resolve(msg);
    };
    worker.onerror = function (event) {
      const message = (event && event.message) || 'CAS worker failed';
      if (readyPromise && readyPromise.resolveReady) readyPromise.resolveReady(false);
      pending.forEach(function (entry) {
        clearTimeout(entry.timer);
        entry.resolve({ id: entry.id, ok: false, error: message });
      });
      pending.clear();
      terminate();
      workerBroken = true;
    };
    return worker;
  }

  /**
   * Start the worker and wait until nerdamer has finished loading.
   * Kept separate from `call` so load time is not charged to the query budget.
   */
  function whenReady() {
    if (!spawn()) return loadDirect().then(function (N) { return N || false; });
    return readyPromise || Promise.resolve(true);
  }

  /** Load the solver in the background so the first query feels instant. */
  function warmup() {
    return whenReady();
  }

  /** Stop the worker, aborting anything in flight. */
  function terminate() {
    if (worker) {
      try { worker.terminate(); } catch (e) { /* ignore */ }
      worker = null;
    }
    readyPromise = null;
  }

  /** Drop the worker without marking it broken (used after a timeout). */
  function reset() {
    terminate();
    pending.clear();
  }

  /**
   * Run one CAS operation.
   * @returns {Promise<{ok:boolean, text?:string, meta?:object, error?:string}>}
   */
  function call(op, args, timeoutMs, opts) {
    const limit = timeoutMs || DEFAULT_TIMEOUT_MS;
    const forceDirect = !!(opts && opts.direct);

    // Main-thread fallback (file://, or no Worker support).
    if (forceDirect || !workerUsable()) {
      return loadDirect().then(function (N) {
        try {
          const out = runDirect(N, op, args);
          return { ok: true, text: out.text, meta: out.meta, viaMainThread: true };
        } catch (err) {
          return { ok: false, error: err && err.message ? err.message : String(err) };
        }
      }, function (err) {
        return {
          ok: false,
          error: 'The symbolic solver could not load: ' + err.message
            + '. Serve the folder over http (for example: python -m http.server) '
            + 'and it will work offline from then on.',
        };
      });
    }

    if (!spawn()) {
      return loadDirect().then(function (N) {
        try {
          const out = runDirect(N, op, args);
          return { ok: true, text: out.text, meta: out.meta, viaMainThread: true };
        } catch (err) {
          return { ok: false, error: err && err.message ? err.message : String(err) };
        }
      });
    }

    const id = ++seq;

    return whenReady().then(function (ready) {
      if (!ready) {
        return { ok: false, error: 'The symbolic solver failed to load. Try reloading the page.' };
      }
      const w = spawn();
      if (!w) return { ok: false, error: 'The symbolic solver is unavailable.' };

      return new Promise(function (resolve) {
        const timer = setTimeout(function () {
          pending.delete(id);
          // The operation is still running and cannot be interrupted in JS;
          // killing the worker is the only way to protect the UI.
          reset();
          resolve({
            ok: false,
            timeout: true,
            error: 'That took longer than ' + Math.round(limit / 1000) + 's and was stopped. '
              + 'Try simplifying the expression, or solving a lower-degree equation.',
          });
        }, limit);

        pending.set(id, { resolve: resolve, timer: timer, id: id });
        try {
          w.postMessage({ id: id, op: op, args: args });
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          resolve({ ok: false, error: 'Could not reach the solver: ' + err.message });
        }
      });
    });
  }

  /* ==================================================================
   * 5. Presentation
   * ================================================================== */

  /**
   * Tidy an arithmetic result for display: 2.0000000000000004 -> 2.
   *
   * Deliberately conservative. Only applied to strings that came out of
   * arithmetic (they contain '.' or an exponent), never to exact integer
   * literals, because rounding those would silently change large values.
   */
  function tidyNumber(s) {
    if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(s)) return s;
    if (s.indexOf('.') === -1 && s.indexOf('e') === -1 && s.indexOf('E') === -1) return s;
    const n = Number(s);
    if (!isFinite(n) || Math.abs(n) >= 1e15) return s;
    const rounded = Math.round(n);
    if (Math.abs(n - rounded) <= 1e-12 * Math.max(1, Math.abs(n))) return String(rounded);
    return String(Number(n.toPrecision(12)));
  }

  /** Unicode superscript digits, for exponents in display output. */
  const SUPERSCRIPT_DIGITS = ['\u2070', '\u00B9', '\u00B2', '\u00B3', '\u2074',
    '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];

  function toSuperscript(digits) {
    let out = '';
    for (const ch of String(digits)) {
      const d = '0123456789'.indexOf(ch);
      if (d === -1) return null;
      out += SUPERSCRIPT_DIGITS[d];
    }
    return out;
  }

  /** Human-readable rendering of a CAS string. Conservative on purpose. */
  function pretty(text) {
    if (text == null) return '';
    let s = String(text);
    s = s.replace(/\*/g, '\u00B7');
    s = s.replace(/\^\(1\/2\)/g, '^(1/2)');
    s = s.replace(/([A-Za-z0-9)\]])\^2(?![0-9])/g, '$1\u00B2');
    s = s.replace(/([A-Za-z0-9)\]])\^3(?![0-9])/g, '$1\u00B3');
    // Negative small exponents are common (derivatives of 1/x), so show
    // x^-2 as x⁻² rather than leaving the caret form.
    s = s.replace(/([A-Za-z0-9)\]])\^\(-?\s*(\d{1,2})\s*\)/g, function (m, base, exp) {
      const sup = toSuperscript(exp.replace(/\s+/g, ''));
      return sup ? base + '\u207B' + sup : m;
    });
    s = s.replace(/([A-Za-z0-9)\]])\^-(\d{1,2})(?![0-9])/g, function (m, base, exp) {
      const sup = toSuperscript(exp);
      return sup ? base + '\u207B' + sup : m;
    });
    s = s.replace(/_n/g, 'n').replace(/_k/g, 'k');
    return tidyNumber(s);
  }

  /** True when a solution string involves the imaginary unit. */
  function isComplex(solution) {
    return /(^|[^A-Za-z0-9_])i($|[^A-Za-z0-9_])/.test(String(solution));
  }

  /**
   * Parse nerdamer's numeric root strings into {re, im}.
   * Handles "3", "-1.5", "1.25+0.5*i", "-0.3-1.2*i", "i", "-i".
   */
  function parseNumeric(s) {
    const raw = String(s).trim().replace(/\*/g, '');
    if (raw === 'i') return { re: 0, im: 1 };
    if (raw === '-i') return { re: 0, im: -1 };
    const m = raw.match(/^(-?\d*\.?\d+(?:e[+-]?\d+)?)([+-])(\d*\.?\d+(?:e[+-]?\d+)?)i$/i);
    if (m) {
      const re = Number(m[1]);
      const im = Number(m[3]) * (m[2] === '-' ? -1 : 1);
      if (isFinite(re) && isFinite(im)) return { re: re, im: im };
    }
    const n = Number(raw);
    if (isFinite(n)) return { re: n, im: 0 };
    return null;
  }

  /** Round to `digits` significant figures, dropping float noise. */
  function roundSignificant(n, digits) {
    if (!isFinite(n)) return n;
    const d = digits || 6;
    if (n === 0) return 0;
    return Number(n.toPrecision(d));
  }

  /**
   * Render numeric roots compactly: sort real roots, and pair complex
   * conjugates as "a ± b·i" instead of listing four near-duplicate numbers.
   */
  function formatNumericRoots(list) {
    const parsed = list.map(parseNumeric);
    if (parsed.some((p) => p === null)) return null; // not all numeric

    const rounded = parsed.map((p) => ({ re: roundSignificant(p.re, 6), im: roundSignificant(p.im, 6) }));
    const EPS = 1e-9;

    if (rounded.every((p) => Math.abs(p.im) < EPS)) {
      return {
        text: rounded.map((p) => p.re).sort((a, b) => a - b).join('  or  '),
        complex: false,
      };
    }

    // Pair conjugates: group by real part, then match +im with -im.
    const used = new Array(rounded.length).fill(false);
    const groups = [];
    for (let i = 0; i < rounded.length; i++) {
      if (used[i]) continue;
      const p = rounded[i];
      if (Math.abs(p.im) < EPS) {
        used[i] = true;
        groups.push({ re: p.re, im: null });
        continue;
      }
      let partner = -1;
      for (let j = 0; j < rounded.length; j++) {
        if (used[j] || j === i) continue;
        const q = rounded[j];
        if (Math.abs(q.re - p.re) < EPS && Math.abs(q.im + p.im) < EPS) { partner = j; break; }
      }
      used[i] = true;
      if (partner !== -1) used[partner] = true;
      const magnitude = Math.abs(p.im);
      const sign = p.im < 0 ? '-' : '+';
      groups.push({
        re: p.re,
        im: partner !== -1 ? { value: magnitude, sign: sign } : magnitude,
      });
    }

    groups.sort((a, b) => a.re - b.re);
    const parts = groups.map(function (g) {
      if (g.im === null) return String(g.re);
      if (typeof g.im === 'object') {
        return g.re + ' \u00B1 ' + g.im.value + '\u00B7i';
      }
      return g.re + ' + ' + g.im + '\u00B7i';
    });
    return { text: parts.join('  or  '), complex: true };
  }

  /** Format one root: rounded when numeric, prettified when symbolic. */
  function formatSingleRoot(s) {
    const p = parseNumeric(s);
    if (!p) return pretty(s);
    const re = roundSignificant(p.re, 6);
    if (Math.abs(p.im) < 1e-9) return String(re);
    const im = roundSignificant(Math.abs(p.im), 6);
    return re + (p.im < 0 ? ' \u2212 ' : ' + ') + im + '\u00B7i';
  }

  /** True when a solution is a parametrised family such as n*pi. */
  function isFamily(solution) {
    const s = String(solution);
    // nerdamer writes the integer index as _n / _k.
    if (/(^|[^A-Za-z0-9])_[nk](?![A-Za-z0-9])/.test(s)) return true;
    return /Infinity/.test(s);
  }

  /** Sort a solution list numerically when every entry is a real number. */
  function sortSolutions(list) {
    const nums = list.map(function (s) { return Number(s); });
    if (nums.every(function (n) { return isFinite(n); })) return nums.sort(function (a, b) { return a - b; });
    return list;
  }

  /**
   * Turn a worker reply into something worth showing, including an honest
   * caveat whenever the answer may be incomplete.
   */
  function present(request, reply) {
    const label = request.label || 'Result';
    if (!reply.ok) {
      return { ok: false, op: request.op, label: label, error: reply.error || 'Unknown error' };
    }

    const meta = reply.meta || {};
    const notes = [];
    let text = pretty(reply.text);
    let solutions = null;

    if (request.op === 'solve') {
      const list = (meta.list && meta.list.length) ? meta.list.slice() : [];
      const variable = request.variable || 'x';

      if (list.length && list.every(function (s) { return /(^|\W)all(\W|$)/.test(s); })) {
        text = 'Any value of ' + variable + ' satisfies the equation.';
        notes.push('The two sides are identical, so this is an identity rather than an equation with roots.');
      } else if (!list.length) {
        text = 'No closed-form solution found.';
        notes.push('The solver tries symbolic and polynomial methods and then a bounded '
          + 'numeric search. An empty result is not proof that no solution exists.');
      } else {
        const numericStrategy = meta.strategy === 'numeric-roots'
          || meta.strategy === 'mixed-factored';
        if (numericStrategy) {
          // Numeric roots (high-degree polynomials) come back as long decimals.
          const allNumeric = formatNumericRoots(list);
          let body;
          if (allNumeric) {
            body = allNumeric.text;
            if (allNumeric.complex) {
              notes.push('Some solutions are complex (i is the imaginary unit).');
            }
          } else {
            // Mixed: a few exact roots alongside numeric ones.
            body = list.map(formatSingleRoot).join('  or  ');
            if (list.some(isComplex)) {
              notes.push('Some solutions are complex (i is the imaginary unit).');
            }
          }
          text = variable + ' = ' + body;
          solutions = list;
          notes.push('Numeric roots \u2014 this polynomial has no simple closed form.');
        } else {
          const sorted = sortSolutions(list);
          const complex = sorted.some(isComplex);
          const family = sorted.some(isFamily);
          const shown = sorted.map(pretty);
          text = variable + ' = ' + shown.join('  or  ');
          solutions = sorted;
          if (complex) notes.push('Some solutions are complex (i is the imaginary unit).');
          if (family) {
            notes.push('This is a family of solutions: the index n runs over the integers.');
          }
          if (sorted.length > 12) {
            text = variable + ' = ' + shown.slice(0, 12).join(', ')
              + ' \u2026 (' + sorted.length + ' total)';
          }
        }
      }
      if (meta.partial) notes.push('The solver stopped early, so this list may be incomplete.');
      if (meta.unsolved && meta.unsolved !== 'undefined') {
        notes.push('Unresolved part: ' + pretty(meta.unsolved));
      }
      // Only mention numerics once; the numeric-roots path already says so.
      const alreadyFlagged = notes.some(function (n) { return /^Numeric roots/.test(n); });
      if (!alreadyFlagged && (meta.solutionsType === 'numeric' || /\.\d{4,}/.test(text))) {
        notes.push('Solutions are given numerically.');
      }
    }

    if (/^(integrate|defint)$/.test(request.op) && /^(integrate|limit)\(/.test(String(reply.text))) {
      notes.push('The symbolic solver could not resolve this, so the operation is left '
        + 'unevaluated.');
    }

    return {
      ok: true,
      op: request.op,
      label: label,
      text: text,
      raw: String(reply.text),
      solutions: solutions,
      variable: request.variable || null,
      viaMainThread: !!reply.viaMainThread,
      notes: notes,
    };
  }

  /* ==================================================================
   * Public API
   * ================================================================== */

  /**
   * Solve a typed problem.
   * @param {string} input
   * @param {{variable?:string, timeout?:number}} [options]
   * @returns {Promise<object|null>} null when the input is not symbolic
   */
  function solve(input, options) {
    const opts = options || {};
    const request = detect(input, opts);
    if (request === null) return Promise.resolve(null);
    if (request.error) return Promise.resolve(request);
    return call(request.op, request.args, opts.timeout, opts).then(function (reply) {
      return present(request, reply);
    });
  }

  /** Synchronous classification, for deciding whether to intercept `=`. */
  function classify(input, options) {
    const request = detect(input, options);
    if (request === null) return null;
    if (request.error) return request;
    return request;
  }

  const Symbolic = {
    solve: solve,
    classify: classify,
    detect: detect,
    normalize: normalize,
    pretty: pretty,
    tidyNumber: tidyNumber,
    findUnsupported: findUnsupported,
    findVariables: findVariables,
    splitEquation: splitEquation,
    parseNumeric: parseNumeric,
    formatNumericRoots: formatNumericRoots,
    formatSingleRoot: formatSingleRoot,
    call: call,
    warmup: warmup,
    workerUsable: workerUsable,
    reset: reset,
    MAX_INPUT: MAX_INPUT,
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
  };

  global.Symbolic = Symbolic;
  if (typeof module !== 'undefined' && module.exports) module.exports = Symbolic;
})(typeof window !== 'undefined' ? window : globalThis);
