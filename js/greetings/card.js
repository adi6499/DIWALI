// Greeting card renderer (1080×1350, 4:5). Four styles: a frame from the
// 3D courtyard, a single painted diya, your rangoli, or fireworks over the
// palace. Gold double-rule border with lotus corners; script-aware text.
import { ACCENTS, presetById } from './presets.js';
import { generateRangoli, mulberry32 } from '../rangoli/generator.js';

const W = 1080;
const H = 1350;
const SCRIPT_FONT = '"Mukta", "Nirmala UI", "Noto Sans Devanagari", "Noto Sans Gujarati", "Noto Sans Bengali", "Noto Sans Tamil", "Noto Sans Telugu", "Noto Sans Kannada", "Noto Sans Malayalam", "Noto Sans Gurmukhi", "Kohinoor Devanagari", sans-serif';
const SERIF = '"Cormorant Garamond", Georgia, serif';

export async function ensureFonts() {
  if (!document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load(`500 40px ${SERIF}`),
      document.fonts.load(`italic 500 40px ${SERIF}`),
      document.fonts.load('600 40px "Mukta"', 'शुभ दीपावली'),
      document.fonts.load('400 40px "Mukta"', 'Happy'),
    ]);
  } catch { /* fall back to system fonts */ }
}

function drawDiya(ctx, x, y, s, t = 0) {
  // glow
  const g = ctx.createRadialGradient(x, y - 90 * s, 0, x, y - 90 * s, 420 * s);
  g.addColorStop(0, 'rgba(255,170,80,0.55)');
  g.addColorStop(0.25, 'rgba(255,120,40,0.18)');
  g.addColorStop(1, 'rgba(255,100,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 440 * s, y - 520 * s, 880 * s, 880 * s);
  // bowl
  ctx.save();
  ctx.translate(x, y);
  const bowl = ctx.createLinearGradient(0, -40 * s, 0, 70 * s);
  bowl.addColorStop(0, '#c3683a');
  bowl.addColorStop(0.5, '#8f3f1e');
  bowl.addColorStop(1, '#4a1d0c');
  ctx.fillStyle = bowl;
  ctx.beginPath();
  ctx.moveTo(-190 * s, -20 * s);
  ctx.quadraticCurveTo(-170 * s, 70 * s, 0, 78 * s);
  ctx.quadraticCurveTo(170 * s, 70 * s, 200 * s, -10 * s);
  ctx.quadraticCurveTo(250 * s, -40 * s, 268 * s, -52 * s);
  ctx.quadraticCurveTo(200 * s, -32 * s, 120 * s, -30 * s);
  ctx.quadraticCurveTo(0, -26 * s, -190 * s, -20 * s);
  ctx.fill();
  // rim and dots
  ctx.strokeStyle = 'rgba(255,214,140,0.75)';
  ctx.lineWidth = 5 * s;
  ctx.beginPath();
  ctx.moveTo(-182 * s, -14 * s);
  ctx.quadraticCurveTo(0, -18 * s, 196 * s, -8 * s);
  ctx.stroke();
  ctx.fillStyle = 'rgba(250,240,220,0.85)';
  for (let i = -6; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(i * 26 * s, 22 * s + Math.abs(i) * 0.4 * s, 4.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // flame
  const fx = 236 * s;
  const fy = -58 * s;
  const fl = ctx.createRadialGradient(fx, fy - 40 * s, 2, fx, fy - 40 * s, 80 * s);
  fl.addColorStop(0, '#fffaf0');
  fl.addColorStop(0.25, '#ffe29a');
  fl.addColorStop(0.55, '#ffa53a');
  fl.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = fl;
  ctx.beginPath();
  ctx.moveTo(fx, fy + 6 * s);
  ctx.bezierCurveTo(fx - 34 * s, fy - 20 * s, fx - 18 * s, fy - 70 * s, fx + 4 * s + Math.sin(t) * 4 * s, fy - 130 * s);
  ctx.bezierCurveTo(fx + 18 * s, fy - 70 * s, fx + 36 * s, fy - 20 * s, fx, fy + 6 * s);
  ctx.fill();
  ctx.restore();
}

function bokeh(ctx, rnd, n, warm = true) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const x = rnd() * W;
    const y = rnd() * H * 0.75;
    const r = 12 + rnd() * 60;
    const a = 0.04 + rnd() * 0.12;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const c = warm ? `255,${150 + Math.floor(rnd() * 70)},${60 + Math.floor(rnd() * 40)}` : '200,180,255';
    g.addColorStop(0, `rgba(${c},${a})`);
    g.addColorStop(0.8, `rgba(${c},${a * 0.8})`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function stars(ctx, rnd, n) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(240,236,255,${0.2 + rnd() * 0.7})`;
    const r = rnd() < 0.9 ? 1.2 : 2.2;
    ctx.fillRect(rnd() * W, rnd() * H * 0.6, r, r);
  }
}

function burst(ctx, x, y, r, color, rnd) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = 64;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd() * 0.05;
    const len = r * (0.75 + rnd() * 0.3);
    const gx = x + Math.cos(a) * len;
    const gy = y + Math.sin(a) * len + len * len * 0.0006;
    const g = ctx.createLinearGradient(x, y, gx, gy);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.7, color.replace('A', '0.35'));
    g.addColorStop(1, color.replace('A', '0.95'));
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * len * 0.2, y + Math.sin(a) * len * 0.2);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.7, y + Math.sin(a) * len * 0.7, gx, gy);
    ctx.stroke();
    ctx.fillStyle = color.replace('A', '1');
    ctx.beginPath();
    ctx.arc(gx, gy, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function palaceSilhouette(ctx, baseY, lamps = true) {
  ctx.save();
  ctx.fillStyle = '#07060f';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, baseY - 140);
  const domes = [[140, 70], [540, 150], [940, 70]];
  ctx.lineTo(80, baseY - 140);
  for (const [cx, r] of domes) {
    ctx.lineTo(cx - r - 30, baseY - 160);
    ctx.lineTo(cx - r, baseY - 160);
    ctx.bezierCurveTo(cx - r * 1.1, baseY - 160 - r * 1.2, cx - r * 0.2, baseY - 160 - r * 1.4, cx, baseY - 160 - r * 1.75);
    ctx.bezierCurveTo(cx + r * 0.2, baseY - 160 - r * 1.4, cx + r * 1.1, baseY - 160 - r * 1.2, cx + r, baseY - 160);
    ctx.lineTo(cx + r + 30, baseY - 160);
  }
  ctx.lineTo(W, baseY - 140);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  if (lamps) {
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 20; x < W; x += 26) {
      for (const y of [baseY - 140, baseY - 40]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
        g.addColorStop(0, 'rgba(255,210,140,0.95)');
        g.addColorStop(0.3, 'rgba(255,140,50,0.4)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 14, y - 14, 28, 28);
      }
    }
  }
  ctx.restore();
}

function border(ctx, accent) {
  ctx.save();
  ctx.strokeStyle = accent.main;
  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, W - 80, H - 80);
  ctx.lineWidth = 1.2;
  ctx.strokeRect(54, 54, W - 108, H - 108);
  // lotus corners
  const corner = (x, y, rot) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.fillStyle = accent.main;
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.rotate(Math.PI / 4 + i * 0.32);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(10, -14, 10, -34, 0, -46);
      ctx.bezierCurveTo(-10, -34, -10, -14, 0, 0);
      ctx.globalAlpha = i === 0 ? 0.95 : 0.6;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };
  corner(54, 54, Math.PI);
  corner(W - 54, 54, -Math.PI / 2);
  corner(54, H - 54, Math.PI / 2);
  corner(W - 54, H - 54, 0);
  ctx.restore();
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function fitFont(ctx, text, weight, family, maxSize, maxW) {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 4;
  } while (size > 30);
  return size;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} g { to, from, message, lang, style, accent }
 * @param {object} assets { background?: canvas, rangoli?: canvas }
 */
export function drawCard(canvas, g, assets = {}) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const accent = ACCENTS[g.accent] || ACCENTS.gold;
  const preset = presetById(g.lang);
  const rnd = mulberry32(42);

  // --- background ----------------------------------------------------------
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05071a');
  sky.addColorStop(0.6, '#0d1136');
  sky.addColorStop(1, '#1a1030');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  let textTop = 760;
  if (g.style === 'courtyard') {
    if (assets.background) {
      ctx.drawImage(assets.background, 0, 0, W, H);
    } else {
      stars(ctx, rnd, 220);
      palaceSilhouette(ctx, 820);
      drawDiya(ctx, W * 0.5, 700, 0.9);
    }
    const shade = ctx.createLinearGradient(0, H * 0.42, 0, H);
    shade.addColorStop(0, 'rgba(5,7,26,0)');
    shade.addColorStop(0.45, 'rgba(5,7,26,0.72)');
    shade.addColorStop(1, 'rgba(5,7,26,0.92)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    textTop = 800;
  } else if (g.style === 'diya') {
    const rg = ctx.createRadialGradient(W / 2, 560, 0, W / 2, 560, 900);
    rg.addColorStop(0, '#2a1630');
    rg.addColorStop(0.5, '#0e1030');
    rg.addColorStop(1, '#05071a');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
    bokeh(ctx, rnd, 46);
    drawDiya(ctx, W * 0.46, 600, 1.15);
    textTop = 780;
  } else if (g.style === 'rangoli') {
    ctx.fillStyle = '#14122a';
    ctx.fillRect(0, 0, W, H);
    const r = 330;
    const cx = W / 2;
    const cy = 450;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    if (assets.rangoli) {
      ctx.drawImage(assets.rangoli, cx - r, cy - r, r * 2, r * 2);
    } else {
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 720;
      generateRangoli(tmp.getContext('2d'), 720, { seed: 11, floor: '#1b1a2c' });
      ctx.drawImage(tmp, cx - r, cy - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.strokeStyle = accent.main;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 22, 0, Math.PI * 2);
    ctx.stroke();
    // a ring of painted diyas around the medallion
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = cx + Math.cos(a) * (r + 56);
      const y = cy + Math.sin(a) * (r + 56);
      const gl = ctx.createRadialGradient(x, y - 8, 0, x, y - 8, 30);
      gl.addColorStop(0, 'rgba(255,230,170,1)');
      gl.addColorStop(0.3, 'rgba(255,150,60,0.55)');
      gl.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x - 30, y - 38, 60, 60);
    }
    textTop = 860;
  } else {
    stars(ctx, rnd, 260);
    burst(ctx, 300, 300, 200, 'rgba(255,190,90,A)', rnd);
    burst(ctx, 780, 230, 170, 'rgba(255,110,170,A)', rnd);
    burst(ctx, 560, 470, 130, 'rgba(140,230,150,A)', rnd);
    burst(ctx, 880, 520, 100, 'rgba(150,170,255,A)', rnd);
    palaceSilhouette(ctx, 900);
    const shade = ctx.createLinearGradient(0, 700, 0, H);
    shade.addColorStop(0, 'rgba(5,7,26,0)');
    shade.addColorStop(0.5, 'rgba(5,7,26,0.75)');
    shade.addColorStop(1, 'rgba(5,7,26,0.9)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    textTop = 820;
  }

  border(ctx, accent);

  // --- text ----------------------------------------------------------------
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const maxW = W - 220;
  const headline = preset.headline;
  const hs = fitFont(ctx, headline, 600, SCRIPT_FONT, 96, maxW);
  ctx.font = `600 ${hs}px ${SCRIPT_FONT}`;
  ctx.fillStyle = accent.soft;
  ctx.shadowColor = 'rgba(5,7,26,0.8)';
  ctx.shadowBlur = 18;
  let y = textTop;
  ctx.fillText(headline, W / 2, y);
  y += 56;
  ctx.font = `italic 500 38px ${SERIF}`;
  ctx.fillStyle = 'rgba(244,236,219,0.82)';
  ctx.fillText(preset.translit, W / 2, y);
  y += 78;

  if (g.to) {
    const dear = (preset.dear || 'Dear {to},').replace('{to}', g.to);
    ctx.font = /[ऀ-෿਀-੿]/.test(dear) ? `500 40px ${SCRIPT_FONT}` : `500 46px ${SERIF}`;
    ctx.fillStyle = '#f4ecdb';
    ctx.fillText(dear, W / 2, y);
    y += 62;
  }
  const msg = (g.message || preset.message || '').trim();
  if (msg) {
    const script = /[ऀ-෿਀-੿]/.test(msg);
    ctx.font = script ? `400 40px ${SCRIPT_FONT}` : `500 44px ${SERIF}`;
    ctx.fillStyle = '#f4ecdb';
    const lines = wrap(ctx, msg, maxW).slice(0, 5);
    for (const line of lines) { ctx.fillText(line, W / 2, y); y += script ? 58 : 56; }
  }
  if (g.from) {
    y += 22;
    ctx.font = `600 36px ${SCRIPT_FONT}`;
    ctx.fillStyle = accent.main;
    ctx.fillText(`— ${g.from}`, W / 2, y);
  }
  ctx.shadowBlur = 0;
  ctx.font = `600 20px ${SCRIPT_FONT}`;
  ctx.fillStyle = 'rgba(244,236,219,0.55)';
  ctx.fillText('D E E P O T S A V   ·   दीपोत्सव', W / 2, H - 82);
  return canvas;
}
