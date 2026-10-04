'use strict';

/**
 * Graph UI — wires the grapher canvas to controls and inputs.
 * Depends on js/grapher.js (Grapher class).
 */
(function () {
  const Grapher = window.Grapher;

  const LS_KEYS = { graphFunctions: 'calc:graph-fns' };

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
  };

  const MAX_FUNCTIONS = 8;

  /* Predefined colors for new functions. */
  const PALETTE = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#f97316',
  ];

  /* Quick-add templates: label + expression. */
  const TEMPLATES = [
    { label: 'sin(x)', expr: 'sin(x)' },
    { label: 'cos(x)', expr: 'cos(x)' },
    { label: 'tan(x)', expr: 'tan(x)' },
    { label: 'x²', expr: 'x^2' },
    { label: 'x³', expr: 'x^3' },
    { label: '√x', expr: 'sqrt(x)' },
    { label: '1/x', expr: '1/x' },
    { label: 'ln(x)', expr: 'ln(x)' },
    { label: 'log(x)', expr: 'log(x)' },
    { label: 'eˣ', expr: 'exp(x)' },
    { label: '|x|', expr: 'abs(x)' },
    { label: 'x·sin(x)', expr: 'x*sin(x)' },
  ];

  /* ---------------- DOM refs ---------------- */
  const graphViewEl = document.getElementById('graph-view');
  const graphCanvasEl = document.getElementById('graph-canvas');
  const graphBackBtnEl = document.getElementById('btn-graph-back');
  const graphTitleEl = document.getElementById('graph-title');
  const functionInputsEl = document.getElementById('function-inputs');
  const addFunctionBtnEl = document.getElementById('btn-add-function');
  const templatesEl = document.getElementById('function-templates');
  const zoomInBtnEl = document.getElementById('btn-zoom-in');
  const zoomOutBtnEl = document.getElementById('btn-zoom-out');
  const resetViewBtnEl = document.getElementById('btn-reset-view');
  const rangeXMinEl = document.getElementById('range-x-min');
  const rangeXMaxEl = document.getElementById('range-x-max');
  const rangeYMinEl = document.getElementById('range-y-min');
  const rangeYMaxEl = document.getElementById('range-y-max');
  const rangeApplyBtnEl = document.getElementById('btn-range-apply');
  const rootFindBtnEl = document.getElementById('btn-find-root');
  const rootResultEl = document.getElementById('root-result');
  const derivBtnEl = document.getElementById('btn-derivative');
  const derivResultEl = document.getElementById('deriv-result');
  const integrateBtnEl = document.getElementById('btn-integrate');
  const integrateResultEl = document.getElementById('integrate-result');
  const integrateAEl = document.getElementById('integrate-a');
  const integrateBEl = document.getElementById('integrate-b');

  /* New analysis / tools */
  const intersectionsBtnEl = document.getElementById('btn-intersections');
  const intersectionsResultEl = document.getElementById('intersections-result');
  const extremaBtnEl = document.getElementById('btn-extrema');
  const extremaResultEl = document.getElementById('extrema-result');
  const tangentBtnEl = document.getElementById('btn-tangent');
  const tableBtnEl = document.getElementById('btn-table');
  const tablePanelEl = document.getElementById('table-panel');
  const tableStepEl = document.getElementById('table-step');
  const exportPngBtnEl = document.getElementById('btn-export-png');
  const modeBtnEl = document.getElementById('btn-mode');

  /* ---------------- state ---------------- */
  let grapher = null;
  let _lastFocusedInput = null; // track the last focused fn-text input
  const _debounceTimers = new Map(); // index -> timeout id

  // Expose grapher for debugging/testing
  Object.defineProperty(window, '__grapherInstance', { get: () => grapher });

  /* Plot colors per app theme. */
  const GRAPH_THEMES = {
    dark: {
      bgColor: '#16161f',
      gridColor: '#2d2d44',
      axisColor: '#a5b4fc',
      labelColor: '#8888a0',
      crosshairColor: 'rgba(255, 255, 255, 0.25)',
      panelBg: 'rgba(30, 30, 46, 0.95)',
      panelBorder: 'rgba(255, 255, 255, 0.12)',
      panelText: '#e5e7eb',
      panelMuted: '#8888a0',
    },
    oled: {
      bgColor: '#000000',
      gridColor: '#1c1c2e',
      axisColor: '#818cf8',
      labelColor: '#6b7280',
      crosshairColor: 'rgba(255, 255, 255, 0.3)',
      panelBg: 'rgba(15, 15, 20, 0.95)',
      panelBorder: 'rgba(255, 255, 255, 0.15)',
      panelText: '#f3f4f6',
      panelMuted: '#6b7280',
    },
    light: {
      bgColor: '#ffffff',
      gridColor: '#e5e7eb',
      axisColor: '#374151',
      labelColor: '#6b7280',
      crosshairColor: 'rgba(0, 0, 0, 0.25)',
      panelBg: 'rgba(255, 255, 255, 0.95)',
      panelBorder: 'rgba(0, 0, 0, 0.1)',
      panelText: '#1f2937',
      panelMuted: '#9ca3af',
    },
  };

  const rootEl = document.querySelector('.calculator');

  function applyGraphTheme() {
    if (!grapher) return;
    const t = document.documentElement.getAttribute('data-theme');
    grapher.setColors(GRAPH_THEMES[t] || GRAPH_THEMES.dark);
  }

  window.addEventListener('app:theme', applyGraphTheme);

  /* ---------------- init ---------------- */
  function init() {
    grapher = new Grapher(graphCanvasEl, {
      width: 700,
      height: 500,
      xMin: -10,
      xMax: 10,
      yMin: -10,
      yMax: 10,
    });

    // Load saved functions or use defaults
    const saved = storage.get(LS_KEYS.graphFunctions);
    if (saved) {
      try {
        const fns = JSON.parse(saved);
        fns.forEach((f) => {
          const def = {
            mode: f.mode || 'cartesian',
            expr: f.expr || '',
            rExpr: f.rExpr || '',
            xExpr: f.xExpr || '',
            yExpr: f.yExpr || '',
            tMin: f.tMin,
            tMax: f.tMax,
          };
          const hasExpr = (def.mode === 'cartesian' && def.expr) ||
                          (def.mode === 'polar' && def.rExpr) ||
                          (def.mode === 'parametric' && def.xExpr && def.yExpr);
          if (hasExpr) {
            grapher.addFunction(def, f.color, f.label);
            if (f.visible === false) {
              grapher.setFunctionVisible(grapher.functions.length - 1, false);
            }
          }
        });
      } catch (e) { /* ignore */ }
    }

    // If no functions loaded, add demo ones for first visit
    if (grapher.functions.length === 0) {
      grapher.addFunction('sin(x)', PALETTE[0], 'sin(x)');
      grapher.addFunction('x^2 / 10', PALETTE[1], 'x²/10');
    }

    // Render initial state
    grapher.render();
    applyGraphTheme();

    // Bind events
    bindEvents();

    // Update function input UI
    updateFunctionInputs();
  }

  function bindEvents() {
    graphBackBtnEl.addEventListener('click', () => {
      if (window.__grapherUI && window.__grapherUI.hideGraph) {
        window.__grapherUI.hideGraph();
      } else {
        graphViewEl.hidden = true;
        document.getElementById('calculator-view').hidden = false;
        graphBackBtnEl.hidden = true;
        graphTitleEl.hidden = true;
      }
    });

    zoomInBtnEl.addEventListener('click', () => {
      grapher.zoom(0.7);
      grapher.render();
    });

    zoomOutBtnEl.addEventListener('click', () => {
      grapher.zoom(1.4);
      grapher.render();
    });

    resetViewBtnEl.addEventListener('click', () => {
      grapher.resetView();
      grapher.render();
    });

    rangeApplyBtnEl.addEventListener('click', () => {
      const xMin = parseFloat(rangeXMinEl.value);
      const xMax = parseFloat(rangeXMaxEl.value);
      const yMin = parseFloat(rangeYMinEl.value);
      const yMax = parseFloat(rangeYMaxEl.value);
      if (!isNaN(xMin) && !isNaN(xMax) && !isNaN(yMin) && !isNaN(yMax)) {
        grapher.setXRange(xMin, xMax);
        grapher.setYRange(yMin, yMax);
        grapher.render();
      }
    });

    rootFindBtnEl.addEventListener('click', () => findRoot());
    derivBtnEl.addEventListener('click', () => findDerivative());
    integrateBtnEl.addEventListener('click', () => integrate());

    if (intersectionsBtnEl) intersectionsBtnEl.addEventListener('click', () => computeIntersections());
    if (extremaBtnEl) extremaBtnEl.addEventListener('click', () => computeExtrema());
    if (tangentBtnEl) tangentBtnEl.addEventListener('click', () => toggleTangent());
    if (tableBtnEl) tableBtnEl.addEventListener('click', () => toggleTable());
    if (exportPngBtnEl) exportPngBtnEl.addEventListener('click', () => exportPNG());
    if (modeBtnEl) modeBtnEl.addEventListener('click', () => toggleInteractionMode());
    const tableCloseEl = document.getElementById('btn-table-close');
    if (tableCloseEl) tableCloseEl.addEventListener('click', () => { tablePanelEl.hidden = true; tableBtnEl && tableBtnEl.setAttribute('aria-pressed', 'false'); });

    addFunctionBtnEl.addEventListener('click', () => addNewFunction());

    // Template click handlers
    templatesEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.template-btn');
      if (!btn) return;
      applyTemplate(btn.dataset.expr, btn.dataset.label);
    });

    // Delegated input change handlers for function inputs
    functionInputsEl.addEventListener('input', (e) => {
      const row = e.target.closest('.fn-input-row');
      if (!row) return;
      const index = parseInt(row.dataset.index);

      // Debounce re-renders while typing
      clearTimeout(_debounceTimers.get(index));
      _debounceTimers.set(index, setTimeout(() => {
        updateFunctionFromInput(index, row);
      }, 200));
    });

    functionInputsEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('fn-mode')) return;
      const row = e.target.closest('.fn-input-row');
      if (!row) return;
      const index = parseInt(row.dataset.index);
      if (!grapher.functions[index]) {
        grapher.addFunction({ mode: e.target.value }, PALETTE[index % PALETTE.length], '');
      } else {
        grapher.setFunctionDef(index, { mode: e.target.value });
      }
      updateFunctionInputs();
      saveFunctions();
      grapher.render();
    });

    functionInputsEl.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('fn-text')) {
        _lastFocusedInput = e.target;
      }
    });
  }

  /* ---------------- function row management ---------------- */

  function defFromRow(index, row) {
    const fn = grapher.functions[index];
    const mode = fn && fn.mode ? fn.mode : 'cartesian';
    const main = row.querySelector('.fn-main');
    const second = row.querySelector('.fn-second');
    const def = { mode };
    if (mode === 'polar') {
      def.rExpr = main ? main.value.trim() : '';
    } else if (mode === 'parametric') {
      def.xExpr = main ? main.value.trim() : '';
      def.yExpr = second ? second.value.trim() : '';
      const tMinEl = row.querySelector('.fn-tmin');
      const tMaxEl = row.querySelector('.fn-tmax');
      const tMin = tMinEl ? parseFloat(tMinEl.value) : NaN;
      const tMax = tMaxEl ? parseFloat(tMaxEl.value) : NaN;
      def.tMin = isNaN(tMin) ? -5 : tMin;
      def.tMax = isNaN(tMax) ? 5 : tMax;
    } else {
      def.expr = main ? main.value.trim() : '';
    }
    return def;
  }

  function defHasInput(def) {
    if (def.mode === 'parametric') return !!(def.xExpr || def.yExpr);
    if (def.mode === 'polar') return !!def.rExpr;
    return !!def.expr;
  }

  function autoLabel(def, index) {
    if (def.mode === 'polar') return `r = ${def.rExpr}`;
    if (def.mode === 'parametric') return `(${def.xExpr}, ${def.yExpr})`;
    return `f${index + 1}(x) = ${def.expr}`;
  }

  function updateFunctionFromInput(index, row) {
    const def = defFromRow(index, row);

    if (!defHasInput(def)) {
      // Empty expression — hide the function but keep the row
      if (grapher.functions[index]) {
        grapher.setFunctionDef(index, def, '');
        grapher.setFunctionVisible(index, false);
      }
      row.classList.remove('fn-invalid');
      grapher.render();
      saveFunctions();
      return;
    }

    // If the row doesn't have a function yet, create one
    if (!grapher.functions[index]) {
      grapher.addFunction(def, PALETTE[index % PALETTE.length], autoLabel(def, index));
    } else {
      grapher.setFunctionDef(index, def, autoLabel(def, index));
    }

    const valid = grapher.isFunctionValid(grapher.functions[index]);
    row.classList.toggle('fn-invalid', !valid);
    grapher.setFunctionVisible(index, valid);
    grapher.render();
    saveFunctions();
  }

  function addNewFunction() {
    if (grapher.functions.length >= MAX_FUNCTIONS) {
      alert(`Maximum ${MAX_FUNCTIONS} functions allowed.`);
      return;
    }
    // Add an empty placeholder function
    grapher.addFunction('', PALETTE[grapher.functions.length % PALETTE.length], '');
    updateFunctionInputs();
    saveFunctions();

    // Focus the new input
    const rows = functionInputsEl.querySelectorAll('.fn-input-row');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      const input = lastRow.querySelector('.fn-text');
      if (input) input.focus();
    }
  }

  function removeFunction(index) {
    if (grapher.functions.length <= 1) {
      // Don't allow removing the last function — just clear it
      const row = functionInputsEl.querySelector(`.fn-input-row[data-index="${index}"]`);
      if (row) {
        const input = row.querySelector('.fn-text');
        if (input) input.value = '';
      }
      grapher.setFunctionExpression(index, '', '');
      grapher.setFunctionVisible(index, false);
      grapher.render();
      saveFunctions();
      return;
    }
    grapher.removeFunction(index);
    updateFunctionInputs();
    saveFunctions();
    grapher.render();
  }

  function cycleFunctionColor(index) {
    if (!grapher.functions[index]) return;
    const currentColor = grapher.functions[index].color;
    const currentIdx = PALETTE.indexOf(currentColor);
    const nextIdx = (currentIdx + 1) % PALETTE.length;
    grapher.setFunctionColor(index, PALETTE[nextIdx]);
    updateFunctionInputs();
    grapher.render();
    saveFunctions();
  }

  function toggleFunctionVisible(index) {
    if (!grapher.functions[index]) return;
    grapher.setFunctionVisible(index, !grapher.functions[index].visible);
    updateFunctionInputs();
    grapher.render();
    saveFunctions();
  }

  function applyTemplate(expr, label) {
    // Find an empty slot, or add a new one
    let targetIndex = -1;
    for (let i = 0; i < grapher.functions.length; i++) {
      const fn = grapher.functions[i];
      const hasInput = fn.mode === 'parametric' ? (fn.xExpr || fn.yExpr)
        : fn.mode === 'polar' ? fn.rExpr
        : fn.expr;
      if (!hasInput || hasInput.trim() === '') {
        targetIndex = i;
        break;
      }
    }
    const def = { mode: 'cartesian', expr };
    if (targetIndex === -1) {
      if (grapher.functions.length >= MAX_FUNCTIONS) {
        alert(`Maximum ${MAX_FUNCTIONS} functions allowed.`);
        return;
      }
      grapher.addFunction(def, PALETTE[grapher.functions.length % PALETTE.length], label);
      targetIndex = grapher.functions.length - 1;
    } else {
      grapher.setFunctionDef(targetIndex, def, label);
      grapher.setFunctionVisible(targetIndex, true);
    }
    updateFunctionInputs();
    grapher.render();
    saveFunctions();
  }

  /* ---------------- render the function rows ---------------- */

  function updateFunctionInputs() {
    functionInputsEl.textContent = '';
    grapher.functions.forEach((fn, i) => {
      const mode = fn.mode || 'cartesian';
      const row = document.createElement('div');
      row.className = 'fn-input-row';
      if (!fn.visible) row.classList.add('fn-hidden');
      const hasAnyInput = mode === 'parametric' ? (fn.xExpr || fn.yExpr) : mode === 'polar' ? fn.rExpr : fn.expr;
      if (hasAnyInput && !grapher.isFunctionValid(fn)) row.classList.add('fn-invalid');
      row.dataset.index = i;

      // Color swatch (click to cycle)
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'fn-swatch';
      swatch.style.backgroundColor = fn.color;
      swatch.setAttribute('aria-label', 'Change color');
      swatch.title = 'Click to change color';
      swatch.addEventListener('click', () => cycleFunctionColor(i));

      // Mode selector
      const modeSel = document.createElement('select');
      modeSel.className = 'fn-mode';
      modeSel.setAttribute('aria-label', `Function ${i + 1} mode`);
      [['cartesian', 'y = f(x)'], ['polar', 'r = f(θ)'], ['parametric', '(x(t), y(t))']].forEach(([val, text]) => {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = text;
        if (val === mode) opt.selected = true;
        modeSel.appendChild(opt);
      });

      // Main expression input (expr / rExpr / xExpr depending on mode)
      const main = document.createElement('input');
      main.type = 'text';
      main.className = 'fn-text fn-main';
      main.autocomplete = 'off';
      main.spellcheck = false;
      if (mode === 'polar') {
        main.value = fn.rExpr || '';
        main.placeholder = 'r(θ) e.g. 2*cos(2*x)';
        main.setAttribute('aria-label', `Function ${i + 1} r(θ)`);
      } else if (mode === 'parametric') {
        main.value = fn.xExpr || '';
        main.placeholder = 'x(t) e.g. 3*cos(x)';
        main.setAttribute('aria-label', `Function ${i + 1} x(t)`);
      } else {
        main.value = fn.expr || '';
        main.placeholder = 'e.g. sin(x), x^2, 1/x';
        main.setAttribute('aria-label', `Function ${i + 1} expression`);
      }

      row.appendChild(swatch);
      row.appendChild(modeSel);
      row.appendChild(main);

      // Second expression input + t-range (parametric only)
      if (mode === 'parametric') {
        const second = document.createElement('input');
        second.type = 'text';
        second.className = 'fn-text fn-second';
        second.value = fn.yExpr || '';
        second.placeholder = 'y(t) e.g. 2*sin(x)';
        second.setAttribute('aria-label', `Function ${i + 1} y(t)`);
        second.autocomplete = 'off';
        second.spellcheck = false;
        row.appendChild(second);

        const tMin = document.createElement('input');
        tMin.type = 'number';
        tMin.className = 'fn-t fn-tmin';
        tMin.value = fn.tMin != null ? fn.tMin : -5;
        tMin.step = '0.5';
        tMin.placeholder = 't min';
        tMin.setAttribute('aria-label', 't minimum');
        row.appendChild(tMin);

        const tMax = document.createElement('input');
        tMax.type = 'number';
        tMax.className = 'fn-t fn-tmax';
        tMax.value = fn.tMax != null ? fn.tMax : 5;
        tMax.step = '0.5';
        tMax.placeholder = 't max';
        tMax.setAttribute('aria-label', 't maximum');
        row.appendChild(tMax);
      }

      // Visibility toggle
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'fn-toggle';
      toggle.textContent = fn.visible ? '👁' : '👁‍🗨';
      toggle.setAttribute('aria-label', fn.visible ? 'Hide function' : 'Show function');
      toggle.title = fn.visible ? 'Hide' : 'Show';
      toggle.addEventListener('click', () => toggleFunctionVisible(i));

      // Delete button
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'fn-delete';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Remove function');
      del.title = 'Remove';
      del.addEventListener('click', () => removeFunction(i));

      row.appendChild(toggle);
      row.appendChild(del);
      functionInputsEl.appendChild(row);
    });

    // Update the add button state
    if (grapher.functions.length >= MAX_FUNCTIONS) {
      addFunctionBtnEl.disabled = true;
      addFunctionBtnEl.textContent = `+ Add function (${MAX_FUNCTIONS} max)`;
    } else {
      addFunctionBtnEl.disabled = false;
      addFunctionBtnEl.textContent = '+ Add function';
    }
  }

  function saveFunctions() {
    const fns = grapher.functions.map((fn) => ({
      mode: fn.mode || 'cartesian',
      expr: fn.expr,
      rExpr: fn.rExpr,
      xExpr: fn.xExpr,
      yExpr: fn.yExpr,
      tMin: fn.tMin,
      tMax: fn.tMax,
      color: fn.color,
      label: fn.label,
      visible: fn.visible,
    }));
    storage.set(LS_KEYS.graphFunctions, JSON.stringify(fns));
  }

  /* ---------------- math operations ---------------- */

  /**
   * The function the analysis buttons operate on: the first visible, valid
   * cartesian function (falls back to the first function with a compiled eval).
   */
  function getActiveFunction() {
    if (!grapher || !grapher.functions) return null;
    const cartesian = grapher.functions.find(
      (f) => f.visible && (!f.mode || f.mode === 'cartesian') && typeof f.eval === 'function');
    if (cartesian) return cartesian.eval;
    const any = grapher.functions.find((f) => f.visible && typeof f.eval === 'function');
    return any ? any.eval : null;
  }

  function findRoot() {
    const fn = getActiveFunction();
    if (!fn) { rootResultEl.textContent = 'No active function'; rootResultEl.className = 'result error'; return; }

    const a = parseFloat(rangeXMinEl.value);
    const b = parseFloat(rangeXMaxEl.value);
    if (isNaN(a) || isNaN(b)) { rootResultEl.textContent = 'Set x range first'; rootResultEl.className = 'result error'; return; }

    const root = grapher.findRoot(fn, a, b);
    if (root != null) {
      rootResultEl.textContent = `x ≈ ${root.toFixed(6)}`;
      rootResultEl.className = 'result ok';
    } else {
      rootResultEl.textContent = 'No root found in range';
      rootResultEl.className = 'result error';
    }
  }

  function findDerivative() {
    const fn = getActiveFunction();
    if (!fn) { derivResultEl.textContent = 'No active function'; derivResultEl.className = 'result error'; return; }

    const x = parseFloat(rangeXMinEl.value);
    if (isNaN(x)) { derivResultEl.textContent = 'Set x range first'; derivResultEl.className = 'result error'; return; }

    const df = grapher._derivative(fn, x);
    if (df != null) {
      derivResultEl.textContent = `f'(${x}) ≈ ${df.toFixed(6)}`;
      derivResultEl.className = 'result ok';
    } else {
      derivResultEl.textContent = 'Derivative undefined';
      derivResultEl.className = 'result error';
    }
  }

  function integrate() {
    const fn = getActiveFunction();
    if (!fn) { integrateResultEl.textContent = 'No active function'; integrateResultEl.className = 'result error'; return; }

    const a = parseFloat(integrateAEl.value);
    const b = parseFloat(integrateBEl.value);
    if (isNaN(a) || isNaN(b)) { integrateResultEl.textContent = 'Set integration bounds'; integrateResultEl.className = 'result error'; return; }

    const result = grapher.integrate(fn, a, b);
    if (result != null) {
      integrateResultEl.textContent = `∫${a} to ${b} f(x)dx ≈ ${result.toFixed(6)}`;
      integrateResultEl.className = 'result ok';
      // Shade the area on the active function
      const idx = grapher.functions.findIndex((f) => f.visible && (!f.mode || f.mode === 'cartesian') && f.eval === fn);
      grapher.shadeRange = { a, b, fnIndex: idx };
      grapher.render();
    } else {
      integrateResultEl.textContent = 'Integration failed';
      integrateResultEl.className = 'result error';
    }
  }

  /* ---------------- new analysis: intersections, extrema, tangent ---------------- */

  function getVisibleCartesianFns() {
    return grapher.functions
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.visible && (!f.mode || f.mode === 'cartesian') && f.eval);
  }

  function computeIntersections() {
    const fns = getVisibleCartesianFns();
    if (fns.length < 2) {
      intersectionsResultEl.textContent = 'Need ≥ 2 visible y = f(x) functions';
      intersectionsResultEl.className = 'result error';
      return;
    }
    const xMin = parseFloat(rangeXMinEl.value);
    const xMax = parseFloat(rangeXMaxEl.value);
    if (isNaN(xMin) || isNaN(xMax)) {
      intersectionsResultEl.textContent = 'Set x range first';
      intersectionsResultEl.className = 'result error';
      return;
    }

    const markers = [];
    const lines = [];
    for (let i = 0; i < fns.length; i++) {
      for (let j = i + 1; j < fns.length; j++) {
        const pts = GrapherMath.findIntersectionsInRange(fns[i].f.eval, fns[j].f.eval, xMin, xMax);
        for (const p of pts) {
          markers.push({ x: p.x, y: p.y, kind: 'intersection' });
          lines.push(`(${p.x.toFixed(4)}, ${p.y.toFixed(4)})`);
        }
      }
    }
    grapher.markers = markers;
    grapher.render();
    intersectionsResultEl.textContent = markers.length
      ? `${markers.length} intersection${markers.length > 1 ? 's' : ''}: ${lines.slice(0, 4).join('  ')}${lines.length > 4 ? ' …' : ''}`
      : 'No intersections in range';
    intersectionsResultEl.className = markers.length ? 'result ok' : 'result error';
  }

  function computeExtrema() {
    const fn = getActiveFunction();
    if (!fn) { extremaResultEl.textContent = 'No active function'; extremaResultEl.className = 'result error'; return; }

    const xMin = parseFloat(rangeXMinEl.value);
    const xMax = parseFloat(rangeXMaxEl.value);
    if (isNaN(xMin) || isNaN(xMax)) {
      extremaResultEl.textContent = 'Set x range first';
      extremaResultEl.className = 'result error';
      return;
    }

    const ext = GrapherMath.findExtremaInRange(fn, xMin, xMax);
    grapher.markers = ext.map((p) => ({ x: p.x, y: p.y, kind: p.kind }));
    grapher.render();
    extremaResultEl.textContent = ext.length
      ? ext.map((p) => `${p.kind} (${p.x.toFixed(4)}, ${p.y.toFixed(4)})`).join('  ')
      : 'No extrema in range';
    extremaResultEl.className = ext.length ? 'result ok' : 'result error';
  }

  function toggleTangent() {
    grapher.showTangent = !grapher.showTangent;
    tangentBtnEl.setAttribute('aria-pressed', String(grapher.showTangent));
    if (grapher.showTangent && grapher.tangentX == null && !grapher.cursor) {
      grapher.tangentX = (parseFloat(rangeXMinEl.value) + parseFloat(rangeXMaxEl.value)) / 2;
    }
    grapher.render();
  }

  /* ---------------- values table ---------------- */

  function renderTable() {
    const tbl = document.getElementById('values-table');
    if (!tbl) return;
    const xMin = parseFloat(rangeXMinEl.value);
    const xMax = parseFloat(rangeXMaxEl.value);
    let step = parseFloat(tableStepEl.value);
    if (isNaN(step) || step <= 0) step = 1;
    if (isNaN(xMin) || isNaN(xMax) || xMin >= xMax) {
      tbl.innerHTML = '<tr><td>Set a valid x range</td></tr>';
      return;
    }

    const fns = getVisibleCartesianFns().slice(0, 4);
    if (fns.length === 0) {
      tbl.innerHTML = '<tr><td>No visible cartesian functions</td></tr>';
      return;
    }

    const rows = [];
    rows.push('<tr><th>x</th>' + fns.map(({ f }) => `<th>${f.label || 'f(x)'}</th>`).join('') + '</tr>');
    const maxRows = 60;
    const effectiveStep = Math.max(step, (xMax - xMin) / maxRows);
    for (let x = xMin; x <= xMax + 1e-12; x += effectiveStep) {
      const cells = fns.map(({ f }) => {
        const y = f.eval(x);
        return `<td>${y == null || isNaN(y) || !isFinite(y) ? '—' : GrapherMath.formatNum(y)}</td>`;
      });
      rows.push(`<tr><td>${GrapherMath.formatNum(x)}</td>${cells.join('')}</tr>`);
    }
    tbl.innerHTML = rows.join('');
  }

  function toggleTable() {
    tablePanelEl.hidden = !tablePanelEl.hidden;
    tableBtnEl.setAttribute('aria-pressed', String(!tablePanelEl.hidden));
    if (!tablePanelEl.hidden) renderTable();
  }

  /* ---------------- PNG export ---------------- */

  function exportPNG() {
    try {
      const url = graphCanvasEl.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'graph.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert('Could not export PNG');
    }
  }

  /* ---------------- pan / inspect toggle ---------------- */

  function toggleInteractionMode() {
    grapher.interactionMode = grapher.interactionMode === 'pan' ? 'inspect' : 'pan';
    const inspect = grapher.interactionMode === 'inspect';
    modeBtnEl.textContent = (typeof I18n !== 'undefined')
      ? I18n.translate(document.documentElement.lang === 'ja' ? 'ja' : 'en', inspect ? 'graph.modeInspect' : 'graph.modePan')
      : (inspect ? '⌖ Inspect' : '✥ Pan');
    modeBtnEl.setAttribute('aria-pressed', String(inspect));
    if (inspect && grapher.tangentX == null) {
      grapher.tangentX = (parseFloat(rangeXMinEl.value) + parseFloat(rangeXMaxEl.value)) / 2;
    }
    grapher.render();
  }

  window.addEventListener('app:lang', () => {
    if (!grapher) return;
    const inspect = grapher.interactionMode === 'inspect';
    modeBtnEl.textContent = I18n.translate(
      document.documentElement.lang === 'ja' ? 'ja' : 'en',
      inspect ? 'graph.modeInspect' : 'graph.modePan');
  });

  /* ---------------- view management ---------------- */

  function showGraph() {
    graphViewEl.hidden = false;
    document.getElementById('calculator-view').hidden = true;
    graphBackBtnEl.hidden = false;
    graphTitleEl.hidden = false;
    rootEl.classList.add('graph-on');
    updateFunctionInputs();

    // Trigger a resize after a short delay to ensure the canvas is visible
    if (grapher) {
      setTimeout(() => {
        const parent = graphCanvasEl.parentElement;
        if (parent) {
          const width = parent.clientWidth - 24; // account for padding
          if (width > 0) {
            grapher._resizeToWidth(width);
          }
        }
      }, 100);
    }
  }

  function hideGraph() {
    graphViewEl.hidden = true;
    document.getElementById('calculator-view').hidden = false;
    graphBackBtnEl.hidden = true;
    graphTitleEl.hidden = true;
    rootEl.classList.remove('graph-on');
  }

  // Export for app.js to call
  window.__grapherUI = {
    showGraph,
    hideGraph,
    init,
    addFunction: (expr, label) => applyTemplate(expr, label),
  };

  // Auto-init if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
