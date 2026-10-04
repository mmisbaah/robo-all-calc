'use strict';

/**
 * Tiny i18n module — EN/JA dictionaries applied via data-i18n attributes.
 * UMD export for browser + Node tests.
 */
(function (global) {

  const DICTS = {
    en: {
      'app.title': 'Calculator',
      'toolbar.history': 'History (H)',
      'toolbar.sci': 'Scientific (F)',
      'toolbar.graph': 'Graph (G)',
      'toolbar.theme': 'Theme (T)',
      'toolbar.undo': 'Undo',
      'toolbar.redo': 'Redo',
      'toolbar.convert': 'Unit converter',
      'toolbar.lang': 'Switch to Japanese',
      'toolbar.contrast': 'High contrast',
      'toolbar.density': 'Key size',
      'display.memoryBadge': 'M',
      'history.title': 'History',
      'history.clear': 'Clear',
      'history.empty': 'No calculations yet. Results appear here after you press =.',
      'history.export': 'Export',
      'history.import': 'Import',
      'history.back': '← Back',
      'graph.title': 'Graph',
      'graph.back': '← Back',
      'graph.functions': 'Functions',
      'graph.quickAdd': 'Quick add',
      'graph.range': 'Range',
      'graph.analysis': 'Analysis',
      'graph.findRoot': 'Find Root',
      'graph.derivative': 'Derivative at X min',
      'graph.integrate': 'Integrate',
      'graph.addFn': '+ Add function',
      'graph.intersections': 'Intersections',
      'graph.extrema': 'Extrema',
      'graph.tangent': 'Tangent',
      'graph.table': 'Table',
      'graph.exportPng': 'PNG',
      'graph.modePan': '✥ Pan',
      'graph.modeInspect': '⌖ Inspect',
      'graph.modeTitle': 'Toggle pan / inspect mode',
      'convert.title': 'Unit Converter',
      'convert.category': 'Category',
      'convert.from': 'From',
      'convert.to': 'To',
      'convert.note': 'Rates from a free public API, refreshed daily. Offline uses bundled snapshot rates.',
      'convert.back': '← Back',
      'convert.swap': 'Swap units',
      'convert.refresh': '⟳ Refresh',
      'cas.title': 'Symbolic solver',
      'cas.back': '← Back',
      'cas.problem': 'Problem',
      'cas.variable': 'Variable',
      'cas.go': 'Solve',
      'cas.help': 'Solve equations, differentiate, integrate, take limits, simplify and factor. Paste a formula anywhere in the app and it opens here.',
      'convert.group.everyday': 'Everyday',
      'convert.group.engineering': 'Engineering',
      'convert.group.computing': 'Computing',
      'convert.group.science': 'Science & maths',
      'convert.group.finance': 'Finance',
      'convert.cat.length': 'Length',
      'convert.cat.mass': 'Mass / weight',
      'convert.cat.area': 'Area',
      'convert.cat.volume': 'Volume',
      'convert.cat.temperature': 'Temperature',
      'convert.cat.speed': 'Speed',
      'convert.cat.time': 'Time',
      'convert.cat.fuel-economy': 'Fuel economy',
      'convert.cat.paper-size': 'Paper size (by area)',
      'convert.cat.pressure': 'Pressure',
      'convert.cat.energy': 'Energy',
      'convert.cat.power': 'Power',
      'convert.cat.force': 'Force',
      'convert.cat.density': 'Density',
      'convert.cat.flow-rate': 'Flow rate',
      'convert.cat.data-storage': 'Data storage',
      'convert.cat.frequency': 'Frequency',
      'convert.cat.angle': 'Angle',
      'convert.cat.currency': 'Currency',
    },
    ja: {
      'app.title': '電卓',
      'toolbar.history': '履歴 (H)',
      'toolbar.sci': '関数電卓 (F)',
      'toolbar.graph': 'グラフ (G)',
      'toolbar.theme': 'テーマ (T)',
      'toolbar.undo': '取り消し',
      'toolbar.redo': 'やり直し',
      'toolbar.convert': '単位変換',
      'toolbar.lang': '英語に切替',
      'toolbar.contrast': 'ハイコントラスト',
      'toolbar.density': 'キーサイズ',
      'display.memoryBadge': 'M',
      'history.title': '履歴',
      'history.clear': 'クリア',
      'history.empty': 'まだ計算がありません。＝を押すとここに表示されます。',
      'history.export': '書き出し',
      'history.import': '読み込み',
      'history.back': '← 戻る',
      'graph.title': 'グラフ',
      'graph.back': '← 戻る',
      'graph.functions': '関数',
      'graph.quickAdd': 'クイック追加',
      'graph.range': '範囲',
      'graph.analysis': '解析',
      'graph.findRoot': '代表根',
      'graph.derivative': '微分 f\'(x)',
      'graph.integrate': '積分',
      'graph.addFn': '＋ 関数を追加',
      'graph.intersections': '交点',
      'graph.extrema': '極値',
      'graph.tangent': '接線',
      'graph.table': '表',
      'graph.exportPng': 'PNG',
      'graph.modePan': '✥ 移動',
      'graph.modeInspect': '⌖ 解析',
      'graph.modeTitle': '移動 / 解析モード切替',
      'convert.title': '単位変換',
      'convert.category': 'カテゴリ',
      'convert.from': '変換前',
      'convert.to': '変換後',
      'convert.note': '無料の公開APIから取得（1日1回更新）。オフライン時は同包の参考値を使用します。',
      'convert.back': '← 戻る',
      'convert.swap': '単位を入れ替え',
      'convert.refresh': '⟳ 更新',
      'cas.title': '数式ソルバー',
      'cas.back': '← 戻る',
      'cas.problem': '問題',
      'cas.variable': '変数',
      'cas.go': '解く',
      'cas.help': '方程式・微分・積分・極限・簡約・因数分解に対応。数式を貼り付けるとここに開きます。',
      'convert.group.everyday': '日常',
      'convert.group.engineering': 'エンジニアリング',
      'convert.group.computing': 'コンピューティング',
      'convert.group.science': '科学・数学',
      'convert.group.finance': '金融',
      'convert.cat.length': '長さ',
      'convert.cat.mass': '重さ・質量',
      'convert.cat.area': '面積',
      'convert.cat.volume': '体積',
      'convert.cat.temperature': '温度',
      'convert.cat.speed': '速度',
      'convert.cat.time': '時間',
      'convert.cat.fuel-economy': '燃費',
      'convert.cat.paper-size': '用紙サイズ（面積）',
      'convert.cat.pressure': '圧力',
      'convert.cat.energy': 'エネルギー',
      'convert.cat.power': '仕事率・出力',
      'convert.cat.force': '力',
      'convert.cat.density': '密度',
      'convert.cat.flow-rate': '流量',
      'convert.cat.data-storage': 'データ容量',
      'convert.cat.frequency': '周波数',
      'convert.cat.angle': '角度',
      'convert.cat.currency': '通貨',
    },
  };

  function translate(lang, key) {
    const dict = DICTS[lang] || DICTS.en;
    return dict[key] != null ? dict[key] : (DICTS.en[key] != null ? DICTS.en[key] : key);
  }

  /**
   * Apply translations to all [data-i18n] elements under rootEl.
   * Elements use data-i18n="key" for textContent and data-i18n-aria="key" for aria-label.
   */
  function applyLang(lang, rootEl) {
    rootEl = rootEl || (typeof document !== 'undefined' ? document : null);
    if (!rootEl) return;
    rootEl.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = translate(lang, el.getAttribute('data-i18n'));
    });
    rootEl.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', translate(lang, el.getAttribute('data-i18n-aria')));
    });
    rootEl.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', translate(lang, el.getAttribute('data-i18n-title')));
    });
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:lang', { detail: lang }));
    }
  }

  const I18n = { DICTS, translate, applyLang };
  global.I18n = I18n;
  if (typeof module !== 'undefined' && module.exports) module.exports = I18n;
})(typeof window !== 'undefined' ? window : globalThis);
