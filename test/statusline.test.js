'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { render, heat, contextInfo, fmtTokens, fmtDuration, DEFAULTS } = require('../statusline.js');

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
