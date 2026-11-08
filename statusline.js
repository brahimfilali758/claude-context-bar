#!/usr/bin/env node
/**
 * claude-context-bar — status line for Claude Code.
 *
 * Claude Code pipes a JSON blob on stdin every time the status line refreshes.
 * We print one line:
 *
 *   Opus │ ctx ████████░░░░░░░░░░░░ 42% 84k/200k │ 5h 23% (resets in 2h14m) · 7d 41%
 *
 * Zero dependencies. Works on macOS, Linux and Windows (Git Bash / PowerShell).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// ---------------------------------------------------------------- config ---

const DEFAULTS = {
  width: 20,            // bar width in cells
  style: 'gradient',    // 'gradient' (each cell coloured by position) | 'solid' (whole bar one colour)
  chars: 'blocks',      // 'blocks' | 'shades' | 'ascii'
  color: 'auto',        // 'auto' | 'truecolor' | '256' | '16' | 'none'
  showModel: true,
  showTokens: true,     // "84k/200k"
  showRateLimits: true, // 5h / 7d plan usage
  showResetTime: true,  // "(resets in 2h14m)" until the 5h window resets
  showCost: false,      // session cost in USD
  compactWarnAt: 80,    // show "⚠ /compact soon" from this context % (0 = off)
  showCompactMarker: true, // tick mark on the bar at compactWarnAt
  showPace: true,       // warn when, at the current pace, you'll hit a plan limit before it resets
  showGit: true,        // "git main* ↑1" — branch, * = uncommitted changes, ↑/↓ = ahead/behind upstream
  showDir: false,       // current folder name
  showLines: false,     // "+120 -45" lines added/removed this session
  separator: ' │ ',
};

const WINDOW_SECONDS = { five_hour: 5 * 3600, seven_day: 7 * 86400 };

function loadConfig() {
  const cfg = { ...DEFAULTS };
  const file = process.env.CLAUDE_CONTEXT_BAR_CONFIG ||
    path.join(os.homedir(), '.claude', 'context-bar.json');
  try {
    Object.assign(cfg, JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (_) { /* no config file — use defaults */ }
  if (process.env.NO_COLOR) cfg.color = 'none';
  return cfg;
}

// ---------------------------------------------------------------- colour ---

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';

const GREEN = [34, 197, 94];
const YELLOW = [234, 179, 8];
const RED = [239, 68, 68];
const EMPTY = [75, 85, 99];

function detectColorMode(pref) {
  if (pref !== 'auto') return pref;
  const ct = (process.env.COLORTERM || '').toLowerCase();
  if (ct.includes('truecolor') || ct.includes('24bit')) return 'truecolor';
  if (process.env.WT_SESSION || process.env.TERM_PROGRAM === 'vscode' ||
      process.env.TERM_PROGRAM === 'iTerm.app' || process.env.TERM_PROGRAM === 'WezTerm' ||
      process.platform === 'win32') return 'truecolor';
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') return '256';
  if ((process.env.TERM || '').includes('256')) return '256';
  return 'truecolor';
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

/** 0 → green, 0.5 → yellow, 1 → red */
function heat(t) {
  t = Math.max(0, Math.min(1, t));
  return t < 0.5 ? mix(GREEN, YELLOW, t / 0.5) : mix(YELLOW, RED, (t - 0.5) / 0.5);
}

function fg(rgb, mode) {
  const [r, g, b] = rgb;
  switch (mode) {
    case 'none': return '';
    case 'truecolor': return `\x1b[38;2;${r};${g};${b}m`;
    case '256': {
      const q = (v) => Math.round((v / 255) * 5);
      return `\x1b[38;5;${16 + 36 * q(r) + 6 * q(g) + q(b)}m`;
    }
    default: { // 16 colours: pick nearest of green / yellow / red / grey
      if (rgb === EMPTY) return '\x1b[90m';
      if (r > 200 && g < 120) return '\x1b[31m';
      if (r > 180) return '\x1b[33m';
      return '\x1b[32m';
    }
  }
}

const paint = (text, rgb, mode) => (mode === 'none' ? text : fg(rgb, mode) + text + RESET);
const dim = (text, mode) => (mode === 'none' ? text : DIM + text + RESET);

// ------------------------------------------------------------------- bar ---

const CHARSETS = {
  blocks: { full: '█', empty: '░', marker: '│', partial: ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] },
  shades: { full: '█', empty: '·', marker: '│', partial: ['', '░', '░', '▒', '▒', '▓', '▓', '▓'] },
  ascii:  { full: '#', empty: '-', marker: '|', partial: ['', '', '', '', '=', '=', '=', '='] },
};

