# claude-context-bar

A coloured **context-window progress bar** for the [Claude Code](https://claude.com/claude-code) status line, plus your **plan usage %** (5-hour and 7-day limits) right next to it.

```
Opus │ ctx ██████████░░░░░░░░░░ 50% 100k/200k │ usage 5h 40% (resets in 2h13m) · 7d 25%
```

The bar fills **green → yellow → red** as the context window fills up, so you can see when it's time to `/compact` or start a new session.

- No dependencies: one small Node script
- Works on macOS, Linux and Windows (Git Bash or PowerShell)
- Supports 1M-token context models (the bar reads the real window size)
- Shows plan usage for Pro / Max / Ultra subscribers, and hides it otherwise
- Your previous status line is backed up, and uninstalling restores it

## Install

Requires Node.js 18+.

```bash
npx github:brahimfilali758/claude-context-bar install
```

(After the package is published to npm: `npx claude-context-bar install`.)

Then restart Claude Code or send a message. That's it.

<details>
<summary>Install from a clone instead</summary>

```bash
git clone https://github.com/brahimfilali758/claude-context-bar.git
cd claude-context-bar
node cli.js install
```
</details>

<details>
<summary>Manual install</summary>

Copy `statusline.js` anywhere and add this to `~/.claude/settings.json` (use forward slashes, even on Windows):

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/path/to/statusline.js\""
  }
}
```
</details>

### What the installer does

1. Copies `statusline.js` to `~/.claude/context-bar/statusline.js`
2. Saves any existing `statusLine` setting to `~/.claude/context-bar/previous-statusline.json`, and backs up `settings.json` to `settings.json.bak`
3. Points `statusLine` in `~/.claude/settings.json` at the script
4. Writes a default config file to `~/.claude/context-bar.json`

It respects `CLAUDE_CONFIG_DIR` if you set it.

## Preview

```bash
npx github:brahimfilali758/claude-context-bar preview
```

This prints the bar at 0% to 100% so you can tune the colours and style for your terminal.

## Configuration

Edit `~/.claude/context-bar.json`. Changes apply on the next refresh.

| Key | Default | Description |
|---|---|---|
| `width` | `20` | Bar width in characters |
| `style` | `"gradient"` | `"gradient"`: each cell is coloured by its position, so a full bar runs green → yellow → red. `"solid"`: the whole bar takes one colour based on how full it is |
| `chars` | `"blocks"` | `"blocks"` (`█░` with smooth ⅛ steps), `"shades"` (`█▓▒░·`), `"ascii"` (`#-`) |
| `color` | `"auto"` | `"auto"`, `"truecolor"`, `"256"`, `"16"` or `"none"` |
| `showModel` | `true` | Show the model name |
| `showTokens` | `true` | Show `84k/200k` |
| `showRateLimits` | `true` | Show 5h / 7d plan usage (only appears when Claude Code provides it) |
| `showResetTime` | `true` | Show time until the 5-hour window resets (`resets in 2h13m`) |
| `showCost` | `false` | Show session cost in USD |
| `separator` | `" │ "` | Separator between sections |

The `NO_COLOR` environment variable is honoured.

## How it works

Claude Code runs the [status line command](https://code.claude.com/docs/en/statusline) after each assistant message and pipes it a JSON blob on stdin. This script reads:

- `context_window.used_percentage` / `context_window_size`, falling back to computing the value from `current_usage` when it's missing
- `rate_limits.five_hour` / `seven_day` / `spend_limit`, which are only present for claude.ai subscribers, and only after the first response of a session

Then it prints one coloured line.

## FAQ

**The status line is blank.** Accept the workspace trust dialog first, because Claude Code doesn't run status line commands in untrusted folders. Run `claude --debug` to see errors. Make sure `node` is on your `PATH`.

**The usage % doesn't show.** It's only available for Pro / Max / Ultra plans, and appears after the first reply in a session. API-key users only see the context bar.

**The colours look wrong.** Set `"color": "256"` or `"16"` in the config. macOS Terminal.app doesn't support truecolor.

**The block characters look broken.** Use `"chars": "ascii"`, or switch to a font with full Unicode block support.

## Uninstall

```bash
npx github:brahimfilali758/claude-context-bar uninstall
```

This restores your previous status line, if you had one.

## Development

```bash
npm test          # run tests (node:test, no deps)
npm run preview   # render sample bars
echo '{"context_window":{"used_percentage":73}}' | node statusline.js
```

## License

MIT
