'use strict';

/**
 * Computer-algebra worker.
 *
 * nerdamer runs off the main thread because some operations are genuinely slow.
 * The main thread can also terminate this worker to abort a runaway operation.
 *
 * Protocol: post {id, op, args} -> receive {id, ok, text, meta} or
 * {id, ok:false, error}.
 */

/* global nerdamer, CasSolve, importScripts */
try {
  importScripts('../vendor/nerdamer.js', '../js/cas-solve.js');
  // Signal readiness. The main thread starts its timeout only after this
  // arrives, otherwise loading and parsing the 500 KB bundle would eat the
  // budget for the first query after a worker restart.
  self.postMessage({ ready: true });
} catch (err) {
  self.postMessage({ id: 0, ok: false, error: 'Failed to load CAS: ' + err.message });
}

/** Run one CAS operation and describe the result. */
function run(op, args) {
  const N = self.nerdamer;
  if (typeof N !== 'function') throw new Error('CAS did not initialise');

  switch (op) {
    case 'solve':
      return CasSolve.solveSmart(N, args[0], args[1]);
    case 'roots':
      return { text: String(N.roots.apply(null, args)), meta: {} };
    case 'diff':
      return { text: String(N.diff.apply(null, args)), meta: {} };
    case 'integrate':
      return { text: String(N.integrate.apply(null, args)), meta: {} };
    case 'defint':
      return { text: String(N.defint.apply(null, args)), meta: {} };
    case 'limit':
      return { text: String(N.limit.apply(null, args)), meta: {} };
    case 'simplify':
      return { text: String(N(args[0]).simplify()), meta: {} };
    case 'expand':
      return { text: String(N(args[0]).expand()), meta: {} };
    case 'factor':
      return { text: String(N(args[0]).factor()), meta: {} };
    case 'evaluate':
      return { text: String(N(args[0]).evaluate(args[1] || {})), meta: {} };
    case 'canonize':
      return { text: String(N(args[0])), meta: {} };
    default:
      throw new Error('Unknown operation: ' + op);
  }
}

self.onmessage = function (event) {
  const msg = event.data || {};
  const id = msg.id;
  try {
    const result = run(msg.op, msg.args || []);
    self.postMessage({ id: id, ok: true, text: result.text, meta: result.meta || {} });
  } catch (err) {
    self.postMessage({
      id: id,
      ok: false,
      error: err && err.message ? err.message : String(err),
    });
  }
};
