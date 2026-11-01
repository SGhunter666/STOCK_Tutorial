/**
 * Lightweight Canvas charting for Phase 1: price lines, portfolio equity curves,
 * sparklines and dashed reference lines. No external dependencies.
 */
export const PALETTE = {
  line: '#5eead4',
  lineAlt: '#7c9cff',
  up: '#34d399',
  down: '#fb7185',
  grid: 'rgba(148, 163, 184, 0.14)',
  axis: '#7d8fa8',
  fillTop: 'rgba(94, 234, 212, 0.24)',
  fillBottom: 'rgba(94, 234, 212, 0)',
  marker: 'rgba(245, 183, 80, 0.9)',
};

/** Reads canvas-facing colours from the active CSS theme. */
function themeColors() {
  const read = (name, fallback) => {
    try {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return value || fallback;
    } catch {
      return fallback;
    }
  };
  return {
    up: read('--up', PALETTE.up),
    down: read('--down', PALETTE.down),
    grid: read('--chart-grid', PALETTE.grid),
    axis: read('--chart-axis', PALETTE.axis),
    accent: read('--accent', PALETTE.line),
    indigo: read('--indigo', PALETTE.lineAlt),
  };
}

/** Replaces the two default chart hues with theme-aware equivalents. */
function resolveLineColor(value, theme) {
  if (!value || value === PALETTE.line) return theme.accent;
  if (value === PALETTE.lineAlt) return theme.indigo;
  return value;
}

function niceRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  if (min === max) {
    const pad = Math.abs(min) * 0.02 || 1;
    return { min: min - pad, max: max + pad };
  }
  const pad = (max - min) * 0.08;
  const low = min >= 0 ? Math.max(0, min - pad) : min - pad;
  return { min: low, max: max + pad };
}

