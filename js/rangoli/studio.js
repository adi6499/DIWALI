// Rangoli studio: draw with radial symmetry (and optional mirroring) in
// grainy powder colours. Tools: powder brush, petal stamp, dots (pulli),
// concentric ring and eraser. Every action is a replayable command, so
// undo/redo are exact; checkpoints keep replay fast. Works with touch, pen
// (pressure), mouse and the keyboard. Autosaves to IndexedDB.
import { POWDERS, powderStamp, petal, ringStroke, generateRangoli, mulberry32 } from './generator.js';
import { idbGet, idbSet } from '../core/storage.js';
import { STORAGE_KEYS } from '../config.js';

const CHECKPOINT_EVERY = 8;
const MAX_CHECKPOINTS = 6;

export function createStudio({ canvas, cursorEl, size = 1024, onChange = () => {}, announce = () => {} }) {
  canvas.width = canvas.height = size;
  const view = canvas.getContext('2d');
  const ink = document.createElement('canvas');
  ink.width = ink.height = size;
  const ictx = ink.getContext('2d');
  const C = size / 2;

  const state = { tool: 'powder', color: 0, size: 12, sym: 8, mirror: true, floor: '#1b1a2c', guides: true };
  let commands = [];
  let redo = [];
  const checkpoints = new Map(); // command count → canvas
  let current = null;
  let base = null; // restored image from a previous session
  let changeTimer = 0;
  let saveTimer = 0;

  // --- geometry ----------------------------------------------------------------
  function symPoints(x, y, sym, mirror) {
    const out = [];
    const dx = x - C;
    const dy = y - C;
    for (let k = 0; k < sym; k++) {
      const a = (k / sym) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      out.push([C + dx * c - dy * s, C + dx * s + dy * c]);
      if (mirror && sym > 1) out.push([C + dx * c + dy * s, C + dx * s - dy * c]);
    }
    return out;
  }

  // --- drawing a command -----------------------------------------------------------
  function stampAt(ctx, cmd, x, y, r, rnd) {
    const col = POWDERS[cmd.color]?.hex || '#ffffff';
    const gold = POWDERS[cmd.color]?.name === 'Gold dust';
    for (const [px, py] of symPoints(x, y, cmd.sym, cmd.mirror)) {
      if (cmd.tool === 'eraser') {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (cmd.tool === 'dots') {
        powderStamp(ctx, px, py, r * 0.55, col, rnd, { grains: 0.5, gold });
      } else if (cmd.tool === 'petal') {
        const a = Math.atan2(py - C, px - C);
        const d = Math.hypot(px - C, py - C);
        petal(ctx, C, C, a, d, r * 4.2, r * 1.5, col, rnd, { outline: 'rgba(246,239,224,0.85)' });
      } else {
        powderStamp(ctx, px, py, r, col, rnd, { gold });
      }
    }
  }

  function drawSegment(ctx, cmd, from) {
    const pts = cmd.points;
    if (cmd.tool === 'ring') {
      const [x, y] = pts[0];
      ringStroke(ctx, C, C, Math.hypot(x - C, y - C), cmd.size, POWDERS[cmd.color].hex, mulberry32(cmd.seed));
      return;
    }
    const spacing = cmd.tool === 'petal' ? cmd.size * 3.8 : cmd.tool === 'dots' ? cmd.size * 2.2 : cmd.size * 0.38;
    for (let i = Math.max(1, from); i < pts.length; i++) {
      // one seeded generator per segment, so live drawing and replay match exactly
      const rnd = mulberry32(cmd.seed + i * 7919);
      const [x0, y0, p0] = pts[i - 1];
      const [x1, y1, p1] = pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      let carry = cmd.carry || 0;
      let d = spacing - carry;
      while (d <= len) {
        const t = d / Math.max(len, 1e-6);
        const pr = p0 + (p1 - p0) * t;
        stampAt(ctx, cmd, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, cmd.size * pr, rnd);
        d += spacing;
      }
      cmd.carry = len - (d - spacing);
    }
    if (from === 0 && pts.length) stampAt(ctx, cmd, pts[0][0], pts[0][1], cmd.size * pts[0][2], mulberry32(cmd.seed));
  }

  function runCommand(ctx, cmd) {
    if (cmd.type === 'clear') { ctx.clearRect(0, 0, size, size); return; }
    if (cmd.type === 'inspire') { generateRangoli(ctx, size, { seed: cmd.seed, transparent: true }); return; }
    cmd.carry = 0;
    drawSegment(ctx, cmd, 0);
  }

  function rebuild() {
    let start = 0;
    for (const n of [...checkpoints.keys()].sort((a, b) => b - a)) {
      if (n <= commands.length) { start = n; break; }
    }
    ictx.clearRect(0, 0, size, size);
    if (start > 0) ictx.drawImage(checkpoints.get(start), 0, 0);
    else if (base) ictx.drawImage(base, 0, 0);
    for (let i = start; i < commands.length; i++) runCommand(ictx, commands[i]);
    for (const n of [...checkpoints.keys()]) if (n > commands.length) checkpoints.delete(n);
  }

  function checkpoint() {
    if (commands.length % CHECKPOINT_EVERY !== 0) return;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d').drawImage(ink, 0, 0);
    checkpoints.set(commands.length, c);
    const keys = [...checkpoints.keys()].sort((a, b) => a - b);
    while (keys.length > MAX_CHECKPOINTS) checkpoints.delete(keys.shift());
  }

  function commit(cmd) {
    commands.push(cmd);
    redo = [];
    checkpoint();
    changed();
  }

  // --- display -------------------------------------------------------------------
  function render() {
    view.fillStyle = state.floor;
    view.fillRect(0, 0, size, size);
    if (state.guides && state.sym > 1) {
      view.save();
      view.strokeStyle = 'rgba(244,236,219,0.07)';
      view.lineWidth = 1;
      for (let k = 0; k < state.sym; k++) {
        const a = (k / state.sym) * Math.PI * 2;
        view.beginPath();
        view.moveTo(C, C);
        view.lineTo(C + Math.cos(a) * C * 1.5, C + Math.sin(a) * C * 1.5);
        view.stroke();
      }
      for (const r of [0.25, 0.5, 0.75, 0.95]) {
        view.beginPath();
        view.arc(C, C, r * C, 0, Math.PI * 2);
        view.stroke();
      }
      view.restore();
    }
    view.drawImage(ink, 0, 0);
  }

  function changed() {
    render();
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => onChange(ink), 160);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 900);
  }

  async function save() {
    try {
      const blob = await new Promise((r) => ink.toBlob(r, 'image/png'));
      if (blob) await idbSet(STORAGE_KEYS.rangoli, { blob, floor: state.floor, savedAt: Date.now() });
    } catch { /* storage is optional */ }
  }

  async function restore() {
    try {
      const rec = await idbGet(STORAGE_KEYS.rangoli);
      if (!rec || !rec.blob) return false;
      const bmp = await (window.createImageBitmap ? createImageBitmap(rec.blob) : blobToImage(rec.blob));
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(bmp, 0, 0, size, size);
      base = c;
      if (rec.floor) state.floor = rec.floor;
      commands = [];
      checkpoints.clear();
      rebuild();
      render();
      onChange(ink);
      return true;
    } catch {
      return false;
    }
  }

  // --- input ---------------------------------------------------------------------
  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * size, ((e.clientY - r.top) / r.height) * size];
  };
  const pressureOf = (e) => (e.pointerType === 'pen' && e.pressure > 0 ? 0.45 + e.pressure * 1.1 : 1);

  function begin(x, y, p = 1) {
    current = { type: 'stroke', tool: state.tool, color: state.color, size: state.size, sym: state.tool === 'ring' ? 1 : state.sym, mirror: state.mirror, seed: (Math.random() * 1e9) | 0, points: [[x, y, p]], carry: 0 };
    drawSegment(ictx, current, 0);
    render();
    if (state.tool === 'ring') end();
  }
  function extend(x, y, p = 1) {
    if (!current) return;
    const last = current.points[current.points.length - 1];
    if (Math.hypot(x - last[0], y - last[1]) < 1.5) return;
    current.points.push([x, y, p]);
    drawSegment(ictx, current, current.points.length - 1);
    render();
  }
  function end() {
    if (!current) return;
    const cmd = current;
    current = null;
    delete cmd.carry;
    commit(cmd);
  }

  let activePointer = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not all pointers can be captured */ }
    const [x, y] = toCanvas(e);
    begin(x, y, pressureOf(e));
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const [x, y] = toCanvas(e);
    moveCursor(x, y, false);
    if (e.pointerId !== activePointer) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of events) { const [cx, cy] = toCanvas(ev); extend(cx, cy, pressureOf(ev)); }
  });
  const stop = (e) => {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    end();
  };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  canvas.addEventListener('pointerleave', () => cursorEl?.classList.remove('is-on'));

  // keyboard drawing
  const kb = { x: C, y: C, down: false };
  function moveCursor(x, y, show = true) {
    if (!cursorEl) return;
    const r = canvas.getBoundingClientRect();
    const wr = canvas.parentElement.getBoundingClientRect();
    const scale = r.width / size;
    cursorEl.style.left = `${r.left - wr.left + x * scale}px`;
    cursorEl.style.top = `${r.top - wr.top + y * scale}px`;
    const d = Math.max(8, state.size * 2 * scale);
    cursorEl.style.width = `${d}px`;
    cursorEl.style.height = `${d}px`;
    if (show !== null) cursorEl.classList.add('is-on');
  }
  canvas.addEventListener('focus', () => moveCursor(kb.x, kb.y));
  canvas.addEventListener('blur', () => { cursorEl?.classList.remove('is-on'); if (kb.down) { kb.down = false; end(); } });
  canvas.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 32 : 8;
    let moved = false;
    if (e.key === 'ArrowLeft') { kb.x -= step; moved = true; }
    else if (e.key === 'ArrowRight') { kb.x += step; moved = true; }
    else if (e.key === 'ArrowUp') { kb.y -= step; moved = true; }
    else if (e.key === 'ArrowDown') { kb.y += step; moved = true; }
    else if (e.key === ' ') {
      e.preventDefault();
      kb.down = !kb.down;
      if (kb.down) begin(kb.x, kb.y); else end();
      announce(kb.down ? 'Drawing. Move with the arrow keys.' : 'Lifted the brush.');
      return;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      begin(kb.x, kb.y);
      end();
      announce('Placed.');
      return;
    } else if (e.key === '+' || e.key === '=') { setSize(state.size + 2); e.preventDefault(); return; }
    else if (e.key === '-') { setSize(state.size - 2); e.preventDefault(); return; }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? api.redo() : api.undo(); return; }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); api.redo(); return; }
    if (moved) {
      e.preventDefault();
      kb.x = Math.max(0, Math.min(size, kb.x));
      kb.y = Math.max(0, Math.min(size, kb.y));
      moveCursor(kb.x, kb.y);
      if (kb.down) extend(kb.x, kb.y);
    }
  });

  function setSize(v) {
    state.size = Math.max(3, Math.min(48, v));
    moveCursor(kb.x, kb.y, document.activeElement === canvas);
    api.onSizeChange?.(state.size);
  }

  const api = {
    state,
    ink,
    onSizeChange: null,
    setTool(t) { state.tool = t; },
    setColor(i) { state.color = i; },
    setSize,
    setSymmetry(n) { state.sym = n; render(); },
    setMirror(m) { state.mirror = m; },
    setFloor(hex) { state.floor = hex; render(); clearTimeout(saveTimer); saveTimer = setTimeout(save, 900); },
    undo() {
      if (!commands.length) return false;
      redo.push(commands.pop());
      rebuild();
      changed();
      announce('Undone.');
      return true;
    },
    redo() {
      if (!redo.length) return false;
      commands.push(redo.pop());
      rebuild();
      changed();
      announce('Redone.');
      return true;
    },
    clear() {
      const cmd = { type: 'clear' };
      runCommand(ictx, cmd);
      commit(cmd);
      announce('Canvas cleared. Undo brings it back.');
    },
    inspire() {
      const cmd = { type: 'inspire', seed: (Math.random() * 1e6) | 0 };
      runCommand(ictx, cmd);
      commit(cmd);
      announce('A new rangoli design was drawn. You can draw over it.');
    },
    /** Image for download/greeting: floor colour + ink. */
    exportCanvas({ floor = true, out = size } = {}) {
      const c = document.createElement('canvas');
      c.width = c.height = out;
      const x = c.getContext('2d');
      if (floor) { x.fillStyle = state.floor; x.fillRect(0, 0, out, out); }
      x.drawImage(ink, 0, 0, out, out);
      return c;
    },
    isEmpty() {
      const d = ictx.getImageData(0, 0, size, size).data;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) return false;
      return true;
    },
    restore,
    render,
    get canUndo() { return commands.length > 0; },
    get canRedo() { return redo.length > 0; },
  };
  render();
  return api;
}

function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}
