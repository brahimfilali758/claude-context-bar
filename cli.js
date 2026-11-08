#!/usr/bin/env node
/**
 * claude-context-bar CLI
 *
 *   npx claude-context-bar install     install + wire into ~/.claude/settings.json
 *   npx claude-context-bar uninstall   restore your previous status line
 *   npx claude-context-bar preview     show what the bar looks like at various fill levels
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');
const INSTALL_DIR = path.join(CLAUDE_DIR, 'context-bar');
const INSTALLED_SCRIPT = path.join(INSTALL_DIR, 'statusline.js');
const BACKUP = path.join(INSTALL_DIR, 'previous-statusline.json');
const CONFIG = path.join(CLAUDE_DIR, 'context-bar.json');

const fwd = (p) => p.replace(/\\/g, '/'); // Git Bash on Windows eats backslashes

function readSettings() {
  if (!fs.existsSync(SETTINGS)) return {};
  const raw = fs.readFileSync(SETTINGS, 'utf8');
  try {
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.error(`✖ Could not parse ${SETTINGS}: ${e.message}`);
    console.error('  Fix the JSON (or add the statusLine block manually, see README) and retry.');
    process.exit(1);
  }
}

function writeSettings(settings) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
}

function install() {
  fs.mkdirSync(INSTALL_DIR, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'statusline.js'), INSTALLED_SCRIPT);

  const settings = readSettings();
  const command = `node "${fwd(INSTALLED_SCRIPT)}"`;
  const prev = settings.statusLine;
  const alreadyOurs = prev && typeof prev.command === 'string' && prev.command.includes('context-bar');

  if (prev && !alreadyOurs) {
    fs.writeFileSync(BACKUP, JSON.stringify(prev, null, 2) + '\n');
    console.log(`• Backed up your previous statusLine to ${BACKUP}`);
  }
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.bak'); // safety net
  settings.statusLine = { type: 'command', command, padding: 0 };
  writeSettings(settings);

  if (!fs.existsSync(CONFIG)) {
    const { DEFAULTS } = require('./statusline.js');
    fs.writeFileSync(CONFIG, JSON.stringify(DEFAULTS, null, 2) + '\n');
    console.log(`• Wrote default config to ${CONFIG}`);
  }

  console.log(`• Installed script to ${INSTALLED_SCRIPT}`);
  console.log(`• Updated ${SETTINGS}`);
  console.log('\n✔ claude-context-bar installed. Restart Claude Code (or send a message) to see it.\n');
  preview([12, 55, 88]);
}

function uninstall() {
  const settings = readSettings();
  if (fs.existsSync(BACKUP)) {
    settings.statusLine = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    console.log('• Restored your previous statusLine');
  } else if (settings.statusLine && String(settings.statusLine.command || '').includes('context-bar')) {
    delete settings.statusLine;
    console.log('• Removed statusLine from settings');
  }
  writeSettings(settings);
  fs.rmSync(INSTALL_DIR, { recursive: true, force: true });
  console.log(`• Removed ${INSTALL_DIR}`);
  console.log(`  (left your config at ${CONFIG} — delete it if you like)`);
  console.log('\n✔ claude-context-bar uninstalled.');
}

function preview(levels = [0, 10, 25, 40, 50, 60, 75, 90, 100]) {
  const { render } = require('./statusline.js');
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8')); } catch (_) {}
  const { DEFAULTS } = require('./statusline.js');
  cfg = { ...DEFAULTS, ...cfg };
  if (process.env.NO_COLOR) cfg.color = "none";
  const now = Math.floor(Date.now() / 1000);
  for (const pct of levels) {
    const size = 200000;
    console.log(render({
      model: { display_name: 'Opus' },
      context_window: { used_percentage: pct, context_window_size: size, current_usage: null },
      rate_limits: {
        five_hour: { used_percentage: Math.min(100, pct * 0.8), resets_at: now + 8040 },
        seven_day: { used_percentage: Math.min(100, pct * 0.3), resets_at: now + 400000 },
      },
    }, cfg));
  }
}

const cmd = process.argv[2];
switch (cmd) {
  case 'install': install(); break;
  case 'uninstall': uninstall(); break;
  case 'preview': preview(); break;
  default:
    console.log(`claude-context-bar — coloured context-window bar for Claude Code

Usage:
  npx claude-context-bar install     Install and enable the status line
  npx claude-context-bar uninstall   Remove it and restore your previous status line
  npx claude-context-bar preview     Preview the bar at different fill levels

Config: ${CONFIG}`);
}