function renderBar(pct, cfg, mode) {
  const width = Math.max(4, Math.min(80, cfg.width | 0));
  const cs = CHARSETS[cfg.chars] || CHARSETS.blocks;
  const exact = (Math.max(0, Math.min(100, pct)) / 100) * width;
  const full = Math.floor(exact);
  const partialIdx = Math.floor((exact - full) * 8);
  const overall = heat(pct / 100);
  const warnAt = num(cfg.compactWarnAt);
  const markerIdx = cfg.showCompactMarker && warnAt > 0 && warnAt < 100
    ? Math.min(width - 1, Math.floor((warnAt / 100) * width)) : -1;

  let out = '';
  for (let i = 0; i < width; i++) {
    const cellColor = cfg.style === 'solid' ? overall : heat((i + 0.5) / width);
    if (i < full) {
      out += paint(cs.full, cellColor, mode);
    } else if (i === full && partialIdx > 0 && cs.partial[partialIdx]) {
      out += paint(cs.partial[partialIdx], cellColor, mode);
    } else if (i === markerIdx) {
      out += paint(cs.marker, heat(warnAt / 100), mode);
    } else {
      out += paint(cs.empty, EMPTY, mode);
    }
  }
  return out;
}

// --------------------------------------------------------------- helpers ---

function fmtTokens(n) {
  if (n == null || isNaN(n)) return '?';
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return Math.round(n / 1e3) + 'k';
  return String(n);
}

