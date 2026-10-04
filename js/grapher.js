'use strict';

/**
 * Grapher engine — plots mathematical functions on a canvas.
 * Pure logic (no DOM). Exposed as `Grapher` class.
 *
 * Features:
 *  - Plot multiple functions f(x) with different colors
 *  - Pan (drag) and zoom (wheel/buttons)
 *  - Auto-scale or manual x/y ranges
 *  - Grid lines, axes, tick labels
 *  - Cursor readout: (x, y), f(x), f'(x)
 *  - Find root (bisection) in a range
 *  - Numerical derivative at a point
 *  - Definite integral (Simpson's rule) over a range
 *  - Multiple functions with legend
 */

/** Default legend label for a function definition. */
function defaultLabel(def) {
  if (def.mode === 'polar') return `r = ${def.rExpr || '?'}`;
  if (def.mode === 'parametric') return `(${def.xExpr || '?'}, ${def.yExpr || '?'})`;
  return `f(${def.expr || 'x'})`;
}

class Grapher {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {number} [options.width=800] - logical width
   * @param {number} [options.height=600] - logical height
   * @param {number} [options.xMin=-10] - left edge of x range
   * @param {number} [options.xMax=10] - right edge of x range
   * @param {number} [options.yMin=-10] - bottom edge of y range
   * @param {number} [options.yMax=10] - top edge of y range
   * @param {boolean} [options.autoScale=true] - auto-scale y to fit functions
   * @param {number} [options.gridStep=1] - grid line spacing
   * @param {string} [options.gridColor='#e5e7eb'] - grid color
   * @param {string} [options.axisColor='#374151'] - axis color
   * @param {string} [options.labelColor='#6b7280'] - label color
   */
  constructor(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    options = options || {};
    this.xMin = options.xMin != null ? options.xMin : -10;
    this.xMax = options.xMax != null ? options.xMax : 10;
    this.yMin = options.yMin != null ? options.yMin : -10;
    this.yMax = options.yMax != null ? options.yMax : 10;
    this.autoScale = options.autoScale != null ? options.autoScale : true;
    this.gridStep = options.gridStep || 1;
    this.gridColor = options.gridColor || '#e5e7eb';
    this.axisColor = options.axisColor || '#374151';
    this.labelColor = options.labelColor || '#6b7280';
    this.bgColor = options.bgColor || '#ffffff';
    this.crosshairColor = options.crosshairColor || 'rgba(0, 0, 0, 0.25)';
    this.panelBg = options.panelBg || 'rgba(255, 255, 255, 0.95)';
    this.panelBorder = options.panelBorder || 'rgba(0, 0, 0, 0.1)';
    this.panelText = options.panelText || '#1f2937';
    this.panelMuted = options.panelMuted || '#9ca3af';

    this.functions = []; // array of {expr, color, visible}
    this.cursor = null; // {x, y} in math coords, or null
    this.dragging = false;
    this.dragStart = null; // {x, y} in pixels
    this.dragRangeStart = null; // {xMin, xMax, yMin, yMax}

    // Dynamic sizing
    this._resizeObserver = null;
    this._targetWidth = options.width || 700;
    this._targetHeight = options.height || 500;
    this.width = this._targetWidth;
    this.height = this._targetHeight;

    // Overlays / annotations
    this.markers = [];        // [{x, y, kind, color?}] intersections, extrema, roots
    this.shadeRange = null;   // {a, b, fnIndex} highlight area under the active function
    this.showTangent = false; // draw tangent at cursor
    this.tangentX = null;     // math-x where the tangent is drawn (null => follow cursor)
    this.interactionMode = options.interactionMode || 'pan'; // 'pan' | 'inspect'
    // Mirror the mode onto the canvas so CSS can show a drag affordance
    // (grab hand to pan, crosshair to inspect).
    this.canvas.dataset.mode = this.interactionMode;
    this._touches = new Map();   // active touch points for pinch-zoom
    this._pinchStartDist = null;

    this._setupCanvas();
    this._bindEvents();
    this._setupResizeObserver();
  }

