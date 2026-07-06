---
'@apostel/visual-config-server': patch
---

Fix the daemon hanging on Ctrl+C (SIGINT). `httpServer.close()` waits for open
connections to drain, and the browser UI's live WebSocket kept a socket (and the
process) open indefinitely — so pressing Ctrl+C in the terminal running
`npx @apostel/visual-config` appeared to do nothing. The daemon's `close()` now
terminates client WebSocket connections and destroys lingering sockets before
closing the HTTP server, so shutdown completes and the process exits. Running
script tasks are still SIGTERM'd on shutdown.