function fmtDuration(seconds) {
  if (seconds <= 0) return 'now';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d${h}h`;
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/**
 * Linear projection: at the rate used so far in this window, how many seconds
 * until the limit is hit? Returns null when we'd make it to the reset, or when
 * there's too little data to judge (first 10 minutes / under 5% used).
 */
function secondsUntilLimit(w, windowSeconds, now) {
  const used = num(w.used_percentage);
  const resetsAt = num(w.resets_at);
  if (used == null || resetsAt == null || !windowSeconds) return null;
  const remaining = resetsAt - now;
  const elapsed = windowSeconds - remaining;
  if (remaining <= 0 || elapsed < 600 || used < 5) return null;
  if (used >= 100) return 0;
  const eta = ((100 - used) / used) * elapsed;
  return eta < remaining ? eta : null;
}

/** Context usage, falling back to computing it ourselves if Claude Code didn't. */
function contextInfo(data) {
  const cw = data.context_window || {};
  const size = num(cw.context_window_size) || 200000;
  let used = null;
  const cu = cw.current_usage;
  if (cu && typeof cu === 'object') {
    used = (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) + (cu.cache_read_input_tokens || 0);
  } else if (num(cw.total_input_tokens) != null) {
    used = cw.total_input_tokens;
  }
  let pct = num(cw.used_percentage);
  if (pct == null && used != null) pct = (used / size) * 100;
  if (pct == null && num(cw.remaining_percentage) != null) pct = 100 - cw.remaining_percentage;
  if (used == null && pct != null) used = Math.round((pct / 100) * size);
  return { pct: pct == null ? 0 : pct, used: used || 0, size };
}

// ---------------------------------------------------------------- render ---

function render(data, cfg) {
  const mode = detectColorMode(cfg.color);
  const sep = dim(cfg.separator, mode);
  const parts = [];

  if (cfg.showModel && data.model && data.model.display_name) {
    parts.push(mode === 'none' ? data.model.display_name : BOLD + data.model.display_name + RESET);
  }

  const ctx = contextInfo(data);
  let ctxPart = dim('ctx ', mode) + renderBar(ctx.pct, cfg, mode) + ' ' +
    paint(`${Math.round(ctx.pct)}%`, heat(ctx.pct / 100), mode);
  if (cfg.showTokens) ctxPart += ' ' + dim(`${fmtTokens(ctx.used)}/${fmtTokens(ctx.size)}`, mode);
  if (num(cfg.compactWarnAt) > 0 && ctx.pct >= cfg.compactWarnAt) {
    ctxPart += ' ' + paint('⚠ /compact soon', heat(ctx.pct / 100), mode);
  }
  parts.push(ctxPart);

  const rl = data.rate_limits;
  if (cfg.showRateLimits && rl && typeof rl === 'object') {
    const now = Date.now() / 1000;
    const windows = [];
    for (const [key, label] of [['five_hour', '5h'], ['seven_day', '7d'], ['spend_limit', '$']]) {
      const w = rl[key];
      if (!w || num(w.used_percentage) == null) continue;
      let s = dim(label + ' ', mode) + paint(`${Math.round(w.used_percentage)}%`, heat(w.used_percentage / 100), mode);
      if (cfg.showResetTime && key === 'five_hour' && num(w.resets_at) != null) {
        s += dim(` (resets in ${fmtDuration(w.resets_at - now)})`, mode);
      }
      if (cfg.showPace) {
        const eta = secondsUntilLimit(w, WINDOW_SECONDS[key], now);
        if (eta != null) s += ' ' + paint(`⚠ limit in ~${fmtDuration(eta)}`, RED, mode);
      }
      windows.push(s);
    }
    if (windows.length) parts.push(dim('usage ', mode) + windows.join(dim(' · ', mode)));
  }

  const dir = (data.workspace && data.workspace.current_dir) || data.cwd || '';

  if (cfg.showDir || cfg.showGit) {
    let s = '';
    if (cfg.showDir && dir) s += paint(path.basename(dir.replace(/[\\/]+$/, '')) || dir, [147, 197, 253], mode);
    const git = cfg.showGit && dir ? getGit(dir) : null;
    if (git) {
      if (s) s += ' ';
      s += dim('git ', mode) + paint(git.branch, [192, 132, 252], mode);
      if (git.dirty) s += paint('*', YELLOW, mode);
      if (git.ahead) s += dim(` ↑${git.ahead}`, mode);
      if (git.behind) s += dim(` ↓${git.behind}`, mode);
    }
    if (s) parts.push(s);
  }

  if (cfg.showLines && data.cost) {
    const add = num(data.cost.total_lines_added) || 0;
    const del = num(data.cost.total_lines_removed) || 0;
    if (add || del) parts.push(paint(`+${add}`, GREEN, mode) + ' ' + paint(`-${del}`, RED, mode));
  }

  if (cfg.showCost && data.cost && num(data.cost.total_cost_usd) != null) {
    parts.push(dim('$' + data.cost.total_cost_usd.toFixed(2), mode));
  }

  return parts.join(sep);
}

/**
 * Branch, dirty flag and ahead/behind from a single `git status` call.
 * Returns null outside a repo, when git is missing, or if it takes too long.
 */
function gitInfo(dir) {
  let out;
  try {
    out = require('child_process').execFileSync(
      'git', ['--no-optional-locks', 'status', '--porcelain=v2', '--branch'],
      { cwd: dir, encoding: 'utf8', timeout: 1000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (_) {
    return null;
  }
  const info = { branch: '', dirty: false, ahead: 0, behind: 0 };
  let oid = '';
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) info.branch = line.slice(14).trim();
    else if (line.startsWith('# branch.oid ')) oid = line.slice(13).trim();
    else if (line.startsWith('# branch.ab ')) {
      const m = line.match(/\+(\d+) -(\d+)/);
      if (m) { info.ahead = +m[1]; info.behind = +m[2]; }
    } else if (line && !line.startsWith('#')) info.dirty = true;
  }
  if (info.branch === '(detached)') info.branch = oid && oid !== '(initial)' ? oid.slice(0, 7) : 'detached';
  return info.branch ? info : null;
}

let getGit = gitInfo; // swappable for tests
const setGitProvider = (fn) => { getGit = fn || gitInfo; };

// ------------------------------------------------------------------ main ---

function main() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { input += c; });
  process.stdin.on('end', () => {
    let data = {};
    try { data = JSON.parse(input || '{}'); } catch (_) { /* render empty state */ }
    try {
      process.stdout.write(render(data, loadConfig()) + '\n');
    } catch (e) {
      process.stdout.write('ctx ?\n'); // never break the status line
    }
  });
}

if (require.main === module) main();

module.exports = { render, renderBar, heat, contextInfo, fmtTokens, fmtDuration, secondsUntilLimit, gitInfo, setGitProvider, DEFAULTS };
