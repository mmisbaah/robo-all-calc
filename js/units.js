'use strict';

/**
 * Unit conversion — pure logic, UMD export.
 *
 * Three kinds of category:
 *   - linear   : value scales by a factor ratio (length, pressure, …)
 *   - affine   : has an offset as well as a scale (temperature)
 *   - inverted : reciprocal quantity, where "less is more" (fuel economy)
 *
 * Currency rates come from js/currency.js via setCurrencyRates(); the bundled
 * table is only an offline fallback.
 *
 * Unit ordering convention: imperial / traditional units first, so the default
 * selection is the familiar one. US and imperial variants are separate,
 * explicitly-labelled units (e.g. `gal (imp)` vs `gal (US)`) because they
 * differ by ~20% and picking one silently is a common source of wrong answers.
 */
(function (global) {

  /** Ordered group headings for the UI dropdown. */
  const GROUPS = ['everyday', 'engineering', 'computing', 'science', 'finance'];

  /* =======================================================================
   * Linear categories — factors relative to `base`.
   * ===================================================================== */

  const UNITS = {
    /* ---------------- everyday ---------------- */
    length: {
      label: 'length', base: 'm', group: 'everyday',
      rates: {
        // imperial / traditional
        'thou (mil)': 0.0000254, inch: 0.0254, ft: 0.3048, yd: 0.9144,
        'furlong': 201.168, chain: 20.1168, rod: 5.0292, fathom: 1.8288,
        'nautical mile': 1852, mile: 1609.344,
        // metric
        mm: 0.001, cm: 0.01, m: 1, km: 1000,
        // astronomical
        'light-year': 9460730472580800, AU: 149597870700, parsec: 3.0856775814913673e16,
      },
    },
    mass: {
      label: 'mass', base: 'kg', group: 'everyday',
      rates: {
        // imperial / traditional
        grain: 6.479891e-5, drachm: 0.028349523125 / 16, oz: 0.028349523125,
        lb: 0.45359237, 'stone': 6.35029318,
        'cwt (imp)': 50.80234544, 'cwt (US)': 45.359237,
        'ton (imp)': 1016.0469088, 'ton (US)': 907.18474, slug: 14.593902937206364,
        'troy oz': 0.0311034768, 'troy lb': 0.3732417216, 'carat': 0.0002,
        // metric
        mg: 1e-6, g: 0.001, kg: 1, t: 1000,
      },
    },
    area: {
      label: 'area', base: 'm2', group: 'everyday',
      rates: {
        // imperial / traditional
        'sq in': 0.00064516, 'sq ft': 0.09290304, 'sq yd': 0.83612736,
        acre: 4046.8564224, 'sq mi': 2589988.110336,
        // A US township is exactly 36 square miles.
        'township (US)': 36 * 2589988.110336,
        // metric
        'mm2': 1e-6, 'cm2': 1e-4, m2: 1, are: 100, ha: 10000, 'km2': 1e6,
      },
    },
    volume: {
      label: 'volume', base: 'l', group: 'everyday',
      rates: {
        // imperial
        'tsp (imp)': 0.005919388020833333, 'tbsp (imp)': 0.0177577640625,
        'floz (imp)': 0.0284130625, gill: 0.1420653125, cup: 0.284130625,
        pint: 0.56826125, quart: 1.1365225, 'gal (imp)': 4.54609,
        peck: 9.09218, 'bushel (imp)': 36.36872, 'firkin': 9 * 4.54609,
        // cooking
        'tsp (US)': 0.00492892159375, 'tbsp (US)': 0.01478676478125,
        'floz (US)': 0.0295735295625, 'cup (US)': 0.2365882365,
        'pint (US)': 0.473176473, 'quart (US)': 0.946352946,
        'gal (US)': 3.785411784,
        // US stick of butter = 1/2 cup = 8 US tbsp (a volume, not the 4 oz mass)
        'stick (butter)': 0.11829411825,
        'barrel (oil)': 158.987294928, 'bushel (US)': 35.23907016688,
        // metric / other
        ml: 0.001, cm3: 0.001, l: 1, dm3: 1,
        'in3': 0.016387064, 'ft3': 28.316846592, m3: 1000,
      },
    },
    time: {
      label: 'time', base: 's', group: 'everyday',
      rates: {
        // calendar (approximate: 30-day months, 365.25-day years)
        fortnight: 1209600, month: 2592000, year: 31557600,
        decade: 315576000, century: 3155760000, millennium: 31557600000,
        // clock
        ms: 0.001, s: 1, min: 60, h: 3600, day: 86400, week: 604800,
      },
    },
    speed: {
      label: 'speed', base: 'm/s', group: 'everyday',
      rates: {
        // imperial
        'ft/s': 0.3048, mph: 0.44704, knot: 0.5144444444444445,
        // metric
        'm/s': 1, 'km/h': 1 / 3.6, 'km/s': 1000, mach: 340.29, c: 299792458,
      },
    },
    'paper-size': {
      label: 'paper size (by area)', base: 'm2', group: 'everyday',
      note: 'By sheet area. ISO 216 rounds A4 and smaller down, so N sheets are '
        + 'fractionally under the next size up (2 x A4 = 0.998 A3).',
      rates: {
        m2: 1, cm2: 1e-4, 'mm2': 1e-6,
        // imperial (US)
        Letter: 0.06032246, Legal: 0.07677404, Tabloid: 0.12062452, Folio: 0.07129018,
        // ISO 216
        A0: 1, A1: 0.5, A2: 0.25, A3: 0.125, A4: 0.06237,
        A5: 0.031185, A6: 0.0155925, A7: 0.00779625,
        A8: 0.003898125, A9: 0.0019490625, A10: 0.00097453125,
      },
    },

    /* ---------------- engineering ---------------- */
    pressure: {
      label: 'pressure', base: 'Pa', group: 'engineering',
      rates: {
        // imperial
        psi: 6894.757293168361, 'inHg': 3386.388640341, 'mmHg': 133.322387415,
        'inH2O': 249.08891, 'lb/ft2': 47.88025898033584,
        torr: 101325 / 760, atm: 101325,
        // metric
        Pa: 1, hPa: 100, kPa: 1000, MPa: 1e6,
        bar: 100000, mbar: 100, 'kgf/cm2': 98066.5,
      },
    },
    energy: {
      label: 'energy', base: 'J', group: 'engineering',
      rates: {
        // imperial
        'BTU (IT)': 1055.05585262, therm: 105480400, 'ft-lbf': 1.3558179483314004,
        // metric
        erg: 1e-7, J: 1, kJ: 1000, MJ: 1e6, cal: 4.184, kcal: 4184,
        Wh: 3600, kWh: 3.6e6, MWh: 3.6e9,
        // other
        'eV': 1.602176634e-19, 'ton TNT': 4.184e9,
      },
    },
    power: {
      label: 'power', base: 'W', group: 'engineering',
      rates: {
        // imperial
        'hp (mech)': 745.6998715822702, 'BTU/h': 1055.05585262 / 3600,
        // metric
        W: 1, kW: 1000, MW: 1e6, GW: 1e9,
        'hp (metric)': 735.49875, 'cal/s': 4.184, 'J/min': 1 / 60,
      },
    },
    force: {
      label: 'force', base: 'N', group: 'engineering',
      rates: {
        // imperial
        poundal: 0.138254954376, lbf: 4.4482216152605,
        // metric
        dyn: 1e-5, N: 1, kN: 1000, MN: 1e6, kgf: 9.80665,
      },
    },
    density: {
      label: 'density', base: 'kg/m3', group: 'engineering',
      rates: {
        // imperial
        'lb/ft3': 16.01846337396014, 'lb/in3': 27679.904710203125,
        'oz/gal (US)': 0.028349523125 / 0.003785411784,
        'oz/gal (imp)': 0.028349523125 / 0.00454609,
        // metric
        'mg/L': 0.001, 'g/L': 1, 'kg/L': 1000,
        'g/cm3': 1000, 'kg/m3': 1,
      },
    },
    'flow-rate': {
      label: 'flow rate', base: 'm3/s', group: 'engineering',
      rates: {
        // imperial
        CFM: 0.028316846592 / 60,
        'GPM (US)': 0.003785411784 / 60,
        'GPM (imp)': 0.00454609 / 60,
        // metric
        'm3/s': 1, 'm3/h': 1 / 3600, 'm3/min': 1 / 60,
        'L/s': 0.001, 'L/min': 0.001 / 60, 'L/h': 0.001 / 3600,
      },
    },

    /* ---------------- computing ---------------- */
    'data-storage': {
      label: 'data storage', base: 'byte', group: 'computing',
      note: 'Decimal (KB=1000) and binary (KiB=1024) prefixes are separate units.',
      rates: {
        bit: 0.125, byte: 1,
        kB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15,
        KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776,
      },
    },
    frequency: {
      label: 'frequency', base: 'Hz', group: 'computing',
      rates: { Hz: 1, kHz: 1000, MHz: 1e6, GHz: 1e9, rpm: 1 / 60 },
    },

    /* ---------------- science ---------------- */
    angle: {
      label: 'angle', base: 'deg', group: 'science',
      rates: {
        'arcsecond': 1 / 3600, 'arcminute': 1 / 60, deg: 1,
        'mil (NATO)': 360 / 6400, gradian: 0.9, rad: 180 / Math.PI, turn: 360,
      },
    },
  };

  /* =======================================================================
   * Affine categories — temperature scales *and* offsets.
   * ===================================================================== */

  const TEMPERATURE_TO_C = {
    C: (v) => v,
    F: (v) => (v - 32) * 5 / 9,
    K: (v) => v - 273.15,
    // Rankine, Reaumur, Romer, Newton, Delisle
    R: (v) => v * 5 / 9 - 273.15,
    Re: (v) => v * 5 / 4,
    Ro: (v) => (v - 7.5) * 40 / 21,
    N: (v) => v * 100 / 33,
    // Delisle: 0 De = 100 C (boiling), 150 De = 0 C (freezing)
    De: (v) => (150 - v) * 2 / 3,
  };

  const TEMPERATURE_FROM_C = {
    C: (v) => v,
    F: (v) => v * 9 / 5 + 32,
    K: (v) => v + 273.15,
    R: (v) => (v + 273.15) * 9 / 5,
    Re: (v) => v * 4 / 5,
    Ro: (v) => v * 21 / 40 + 7.5,
    N: (v) => v * 33 / 100,
    De: (v) => 150 - v * 3 / 2,
  };

  const AFFINE = {
    temperature: {
      label: 'temperature', base: 'C', group: 'everyday',
      units: Object.keys(TEMPERATURE_TO_C),
    },
  };

  /* =======================================================================
   * Inverted categories — reciprocal quantities (fuel economy).
   * Base is km per litre; L/100km maps to it by reciprocal.
   * ===================================================================== */

  const INVERTED = {
    'fuel-economy': {
      label: 'fuel economy', base: 'km/L', group: 'everyday',
      units: {
        // imperial first
        'mpg (imp)': { factor: 1.609344 / 4.54609 },
        'mpg (US)': { factor: 1.609344 / 3.785411784 },
        'km/L': { factor: 1 },
        // reciprocal: value is litres per 100 km, so base = 100 / value
        'L/100km': { factor: 1, inverted: true },
      },
    },
  };

  /** Value in `unit` expressed in the category base. */
  function toBaseInverted(unit, value) {
    if (value === 0) return null; // would be infinite efficiency
    const spec = INVERTED['fuel-economy'].units[unit];
    return spec.inverted ? 100 / value : value * spec.factor;
  }

  /** Base value expressed in `unit`. */
  function fromBaseInverted(unit, baseValue) {
    const spec = INVERTED['fuel-economy'].units[unit];
    if (spec.inverted) {
      if (baseValue === 0) return null;
      return 100 / baseValue;
    }
    return baseValue / spec.factor;
  }

  /* =======================================================================
   * Currency — live rates injected by js/currency.js.
   * ===================================================================== */

  // Offline snapshot (USD base) — always shipped so the converter works with
  // no network. Replaced at runtime by live rates via setCurrencyRates().
  let CURRENCY_RATES = { USD: 1, EUR: 0.92, JPY: 149.5, GBP: 0.79, CNY: 7.24, KRW: 1340 };

  /**
   * Swap in a live rate table (rates relative to a single base, e.g. USD).
   * Pass null to fall back to the bundled offline snapshot.
   */
  function setCurrencyRates(rates) {
    if (rates && typeof rates === 'object' && typeof rates.USD === 'number') {
      CURRENCY_RATES = rates;
      return true;
    }
    return false;
  }

  /** The currency rate table currently in effect. */
  function getCurrencyRates() {
    return CURRENCY_RATES;
  }

  /** Currency codes available for conversion. */
  function listCurrencies() {
    return Object.keys(CURRENCY_RATES);
  }

  /* =======================================================================
   * Public API
   * ===================================================================== */

  /**
   * List categories for UI.
   * @returns {Array<{id,label,group,units:string[],note?:string}>}
   */
  function listCategories() {
    const out = [];
    for (const [id, cat] of Object.entries(UNITS)) {
      out.push({
        id: id,
        label: cat.label,
        group: cat.group || 'everyday',
        units: Object.keys(cat.rates),
        note: cat.note,
      });
    }
    for (const [id, cat] of Object.entries(AFFINE)) {
      out.push({
        id: id,
        label: cat.label,
        group: cat.group || 'everyday',
        units: cat.units.slice(),
        note: cat.note,
      });
    }
    for (const [id, cat] of Object.entries(INVERTED)) {
      out.push({
        id: id,
        label: cat.label,
        group: cat.group || 'everyday',
        units: Object.keys(cat.units),
        note: cat.note,
      });
    }
    out.push({
      id: 'currency',
      label: 'currency',
      group: 'finance',
      units: listCurrencies(),
    });
    // Order by group heading so the UI can render optgroups in one pass.
    out.sort(function (a, b) {
      const ia = GROUPS.indexOf(a.group);
      const ib = GROUPS.indexOf(b.group);
      return (ia < 0 ? GROUPS.length : ia) - (ib < 0 ? GROUPS.length : ib);
    });
    return out;
  }

  /** Group headings, in display order. */
  function listGroups() {
    return GROUPS.slice();
  }

  /** Short note attached to a category, or '' when there is none. */
  function categoryNote(id) {
    if (UNITS[id] && UNITS[id].note) return UNITS[id].note;
    if (AFFINE[id] && AFFINE[id].note) return AFFINE[id].note;
    if (INVERTED[id] && INVERTED[id].note) return INVERTED[id].note;
    return '';
  }

  /**
   * Convert a value between units of a category.
   * @param {number} value
   * @param {string} fromUnit
   * @param {string} toUnit
   * @param {string} category
   * @returns {number|null} null for unknown units/categories or undefined results
   */
  function convert(value, fromUnit, toUnit, category) {
    if (typeof value !== 'number' || !isFinite(value)) return null;

    if (category === 'temperature') {
      const toC = TEMPERATURE_TO_C[fromUnit];
      const fromC = TEMPERATURE_FROM_C[toUnit];
      if (!toC || !fromC) return null;
      const c = toC(value);
      if (!isFinite(c)) return null;
      return fromC(c);
    }

    if (INVERTED[category]) {
      const spec = INVERTED[category].units;
      if (!spec[fromUnit] || !spec[toUnit]) return null;
      const base = toBaseInverted(fromUnit, value);
      if (base == null || !isFinite(base)) return null;
      const out = fromBaseInverted(toUnit, base);
      return out == null || !isFinite(out) ? null : out;
    }

    if (category === 'currency') {
      const rFrom = CURRENCY_RATES[fromUnit];
      const rTo = CURRENCY_RATES[toUnit];
      if (rFrom == null || rTo == null) return null;
      // Rates are "units per 1 USD", so:
      //   value in `from` -> USD = value / rFrom -> `to` = USD * rTo
      return value * (rTo / rFrom);
    }

    const cat = UNITS[category];
    if (!cat) return null;
    const r1 = cat.rates[fromUnit];
    const r2 = cat.rates[toUnit];
    if (r1 == null || r2 == null) return null;
    return value * (r1 / r2);
  }

  const Units = {
    convert,
    listCategories,
    listGroups,
    categoryNote,
    setCurrencyRates,
    getCurrencyRates,
    listCurrencies,
    GROUPS: GROUPS,
    UNITS: UNITS,
    AFFINE: AFFINE,
    INVERTED: INVERTED,
  };
  global.Units = Units;
  if (typeof module !== 'undefined' && module.exports) module.exports = Units;
})(typeof window !== 'undefined' ? window : globalThis);
