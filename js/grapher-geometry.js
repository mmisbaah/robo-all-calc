'use strict';

/**
 * Pure geometry for the graph viewport.
 *
 * These functions are the part of the grapher most likely to be subtly wrong —
 * an inverted sign or a swapped axis produces a plot that still renders, just
 * the wrong way round. That is exactly the class of bug that survives review
 * and reaches users, so the maths lives here, free of canvas and DOM, and is
 * unit tested (tests/grapher-geometry.test.js).
 *
 * Conventions:
 *   - `range` is {xMin, xMax, yMin, yMax} in math units.
 *   - `width`/`height` are canvas pixels, with y growing DOWNWARDS.
 *   - Math y grows upwards, hence the deliberate sign flips below.
 */
(function (global) {

  /** Math coords -> canvas pixels. */
  function toPixel(range, width, height, x, y) {
    const px = ((x - range.xMin) / (range.xMax - range.xMin)) * width;
    const py = height - ((y - range.yMin) / (range.yMax - range.yMin)) * height;
    return { x: px, y: py };
  }

  /** Canvas pixels -> math coords. */
  function toMath(range, width, height, px, py) {
    const x = range.xMin + (px / width) * (range.xMax - range.xMin);
    const y = range.yMax - (py / height) * (range.yMax - range.yMin);
    return { x: x, y: y };
  }

  /**
   * Viewport after panning by a pixel delta.
   *
   * Returns a NEW range; the inputs are never mutated. `dragRangeStart` is the
   * range captured at drag start, which is what keeps a long drag from
   * accumulating rounding drift — every move is computed from that same origin,
   * not from the previous frame.
   *
   * Dragging right moves the content right, which means the visible window
   * moves left, hence the negated x shift. Screen y grows downwards, so dragging
   * down raises the bottom edge.
   */
  function panByFrom(range, dragRangeStart, width, height, dx, dy) {
    const xRange = dragRangeStart.xMax - dragRangeStart.xMin;
    const yRange = dragRangeStart.yMax - dragRangeStart.yMin;
    const xShift = -(dx / width) * xRange;
    const yShift = (dy / height) * yRange;
    return {
      xMin: dragRangeStart.xMin + xShift,
      xMax: dragRangeStart.xMax + xShift,
      yMin: dragRangeStart.yMin + yShift,
      yMax: dragRangeStart.yMax + yShift,
    };
  }

  /**
   * Viewport after zooming by `factor` about a fixed math point.
   *
   * `factor` > 1 zooms OUT (the visible range grows), matching the wheel
   * handler and pinch gesture. The point under the cursor/fingers stays put,
   * which is what makes zooming feel anchored rather than drifting.
   */
  function zoomAt(range, width, height, factor, anchorX, anchorY) {
    const cx = anchorX != null ? anchorX : (range.xMin + range.xMax) / 2;
    const cy = anchorY != null ? anchorY : (range.yMin + range.yMax) / 2;
    return {
      xMin: cx - (cx - range.xMin) * factor,
      xMax: cx + (range.xMax - cx) * factor,
      yMin: cy - (cy - range.yMin) * factor,
      yMax: cy + (range.yMax - cy) * factor,
    };
  }

  /** True when a range is usable: finite and not inverted or collapsed. */
  function isValidRange(range) {
    return isFinite(range.xMin) && isFinite(range.xMax)
      && isFinite(range.yMin) && isFinite(range.yMax)
      && range.xMax > range.xMin && range.yMax > range.yMin;
  }

  /**
   * Keep a range sane after repeated zooming. Guards against a range collapsing
   * to zero width (which makes the transforms divide by zero) or drifting to
   * non-finite values.
   */
  function clampRange(range, minSpan, maxSpan) {
    const lo = minSpan != null ? minSpan : 1e-9;
    const hi = maxSpan != null ? maxSpan : 1e12;
    function fix(min, max) {
      let a = min, b = max;
      if (!isFinite(a)) a = -lo;
      if (!isFinite(b)) b = lo;
      if (b - a < lo) {
        const mid = (a + b) / 2;
        a = mid - lo / 2;
        b = mid + lo / 2;
      }
      if (b - a > hi) {
        const mid = (a + b) / 2;
        a = mid - hi / 2;
        b = mid + hi / 2;
      }
      return { min: a, max: b };
    }
    const fx = fix(range.xMin, range.xMax);
    const fy = fix(range.yMin, range.yMax);
    return { xMin: fx.min, xMax: fx.max, yMin: fy.min, yMax: fy.max };
  }

  const Geometry = {
    toPixel: toPixel,
    toMath: toMath,
    panByFrom: panByFrom,
    zoomAt: zoomAt,
    isValidRange: isValidRange,
    clampRange: clampRange,
  };

  global.GrapherGeometry = Geometry;
  if (typeof module !== 'undefined' && module.exports) module.exports = Geometry;
})(typeof self !== 'undefined' ? self : globalThis);