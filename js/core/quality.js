// Picks a rendering tier for the device and watches frame times at runtime,
// lowering resolution (and then effects) if the GPU struggles.
import { TIERS } from '../config.js';

/** Returns { webgl2: boolean, tier, gpu, reason }. Never throws. */
export function probeDevice() {
  const out = { webgl2: false, tier: 'low', gpu: '', reason: '' };
  let gl = null;
  try {
    const c = document.createElement('canvas');
    gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
  } catch { gl = null; }
  if (!gl) { out.reason = 'WebGL2 unavailable'; return out; }
  out.webgl2 = true;

  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    out.gpu = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch { out.gpu = ''; }

  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
  const ua = navigator.userAgent || '';
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const mobile = coarse || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const mem = navigator.deviceMemory || (mobile ? 4 : 8);
  const cores = navigator.hardwareConcurrency || 4;
  const gpu = out.gpu;
  const screenPx = (window.screen?.width || 1280) * (window.screen?.height || 800) * Math.min(window.devicePixelRatio || 1, 3) ** 2;

  if (/SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu) || maxTex < 4096) {
    out.tier = 'low'; out.reason = 'software or limited GPU';
  } else if (mobile) {
    const strongMobile = /Apple GPU|Apple A1[5-9]|Apple M|Adreno \(TM\) (7[3-9]\d|8\d\d)|Mali-G7[1-9]|Mali-G[7-9]\d\d|Immortalis|Xclipse/i.test(gpu);
    out.tier = (strongMobile || (mem >= 6 && cores >= 8)) ? 'medium' : 'low';
    out.reason = `mobile (${gpu || 'unknown GPU'})`;
  } else {
    const discrete = /NVIDIA|GeForce|RTX|Radeon|AMD|Apple M\d|Apple GPU|Arc/i.test(gpu);
    out.tier = discrete && mem >= 4 ? 'high' : 'medium';
    if (screenPx > 14e6 && out.tier === 'high' && !/RTX|Apple M[2-9]/i.test(gpu)) out.tier = 'medium';
    out.reason = `desktop (${gpu || 'unknown GPU'})`;
  }

  try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ignore */ }
  return out;
}

export function resolveTier(setting, probed) {
  const name = setting && setting !== 'auto' && TIERS[setting] ? setting : probed.tier;
  return { ...TIERS[name] };
}

/**
 * Watches frame times. Calls onScale(scale) to change render resolution and
 * onDegrade() when even the lowest resolution is too slow.
 */
export class AdaptiveMonitor {
  constructor({ onScale, onDegrade, minScale = 0.85 }) {
    this.onScale = onScale;
    this.onDegrade = onDegrade;
    this.minScale = minScale;
    this.scale = 1;
    this.samples = [];
    this.warmup = 2.5; // seconds ignored after start / scene change
    this.cooldown = 0;
    this.degraded = false;
    this.enabled = true;
  }

  reset(warmup = 1.5) {
    this.samples.length = 0;
    this.warmup = warmup;
  }

  sample(dt) {
    if (!this.enabled) return;
    if (this.warmup > 0) { this.warmup -= dt; return; }
    if (dt > 0.25) return; // tab switches, breakpoints
    this.samples.push(dt);
    if (this.samples.length < 90) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples.length = 0;
    if (this.cooldown > 0) { this.cooldown--; return; }

    // Every resolution change rebuilds render targets (a visible flash), so
    // change it rarely: only after two slow windows in a row, one step at a
    // time, and never back up during the visit.
    if (median > 1 / 38) {
      this.slow = (this.slow || 0) + 1;
      if (this.slow < 2) return;
      this.slow = 0;
      if (this.scale > this.minScale + 0.01) {
        this.scale = Math.max(this.minScale, this.scale - 0.15);
        this.onScale(this.scale);
        this.cooldown = 3;
      } else if (!this.degraded) {
        this.degraded = true;
        this.onDegrade();
      }
    } else {
      this.slow = 0;
    }
  }
}