  _setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    this.ctx.scale(dpr, dpr);
  }

  _setupResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0 && width !== this.width) {
          this._resizeToWidth(width);
        }
      }
    });
    
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  _resizeToWidth(newWidth) {
    // Maintain aspect ratio
    const aspectRatio = this._targetHeight / this._targetWidth;
    const newHeight = newWidth * aspectRatio;
    
    this.width = Math.floor(newWidth);
    this.height = Math.floor(newHeight);
    
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
    
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    
    this.render();
  }

  destroy() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
    }
  }

  _bindEvents() {
    // Pointer Events for mouse and pen. setPointerCapture (below) keeps a drag
    // alive when the pointer leaves the canvas, which plain mouse events could
    // not: 'mouseleave' fired and abandoned the pan half way through.
    //
    // Touch is deliberately excluded here (pointerType === 'touch') because the
    // touch handlers below own that path, including two-finger pinch-zoom.
    // The canvas sets `touch-action: none`, so touch does emit pointer events
    // and would otherwise be handled twice.
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });

    // Hover readout. Only clears when no drag is in flight, so the cursor
    // value survives a drag that strays over the edge.
    this.canvas.addEventListener('pointerleave', (e) => this._onPointerLeave(e));

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => this._onTouchStart(e), { passive: false });
    this.canvas.addEventListener('touchmove', (e) => this._onTouchMove(e), { passive: false });
    this.canvas.addEventListener('touchend', (e) => this._onTouchEnd(e));
    this.canvas.addEventListener('touchcancel', (e) => this._onTouchEnd(e));
  }

  /* ---------------- coordinate transforms ---------------- */

  /** Convert math coords (x, y) to canvas pixels. */
  toPixel(x, y) {
    const px = ((x - this.xMin) / (this.xMax - this.xMin)) * this.width;
    const py = this.height - ((y - this.yMin) / (this.yMax - this.yMin)) * this.height;
    return { x: px, y: py };
  }

  /** Convert canvas pixels to math coords. */
  toMath(px, py) {
    const x = this.xMin + (px / this.width) * (this.xMax - this.xMin);
    const y = this.yMax - (py / this.height) * (this.yMax - this.yMin);
    return { x, y };
  }

  /* ---------------- rendering ---------------- */

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    this._drawBackground();
    this._drawGrid();
    this._drawAxes();
    this._drawFunctions();
    this._drawMarkers();
    this._drawTangent();
    this._drawCursor();
    this._drawLegend();
  }

  _drawBackground() {
    this.ctx.fillStyle = this.bgColor;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  _drawGrid() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = this.gridColor;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 5]);

    // Vertical grid lines
    const xStep = this._niceStep(this.xMax - this.xMin, 10);
    const xStart = Math.ceil(this.xMin / xStep) * xStep;
    for (let x = xStart; x <= this.xMax; x += xStep) {
      const { x: px } = this.toPixel(x, 0);
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, this.height);
      ctx.stroke();
    }

    // Horizontal grid lines
    const yStep = this._niceStep(this.yMax - this.yMin, 10);
    const yStart = Math.ceil(this.yMin / yStep) * yStep;
    for (let y = yStart; y <= this.yMax; y += yStep) {
      const { y: py } = this.toPixel(0, y);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(this.width, py);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawAxes() {
    const ctx = this.ctx;
    ctx.save();

    // X axis
    const originY = this.toPixel(0, 0).y;
    if (originY >= 0 && originY <= this.height) {
      ctx.strokeStyle = this.axisColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(this.width, originY);
      ctx.stroke();

      // Arrow head
      ctx.fillStyle = this.axisColor;
      ctx.beginPath();
      ctx.moveTo(this.width, originY);
      ctx.lineTo(this.width - 8, originY - 4);
      ctx.lineTo(this.width - 8, originY + 4);
      ctx.closePath();
      ctx.fill();
    }

    // Y axis
    const originX = this.toPixel(0, 0).x;
    if (originX >= 0 && originX <= this.width) {
      ctx.strokeStyle = this.axisColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, this.height);
      ctx.stroke();

      // Arrow head
      ctx.fillStyle = this.axisColor;
      ctx.beginPath();
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX - 4, 8);
      ctx.lineTo(originX + 4, 8);
      ctx.closePath();
      ctx.fill();
    }

    // Tick labels
    ctx.fillStyle = this.labelColor;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const xStep = this._niceStep(this.xMax - this.xMin, 10);
    const xStart = Math.ceil(this.xMin / xStep) * xStep;
    for (let x = xStart; x <= this.xMax; x += xStep) {
      if (Math.abs(x) < 1e-10) continue;
      const { x: px } = this.toPixel(x, 0);
      const labelY = Math.min(Math.max(originY + 6, 6), this.height - 16);
      ctx.fillText(this._formatNum(x), px, labelY);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yStep = this._niceStep(this.yMax - this.yMin, 10);
    const yStart = Math.ceil(this.yMin / yStep) * yStep;
    for (let y = yStart; y <= this.yMax; y += yStep) {
      if (Math.abs(y) < 1e-10) continue;
      const { y: py } = this.toPixel(0, y);
      const labelX = Math.min(Math.max(originX - 6, 36), this.width - 6);
      ctx.fillText(this._formatNum(y), labelX, py);
    }

    // Origin label
    if (originX >= 0 && originX <= this.width && originY >= 0 && originY <= this.height) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('0', originX - 4, originY + 4);
    }

    ctx.restore();
  }

  _drawFunctions() {
    for (let i = 0; i < this.functions.length; i++) {
      const fn = this.functions[i];
      if (!fn.visible || !this.isFunctionValid(fn)) continue;
      this._drawFunction(fn, i);
    }
  }

  /** Sample a function for its mode and convert to filtered canvas points. */
  _pointsForFunction(fn) {
    const steps = this.width * 6;
    let pts = [];
    if (fn.mode === 'polar' && fn.rEval) {
      pts = GrapherMath.samplePolar(fn.rEval, 0, Math.PI * 2, steps);
    } else if (fn.mode === 'parametric' && fn.xEval && fn.yEval) {
      pts = GrapherMath.sampleParametric(fn.xEval, fn.yEval, fn.tMin, fn.tMax, steps);
    } else if (fn.eval) {
      pts = GrapherMath.sampleCartesian(fn.eval, this.xMin, this.xMax, steps);
    }
    const out = [];
    for (const p of pts) {
      const { x: px, y: py } = this.toPixel(p.x, p.y);
      if (py < -2000 || py > this.height + 2000) continue;
      out.push({ px, py, x: p.x, y: p.y });
    }
    return out;
  }

  _drawFunction(fn, fnIndex) {
    const ctx = this.ctx;
    const points = this._pointsForFunction(fn);
    if (points.length < 2) return;

    const isCartesian = !fn.mode || fn.mode === 'cartesian';

    // Fill under the curve (cartesian only)
    if (isCartesian) {
      ctx.save();
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      gradient.addColorStop(0, fn.color + '1A'); // 10% opacity at top
      gradient.addColorStop(1, fn.color + '05'); // 3% opacity at bottom
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(points[0].px, points[0].py);
      for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].px, points[i].py);
      ctx.lineTo(points[points.length - 1].px, this.height);
      ctx.lineTo(points[0].px, this.height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Integration region shading
      if (this.shadeRange && this.shadeRange.fnIndex === fnIndex) {
        const { a, b } = this.shadeRange;
        const seg = points.filter((p) => p.x >= a && p.x <= b);
        if (seg.length >= 2) {
          const axisY = this.toPixel(0, 0).y;
          ctx.save();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = fn.color;
          ctx.beginPath();
          ctx.moveTo(seg[0].px, axisY);
          for (const p of seg) ctx.lineTo(p.px, p.py);
          ctx.lineTo(seg[seg.length - 1].px, axisY);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
      }
    }

    // Curve with glow
    ctx.save();
    ctx.strokeStyle = fn.color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.shadowColor = fn.color;
    ctx.shadowBlur = 8;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(points[0].px, points[0].py);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].px, points[i].py);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(points[0].px, points[0].py);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].px, points[i].py);
    ctx.stroke();
    ctx.restore();

    // Curve label near the middle of the visible path
    this._drawCurveLabel(fn, points);
  }

  /** Draw the function's label along its curve. */
  _drawCurveLabel(fn, points) {
    if (!fn.label || points.length < 10) return;
    const ctx = this.ctx;
    const mid = points[Math.floor(points.length * 0.45)];
    if (!mid || mid.py < 0 || mid.py > this.height) return;

    ctx.save();
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const text = fn.label;
    const w = ctx.measureText(text).width;
    const bx = Math.min(Math.max(mid.px - w / 2 - 4, 2), this.width - w - 10);
    const by = Math.min(Math.max(mid.py - 22, 2), this.height - 18);

    ctx.fillStyle = this.panelBg;
    ctx.strokeStyle = this.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, w + 8, 16, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fn.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 4, by + 8.5);
    ctx.restore();
  }

  /** Draw intersection / extremum / root markers. */
  _drawMarkers() {
    if (!this.markers || this.markers.length === 0) return;
    const ctx = this.ctx;
    const colors = {
      intersection: '#f59e0b',
      max: '#ef4444',
      min: '#10b981',
      root: '#8b5cf6',
    };
    ctx.save();
    for (const m of this.markers) {
      const p = this.toPixel(m.x, m.y);
      if (p.px < -10 || p.px > this.width + 10 || p.py < -10 || p.py > this.height + 10) continue;
      ctx.fillStyle = m.color || colors[m.kind] || '#f59e0b';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.px, p.py, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Draw the tangent line at the cursor / tangentX for the active cartesian fn. */
  _drawTangent() {
    if (!this.showTangent) return;
    const fn = this.functions.find((f) => f.visible && this.isFunctionValid(f) && (!f.mode || f.mode === 'cartesian'));
    if (!fn || !fn.eval) return;

    const x = this.tangentX != null ? this.tangentX : (this.cursor ? this.cursor.x : null);
    if (x == null) return;

    const y = GrapherMath.safeEval(fn.eval, x);
    const m = GrapherMath.numericalDerivative(fn.eval, x);
    if (y == null || m == null) return;
    const b = y - m * x;

    const p1 = this.toPixel(this.xMin, m * this.xMin + b);
    const p2 = this.toPixel(this.xMax, m * this.xMax + b);

    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = fn.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.px, p1.py);
    ctx.lineTo(p2.px, p2.py);
    ctx.stroke();
    ctx.setLineDash([]);

    // Point of tangency
    const p = this.toPixel(x, y);
    ctx.fillStyle = fn.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.px, p.py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Slope label
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const text = `slope ≈ ${m.toFixed(4)}`;
    const w = ctx.measureText(text).width;
    const bx = Math.min(Math.max(p.px + 10, 4), this.width - w - 14);
    const by = Math.min(Math.max(p.py - 24, 4), this.height - 20);
    ctx.fillStyle = this.panelBg;
    ctx.strokeStyle = this.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, w + 10, 17, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = this.panelText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 5, by + 9);
    ctx.restore();
  }

  _drawCursor() {
    if (!this.cursor) return;

    const ctx = this.ctx;
    const { x: px, y: py } = this.toPixel(this.cursor.x, this.cursor.y);

    // Crosshair
    ctx.save();
    ctx.strokeStyle = this.crosshairColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, this.height);
    ctx.moveTo(0, py);
    ctx.lineTo(this.width, py);
    ctx.stroke();
    ctx.setLineDash([]);

    // Readout box
    let text = `x: ${this._formatNum(this.cursor.x)}`;
    if (this.cursor.fx != null) {
      text += `\nf(x): ${this._formatNum(this.cursor.fx)}`;
    }
    if (this.cursor.df != null) {
      text += `\nf'(x): ${this._formatNum(this.cursor.df)}`;
    }

    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const lines = text.split('\n');
    const boxWidth = 140;
    const boxHeight = 20 + lines.length * 18;
    const boxX = Math.min(px + 12, this.width - boxWidth - 8);
    const boxY = Math.max(py - boxHeight - 8, 8);

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Box
    ctx.fillStyle = this.panelBg;
    ctx.strokeStyle = this.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Text
    ctx.fillStyle = this.panelText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => {
      ctx.fillText(line, boxX + 10, boxY + 10 + i * 18);
    });

    ctx.restore();
  }

  _drawLegend() {
    if (this.functions.length === 0) return;

    const ctx = this.ctx;
    const boxWidth = 130;
    const boxHeight = 28 * this.functions.length + 12;
    const boxX = this.width - boxWidth - 10;
    const boxY = 10;

    ctx.save();

    // Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;

    // Box
    ctx.fillStyle = this.panelBg;
    ctx.strokeStyle = this.panelBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Function entries
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    this.functions.forEach((fn, i) => {
      const y = boxY + 22 + i * 28;
      // Color swatch
      ctx.fillStyle = fn.color;
      ctx.beginPath();
      ctx.arc(boxX + 16, y, 5, 0, Math.PI * 2);
      ctx.fill();
      // Label
      ctx.fillStyle = fn.visible ? this.panelText : this.panelMuted;
      ctx.fillText(fn.label || `f${i + 1}(x)`, boxX + 28, y);
    });

    ctx.restore();
  }

  /* ---------------- interaction ---------------- */

  _getEventPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.width / rect.width;
    const scaleY = this.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  /**
   * Switch between dragging the viewport ('pan') and scrubbing the cursor
   * readout ('inspect'). Keeps the canvas data-mode in step so the cursor
   * shows which behaviour a drag will have.
   */
  setInteractionMode(mode) {
    this.interactionMode = mode === 'inspect' ? 'inspect' : 'pan';
    this.canvas.dataset.mode = this.interactionMode;
    if (this.interactionMode === 'inspect') {
      this.tangentX = (this.xMin + this.xMax) / 2;
    }
    this.render();
  }

  /**
   * Shift the viewport by a pixel delta measured from the drag start.
   * Shared by the pointer and touch paths, which used to carry identical copies.
   */
  _panByFrom(dragStart, dragRangeStart, dx, dy) {
    const xRange = dragRangeStart.xMax - dragRangeStart.xMin;
    const yRange = dragRangeStart.yMax - dragRangeStart.yMin;
    // Screen y grows downwards, math y grows upwards.
    const xShift = -(dx / this.width) * xRange;
    const yShift = (dy / this.height) * yRange;
    this.xMin = dragRangeStart.xMin + xShift;
    this.xMax = dragRangeStart.xMax + xShift;
    this.yMin = dragRangeStart.yMin + yShift;
    this.yMax = dragRangeStart.yMax + yShift;
  }

  /** Pan the viewport by the drag delta accumulated since pointerdown. */
  _applyDrag(pos) {
    this._panByFrom(this.dragStart, this.dragRangeStart,
      pos.x - this.dragStart.x, pos.y - this.dragStart.y);
  }

  /** Record the viewport at drag start so repeated moves cannot accumulate drift. */
  _beginDrag(pos) {
    this.dragging = true;
    this.dragStart = pos;
    this.dragRangeStart = { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };
    this.canvas.classList.add('is-panning');
  }

  _endDrag() {
    this.dragging = false;
    this.dragStart = null;
    this.dragRangeStart = null;
    this.canvas.classList.remove('is-panning');
  }

  /** True for pointer events that the touch handlers own instead. */
  _isTouchPointer(e) {
    return e.pointerType === 'touch';
  }

  _onPointerDown(e) {
    if (this._isTouchPointer(e)) return;
    // Only the primary button drags; a right-click should not move the plot.
    if (e.button !== 0) return;
    e.preventDefault();
    const pos = this._getEventPos(e);
    this._beginDrag(pos);
    if (this.interactionMode === 'inspect') {
      const math = this.toMath(pos.x, pos.y);
      this.cursor = { x: math.x, y: math.y, fx: null, df: null };
      this._updateCursorValues();
      this.cursor.y = this.cursor.fx != null ? this.cursor.fx : math.y;
      this.tangentX = math.x;
      this.render();
    }
    // Capture so the drag continues if the pointer leaves the canvas, and the
    // matching pointerup arrives even when released outside it.
    if (this.canvas.setPointerCapture) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
    }
  }

  _onPointerMove(e) {
    if (this._isTouchPointer(e)) return;
    const pos = this._getEventPos(e);

    if (this.dragging && this.interactionMode === 'inspect') {
      // Scrub the cursor along x instead of panning
      const math = this.toMath(pos.x, pos.y);
      this.cursor = { x: math.x, y: this.cursor && this.cursor.y != null ? this.cursor.y : math.y, fx: null, df: null };
      this._updateCursorValues();
      this.cursor.y = this.cursor.fx != null ? this.cursor.fx : math.y;
      this.tangentX = math.x;
    } else if (this.dragging) {
      this._applyDrag(pos);
    } else {
      // Update cursor
      const math = this.toMath(pos.x, pos.y);
      this.cursor = { x: math.x, y: math.y, fx: null, df: null };
      this._updateCursorValues();
      if (this.interactionMode === 'inspect') {
        this.tangentX = math.x;
        this.cursor.y = this.cursor.fx != null ? this.cursor.fx : math.y;
      }
    }

    this.render();
  }

  _onPointerUp(e) {
    if (this._isTouchPointer(e)) return;
    if (this.canvas.releasePointerCapture && this.canvas.hasPointerCapture
        && this.canvas.hasPointerCapture(e.pointerId)) {
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    this._endDrag();
    this.render();
  }

  _onPointerLeave(e) {
    if (this._isTouchPointer(e)) return;
    // Keep the drag (and its captured pointer) alive; only drop the hover
    // readout when the pointer is simply moving away.
    if (this.dragging) return;
    this.cursor = null;
    this.render();
  }

  _onWheel(e) {
    e.preventDefault();
    const pos = this._getEventPos(e);
    const math = this.toMath(pos.x, pos.y);
    const factor = e.deltaY > 0 ? 1.1 : 0.9;

    this.xMin = math.x - (math.x - this.xMin) * factor;
    this.xMax = math.x + (this.xMax - math.x) * factor;
    this.yMin = math.y - (math.y - this.yMin) * factor;
    this.yMax = math.y + (this.yMax - math.y) * factor;

    this._updateCursorValues();
    this.render();
  }

  // Touch handlers
  _onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (this._touches.size === 2) {
      // Begin pinch-zoom — cancel any pan drag
      const pts = [...this._touches.values()];
      this._pinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      this._pinchStartRange = { xMin: this.xMin, xMax: this.xMax, yMin: this.yMin, yMax: this.yMax };
      this.dragging = false;
      return;
    }
    if (this._touches.size === 1) {
      const pos = this._getEventPos(e.touches[0]);
      this._beginDrag(pos);
      if (this.interactionMode === 'inspect') {
        const math = this.toMath(pos.x, pos.y);
        this.cursor = { x: math.x, y: math.y, fx: null, df: null };
        this._updateCursorValues();
        this.cursor.y = this.cursor.fx != null ? this.cursor.fx : math.y;
        this.tangentX = math.x;
        this.render();
      }
    }
  }

  _onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (this._touches.has(t.identifier)) this._touches.set(t.identifier, { x: t.clientX, y: t.clientY });
    }

    if (this._touches.size === 2 && this._pinchStartDist) {
      this.canvas.classList.remove('is-panning');
      const pts = [...this._touches.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      if (dist > 0) {
        // The factor scales the visible range, so >1 means zoom out — matching
        // _onWheel below. Fingers apart (dist > start) must therefore zoom out,
        // which means dividing by the start distance, not dividing it.
        const factor = dist / this._pinchStartDist;
        const center = this._getEventPos({
          clientX: (pts[0].x + pts[1].x) / 2,
          clientY: (pts[0].y + pts[1].y) / 2,
        });
        const math = this.toMath(center.x, center.y);
        const r = this._pinchStartRange;
        this.xMin = math.x - (math.x - r.xMin) * factor;
        this.xMax = math.x + (r.xMax - math.x) * factor;
        this.yMin = math.y - (math.y - r.yMin) * factor;
        this.yMax = math.y + (r.yMax - math.y) * factor;
      }
      this.render();
      return;
    }

    if (this._touches.size === 1 && this.dragging) {
      const pos = this._getEventPos(e.touches[0]);
      if (this.interactionMode === 'inspect') {
        const math = this.toMath(pos.x, pos.y);
        this.cursor = { x: math.x, y: this.cursor && this.cursor.y != null ? this.cursor.y : math.y, fx: null, df: null };
        this._updateCursorValues();
        this.cursor.y = this.cursor.fx != null ? this.cursor.fx : math.y;
        this.tangentX = math.x;
      } else {
        this._applyDrag(pos);
      }
      this.render();
    }
  }

  _onTouchEnd(e) {
    for (const t of e.changedTouches) this._touches.delete(t.identifier);
    if (this._touches.size < 2) {
      this._pinchStartDist = null;
      this._pinchStartRange = null;
    }
    if (this._touches.size === 0) {
      this._endDrag();
    }
  }

  _updateCursorValues() {
    if (!this.cursor) return;
    const { x } = this.cursor;
    let fx = null, df = null;

    for (const fn of this.functions) {
      if (!fn.visible || !fn.eval) continue;
      try {
        fx = fn.eval(x);
        df = this._derivative(fn.eval, x);
        break;
      } catch (e) {
        // ignore
      }
    }

    this.cursor.fx = fx;
    this.cursor.df = df;
  }

  /* ---------------- public API ---------------- */

  addFunction(def, color = '#3b82f6', label = null, visible = true) {
    // Backward compat: addFunction(exprString, color, label)
    if (typeof def === 'string') def = { mode: 'cartesian', expr: def };
    const mode = def.mode || 'cartesian';
    const fn = {
      mode,
      expr: def.expr || '',
      rExpr: def.rExpr || '',
      xExpr: def.xExpr || '',
      yExpr: def.yExpr || '',
      tMin: def.tMin != null ? def.tMin : -5,
      tMax: def.tMax != null ? def.tMax : 5,
      color,
      label: label || defaultLabel(def),
      visible,
      eval: null, rEval: null, xEval: null, yEval: null,
    };
    this._compileForMode(fn);
    this.functions.push(fn);
    return fn;
  }

  _compileForMode(fn) {
    if (fn.mode === 'polar') {
      fn.rEval = fn.rExpr ? GrapherMath.compileFunction(fn.rExpr) : null;
    } else if (fn.mode === 'parametric') {
      fn.xEval = fn.xExpr ? GrapherMath.compileFunction(fn.xExpr) : null;
      fn.yEval = fn.yExpr ? GrapherMath.compileFunction(fn.yExpr) : null;
    } else {
      fn.eval = fn.expr ? GrapherMath.compileFunction(fn.expr) : null;
    }
  }

  /** True when the function has at least one compiled, plottable expression. */
  isFunctionValid(fn) {
    if (!fn) return false;
    if (fn.mode === 'polar') return !!fn.rEval;
    if (fn.mode === 'parametric') return !!(fn.xEval && fn.yEval);
    return !!fn.eval;
  }

  removeFunction(index) {
    this.functions.splice(index, 1);
  }

  /** Replace the definition of an existing function (keeps color/label/visibility). */
  setFunctionDef(index, def, label = null) {
    const fn = this.functions[index];
    if (!fn) return;
    if (def.mode) fn.mode = def.mode;
    if (def.expr !== undefined) fn.expr = def.expr;
    if (def.rExpr !== undefined) fn.rExpr = def.rExpr;
    if (def.xExpr !== undefined) fn.xExpr = def.xExpr;
    if (def.yExpr !== undefined) fn.yExpr = def.yExpr;
    if (def.tMin !== undefined) fn.tMin = def.tMin;
    if (def.tMax !== undefined) fn.tMax = def.tMax;
    if (label != null) fn.label = label;
    this._compileForMode(fn);
  }

  /** Replace the expression of an existing cartesian function (keeps color/label). */
  setFunctionExpression(index, expr, label = null) {
    const fn = this.functions[index];
    if (!fn) return;
    fn.expr = expr;
    if (label != null) fn.label = label;
    fn.eval = fn.expr ? GrapherMath.compileFunction(expr) : null;
  }

  /** Update color of an existing function. */
  setFunctionColor(index, color) {
    if (this.functions[index]) {
      this.functions[index].color = color;
    }
  }

  /** Update label of an existing function. */
  setFunctionLabel(index, label) {
    if (this.functions[index]) {
      this.functions[index].label = label;
    }
  }

  setFunctionVisible(index, visible) {
    if (this.functions[index]) {
      this.functions[index].visible = visible;
    }
  }

  /** Apply a set of theme colors (bg, grid, axes, labels, panels) and repaint. */
  setColors(colors) {
    Object.assign(this, colors);
    this.render();
  }

  setXRange(min, max) {
    this.xMin = min;
    this.xMax = max;
    this.autoScale = false;
  }

  setYRange(min, max) {
    this.yMin = min;
    this.yMax = max;
    this.autoScale = false;
  }

  resetView() {
    this.xMin = -10;
    this.xMax = 10;
    this.yMin = -10;
    this.yMax = 10;
    this.autoScale = true;
  }

  zoom(factor, centerX, centerY) {
    centerX = centerX != null ? centerX : (this.xMin + this.xMax) / 2;
    centerY = centerY != null ? centerY : (this.yMin + this.yMax) / 2;
    this.xMin = centerX - (centerX - this.xMin) * factor;
    this.xMax = centerX + (this.xMax - centerX) * factor;
    this.yMin = centerY - (centerY - this.yMin) * factor;
    this.yMax = centerY + (this.yMax - centerY) * factor;
  }

  /** Bisection root-finding (delegates to GrapherMath). */
  findRoot(fn, a, b, tolerance = 1e-7, maxIter = 50) {
    return GrapherMath.findRootByBisection(fn, a, b, tolerance, maxIter);
  }

  /** Numerical derivative at x using central differences. */
  _derivative(fn, x, h = 1e-5) {
    return GrapherMath.numericalDerivative(fn, x, h);
  }

  /** Definite integral of f(x) from a to b using Simpson's rule. */
  integrate(fn, a, b, n = 1000) {
    return GrapherMath.simpsonIntegrate(fn, a, b, n);
  }

  /** Format a number for display (compact, with decimals). */
  _formatNum(n) {
    return GrapherMath.formatNum(n);
  }

  /** Compute a nice grid step size. */
  _niceStep(range, targetSteps) {
    return GrapherMath.niceStep(range, targetSteps);
  }

  /** Compile a math expression string into a function f(x). */
  _compileFunction(expr) {
    return GrapherMath.compileFunction(expr);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Grapher;
}
if (typeof window !== 'undefined') {
  window.Grapher = Grapher;
}
