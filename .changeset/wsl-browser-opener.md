---
'@apostel/visual-config': patch
---

fix(cli): don't crash when no browser opener exists; use explorer.exe on WSL

`spawn()` reports a missing opener binary as an async `error` event, not a
synchronous throw, so the `try/catch` around `openBrowser` never caught it and a
missing `xdg-open` (headless Linux, WSL, minimal containers) took down the whole
daemon. The spawned child now gets an `error` handler so opening the browser is
genuinely best-effort — the URL is printed regardless. On WSL, where `xdg-open`
is usually absent, the opener falls back to `explorer.exe`, which opens the
Windows default browser.
