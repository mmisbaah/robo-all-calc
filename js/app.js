'use strict';

/** UI wiring for the calculator. Depends on js/calculator.js (CalculatorLib). */
(function () {
  const { Calculator, formatNumber, evaluateExpression, roundResult } = CalculatorLib;

  const LS_KEYS = { theme: 'calc:theme', sci: 'calc:sci', hc: 'calc:hc', density: 'calc:density', lang: 'calc:lang' };

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* ignore */ } },
  };

  const calc = new Calculator({ storage: storage });

  /* ---------------- DOM refs ---------------- */
  const rootEl = document.querySelector('.calculator');
  const currentEl = document.getElementById('current');
  const historyLineEl = document.getElementById('history-line');
  const memBadgeEl = document.getElementById('mem-badge');
  const sciPadEl = document.getElementById('sci-pad');
  const historyPanelEl = document.getElementById('history-panel');
  const historyListEl = document.getElementById('history-list');
  const historyEmptyEl = document.getElementById('history-empty');
  const angleBtnEl = document.getElementById('btn-angle');
  const themeBtnEl = document.getElementById('btn-theme');
  const sciBtnEl = document.getElementById('btn-sci');
  const historyBtnEl = document.getElementById('btn-history');
  const backBtnEl = document.getElementById('btn-back');
  const clearHistoryBtnEl = document.getElementById('btn-clear-history');
  const graphBtnEl = document.getElementById('btn-graph');
  const graphViewEl = document.getElementById('graph-view');
  const calculatorViewEl = document.getElementById('calculator-view');
  const graphBackBtnEl = document.getElementById('btn-graph-back');
  const undoBtnEl = document.getElementById('btn-undo');
  const redoBtnEl = document.getElementById('btn-redo');
  const convertBtnEl = document.getElementById('btn-convert');
  const convertPanelEl = document.getElementById('converter-panel');
  const convertBackBtnEl = document.getElementById('btn-convert-back');
  const densityBtnEl = document.getElementById('btn-density');
  const hcBtnEl = document.getElementById('btn-hc');
  const langBtnEl = document.getElementById('btn-lang');
  const exportJsonBtnEl = document.getElementById('btn-export-json');
  const importJsonBtnEl = document.getElementById('btn-import-json');
  const importFileEl = document.getElementById('import-file');
  const solveBtnEl = document.getElementById('btn-solve');

  /* ---------------- display ---------------- */
  function updateDisplay() {
    const text = calc.displayValue;
    currentEl.textContent = text;
    historyLineEl.textContent = calc.displayHistoryLine;
    currentEl.classList.toggle('len-md', text.length > 10 && text.length <= 14);
    currentEl.classList.toggle('len-lg', text.length > 14);
    memBadgeEl.hidden = !calc.hasMemory;
    angleBtnEl.textContent = calc.degrees ? 'DEG' : 'RAD';
    if (historyOpen) renderHistory();
  }

  /* ---------------- history panel ---------------- */
  let historyOpen = false;

  function setHistoryPanel(open, keepFocus) {
    historyOpen = open;
    historyPanelEl.hidden = !open;
    historyBtnEl.setAttribute('aria-pressed', String(open));
    if (open) {
      renderHistory();
      backBtnEl.focus(); // so keyboard/screen-reader users land in the panel
    } else if (!keepFocus) {
      currentEl.focus(); // return focus to the calculator display
    }
  }

  function renderHistory() {
    historyListEl.textContent = '';
    historyEmptyEl.hidden = calc.history.length > 0;
    calc.history.forEach(function (entry, i) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'history-item';
      const expr = document.createElement('span');
      expr.className = 'expr';
      expr.textContent = entry.expression;
      const res = document.createElement('span');
      res.className = 'res';
      res.textContent = formatNumber(entry.result);
      btn.appendChild(expr);
      btn.appendChild(res);
      btn.setAttribute('aria-label',
        'Reuse ' + entry.expression + ' = ' + formatNumber(entry.result));
      btn.addEventListener('click', function () {
        calc.reuseHistory(i);
        setHistoryPanel(false); // reuse means "back to calculating"
        pushUndo();
        updateDisplay();
      });
      li.appendChild(btn);
      historyListEl.appendChild(li);
    });
  }

  clearHistoryBtnEl.addEventListener('click', function () {
    calc.clearHistory();
    renderHistory();
  });
  historyBtnEl.addEventListener('click', function () {
    setHistoryPanel(!historyOpen);
  });
  backBtnEl.addEventListener('click', function () {
    setHistoryPanel(false);
  });

  /* ---------------- scientific + theme toggles ---------------- */
  function setScientific(on) {
    sciPadEl.hidden = !on;
    sciBtnEl.setAttribute('aria-pressed', String(on));
    rootEl.classList.toggle('sci-on', on);
    storage.set(LS_KEYS.sci, on ? '1' : '0');
  }
  sciBtnEl.addEventListener('click', function () {
    setScientific(sciPadEl.hidden);
  });

  /* Theme order is the cycle order of the theme button and the T shortcut. */
  const THEME_ORDER = ['robot', 'dark', 'oled', 'light'];
  const THEME_ICONS = {
    robot: '\uD83E\uDD16',
    dark: '\uD83C\uDF19',
    oled: '\u26AB',
    light: '\u2600\uFE0F',
  };
  const THEME_COLORS = {
    robot: '#04121a',
    dark: '#1e1e2e',
    oled: '#000000',
    light: '#ffffff',
  };
  const DEFAULT_THEME = 'robot';

  function applyTheme(theme) {
    const next = THEME_ORDER.indexOf(theme) === -1 ? DEFAULT_THEME : theme;
    document.documentElement.setAttribute('data-theme', next);
    themeBtnEl.textContent = THEME_ICONS[next] || THEME_ICONS[DEFAULT_THEME];
    themeBtnEl.setAttribute('aria-label', 'Switch theme (current: ' + next + ')');
    storage.set(LS_KEYS.theme, next);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[next] || THEME_COLORS[DEFAULT_THEME]);
    window.dispatchEvent(new CustomEvent('app:theme', { detail: next }));
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
  }
  /** Advance to the next theme in the cycle; used by the button and the T key. */
  function cycleTheme() {
    const i = THEME_ORDER.indexOf(currentTheme());
    applyTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length]);
  }
  themeBtnEl.addEventListener('click', cycleTheme);

  /* ---------------- undo / redo ---------------- */
  const undoStack = [];
  const redoStack = [];

  function pushUndo() {
    undoStack.push(calc.snapshot());
    if (undoStack.length > 100) undoStack.shift();
    redoStack.length = 0;
  }

  function undo() {
    if (undoStack.length <= 1) return; // index of the last state
    redoStack.push(undoStack.pop());
    calc.restore(undoStack[undoStack.length - 1]);
    updateDisplay();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const state = redoStack.pop();
    undoStack.push(state);
    calc.restore(state);
    updateDisplay();
  }

  undoBtnEl.addEventListener('click', undo);
  redoBtnEl.addEventListener('click', redo);

  /* ---------------- button actions ---------------- */
  function handleAction(action, value) {
    switch (action) {
      case 'digit': calc.inputDigit(value); break;
      case 'decimal': calc.inputDecimal(); break;
      case 'operator': calc.chooseOperator(value); break;
      case 'equals': calc.equals(); break;
      case 'clear': calc.clearAll(); break;
      case 'delete': calc.backspace(); break;
      case 'negate': calc.toggleSign(); break;
      case 'percent': calc.percent(); break;
      case 'function': calc.applyFunction(value); break;
      case 'constant': calc.insertConstant(value); break;
      case 'angle-mode': calc.toggleAngleMode(); break;
      case 'memory':
        if (value === 'clear') calc.memoryClear();
        else if (value === 'recall') calc.memoryRecall();
        else if (value === 'add') calc.memoryAdd();
        else if (value === 'sub') calc.memorySubtract();
        break;
    }
    pushUndo();
    updateDisplay();
    vibrate();
  }

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { /* ignore */ }
  }

  rootEl.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn || !rootEl.contains(btn)) return;
    handleAction(btn.dataset.action, btn.dataset.value);
  });

  /* ---------------- visual feedback for keyboard ---------------- */
  function flashButton(selector) {
    const btn = rootEl.querySelector(selector);
    if (!btn) return;
    btn.classList.remove('flash');
    void btn.offsetWidth; // restart animation
    btn.classList.add('flash');
  }

  /* ---------------- keyboard ---------------- */
  const KEY_OPERATORS = {
    '+': '+',
    '-': '\u2212',
    '*': '\u00d7',
    '/': '\u00f7',
    '^': '^',
  };

  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') { e.preventDefault(); undo(); }
      else if (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z'))) { e.preventDefault(); redo(); }
      return;
    }
    if (e.altKey) return;
    const k = e.key;
    let flash = null;

    if (k >= '0' && k <= '9') {
      calc.inputDigit(k);
      flash = 'button[data-action="digit"][data-value="' + k + '"]';
    } else if (k === '.' || k === ',') {
      calc.inputDecimal();
      flash = 'button[data-action="decimal"]';
    } else if (KEY_OPERATORS[k]) {
      if (k === '/') e.preventDefault();
      calc.chooseOperator(KEY_OPERATORS[k]);
      flash = 'button[data-action="operator"][data-value="' + KEY_OPERATORS[k] + '"]';
    } else if (k === '%') {
      calc.percent();
      flash = 'button[data-action="percent"]';
    } else if (k === 'Enter' || k === '=') {
      e.preventDefault();
      calc.equals();
      flash = 'button[data-action="equals"]';
    } else if (k === 'Backspace') {
      calc.backspace();
      flash = 'button[data-action="delete"]';
    } else if (k === 'Delete') {
      calc.clearEntry();
      flash = 'button[data-action="clear"]';
    } else if (k === 'Escape') {
      if (historyOpen) { setHistoryPanel(false); return; } // Esc returns from the panel first
      calc.clearAll();
      flash = 'button[data-action="clear"]';
    } else if (k === 'h' || k === 'H') {
      setHistoryPanel(!historyOpen);
      return;
    } else if (k === 'f' || k === 'F') {
      setScientific(sciPadEl.hidden);
      return;
    } else if (k === 't' || k === 'T') {
      cycleTheme();
      return;
    } else if (k === 'g' || k === 'G') {
      showGraph();
      return;
    } else if (k === 'r' || k === 'R') {
      // Reset graph view if visible
      if (!graphViewEl.hidden) {
        const resetBtn = document.getElementById('btn-reset-view');
        if (resetBtn) resetBtn.click();
        return;
      }
    } else if (k === 'u' || k === 'U') {
      setConverter(convertPanelEl.hidden);
      return;
    } else if (k === 'y' || k === 'Y') {
      setSolver(casPanelEl.hidden);
      return;
    } else if (k === 'l' || k === 'L') {
      currentLang = currentLang === 'en' ? 'ja' : 'en';
      applyLang();
      return;
    } else {
      return;
    }
    pushUndo();
    updateDisplay();
    if (flash) flashButton(flash);
    vibrate();
  });

  /* ---------------- paste ---------------- */
  document.addEventListener('paste', function (e) {
    const clip = e.clipboardData || window.clipboardData;
    if (!clip) return;
    const text = clip.getData('text');
    if (!text) return;

    const cleaned = text.replace(/[\s,]/g, '');
    // A plain number?
    if (/^-?\d*\.?\d+$/.test(cleaned)) {
      const r = roundResult(parseFloat(cleaned));
      if (r !== null) {
        e.preventDefault();
        calc.setOperand(String(r));
        pushUndo();
        updateDisplay();
      }
      return;
    }
    // A symbolic problem? Hand it to the solver rather than silently
    // flattening it into a number.
    const symbolic = typeof Symbolic !== 'undefined' ? Symbolic.classify(text) : null;
    if (symbolic && !symbolic.error) {
      e.preventDefault();
      setSolver(true);
      casInputEl.value = text.trim();
      runCas();
      return;
    }
    // Otherwise try to evaluate it as a numeric expression.
    const result = evaluateExpression(text);
    if (result !== null) {
      e.preventDefault();
      calc.setOperand(String(result));
      pushUndo();
      updateDisplay();
      return;
    }
    // Unrecognised, but possibly a symbolic problem nerdamer will reject with
    // a clearer message than "nothing happened" — show it in the solver.
    if (symbolic) {
      e.preventDefault();
      setSolver(true);
      casInputEl.value = text.trim();
      runCas();
    }
  });

  /* ---------------- unit converter ---------------- */
  const convertCategoryEl = document.getElementById('convert-category');
  const convertValueEl = document.getElementById('convert-value');
  const convertFromEl = document.getElementById('convert-from');
  const convertToEl = document.getElementById('convert-to');
  const convertResultEl = document.getElementById('convert-result');

  const fxStatusEl = document.getElementById('fx-status');
  const fxStatusTextEl = document.getElementById('fx-status-text');
  const fxRefreshBtnEl = document.getElementById('btn-fx-refresh');
  const convertSwapBtnEl = document.getElementById('btn-convert-swap');
  const convertNoteEl = document.querySelector('#converter-panel .convert-note');

  /* ---------------- symbolic solver ---------------- */
  const casPanelEl = document.getElementById('cas-panel');
  const casBackBtnEl = document.getElementById('btn-cas-back');
  const casInputEl = document.getElementById('cas-input');
  const casVariableEl = document.getElementById('cas-variable');
  const casGoBtnEl = document.getElementById('btn-cas-go');
  const casResultEl = document.getElementById('cas-result');
  const casNotesEl = document.getElementById('cas-notes');
  const casExamplesEl = document.getElementById('cas-examples');

  const CAS_EXAMPLES = [
    { expr: 'x^2-5x+6=0', label: 'quadratic' },
    { expr: '2x+3=7', label: 'linear' },
    { expr: 'x^3-6x^2+11x-6=0', label: 'cubic' },
    { expr: 'x^2-2=0', label: 'irrational' },
    { expr: 'd/dx x^3+2x^2', label: 'derivative' },
    { expr: 'd/dx sin(x)*x', label: 'product rule' },
    { expr: '\u222B x^2 dx', label: 'integral' },
    { expr: '\u222B x^2 dx from 0 to 3', label: 'definite' },
    { expr: 'limit (x^2-1)/(x-1) as x -> 1', label: 'limit' },
    { expr: 'simplify (x^2-1)/(x-1)', label: 'simplify' },
    { expr: 'expand (x+1)^3', label: 'expand' },
    { expr: 'factor x^2-1', label: 'factor' },
  ];

  function buildCasExamples() {
    if (!casExamplesEl) return;
    casExamplesEl.textContent = '';
    CAS_EXAMPLES.forEach((ex) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cas-example';
      b.textContent = ex.label;
      b.title = ex.expr;
      b.addEventListener('click', function () {
        casInputEl.value = ex.expr;
        runCas();
      });
      casExamplesEl.appendChild(b);
    });
  }

  let casBusy = false;

  function renderCasResult(result) {
    if (!casResultEl) return;
    casNotesEl.textContent = '';
    if (!result) {
      casResultEl.textContent = '';
      casResultEl.className = 'cas-result';
      return;
    }
    if (result.error) {
      casResultEl.textContent = result.error;
      casResultEl.className = 'cas-result error';
      return;
    }
    const label = document.createElement('span');
    label.className = 'cas-label';
    label.textContent = result.label;
    const value = document.createElement('div');
    value.className = 'cas-value';
    value.textContent = result.text;
    casResultEl.textContent = '';
    casResultEl.className = 'cas-result ok';
    casResultEl.appendChild(label);
    casResultEl.appendChild(value);

    (result.notes || []).forEach((note) => {
      const p = document.createElement('p');
      p.className = 'cas-note';
      p.textContent = note;
      casNotesEl.appendChild(p);
    });

    // Warn when the solver had to run on the main thread (opened from disk,
    // or a browser without Worker support): it cannot be interrupted, so a
    // pathological problem could briefly freeze the page.
    if (result.viaMainThread) {
      const p = document.createElement('p');
      p.className = 'cas-note';
      p.textContent = 'Running without a background worker, so a very hard problem '
        + 'could briefly freeze the page. Serving the folder over http enables the '
        + 'safer worker mode.';
      casNotesEl.appendChild(p);
    }
  }

  function runCas() {
    if (casBusy) return Promise.resolve(null);
    const raw = casInputEl.value.trim();
    if (!raw) {
      renderCasResult({ error: 'Enter a problem first — try x^2-5x+6=0' });
      return Promise.resolve(null);
    }
    const options = {};
    const variable = (casVariableEl.value || '').trim();
    if (variable) options.variable = variable;

    casBusy = true;
    renderCasResult({ error: 'Working\u2026' });
    if (casGoBtnEl) casGoBtnEl.disabled = true;

    return Symbolic.solve(raw, options).then(function (result) {
      casBusy = false;
      if (casGoBtnEl) casGoBtnEl.disabled = false;
      if (result === null) {
        renderCasResult({
          error: 'Nothing symbolic to do here — that looks like plain arithmetic.',
        });
        return null;
      }
      renderCasResult(result);
      return result;
    }).catch(function (err) {
      casBusy = false;
      if (casGoBtnEl) casGoBtnEl.disabled = false;
      renderCasResult({ error: 'Solver error: ' + (err && err.message ? err.message : String(err)) });
      return null;
    });
  }

  if (casGoBtnEl) casGoBtnEl.addEventListener('click', function () { runCas(); });
  if (casInputEl) {
    casInputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); runCas(); }
    });
  }

  function setSolver(open) {
    casPanelEl.hidden = !open;
    solveBtnEl.setAttribute('aria-pressed', String(open));
    if (open) {
      buildCasExamples();
      // Load the CAS bundle now so the first solve is not waiting on it.
      if (typeof Symbolic !== 'undefined' && Symbolic.warmup) Symbolic.warmup();
      casInputEl.focus();
    }
  }
  if (solveBtnEl) solveBtnEl.addEventListener('click', function () { setSolver(casPanelEl.hidden); });
  if (casBackBtnEl) casBackBtnEl.addEventListener('click', function () { setSolver(false); });

  buildCasExamples();
  /** Remembered selections so the dropdowns survive rate refreshes. */
  const convertSelection = { from: null, to: null };

  /** Localized category label, falling back to the built-in English name. */
  function convertCategoryLabel(cat) {
    const key = 'convert.cat.' + cat.id;
    const dict = typeof I18n !== 'undefined' && I18n.DICTS[currentLang] ? I18n.DICTS[currentLang] : null;
    const enDict = typeof I18n !== 'undefined' ? I18n.DICTS.en : null;
    if (dict && dict[key]) return dict[key];
    if (enDict && enDict[key]) return enDict[key];
    return cat.label;
  }

  const GROUP_LABELS = {
    everyday: 'Everyday',
    engineering: 'Engineering',
    computing: 'Computing',
    science: 'Science & maths',
    finance: 'Finance',
  };

  function convertGroupLabel(id) {
    const key = 'convert.group.' + id;
    const dict = typeof I18n !== 'undefined' && I18n.DICTS[currentLang] ? I18n.DICTS[currentLang] : null;
    const enDict = typeof I18n !== 'undefined' ? I18n.DICTS.en : null;
    if (dict && dict[key]) return dict[key];
    if (enDict && enDict[key]) return enDict[key];
    return GROUP_LABELS[id] || id;
  }

  /**
   * Rebuild the category dropdown, including optgroup headings.
   * @param {{defer?: boolean}} [options] `defer` skips populating the unit
   *   dropdowns, so a caller can restore its own category/selection first.
   */
  function populateConvertCategory(options) {
    convertCategoryEl.textContent = '';
    const cats = Units.listCategories();
    // Render <optgroup> headings so 19 categories stay scannable.
    const byGroup = new Map();
    cats.forEach((c) => {
      const key = c.group || 'everyday';
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key).push(c);
    });
    Units.listGroups().forEach((groupId) => {
      const members = byGroup.get(groupId);
      if (!members || !members.length) return;
      const og = document.createElement('optgroup');
      og.label = convertGroupLabel(groupId);
      members.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = convertCategoryLabel(c);
        og.appendChild(opt);
      });
      convertCategoryEl.appendChild(og);
    });
    if (!(options && options.defer)) populateConvertUnits();
  }

  function currentCategoryUnits() {
    const cat = Units.listCategories().find((c) => c.id === convertCategoryEl.value);
    return cat ? cat.units : [];
  }

  /** Option label: "JPY — Japanese Yen" for currency, plain code otherwise. */
  function unitOptionLabel(unit, category) {
    if (category === 'currency' && typeof Currency !== 'undefined') {
      const name = Currency.name(unit);
      return name === unit ? unit : unit + ' — ' + name;
    }
    return unit;
  }

  /**
   * Fill a unit dropdown.
   * @param defaultIndex used when `selected` is not available; the "from" and
   *   "to" dropdowns pass different indices so a fresh panel never compares a
   *   unit with itself.
   */
  function fillUnitSelect(select, units, category, selected, defaultIndex) {
    select.textContent = '';
    const frag = document.createDocumentFragment();
    units.forEach((u) => {
      const opt = document.createElement('option');
      opt.value = u;
      opt.textContent = unitOptionLabel(u, category);
      frag.appendChild(opt);
    });
    select.appendChild(frag);
    if (selected && units.indexOf(selected) !== -1) {
      select.value = selected;
    } else if (units.length) {
      select.selectedIndex = Math.min(defaultIndex || 0, units.length - 1);
    }
  }

  function populateConvertUnits(preserve) {
    const category = convertCategoryEl.value;
    const units = currentCategoryUnits();

    // Per-category caveats (ISO rounding, decimal vs binary prefixes, ...).
    const hintEl = document.getElementById('convert-hint');
    if (hintEl) {
      const note = Units.categoryNote(category);
      if (note) {
        hintEl.textContent = note;
        hintEl.hidden = false;
      } else {
        hintEl.hidden = true;
      }
    }

    // The rate status and currency disclaimer only apply to currency.
    const isCurrency = category === 'currency';
    if (fxStatusEl) fxStatusEl.hidden = !isCurrency;
    if (convertNoteEl) convertNoteEl.hidden = !isCurrency;

    if (!preserve) {
      // Currency's default pair is more useful than the first two codes.
      convertSelection.from = category === 'currency' ? 'USD' : null;
      convertSelection.to = category === 'currency' ? 'EUR' : null;
    }

    fillUnitSelect(convertFromEl, units, category, convertSelection.from, 0);
    fillUnitSelect(convertToEl, units, category, convertSelection.to, 1);

    // Never leave the panel comparing a unit with itself.
    if (units.length > 1 && convertFromEl.value === convertToEl.value) {
      const i = units.indexOf(convertToEl.value);
      convertToEl.selectedIndex = (i + 1) % units.length;
    }

    convertSelection.from = convertFromEl.value;
    convertSelection.to = convertToEl.value;
    runConversion();
  }

  function runConversion() {
    const v = parseFloat(convertValueEl.value);
    if (isNaN(v)) { convertResultEl.textContent = '—'; return; }
    const out = Units.convert(v, convertFromEl.value, convertToEl.value, convertCategoryEl.value);
    convertResultEl.textContent = out == null ? '—' : String(Math.round(out * 1e10) / 1e10);
  }

  convertCategoryEl.addEventListener('change', function () { populateConvertUnits(false); });
  convertValueEl.addEventListener('input', runConversion);
  convertFromEl.addEventListener('change', function () {
    convertSelection.from = convertFromEl.value;
    runConversion();
  });
  convertToEl.addEventListener('change', function () {
    convertSelection.to = convertToEl.value;
    runConversion();
  });

  if (convertSwapBtnEl) {
    convertSwapBtnEl.addEventListener('click', function () {
      const from = convertFromEl.value;
      const to = convertToEl.value;
      convertFromEl.value = to;
      convertToEl.value = from;
      convertSelection.from = convertToEl.value;
      convertSelection.to = convertFromEl.value;
      runConversion();
    });
  }

  /* ---------------- live exchange rates ---------------- */

  function formatRateAge(ms) {
    if (ms == null) return '';
    const mins = Math.round(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + ' min ago';
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + ' h ago';
    return Math.round(hours / 24) + ' d ago';
  }

  function formatProviderDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
    return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }

  function updateFxStatus(st) {
    if (!fxStatusEl) return;
    const text = fxStatusTextEl || fxStatusEl;
    if (!st || !st.live) {
      text.textContent = st && st.error
        ? 'Offline — bundled snapshot rates'
        : 'Bundled offline rates';
      fxStatusEl.setAttribute('data-state', 'offline');
      return;
    }
    const parts = [];
    parts.push(st.sourceLabel || st.source || 'live rates');
    parts.push(Object.keys(st.rates).length + ' currencies');
    if (st.updatedAt) parts.push('as of ' + formatProviderDate(st.updatedAt));
    else if (st.ageMs != null) parts.push('fetched ' + formatRateAge(st.ageMs));
    if (st.nextUpdate && !st.error) parts.push('next ' + formatProviderDate(st.nextUpdate));
    if (st.error) parts.push('⚠ refresh failed — showing last known rates');
    text.textContent = parts.join(' · ');
    const degraded = st.stale || !!st.error;
    fxStatusEl.setAttribute('data-state', degraded ? 'stale' : 'live');
    if (fxRefreshBtnEl) fxRefreshBtnEl.setAttribute('data-state', degraded ? 'stale' : 'live');
  }

  function onRatesChanged() {
    const st = typeof Currency !== 'undefined' ? Currency.status() : null;
    updateFxStatus(st);
    // Refresh the dropdowns when the rate table (and thus code list) changes.
    if (convertCategoryEl.value === 'currency') populateConvertUnits(true);
    else runConversion();
  }

  if (fxRefreshBtnEl) {
    fxRefreshBtnEl.addEventListener('click', function () {
      fxRefreshBtnEl.disabled = true;
      fxStatusTextEl.textContent = 'Fetching latest rates…';
      Currency.refresh({ force: true }).then(function () {
        fxRefreshBtnEl.disabled = false;
      });
    });
  }

  window.addEventListener('app:fx', onRatesChanged);

  function setConverter(open) {
    convertPanelEl.hidden = !open;
    convertBtnEl.setAttribute('aria-pressed', String(open));
    if (open) {
      if (convertCategoryEl.options.length === 0) populateConvertCategory();
      // Rates may be stale or still loading — fetch in the background.
      Currency.refresh();
      convertValueEl.focus();
    }
  }
  convertBtnEl.addEventListener('click', function () { setConverter(convertPanelEl.hidden); });
  convertBackBtnEl.addEventListener('click', function () { setConverter(false); });

  /* ---------------- high contrast + density + language ---------------- */
  function setHighContrast(on) {
    document.documentElement.setAttribute('data-hc', on ? 'on' : 'off');
    hcBtnEl.setAttribute('aria-pressed', String(on));
    storage.set(LS_KEYS.hc, on ? '1' : '0');
  }
  hcBtnEl.addEventListener('click', function () {
    setHighContrast(document.documentElement.getAttribute('data-hc') !== 'on');
  });

  const DENSITIES = ['normal', 'small', 'large'];
  function setDensity(d) {
    rootEl.classList.remove('density-small', 'density-large');
    if (d === 'small') rootEl.classList.add('density-small');
    else if (d === 'large') rootEl.classList.add('density-large');
    storage.set(LS_KEYS.density, d);
  }
  densityBtnEl.addEventListener('click', function () {
    const cur = storage.get(LS_KEYS.density) || 'normal';
    setDensity(DENSITIES[(DENSITIES.indexOf(cur) + 1) % DENSITIES.length]);
  });

  let currentLang = storage.get(LS_KEYS.lang) === 'ja' ? 'ja' : 'en';
  function applyLang() {
    I18n.applyLang(currentLang);
    langBtnEl.textContent = currentLang === 'ja' ? 'JA' : 'EN';
    storage.set(LS_KEYS.lang, currentLang);
  }
  langBtnEl.addEventListener('click', function () {
    currentLang = currentLang === 'en' ? 'ja' : 'en';
    applyLang();
  });

  // Category names live in <option> text, which data-i18n cannot reach.
  window.addEventListener('app:lang', function () {
    if (!convertCategoryEl.options.length) return;
    // Capture the whole selection first: rebuilding the category <select>
    // resets its value to the first option, which would otherwise reset the
    // unit dropdowns to index 1 on both sides.
    const category = convertCategoryEl.value;
    convertSelection.from = convertFromEl.value;
    convertSelection.to = convertToEl.value;
    populateConvertCategory({ defer: true });
    convertCategoryEl.value = category;
    populateConvertUnits(true);
  });

  /* ---------------- JSON export / import ---------------- */
  exportJsonBtnEl.addEventListener('click', function () {
    let fns = [];
    try { fns = JSON.parse(storage.get('calc:graph-fns') || '[]'); } catch (e) { fns = []; }
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      memory: calc.memory,
      history: calc.history,
      theme: currentTheme(),
      sci: !sciPadEl.hidden,
      hc: document.documentElement.getAttribute('data-hc'),
      density: storage.get(LS_KEYS.density) || 'normal',
      lang: currentLang,
      functions: fns,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'calculator-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  importJsonBtnEl.addEventListener('click', function () { importFileEl.click(); });
  importFileEl.addEventListener('change', function () {
    const file = importFileEl.files && importFileEl.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        if (data.theme) storage.set(LS_KEYS.theme, data.theme);
        if (typeof data.sci === 'boolean') storage.set(LS_KEYS.sci, data.sci ? '1' : '0');
        if (Array.isArray(data.history)) storage.set('calc:history', JSON.stringify(data.history));
        if (typeof data.memory === 'number') storage.set('calc:memory', JSON.stringify(data.memory));
        if (data.lang === 'ja' || data.lang === 'en') storage.set(LS_KEYS.lang, data.lang);
        if (data.hc === 'on' || data.hc === 'off') storage.set(LS_KEYS.hc, data.hc === 'on' ? '1' : '0');
        if (typeof data.density === 'string') storage.set(LS_KEYS.density, data.density);
        if (Array.isArray(data.functions)) storage.set('calc:graph-fns', JSON.stringify(data.functions));
        alert('Import complete. Reloading…');
        location.reload();
      } catch (err) {
        alert('Invalid backup file.');
      }
    };
    reader.readAsText(file);
    importFileEl.value = '';
  });

  /* ---------------- graph view ---------------- */
  function showGraph() {
    calculatorViewEl.hidden = true;
    graphViewEl.hidden = false;
    graphBackBtnEl.hidden = false;
    // Initialize grapher UI if not already done
    if (window.__grapherUI) {
      window.__grapherUI.showGraph();
    }
  }

  graphBtnEl.addEventListener('click', showGraph);
  graphBackBtnEl.addEventListener('click', () => {
    if (window.__grapherUI && window.__grapherUI.hideGraph) {
      window.__grapherUI.hideGraph();
    } else {
      graphViewEl.hidden = true;
      calculatorViewEl.hidden = false;
      graphBackBtnEl.hidden = true;
    }
  });

  /* ---------------- init ---------------- */
  // applyTheme() falls back to the default for anything unrecognised, so a
  // stale or hand-edited value can never leave the app unthemed.
  applyTheme(storage.get(LS_KEYS.theme));
  setScientific(storage.get(LS_KEYS.sci) === '1');
  setHistoryPanel(false, true); // keepFocus: don't steal focus on load
  setHighContrast(storage.get(LS_KEYS.hc) === '1');
  setDensity(storage.get(LS_KEYS.density) || 'normal');
  applyLang();
  pushUndo(); // initial state as undo base
  updateDisplay();

  // Live exchange rates: hydrate from cache, refresh in the background.
  if (typeof Currency !== 'undefined') {
    updateFxStatus(Currency.init());
  }

  // Service worker (only over http/https, e.g. when served locally)
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ });
    });
  }
})();
