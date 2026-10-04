'use strict';

/**
 * Equation-solving strategy shared by the Web Worker and the main-thread
 * fallback, so both produce identical answers.
 *
 * nerdamer's general `solve` is exact and fast for degree <= 3, but its numeric
 * fallback scans a bounded range and takes 12-27 s on an irreducible quartic or
 * quintic — long enough to look like a crash. Measured on nerdamer 2.0:
 *
 *   x^2-5x+6=0      solve  18 ms exact     roots   1 ms
 *   x^3-6x^2+11x-6  solve  25 ms exact     roots  28 ms
 *   x^4-5x^2+6=0    solve  42 ms exact     roots  24 ms
 *   x^4-5x+6=0      solve 11815 ms (none)  roots  17 ms (all four roots)
 *   x^5-x^3+x-1=0  factor -> (-1+x)*(1+x^3+x^4); solving that quartic
 *                   factor directly costs ~12 s, so each factor gets the
 *                   same degree test.
 *
 * Rule: exact solver up to degree 3; above that, factor first and use the
 * exact solver only on factors of degree <= 3; everything else goes to the
 * polynomial root finder, which is fast and complete.
 */
(function (global) {

  /** Express `lhs = rhs` as a single expression to find the zeros of. */
  function toExpression(eq) {
    const at = String(eq).indexOf('=');
    if (at === -1) return String(eq);
    const lhs = String(eq).slice(0, at).trim();
    const rhs = String(eq).slice(at + 1).trim();
    if (!rhs || rhs === '0') return lhs || '0';
    return '(' + lhs + ')-(' + rhs + ')';
  }

  /** Degree of a polynomial in `v`, or null when it is not a polynomial. */
  function degreeOf(N, expr, v) {
    try {
      const e = N(expr);
      if (typeof e.isPolynomialLike === 'function' && !e.isPolynomialLike(v)) return null;
      const result = e.coeffs(v);
      // coeffs() returns a wrapper; the exponent -> value map is on `.coeffs`.
      const map = result && result.coeffs ? result.coeffs : result;
      if (!map || typeof map !== 'object') return null;
      const keys = Object.keys(map)
        .map(function (k) { return Number(k); })
        .filter(function (k) { return isFinite(k); });
      if (!keys.length) return null;
      return Math.max.apply(null, keys);
    } catch (err) {
      return null;
    }
  }

  function describeSet(set, strategy) {
    return {
      text: typeof set.text === 'function' ? set.text() : String(set),
      meta: {
        list: set.toArray().map(String),
        solutionsType: set.solutionsType == null ? null : String(set.solutionsType),
        solutionForm: set.solutionForm == null ? null : String(set.solutionForm),
        partial: set.partial === true,
        unsolved: set.unsolved == null ? null : String(set.unsolved),
        strategy: strategy,
      },
    };
  }

  function wrapList(list, strategy, solutionsType) {
    return {
      text: '{' + list.join(', ') + '}',
      meta: {
        list: list,
        solutionsType: solutionsType,
        solutionForm: 'finite',
        partial: false,
        unsolved: null,
        strategy: strategy,
      },
    };
  }

  /**
   * Solve an equation for one variable.
   * @param {Function} N nerdamer
   * @param {string} equation e.g. "x^2-5x+6=0"
   * @param {string} variable
   * @returns {{text:string, meta:object}}
   */
  function solveSmart(N, equation, variable) {
    function exactSolve(eq) {
      return describeSet(N.solve(eq, variable), 'exact');
    }

    /** Roots of one factor, applying the same degree rule. */
    function solvePiece(piece) {
      const d = degreeOf(N, piece, variable);
      if (d !== null && d >= 4) {
        try {
          return { list: N.roots(piece, variable).toArray().map(String), numeric: true };
        } catch (err) {
          return { list: [], numeric: true };
        }
      }
      try {
        return { list: N.solve(piece + '=0', variable).toArray().map(String), numeric: false };
      } catch (err) {
        return { list: [], numeric: false };
      }
    }

    const expr = toExpression(equation);
    const degree = degreeOf(N, expr, variable);

    // Not a polynomial (sin, exp, reciprocal, ...): the general solver handles
    // these quickly, and it is the only option.
    if (degree === null) return exactSolve(equation);

    // Degree <= 3: closed-form solution is fast and exact.
    if (degree <= 3) return exactSolve(equation);

    // Higher degree: factor first. A reducible polynomial yields an exact
    // answer cheaply; an irreducible one must go to the root finder.
    try {
      const plain = String(N(expr));
      const factored = String(N(expr).factor());
      if (factored !== plain && factored.indexOf('*') !== -1) {
        const solutions = [];
        let anyNumeric = false;
        const parts = factored.split(/\)\s*\*\s*\(|\)\*\(/);
        for (let i = 0; i < parts.length; i++) {
          const piece = parts[i].replace(/^\(/, '').replace(/\)$/, '');
          if (!piece) continue;
          const out = solvePiece(piece);
          if (out.numeric && out.list.length) anyNumeric = true;
          out.list.forEach(function (s) { solutions.push(String(s)); });
        }
        if (solutions.length) {
          const unique = solutions.filter(function (s, i, arr) { return arr.indexOf(s) === i; });
          return wrapList(unique,
            anyNumeric ? 'mixed-factored' : 'exact-factored',
            anyNumeric ? 'numeric' : 'symbolic');
        }
      }
    } catch (err) {
      // fall through to the numeric path
    }

    // Irreducible polynomial of high degree: numerical roots, quickly.
    const list = N.roots(expr, variable).toArray().map(String);
    return wrapList(list, 'numeric-roots', 'numeric');
  }

  const CasSolve = { solveSmart: solveSmart, toExpression: toExpression, degreeOf: degreeOf };
  global.CasSolve = CasSolve;
  if (typeof module !== 'undefined' && module.exports) module.exports = CasSolve;
})(typeof self !== 'undefined' ? self : globalThis);