export class LineChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      color: PALETTE.line,
      fill: true,
      height: 220,
      showYAxis: true,
      yFormat: (v) => String(Math.round(v)),
      xLabels: [],
      markers: [],
      padding: { top: 14, right: 12, bottom: 20, left: 64 },
      ...options,
    };
    this.data = { values: [], labels: [] };
    this.ctx = canvas.getContext('2d');
    this._frame = null;
    this._onResize = () => this.schedule();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this._onResize);
      this.ro.observe(canvas);
    } else {
      window.addEventListener('resize', this._onResize);
    }
  }

  setData(data) {
    this.data = {
      values: Array.isArray(data) ? data : (data.values || []),
      labels: Array.isArray(data) ? [] : (data.labels || []),
    };
    this.schedule();
  }

  schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.render();
    });
  }

  render() {
    const canvas = this.canvas;
    if (!canvas || !canvas.isConnected) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight || this.options.height;
    if (!width || !height) {
      this.schedule();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const theme = themeColors();
    const lineColor = resolveLineColor(this.options.color, theme);
    const { values, labels } = this.data;
    const options = this.options;
    const pad = options.padding;
    const plotW = Math.max(1, width - pad.left - pad.right);
    const plotH = Math.max(1, height - pad.top - pad.bottom);

    if (!values.length) return;
    const range = niceRange(Math.min(...values), Math.max(...values));

    const xFor = (index) => pad.left + (values.length === 1 ? plotW / 2 : (index / (values.length - 1)) * plotW);
    const yFor = (value) => pad.top + plotH - ((value - range.min) / (range.max - range.min)) * plotH;

    // Grid + y labels
    if (options.showYAxis) {
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = theme.axis;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const lines = 4;
      for (let i = 0; i <= lines; i += 1) {
        const t = i / lines;
        const y = pad.top + t * plotH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y + 0.5);
        ctx.lineTo(width - pad.right, y + 0.5);
        ctx.stroke();
        const value = range.max - t * (range.max - range.min);
        ctx.fillText(options.yFormat(value), pad.left - 8, y);
      }
    }

    // X labels
    if (options.showYAxis && labels.length) {
      ctx.fillStyle = theme.axis;
      ctx.font = '10px ui-sans-serif, system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(labels[0], pad.left, height - pad.bottom + 6);
      if (labels.length > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(labels[labels.length - 1], width - pad.right, height - pad.bottom + 6);
      }
    }

    // Reference lines (limit price, cost basis...)
    for (const marker of options.markers) {
      if (!Number.isFinite(marker.value)) continue;
      if (marker.value < range.min || marker.value > range.max) continue;
      const y = yFor(marker.value);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = marker.color || PALETTE.marker;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.restore();
      if (marker.label) {
        ctx.fillStyle = marker.color || PALETTE.marker;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(marker.label, pad.left + 4, y - 3);
      }
    }

    // Area fill
    if (options.fill) {
      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      gradient.addColorStop(0, PALETTE.fillTop);
      gradient.addColorStop(1, PALETTE.fillBottom);
      ctx.beginPath();
      ctx.moveTo(xFor(0), yFor(values[0]));
      values.forEach((value, index) => {
        if (index > 0) ctx.lineTo(xFor(index), yFor(value));
      });
      ctx.lineTo(xFor(values.length - 1), pad.top + plotH);
      ctx.lineTo(xFor(0), pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Overlay series such as moving averages.
    for (const overlay of (options.overlays || [])) {
      const series = overlay.values || [];
      if (!series.length) continue;
      ctx.beginPath();
      let started = false;
      series.forEach((value, index) => {
        if (!Number.isFinite(value)) return;
        const x = pad.left + (series.length === 1 ? plotW / 2 : (index / Math.max(1, series.length - 1)) * plotW);
        const y = yFor(value);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      if (!started) continue;
      ctx.strokeStyle = overlay.color || PALETTE.marker;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Line
    ctx.beginPath();
    values.forEach((value, index) => {
      if (index === 0) ctx.moveTo(xFor(index), yFor(value));
      else ctx.lineTo(xFor(index), yFor(value));
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Last point
    const lastX = xFor(values.length - 1);
    const lastY = yFor(values[values.length - 1]);
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
    ctx.fillStyle = `${lineColor}33`;
    ctx.fill();
  }

  destroy() {
    if (this.ro) this.ro.disconnect();
    else window.removeEventListener('resize', this._onResize);
    if (this._frame) cancelAnimationFrame(this._frame);
  }
}

/**
 * Daily candlestick (K-line) chart with an optional volume histogram.
 * Candles use { o, h, l, c, v } objects in the same shape as the market history.
 */
export class CandlestickChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.options = {
      height: 300,
      showVolume: true,
      yFormat: (v) => String(Math.round(v)),
      markers: [],
      padding: { top: 14, right: 12, bottom: 20, left: 64 },
      ...options,
    };
    this.data = { candles: [], labels: [] };
    this.ctx = canvas.getContext('2d');
    this._frame = null;
    this._onResize = () => this.schedule();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(this._onResize);
      this.ro.observe(canvas);
    } else {
      window.addEventListener('resize', this._onResize);
    }
  }

  setData(data) {
    this.data = {
      candles: data.candles || [],
      labels: data.labels || [],
    };
    if (data.markers) this.options.markers = data.markers;
    this.schedule();
  }

  schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.render();
    });
  }

  render() {
    const canvas = this.canvas;
    if (!canvas || !canvas.isConnected) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight || this.options.height;
    if (!width || !height) {
      this.schedule();
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const opts = this.options;
    const theme = themeColors();
    const candles = this.data.candles.filter((candle) => (
      [candle.o, candle.h, candle.l, candle.c].every((value) => Number.isFinite(value))
    ));
    if (!candles.length) return;

    const pad = opts.padding;
    const volumeH = opts.showVolume ? Math.min(56, Math.round(height * 0.22)) : 0;
    const gap = volumeH ? 10 : 0;
    const priceBottom = height - pad.bottom - volumeH - gap;
    const plotW = Math.max(1, width - pad.left - pad.right);
    const plotH = Math.max(1, priceBottom - pad.top);
    const slot = plotW / candles.length;
    const bodyW = Math.max(2, Math.min(14, slot * 0.62));

    let low = Math.min(...candles.map((candle) => candle.l));
    let high = Math.max(...candles.map((candle) => candle.h));
    if (low === high) {
      const padValue = Math.abs(low) * 0.02 || 1;
      low -= padValue;
      high += padValue;
    } else {
      const padValue = (high - low) * 0.08;
      low -= padValue;
      high += padValue;
    }
    const yFor = (value) => pad.top + plotH - ((value - low) / (high - low)) * plotH;
    const xCenter = (index) => pad.left + (index + 0.5) * slot;

    ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.axis;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (i / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(pad.left, y + 0.5);
      ctx.lineTo(width - pad.right, y + 0.5);
      ctx.stroke();
      ctx.fillText(opts.yFormat(high - (i / 4) * (high - low)), pad.left - 8, y);
    }

    // Candles: wick plus body, coloured by close versus open.
    for (let index = 0; index < candles.length; index += 1) {
      const candle = candles[index];
      const x = xCenter(index);
      const color = candle.c >= candle.o ? theme.up : theme.down;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, yFor(candle.h));
      ctx.lineTo(x, yFor(candle.l));
      ctx.stroke();
      const openY = yFor(candle.o);
      const closeY = yFor(candle.c);
      const top = Math.min(openY, closeY);
      const bodyH = Math.max(1, Math.abs(closeY - openY));
      ctx.fillRect(x - bodyW / 2, top, bodyW, bodyH);
    }

    // Volume histogram under the price panel.
    if (volumeH) {
      const volumeTop = priceBottom + gap;
      const volumeBottom = height - pad.bottom;
      const maxVolume = Math.max(1, ...candles.map((candle) => candle.v || 0));
      ctx.fillStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(pad.left, volumeBottom + 0.5);
      ctx.lineTo(width - pad.right, volumeBottom + 0.5);
      ctx.stroke();
      for (let index = 0; index < candles.length; index += 1) {
        const candle = candles[index];
        const barH = Math.max(1, ((candle.v || 0) / maxVolume) * (volumeBottom - volumeTop));
        ctx.fillStyle = candle.c >= candle.o ? theme.up : theme.down;
        ctx.globalAlpha = 0.38;
        ctx.fillRect(xCenter(index) - bodyW / 2, volumeBottom - barH, bodyW, barH);
        ctx.globalAlpha = 1;
      }
    }

    // Horizontal reference lines such as average cost.
    for (const marker of opts.markers) {
      if (!Number.isFinite(marker.value) || marker.value < low || marker.value > high) continue;
      const y = yFor(marker.value);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = marker.color || PALETTE.marker;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
      ctx.stroke();
      ctx.restore();
      if (marker.label) {
        ctx.fillStyle = marker.color || PALETTE.marker;
        ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(marker.label, pad.left + 4, y - 3);
      }
    }

    if (this.data.labels.length) {
      ctx.fillStyle = theme.axis;
      ctx.font = '10px ui-sans-serif, system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(this.data.labels[0], pad.left, height - pad.bottom + 6);
      if (this.data.labels.length > 1) {
        ctx.textAlign = 'right';
        ctx.fillText(this.data.labels[this.data.labels.length - 1], width - pad.right, height - pad.bottom + 6);
      }
    }
  }

  destroy() {
    if (this.ro) this.ro.disconnect();
    else window.removeEventListener('resize', this._onResize);
    if (this._frame) cancelAnimationFrame(this._frame);
  }
}

/** Renders a compact sparkline. Used by the market list, 8 tiny canvases at once. */
export function drawSparkline(canvas, values, { positive = true } = {}) {
  if (!canvas || !canvas.isConnected || !values.length) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xFor = (i) => (i / Math.max(1, values.length - 1)) * width;
  const yFor = (v) => height - 3 - ((v - min) / span) * (height - 6);

  ctx.beginPath();
  values.forEach((value, index) => {
    if (index === 0) ctx.moveTo(xFor(index), yFor(value));
    else ctx.lineTo(xFor(index), yFor(value));
  });
  ctx.strokeStyle = positive ? PALETTE.up : PALETTE.down;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, positive ? 'rgba(52, 211, 153, 0.22)' : 'rgba(251, 113, 133, 0.22)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.fill();
}
