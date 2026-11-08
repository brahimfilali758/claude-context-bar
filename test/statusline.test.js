'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { render, heat, contextInfo, fmtTokens, fmtDuration, secondsUntilLimit, DEFAULTS } = require('../statusline.js');

const plain = { ...DEFAULTS, color: 'none' };
const SCRIPT = path.join(__dirname, '..', 'statusline.js');

test('heat goes green → yellow → red', () => {
  assert.deepStrictEqual(heat(0), [34, 197, 94]);
  assert.deepStrictEqual(heat(0.5), [234, 179, 8]);
  assert.deepStrictEqual(heat(1), [239, 68, 68]);
});

test('uses used_percentage when present', () => {
  const out = render({ context_window: { used_percentage: 42, context_window_size: 200000 } }, plain);
  assert.match(out, /42%/);
  assert.match(out, /84k\/200k/);
});

test('computes percentage from current_usage when used_percentage is null', () => {
  const info = contextInfo({
    context_window: {
      used_percentage: null,
      context_window_size: 1000000,
      current_usage: { input_tokens: 100000, cache_creation_input_tokens: 50000, cache_read_input_tokens: 100000, output_tokens: 9999 },
    },
  });
  assert.strictEqual(info.used, 250000);
  assert.strictEqual(info.pct, 25);
});

test('empty input renders a 0% bar without crashing', () => {
  const out = render({}, plain);
  assert.match(out, /ctx -*|ctx ░+ 0%/);
  assert.match(out, /0%/);
});

test('shows rate limits only when present', () => {
  const base = { context_window: { used_percentage: 10 } };
  assert.doesNotMatch(render(base, plain), /usage/);
  const out = render({ ...base, rate_limits: { five_hour: { used_percentage: 23.5, resets_at: Date.now() / 1000 + 3700 }, seven_day: { used_percentage: 41.2 } } }, plain);
  assert.match(out, /5h 24%/);
  assert.match(out, /7d 41%/);
  assert.match(out, /resets in 1h01m/);
});

test('formatters', () => {
  assert.strictEqual(fmtTokens(1000000), '1M');
  assert.strictEqual(fmtTokens(15500), '16k');
  assert.strictEqual(fmtDuration(90061), '1d1h');
});

test('script reads stdin and survives garbage input', () => {
  const ok = spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify({ context_window: { used_percentage: 77 } }), env: { ...process.env, NO_COLOR: '1' } });
  assert.strictEqual(ok.status, 0);
  assert.match(ok.stdout.toString(), /77%/);
  const bad = spawnSync(process.execPath, [SCRIPT], { input: 'not json' });
  assert.strictEqual(bad.status, 0);
});

test('compact warning appears at the threshold and can be disabled', () => {
  const at = (pct, extra = {}) => render({ context_window: { used_percentage: pct } }, { ...plain, ...extra });
  assert.doesNotMatch(at(79), /compact/);
  assert.match(at(80), /⚠ \/compact soon/);
  assert.doesNotMatch(at(95, { compactWarnAt: 0 }), /compact/);
});

test('compact marker sits in the empty part of the bar', () => {
  const out = render({ context_window: { used_percentage: 10 } }, { ...plain, chars: 'ascii', width: 10 });
  assert.match(out, /ctx #-------\|-/);
  const off = render({ context_window: { used_percentage: 10 } }, { ...plain, chars: 'ascii', width: 10, showCompactMarker: false });
  assert.match(off, /ctx #---------/);
});

test('pace: warns only when the limit will be hit before reset', () => {
  const now = 1_000_000;
  const W = 5 * 3600;
  // 2.5h in, 80% used → 100% in ~37m, reset in 2h30m → warn
  assert.ok(Math.abs(secondsUntilLimit({ used_percentage: 80, resets_at: now + W / 2 }, W, now) - 2250) < 1);
  // 2.5h in, 40% used → on track to finish at 80% → no warning
  assert.strictEqual(secondsUntilLimit({ used_percentage: 40, resets_at: now + W / 2 }, W, now), null);
  // too early to judge
  assert.strictEqual(secondsUntilLimit({ used_percentage: 50, resets_at: now + W - 300 }, W, now), null);
  // already maxed
  assert.strictEqual(secondsUntilLimit({ used_percentage: 100, resets_at: now + 3600 }, W, now), 0);
});

test('pace warning is rendered', () => {
  const now = Date.now() / 1000;
  const out = render({ context_window: { used_percentage: 10 }, rate_limits: { five_hour: { used_percentage: 80, resets_at: now + 9000 } } }, plain);
  assert.match(out, /⚠ limit in ~3[67]m/);
  const off = render({ context_window: { used_percentage: 10 }, rate_limits: { five_hour: { used_percentage: 80, resets_at: now + 9000 } } }, { ...plain, showPace: false });
  assert.doesNotMatch(off, /limit in/);
});
