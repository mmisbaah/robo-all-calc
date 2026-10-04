/** Sanity-check conversion factors against authoritative values. */
const U = require('E:/OpenCode/Apps/calculator/js/units.js');

/**
 * @param v value, f from unit, t to unit, cat category
 * @param exp expected, tol absolute tolerance (relative tolerance is 1e-12)
 * @param label description
 */
function chk(v, f, t, cat, exp, tol, label) {
  const got = U.convert(v, f, t, cat);
  if (exp === null) {
    if (got !== null) { console.log('FAIL ' + label + ': expected null, got ' + got); return false; }
    console.log('ok   ' + label);
    return true;
  }
  if (got == null) { console.log('FAIL ' + label + ': got null'); return false; }
  const diff = Math.abs(got - exp);
  const rel = diff / Math.max(1e-300, Math.abs(exp));
  if (diff > tol && rel > 1e-12) {
    console.log('FAIL ' + label + ': expected ' + exp + ', got ' + got + ' (rel ' + rel.toExponential(2) + ')');
    return false;
  }
  console.log('ok   ' + label);
  return true;
}

const cases = [
  /* ---------------- length ---------------- */
  [1, 'nautical mile', 'm', 'length', 1852, 0, 'nautical mile exact'],
  [1, 'mile', 'km', 'length', 1.609344, 1e-12, 'mile->km'],
  [1, 'light-year', 'm', 'length', 9460730472580800, 1, 'light-year'],
  [1, 'AU', 'km', 'length', 149597870.7, 1e-6, 'AU->km'],
  [1, 'parsec', 'AU', 'length', 648000 / Math.PI, 1e-3, 'parsec->AU'],
  [1, 'fathom', 'ft', 'length', 6, 1e-12, 'fathom->ft'],
  [1, 'furlong', 'ft', 'length', 660, 1e-9, 'furlong->ft'],
  [1, 'chain', 'ft', 'length', 66, 1e-9, 'chain->ft'],
  [1000, 'thou (mil)', 'inch', 'length', 1, 1e-12, '1000 thou->inch'],
  [1, 'rod', 'ft', 'length', 16.5, 1e-9, 'rod->ft'],

  /* ---------------- mass ---------------- */
  [1, 'lb', 'g', 'mass', 453.59237, 1e-9, 'lb->g'],
  [1, 'oz', 'g', 'mass', 28.349523125, 1e-9, 'oz->g'],
  [1, 'stone', 'lb', 'mass', 14, 1e-12, 'stone->lb'],
  [1, 'ton (US)', 'lb', 'mass', 2000, 1e-12, 'short ton->lb'],
  [1, 'ton (imp)', 'lb', 'mass', 2240, 1e-12, 'long ton->lb'],
  [1, 'troy oz', 'g', 'mass', 31.1034768, 1e-9, 'troy oz->g'],
  [1, 'troy lb', 'troy oz', 'mass', 12, 1e-12, 'troy lb->troy oz'],
  [1, 'carat', 'mg', 'mass', 200, 1e-12, 'carat->mg'],
  [1, 'grain', 'mg', 'mass', 64.79891, 1e-9, 'grain->mg'],
  [1, 'slug', 'lb', 'mass', 14.593902937206364 / 0.45359237, 1e-12, 'slug->lb'],
  [1, 'cwt (US)', 'lb', 'mass', 100, 1e-9, 'US cwt->lb'],
  [1, 'cwt (imp)', 'lb', 'mass', 112, 1e-9, 'imp cwt->lb'],
  [16, 'drachm', 'oz', 'mass', 1, 1e-9, '16 drachm->oz'],

  /* ---------------- area ---------------- */
  [1, 'acre', 'sq ft', 'area', 43560, 1e-6, 'acre->sqft'],
  [1, 'are', 'm2', 'area', 100, 1e-12, 'are->sqm'],
  [1, 'sq mi', 'km2', 'area', 2.589988110336, 1e-12, 'sqmi->sqkm'],
  [1, 'ha', 'acre', 'area', 2.4710538146717, 1e-9, 'hectare->acre'],
  [1, 'sq yd', 'sq ft', 'area', 9, 1e-12, 'sqyd->sqft'],

  /* ---------------- volume ---------------- */
  [1, 'gal (imp)', 'l', 'volume', 4.54609, 1e-12, 'imp gal->l'],
  [1, 'gal (US)', 'l', 'volume', 3.785411784, 1e-12, 'US gal->l'],
  [1, 'pint', 'floz (imp)', 'volume', 20, 1e-12, 'imp pint->floz'],
  [1, 'quart', 'cup', 'volume', 4, 1e-12, 'imp quart->cup'],
  // The 1958 tbsp redefinition means a cup is 16.0004 tbsp, not exactly 16.
  [1, 'cup', 'tbsp (imp)', 'volume', 16.00036, 1e-4, 'imp cup->tbsp'],
  [1, 'cup (US)', 'tbsp (US)', 'volume', 16, 1e-12, 'US cup->tbsp'],
  [1, 'cup (US)', 'floz (US)', 'volume', 8, 1e-12, 'US cup->floz'],
  [1, 'stick (butter)', 'tbsp (US)', 'volume', 8, 1e-6, 'stick->tbsp US'],
  [1, 'stick (butter)', 'cup (US)', 'volume', 0.5, 1e-9, 'stick->half US cup'],
  [1, 'bushel (imp)', 'gal (imp)', 'volume', 8, 1e-12, 'imp bushel->gal'],
  [1, 'bushel (US)', 'gal (US)', 'volume', 2150.42 / 231, 1e-9, 'US bushel->gal'],
  [1, 'barrel (oil)', 'gal (US)', 'volume', 42, 1e-6, 'oil barrel->US gal'],
  [1, 'firkin', 'gal (imp)', 'volume', 9, 1e-9, 'firkin->imp gal'],
  [1, 'gill', 'floz (imp)', 'volume', 5, 1e-12, 'gill->floz'],
  [1, 'peck', 'gal (imp)', 'volume', 2, 1e-12, 'peck->imp gal'],
  [1, 'ft3', 'l', 'volume', 28.316846592, 1e-12, 'cuft->l'],
  [1, 'in3', 'cm3', 'volume', 16.387064, 1e-12, 'cuin->cc'],
  [1, 'm3', 'l', 'volume', 1000, 1e-12, 'm3->l'],

  /* ---------------- time ---------------- */
  [1, 'year', 'day', 'time', 365.25, 1e-12, 'year->day'],
  [1, 'fortnight', 'day', 'time', 14, 1e-12, 'fortnight->day'],
  [1, 'month', 'day', 'time', 30, 1e-12, 'month->day'],
  [1, 'week', 'h', 'time', 168, 1e-12, 'week->hour'],
  [1, 'century', 'year', 'time', 100, 1e-12, 'century->year'],
  [1, 'millennium', 'year', 'time', 1000, 1e-12, 'millennium->year'],

  /* ---------------- speed ---------------- */
  [1, 'mph', 'km/h', 'speed', 1.609344, 1e-12, 'mph->kmh'],
  [1, 'knot', 'km/h', 'speed', 1.852, 1e-12, 'knot->kmh'],
  [1, 'ft/s', 'mph', 'speed', 0.6818181818, 1e-9, 'ft/s->mph'],
  [1, 'mach', 'km/h', 'speed', 1225.044, 1e-2, 'mach->kmh'],
  [1, 'c', 'km/s', 'speed', 299792.458, 1e-6, 'c->km/s'],

  /* ---------------- temperature (affine) ---------------- */
  [0, 'C', 'F', 'temperature', 32, 1e-12, '0C->F'],
  [100, 'C', 'F', 'temperature', 212, 1e-12, '100C->F'],
  [0, 'C', 'K', 'temperature', 273.15, 1e-12, '0C->K'],
  [0, 'C', 'R', 'temperature', 491.67, 1e-9, '0C->Rankine'],
  [491.67, 'R', 'C', 'temperature', 0, 1e-9, 'Rankine->C'],
  [0, 'C', 'Re', 'temperature', 0, 1e-12, '0C->Reaumur'],
  [100, 'C', 'Re', 'temperature', 80, 1e-12, '100C->Reaumur'],
  // Roemer: 0 C = 7.5 Ro, 100 C = 60 Ro
  [0, 'C', 'Ro', 'temperature', 7.5, 1e-12, '0C->Romer'],
  [100, 'C', 'Ro', 'temperature', 60, 1e-12, '100C->Romer'],
  [60, 'Ro', 'C', 'temperature', 100, 1e-9, 'Romer->C'],
  [0, 'C', 'N', 'temperature', 0, 1e-12, '0C->Newton'],
  [100, 'C', 'N', 'temperature', 33, 1e-12, '100C->Newton'],
  [33, 'N', 'C', 'temperature', 100, 1e-9, 'Newton->C'],
  // Delisle: 150 De = 0 C (freezing), 0 De = 100 C (boiling)
  [0, 'C', 'De', 'temperature', 150, 1e-12, '0C->Delisle'],
  [100, 'C', 'De', 'temperature', 0, 1e-12, '100C->Delisle'],
  [150, 'De', 'C', 'temperature', 0, 1e-12, 'Delisle 150->C'],
  [0, 'De', 'C', 'temperature', 100, 1e-12, 'Delisle 0->C'],
  [-273.15, 'C', 'K', 'temperature', 0, 1e-12, 'abs zero->K'],
  [-40, 'C', 'F', 'temperature', -40, 1e-12, '-40C->F'],
  [36.6, 'C', 'F', 'temperature', 97.88, 1e-9, '36.6C->F'],

  /* ---------------- fuel economy (inverted) ---------------- */
  // A US gallon is smaller, so 1 US mpg covers more km/L than 1 imp mpg.
  [1, 'mpg (US)', 'mpg (imp)', 'fuel-economy', 1.200949925504855, 1e-9, 'US mpg->imp mpg'],
  [1, 'mpg (imp)', 'mpg (US)', 'fuel-economy', 0.8326741846, 1e-9, 'imp mpg->US mpg'],
  [1, 'mpg (US)', 'km/L', 'fuel-economy', 1.609344 / 3.785411784, 1e-12, 'US mpg->km/L'],
  [23.5214583, 'mpg (US)', 'L/100km', 'fuel-economy', 10, 1e-6, 'US mpg->L/100km'],
  [10, 'L/100km', 'mpg (US)', 'fuel-economy', 23.5214583, 1e-6, 'L/100km->US mpg'],
  [10, 'L/100km', 'mpg (imp)', 'fuel-economy', 28.2480936, 1e-6, 'L/100km->imp mpg'],
  [1, 'km/L', 'L/100km', 'fuel-economy', 100, 1e-12, 'km/L->L/100km'],
  [100, 'L/100km', 'km/L', 'fuel-economy', 1, 1e-12, '100 L/100km->km/L'],
  [1, 'mpg (US)', 'mpg (US)', 'fuel-economy', 1, 1e-12, 'identity'],
  // Zero efficiency would be infinite mpg -> reject
  [0, 'L/100km', 'mpg (US)', 'fuel-economy', null, 0, 'zero L/100km -> null'],

  /* ---------------- pressure ---------------- */
  [1, 'atm', 'kPa', 'pressure', 101.325, 1e-12, 'atm->kPa'],
  [1, 'psi', 'kPa', 'pressure', 6.894757293168361, 1e-12, 'psi->kPa'],
  [1, 'bar', 'psi', 'pressure', 14.503773773, 1e-6, 'bar->psi'],
  [760, 'torr', 'atm', 'pressure', 1, 1e-12, '760 torr->atm'],
  [1, 'torr', 'mmHg', 'pressure', 0.9999998575337, 1e-9, 'torr->mmHg'],
  [1, 'inHg', 'kPa', 'pressure', 3.386388640341, 1e-9, 'inHg->kPa'],
  [1, 'atm', 'psi', 'pressure', 14.6959487755, 1e-8, 'atm->psi'],
  [1, 'kgf/cm2', 'kPa', 'pressure', 98.0665, 1e-12, 'kgf/cm2->kPa'],

  /* ---------------- energy ---------------- */
  [1, 'kWh', 'MJ', 'energy', 3.6, 1e-12, 'kWh->MJ'],
  [1, 'kcal', 'kJ', 'energy', 4.184, 1e-12, 'kcal->kJ'],
  [1, 'BTU (IT)', 'J', 'energy', 1055.05585262, 1e-9, 'BTU->J'],
  [1, 'cal', 'J', 'energy', 4.184, 1e-12, 'cal->J'],
  // The US therm is defined via BTU(59F), so it is 99976 BTU(IT), not 100000.
  [1, 'therm', 'BTU (IT)', 'energy', 99976.1289775, 1e-3, 'therm->BTU(IT)'],
  [1, 'eV', 'J', 'energy', 1.602176634e-19, 1e-30, 'eV->J'],
  [1, 'Wh', 'J', 'energy', 3600, 1e-12, 'Wh->J'],
  [1, 'erg', 'J', 'energy', 1e-7, 1e-20, 'erg->J'],
  [1, 'ft-lbf', 'J', 'energy', 1.3558179483314004, 1e-12, 'ft-lbf->J'],

  /* ---------------- power ---------------- */
  [1, 'hp (mech)', 'W', 'power', 745.6998715823, 1e-9, 'mech hp->W'],
  [1, 'hp (metric)', 'W', 'power', 735.49875, 1e-9, 'metric hp->W'],
  [1, 'kW', 'BTU/h', 'power', 3412.1416331, 1e-6, 'kW->BTU/h'],
  [1, 'kW', 'hp (mech)', 'power', 1.34102209, 1e-8, 'kW->mech hp'],
  [1, 'J/min', 'W', 'power', 1 / 60, 1e-12, 'J/min->W'],

  /* ---------------- force ---------------- */
  [1, 'lbf', 'N', 'force', 4.4482216152605, 1e-12, 'lbf->N'],
  [1, 'kgf', 'N', 'force', 9.80665, 1e-12, 'kgf->N'],
  [1, 'poundal', 'dyn', 'force', 13825.4954376, 1e-6, 'poundal->dyn'],

  /* ---------------- density ---------------- */
  [1, 'g/cm3', 'kg/L', 'density', 1, 1e-15, 'g/cm3->kg/L'],
  [1, 'lb/ft3', 'kg/m3', 'density', 16.01846337396, 1e-9, 'lb/ft3->kg/m3'],
  [1, 'oz/gal (US)', 'g/L', 'density', 0.028349523125 / 0.003785411784, 1e-12, 'US oz/gal->g/L'],
  [1, 'oz/gal (imp)', 'g/L', 'density', 0.028349523125 / 0.00454609, 1e-12, 'imp oz/gal->g/L'],
  [1, 'lb/in3', 'g/cm3', 'density', 27.6799047102, 1e-9, 'lb/in3->g/cm3'],

  /* ---------------- flow rate ---------------- */
  [1, 'GPM (US)', 'L/min', 'flow-rate', 3.785411784, 1e-9, 'US GPM->L/min'],
  [1, 'GPM (imp)', 'L/min', 'flow-rate', 4.54609, 1e-9, 'imp GPM->L/min'],
  [1, 'CFM', 'm3/h', 'flow-rate', 1.6990107952, 1e-9, 'CFM->m3/h'],
  [1, 'm3/h', 'L/s', 'flow-rate', 1000 / 3600, 1e-15, 'm3/h->L/s'],
  [1, 'L/min', 'L/h', 'flow-rate', 60, 1e-12, 'L/min->L/h'],

  /* ---------------- data storage ---------------- */
  [1, 'GB', 'GiB', 'data-storage', 1e9 / 1073741824, 1e-15, 'GB->GiB'],
  [1, 'GiB', 'GB', 'data-storage', 1073741824 / 1e9, 1e-15, 'GiB->GB'],
  [1, 'byte', 'bit', 'data-storage', 8, 1e-12, 'byte->bit'],
  [1, 'MiB', 'KiB', 'data-storage', 1024, 1e-12, 'MiB->KiB'],
  [1, 'TB', 'GB', 'data-storage', 1000, 1e-12, 'TB->GB'],
  [1, 'TiB', 'GiB', 'data-storage', 1024, 1e-12, 'TiB->GiB'],

  /* ---------------- frequency ---------------- */
  [1, 'GHz', 'MHz', 'frequency', 1000, 1e-12, 'GHz->MHz'],
  [1, 'rpm', 'Hz', 'frequency', 1 / 60, 1e-15, 'rpm->Hz'],
  [60, 'rpm', 'Hz', 'frequency', 1, 1e-12, '60 rpm->Hz'],

  /* ---------------- angle ---------------- */
  [180, 'deg', 'rad', 'angle', Math.PI, 1e-12, '180deg->rad'],
  [1, 'turn', 'deg', 'angle', 360, 1e-12, 'turn->deg'],
  [1, 'gradian', 'deg', 'angle', 0.9, 1e-12, 'gradian->deg'],
  [1, 'arcminute', 'deg', 'angle', 1 / 60, 1e-12, 'arcmin->deg'],
  [1, 'arcsecond', 'deg', 'angle', 1 / 3600, 1e-12, 'arcsec->deg'],
  [1, 'mil (NATO)', 'deg', 'angle', 0.05625, 1e-12, 'NATO mil->deg'],
  [2, 'rad', 'deg', 'angle', 360 / Math.PI, 1e-12, '2rad->deg'],

  /* ---------------- paper size (by area) ---------------- */
  [1, 'Letter', 'A4', 'paper-size', 0.06032246 / 0.06237, 1e-9, 'Letter->A4'],
  [1, 'A4', 'cm2', 'paper-size', 623.7, 1e-9, 'A4->cm2'],
  [1, 'A0', 'm2', 'paper-size', 1, 1e-15, 'A0->m2'],
  [1, 'm2', 'A0', 'paper-size', 1, 1e-12, 'm2->A0'],
  // ISO halves each step: 2 A4 = 1 A3
  [2, 'A4', 'A3', 'paper-size', 0.99792, 1e-9, '2 A4 -> 0.998 A3 (ISO rounding)'],
  [4, 'A4', 'A2', 'paper-size', 0.99792, 1e-9, '4 A4 -> 0.998 A2 (ISO rounding)'],
  [1, 'Tabloid', 'A3', 'paper-size', 0.12062452 / 0.125, 1e-9, 'Tabloid->A3'],
  [1, 'Legal', 'Letter', 'paper-size', 0.07677404 / 0.06032246, 1e-9, 'Legal->Letter'],

  /* ---------------- identity / unknown ---------------- */
  [5, 'm', 'm', 'length', 5, 1e-12, 'identity length'],
  [5, 'zzz', 'm', 'length', null, 0, 'unknown unit -> null'],
  [5, 'm', 'kg', 'mass', null, 0, 'cross-category -> null'],
  [NaN, 'm', 'ft', 'length', null, 0, 'NaN -> null'],
  [Infinity, 'm', 'ft', 'length', null, 0, 'Infinity -> null'],
  [5, 'm', 'ft', 'nonsense', null, 0, 'unknown category -> null'],
];

let fail = 0;
for (const [v, f, t, cat, exp, tol, label] of cases) {
  if (!chk(v, f, t, cat, exp, tol, label)) fail++;
}

console.log('\n' + (cases.length - fail) + '/' + cases.length + ' passed');
if (fail) process.exitCode = 1;
